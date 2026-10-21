import {wallAllows} from './matter-scope';
import {visibleDocument} from './documents';
import {contactData,contactRevisionGuard} from './contact-data';
import {contactGraph} from './contact-graph';
import {guard,accessGuard,availabilitySql,postingDateGuard} from './trust-guards';
import {historicalFundsGuard} from './trust-funds';
import {insist,rows,stmt,type Actor,type Data} from './model';
import {ledgerFor} from './trust-transactions';
import {officerGuard,sourceDocument,sourceGuard,trustOfficer} from './trust';
export async function matterTransferContext(db:D1Database,actor:Actor,fromId:string,toId:string,clientId:string){
 await trustOfficer(db,actor);const from=await ledgerFor(db,actor,fromId),to=await ledgerFor(db,actor,toId);
 insist(from.matter_id!==to.matter_id,'Choose two different matters',409);
 insist((await rows(db,"SELECT id FROM s_trust_accounts WHERE id IN (?,?) AND kind='trust'",from.account_id,to.account_id)).length===(from.account_id===to.account_id?1:2),'Both ledgers must be trust accounts',409);
 const graph=contactGraph(await contactData(db)),client=graph.contacts.find(c=>c.identityIds.includes(clientId));
 insist(client&&[from,to].every(l=>client.matterRoles.some((r:Data)=>r.matter_id===l.matter_id&&r.role==='client')),'Both matters must have the same canonical client identity and client role',409);
 return {from,to,clientId:client.id,graphRevision:graph.revision};
}
export async function transferContext(db:D1Database,actor:Actor,transferId:string){
 const t=await stmt(db,'SELECT * FROM s_trust_matter_transfers WHERE id=?',transferId).first<Data>();insist(t,'Matter transfer not found',404);
 const context=await matterTransferContext(db,actor,t.from_ledger_id,t.to_ledger_id,t.client_id);
 return {...context,t};
}
export function contextGuards(db:D1Database,actor:Actor,c:Awaited<ReturnType<typeof matterTransferContext>>){return [officerGuard(db,actor),accessGuard(db,actor,c.from.matter_id),accessGuard(db,actor,c.to.matter_id),...contactRevisionGuard(db,c.graphRevision)];}
export function liveMatterTransferGuard(db:D1Database,transferId:string){return guard(db,"NOT EXISTS(SELECT 1 FROM s_trust_matter_transfer_actions WHERE transfer_id=? AND kind IN('posted','cleared','declined','not_executed'))",transferId);}
export function matterTransferFunds(db:D1Database,ledgerId:string,cents:number,day:string,exclude=''){
 return [guard(db,`(${availabilitySql()})>=?`,ledgerId,ledgerId,exclude,ledgerId,exclude,cents),historicalFundsGuard(db,ledgerId,cents,day)];
}
export function matterTransferPosting(db:D1Database,t:Data,c:Awaited<ReturnType<typeof matterTransferContext>>,day:string,actor:Actor,at:string,approvalCondition=false,destinationDay=day){
 const condition=approvalCondition?` WHERE (SELECT COUNT(*) FROM s_trust_matter_transfer_actions WHERE transfer_id=? AND kind='approved')>=?`:"",extra=approvalCondition?[t.id,t.required_approvals]:[];
 return [...matterTransferFunds(db,c.from.id,t.cents,day,t.id),postingDateGuard(db,c.from.account_id,day),postingDateGuard(db,c.to.account_id,destinationDay),
 stmt(db,'INSERT INTO s_trust_entries SELECT ?,?,?,?,?,?,?,?,?,?'+condition,t.id+':from',c.from.account_id,c.from.id,c.from.account_id===c.to.account_id?'matter_allocation':'matter_bank_transfer',-t.cents,day,day,t.id+':from',actor.email,at,...extra),
 stmt(db,'INSERT INTO s_trust_entries SELECT ?,?,?,?,?,?,?,?,?,?'+condition,t.id+':to',c.to.account_id,c.to.id,c.from.account_id===c.to.account_id?'matter_allocation':'matter_bank_transfer',t.cents,destinationDay,destinationDay,t.id+':to',actor.email,at,...extra)];
}
export function authorizationGuard(db:D1Database,t:Data){return guard(db,`EXISTS(SELECT 1 FROM s_documents d JOIN s_document_versions v ON v.document_id=d.id WHERE d.id=? AND d.visibility='matter' AND d.erased_at IS NULL AND v.version=? AND v.sha256=? AND v.content_base64 IS NOT NULL)`,t.source_document_id,t.source_version,t.source_digest);}
export async function matterTransferSource(db:D1Database,actor:Actor,documentId:string,matterId:string){const d=await visibleDocument(db,actor,documentId);insist(d.visibility==='matter','Use an authorization or bank original shared with this matter',409);return sourceDocument(db,actor,documentId,matterId);}

export function activeApprovals(db:D1Database,t:Data,c:Awaited<ReturnType<typeof matterTransferContext>>){return guard(db,`NOT EXISTS(SELECT 1 FROM s_trust_matter_transfer_actions a WHERE a.transfer_id=? AND a.kind='approved' AND NOT EXISTS(SELECT 1 FROM s_members m JOIN oa_operators o ON o.email=m.email WHERE m.email=a.actor AND m.role='trust_officer' AND m.active=1 AND o.status='active' AND EXISTS(SELECT 1 FROM s_matters wf,s_matters wt WHERE wf.id=? AND wt.id=? AND ${wallAllows('wf.id','a.actor')} AND ${wallAllows('wt.id','a.actor')} AND (o.role='owner' OR (EXISTS(SELECT 1 FROM s_matter_access x WHERE x.matter_id=wf.id AND x.email=a.actor) AND EXISTS(SELECT 1 FROM s_matter_access x WHERE x.matter_id=wt.id AND x.email=a.actor))))))`,t.id,c.from.matter_id,c.to.matter_id);}
