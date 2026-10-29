import { atomic,audit,human,id,insist,matter,need,now,rows,stmt,text,type Actor,type Data } from './model';
import { openMatter } from './matters';
import { prepareBill } from './billing';
import { proposeDeadline } from './deadlines';
import { requireArea } from './role-areas';
import {preparationWrites} from './agent-authority';
export async function propose(db:D1Database,actor:Actor,kind:string,body:Data,integration?:{id:string;requestKey:string;fingerprint:string}) {
 need(actor,'owner','lawyer'); insist(['matter','bill','deadline'].includes(kind),'Unknown preparation command',404);
 if(kind==='bill')requireArea(actor,'billing','write');
 if(kind!=='matter') await matter(db,actor,text(body.matterId,'Matter'));
 else { text(body.title,'Matter title',200); text(body.client,'Client',200); text(body.adverse,'Adverse party',200); }
 const proposalId=id();
 const result={id:proposalId,kind,status:'pending',payload:body},guardId=id();
 await atomic(db,actor,[...await preparationWrites(db,actor,proposalId),...(integration?[stmt(db,"INSERT INTO s_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM s_integrations WHERE id=? AND revoked=0) THEN 1 ELSE 0 END)",guardId,integration.id),stmt(db,'INSERT INTO s_integration_requests VALUES(?,?,?,?,?)',integration.id,integration.requestKey,integration.fingerprint,JSON.stringify(result),now()),stmt(db,'DELETE FROM s_guard WHERE id=?',guardId)]:[]),stmt(db,'INSERT INTO s_proposals(id,kind,payload,for_email,agent_label,created_at,delegation_id,agreement_id,sponsor_id,prepared_agent_id) VALUES(?,?,?,?,?,?,?,?,?,?)',proposalId,kind,JSON.stringify(body),actor.email,(actor as any).label??'Prepared by person',now(),actor.agentExecution?.delegation.id??null,actor.agentExecution?.delegation.agreement_id??null,actor.id,actor.agentAttribution?.agent.id??null),audit(db,actor,'proposal.prepared',proposalId,kind)]);
 return result;
}
export async function decideProposal(db:D1Database,actor:Actor,proposalId:string,body:Data) {
 human(actor);need(actor,'owner','lawyer');
 const p=await stmt(db,'SELECT * FROM s_proposals WHERE id=? AND (sponsor_id=? OR EXISTS(SELECT 1 FROM s_proposal_sponsor_links ps WHERE ps.proposal_id=s_proposals.id AND ps.operator_id=?) OR (sponsor_id IS NULL AND for_email=?))',proposalId,actor.id,actor.id,actor.email).first<Data>();
 insist(p,'Proposal not found',404);insist(p.status==='pending','This proposal was already decided',409);if(p.kind==='bill')requireArea(actor,'billing','write');
 if(body.decision==='decline') { const reason=text(body.reason,'Reason');await atomic(db,actor,[stmt(db,"INSERT INTO s_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM s_proposals WHERE id=? AND status='pending') THEN 1 ELSE 0 END)",proposalId,proposalId),stmt(db,"UPDATE s_proposals SET status='declined',decided_by=?,decided_at=? WHERE id=?",actor.email,now(),proposalId),audit(db,actor,'proposal.declined',proposalId,reason),stmt(db,'DELETE FROM s_guard WHERE id=?',proposalId)]);return {status:'declined'}; }
 insist(body.decision==='approve','Choose approve or decline');
 const payload=JSON.parse(p.payload), approving={...actor,approval:{id:proposalId,resultId:id()}};
 if(p.kind==='matter') {
  const c=await stmt(db,'SELECT client,adverse FROM s_conflicts WHERE id=?',text(body.conflictId,'Reviewed conflict search')).first<Data>();
  insist(c&&c.client===payload.client&&c.adverse===payload.adverse,'Run a conflict search for the proposed parties first');
  return openMatter(db,approving,{...payload,conflictId:body.conflictId,reviewNote:body.reviewNote,confirmed:body.confirmed});
 }
 if(p.kind==='bill') return prepareBill(db,approving,payload.matterId,payload);
 return proposeDeadline(db,approving,payload.matterId,payload);
}
