import {digest,insist,now,rows,stmt,type Actor,type Data} from './model';
import {authorizedDelegation,guard,liveAgentArgs,liveAgentSql} from './agent-authority';
import {listBilling} from './billing';
import {documentGuard,matterGuard,visibleDocument} from './documents';
import {agentForKey} from './session';
import {gateGrants,requireArea} from './role-areas';

const policyRevision='native-confirmed-work-1';
const scopeKeys=['id','key_id','agreement_id','sponsor_id','matter_id','actions','recipients','spend_cents','expires_at','stop_rule','escalation_email','approved_by','approved_at'];
const scope=(d:Data)=>Object.fromEntries(scopeKeys.map(k=>[k,d[k]]));
const eligible=(s:Data)=>s.state==='omitted'||s.state==='released';

// Use only the invoice snapshots and native balances already in billing context.
// Recorded receipts are not evidence of bank settlement or books synchronization.
function reconcileInvoices(billing:Data){
 const bills:Data[]=billing.bills;
 const descendants=(parent:string):Data[]=>bills.filter(b=>b.correctsBillId===parent&&b.status!=='void').flatMap(b=>[b,...descendants(b.id)]);
 return bills.map(b=>{
  const corrections=descendants(b.id),pending=corrections.filter(c=>c.status==='draft'),f=b.trustPayment;
  return {id:b.id,revision:b.revision,title:b.snapshot.title,status:b.status,correctsBillId:b.correctsBillId,number:b.issue?.number??null,totalCents:b.snapshot.totalCents,
   sources:b.snapshot.lines.map((l:Data)=>({sourceId:l.sourceId,sourceRevision:l.sourceRevision,kind:l.kind,amountCents:l.amountCents,...(l.timekeeper?{timekeeperEmail:l.timekeeper}:{})})),
   feeAgreement:b.snapshot.feePlan?{id:b.snapshot.feePlan.id,kind:b.snapshot.feePlan.kind}:null,
   correctionIds:corrections.map(c=>c.id),
   trustPayment:!b.correctsBillId&&['approved','exported'].includes(b.status)?{
    reviewedCents:f.earned_cents+f.tax_cents,recordedPaidCents:f.paid_cents,writtenOffCents:f.written_off_cents,dueCents:f.due_cents,creditCents:f.credit_cents,reservedCents:f.reserved_cents,
    state:pending.length?'review_correction':f.credit_cents>0?'review_credit':f.due_cents>0?'payment_gap':f.written_off_cents>0?'resolved_with_writeoff':f.paid_cents>0?'recorded_paid':'no_receivable',
    pendingCorrectionIds:pending.map(c=>c.id),bankSettlement:'unverified',booksSync:'unknown',
   }:null};
 });
}

// Only posted native entries are confirmed work. Unposted timers and timesheets,
// document activity and provider observations are never inferred to be billable.
export async function reconcileAgentWork(db:D1Database,d:Data,billing:Data){
 const sources=billing.entries.map((e:Data)=>{
  const invoices=billing.bills.flatMap((b:Data)=>b.snapshot.lines.filter((l:Data)=>l.sourceId===e.id).map((l:Data)=>({id:b.id,revision:b.revision,status:b.status,correctsBillId:b.correctsBillId,sourceRevision:l.sourceRevision})));
  const live=invoices.filter((b:Data)=>b.status!=='void');
  const state=live.some((b:Data)=>b.status!=='draft')?'billed':live.length||e.reservedBy?'reserved':!e.billable?'nonbillable':invoices.length||e.released?'released':'omitted';
  const expense=e.expense?{category:e.expense.category,vendor:e.expense.vendor,vendorReference:e.expense.vendorReference,accountingCode:e.expense.accountingCode,sourceSystem:e.expense.sourceSystem,sourceId:e.expense.sourceId}:null;
  return {sourceId:e.id,sourceRevision:e.revision,kind:e.kind,date:e.date,description:e.description,timekeeperEmail:e.timekeeperEmail,amountCents:e.amountCents,rateRuleId:e.rateRuleId,rateSource:e.rateSource,expense,billable:e.billable,state,invoices,edits:(e.editHistory??[]).map((v:Data)=>({id:v.id,previousRevision:v.previousRevision,revision:v.revision}))};
 });
 const agreement=await stmt(db,'SELECT id,processor,model_revision FROM s_agent_agreements WHERE id=?',d.agreement_id).first<Data>();
 const invoices=reconcileInvoices(billing);
 const inputs={policyRevision,scope:scope(d),agreement,sources,invoices};
 const reconciliationId=await digest(JSON.stringify(inputs));
 return {id:reconciliationId,policyRevision,agreement,sources,invoices,inputs};
}
export function reconciliationWrites(db:D1Database,r:Data){
 return [stmt(db,'INSERT OR IGNORE INTO s_agent_work_reconciliations(id,delegation_id,matter_id,inputs,created_at) VALUES(?,?,?,?,?)',r.id,r.inputs.scope.id,r.inputs.scope.matter_id,JSON.stringify(r.inputs),now())];
}
function sourceGuards(db:D1Database,matterId:string,sources:Data[]){
 return guard(db,`NOT EXISTS(SELECT 1 FROM json_each(?) chosen LEFT JOIN s_entries e ON e.id=json_extract(chosen.value,'$.sourceId')
 WHERE e.id IS NULL OR e.matter_id<>? OR e.revision<>json_extract(chosen.value,'$.sourceRevision') OR e.billable<>1
 OR EXISTS(SELECT 1 FROM s_billing_sources WHERE entry_id=e.id)
 OR EXISTS(SELECT 1 FROM s_bills b,json_each(b.snapshot,'$.lines') l WHERE b.matter_id=e.matter_id AND b.status<>'void' AND json_extract(l.value,'$.sourceId')=e.id))`,JSON.stringify(sources.map(s=>({sourceId:s.sourceId,sourceRevision:s.sourceRevision}))),matterId);
}
async function currentAuthority(db:D1Database,actor:Actor,d:Data){
 await authorizedDelegation(db,actor,d.id,'prepare-bill');
 requireArea(actor,'billing','write');gateGrants(actor,'GET','/api/satchel/agent/matters/'+d.matter_id);
 const writes=[...guard(db,liveAgentSql,...liveAgentArgs(d)),...matterGuard(db,actor,d.matter_id),...guard(db,`EXISTS(SELECT 1 FROM s_agent_delegations WHERE ${scopeKeys.map(k=>k+'=?').join(' AND ')})`,...scopeKeys.map(k=>d[k]))];
 for(const s of await rows(db,'SELECT document_id FROM s_agent_sources WHERE delegation_id=?',d.id))writes.push(...documentGuard(db,actor,await visibleDocument(db,actor,s.document_id)));
 return writes;
}
export async function prepareWorkRecommendation(db:D1Database,actor:Actor,d:Data,body:Data){
 insist(Array.isArray(body.entryIds)&&body.entryIds.length>0&&body.entryIds.length<=100&&new Set(body.entryIds).size===body.entryIds.length,'Select between 1 and 100 distinct confirmed entries');
 const current=await reconcileAgentWork(db,d,await listBilling(db,actor,d.matter_id));
 let recommendation:Data=current;
 if(body.reconciliationId!==undefined){
  insist(typeof body.reconciliationId==='string','Choose a recorded reconciliation');
  const prior=await stmt(db,'SELECT * FROM s_agent_work_reconciliations WHERE id=? AND delegation_id=? AND matter_id=?',body.reconciliationId,d.id,d.matter_id).first<Data>();
  insist(prior,'Reconciliation outside this delegation',403);
  const inputs=JSON.parse(prior.inputs);recommendation={id:prior.id,inputs,sources:inputs.sources};
  insist(inputs.policyRevision===policyRevision&&JSON.stringify(inputs.scope)===JSON.stringify(scope(d)),'Delegation changed; reconcile again',409);
 }
 const selected=body.entryIds.map((entryId:string)=>{
  const source=recommendation.sources.find((s:Data)=>s.sourceId===entryId),live=current.sources.find((s:Data)=>s.sourceId===entryId);
  insist(source&&eligible(source)&&live&&eligible(live)&&source.sourceRevision===live.sourceRevision,'Recommended work changed or is no longer eligible; reconcile again',409);
  return source;
 });
 return {id:recommendation.id,selected,writes:[...await currentAuthority(db,actor,d),...sourceGuards(db,d.matter_id,selected),...reconciliationWrites(db,current)]};
}
export function recommendationLink(db:D1Database,proposalId:string,r:Data){
 return stmt(db,'INSERT INTO s_agent_work_proposals(proposal_id,reconciliation_id,selected_sources) VALUES(?,?,?)',proposalId,r.id,JSON.stringify(r.selected));
}
export async function reviewWorkRecommendation(db:D1Database,p:Data,payload:Data){
 const link=await stmt(db,'SELECT r.inputs,l.selected_sources FROM s_agent_work_proposals l JOIN s_agent_work_reconciliations r ON r.id=l.reconciliation_id WHERE l.proposal_id=?',p.id).first<Data>();
 if(!link)return [];
 const inputs=JSON.parse(link.inputs),selected=JSON.parse(link.selected_sources),agent=await agentForKey(db,inputs.scope.key_id);
 const d=await authorizedDelegation(db,agent,p.delegation_id,'prepare-bill');
 insist(inputs.policyRevision===policyRevision&&JSON.stringify(inputs.scope)===JSON.stringify(scope(d)),'Delegation changed; reconcile again',409);
 insist(payload.matterId===d.matter_id&&JSON.stringify(payload.entryIds)===JSON.stringify(selected.map((s:Data)=>s.sourceId)),'Recommendation sources changed',409);
 const current=await reconcileAgentWork(db,d,await listBilling(db,agent,d.matter_id));
 insist(selected.every((s:Data)=>current.sources.some((c:Data)=>c.sourceId===s.sourceId&&c.sourceRevision===s.sourceRevision&&eligible(c))),'Recommended work changed or is no longer eligible; reconcile again',409);
 return [...await currentAuthority(db,agent,d),...sourceGuards(db,d.matter_id,selected)];
}
export async function proposalWorkHistory(db:D1Database,proposalId:string){
 const r=await stmt(db,'SELECT r.id,r.inputs,r.created_at,l.selected_sources FROM s_agent_work_proposals l JOIN s_agent_work_reconciliations r ON r.id=l.reconciliation_id WHERE l.proposal_id=?',proposalId).first<Data>();
 if(!r)return null;
 const inputs=JSON.parse(r.inputs);
 return {id:r.id,createdAt:r.created_at,policyRevision:inputs.policyRevision,agreement:inputs.agreement,sources:JSON.parse(r.selected_sources),invoices:inputs.invoices??null};
}
