import {human,insist,matter,need,rows,stmt,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {invoiceFunds,invoiceAvailableGuard} from './trust-transfers';
import {gateGrants} from './role-areas';
import {updateContactCapGuard} from './matter-update-delivery';

export async function collectionCounsel(db:D1Database,actor:Actor,matterId:string){
 human(actor);need(actor,'owner','lawyer');await matter(db,actor,matterId);
 gateGrants(actor,'POST','/api/satchel/matters/'+matterId+'/collections');
 insist(await stmt(db,'SELECT 1 FROM s_matter_stage_profiles WHERE matter_id=? AND lawyer_email=?',matterId,actor.email).first(),'Only current responsible counsel can approve or run collections',403);
}
export async function collectionBalance(db:D1Database,s:Data){
 if(s.bill_id){
  const bill=await stmt(db,'SELECT b.status,i.number,MIN(d.due_date) due_date FROM s_bills b JOIN s_invoice_issues i ON i.bill_id=b.id LEFT JOIN s_invoice_deliveries d ON d.bill_id=b.id WHERE b.id=? GROUP BY b.id',s.bill_id).first<Data>();
  insist(bill,'Collection invoice is unavailable',409);const funds=await invoiceFunds(db,s.bill_id);
  return {dueCents:bill.status==='void'?0:funds.due_cents,void:bill.status==='void',number:bill.number,dueDate:bill.due_date,funds};
 }
 const request=await stmt(db,"SELECT r.*,p.target_cents FROM s_retainer_requests r JOIN s_retainer_policies p ON p.id=r.policy_id JOIN s_portal_grants g ON g.id=r.grant_id AND g.revoked_at IS NULL JOIN oa_operators o ON o.email=r.created_by AND o.role='owner' AND o.status='active' WHERE r.id=? AND r.ledger_id=?",s.replenishment_id,s.ledger_id).first<Data>();
 insist(request,'Approved replenishment is unavailable; request fresh review',409);
 const latest=await stmt(db,'SELECT id FROM s_retainer_policies WHERE ledger_id=? ORDER BY rowid DESC LIMIT 1',s.ledger_id).first<Data>();
 insist(latest?.id===request.policy_id,'Retainer policy changed; approve a fresh request',409);
 const r=await stmt(db,'SELECT COALESCE(SUM(cents),0) cents,COUNT(*) count FROM s_trust_entries WHERE ledger_id=?',s.ledger_id).first<Data>();
 return {dueCents:Math.max(0,request.target_cents-r!.cents),void:false,number:'Retainer replenishment',dueDate:null,entryCount:r!.count,request};
}
export async function collectionView(db:D1Database,s:Data):Promise<Data>{
 const events=await rows(db,'SELECT * FROM s_collection_events WHERE collection_id=? ORDER BY sequence',s.id);
 const attempts=await rows(db,`SELECT c.*,a.status,a.attempted_at,a.detail,a.provider_id,COALESCE((SELECT e.status FROM s_correspondence_events e WHERE e.attempt_id=a.id ORDER BY e.observed_at DESC,e.id DESC LIMIT 1),a.status) outcome FROM s_collection_attempts c JOIN s_correspondence_attempts a ON a.id=c.attempt_id WHERE c.collection_id=? ORDER BY c.collection_step`,s.id);
 const steps=JSON.parse(s.steps),sent=attempts.filter(a=>a.attempted_at),last=sent.at(-1),step=sent.length,lastEvent=events.at(-1);
 let balance:Data,reason='',status='active';
 try{balance=await collectionBalance(db,s);}catch(e){balance={dueCents:0,number:s.bill_id?'Invoice unavailable':'Retainer replenishment',void:false};status='review';reason=e instanceof Error?e.message:'Review source';}
 const authorization=await stmt(db,'SELECT * FROM s_client_reminder_authorizations WHERE matter_id=? ORDER BY sequence DESC LIMIT 1',s.matter_id).first<Data>();
 if(status==='active'&&(!authorization?.enabled||authorization.id!==s.authorization_id)){status='review';reason='Reminder authority changed; no further contact';}
 if(lastEvent?.kind==='stop'){status='completed';reason=lastEvent.note;}
 else if(balance.void){status='void';reason='Invoice voided; this sequence has ended';}
 else if(status==='active'&&balance.dueCents===0){status='resolved';reason='No collectible balance remains';}
 else if(status==='active'&&lastEvent&&['dispute','promise','hardship','representation'].includes(lastEvent.kind)){status='paused';reason=lastEvent.kind+': '+lastEvent.note;}
 else if(status==='active'&&last&&!['accepted','delivered','sandbox_validated'].includes(last.outcome)&&!(lastEvent?.kind==='decision'&&lastEvent.decision_attempt_id===last.id)){status='review';reason='Check the provider and record a new decision before another step';}
 else if(status==='active'&&step>=steps.length){status='completed';reason='Approved steps exhausted; route to counsel';}
 const nextDueAt=step>=steps.length?null:lastEvent?.next_due_at??new Date(Math.max(Math.max(Date.parse(s.first_due_at),balance.dueDate?Date.parse(balance.dueDate+'T00:00:00.000Z'):0)+steps[step]*86400000,last?Date.parse(last.attempted_at)+(steps[step]-steps[step-1])*86400000:0)).toISOString();
 return {...s,approvalReason:s.reason,kind:s.bill_id?'invoice':'retainer',steps,events,attempts,step,status,reason,...balance,nextDueAt};
}
export async function collectionSendGuards(db:D1Database,actor:Actor,attempt:Data,atMs:number){
 const link=await stmt(db,'SELECT * FROM s_collection_attempts WHERE correspondence_id=?',attempt.correspondence_id).first<Data>();if(!link)return [];
 const s=await stmt(db,'SELECT * FROM s_collection_sequences WHERE id=?',link.collection_id).first<Data>();insist(s,'Collection sequence unavailable',409);
 await collectionCounsel(db,actor,s.matter_id);insist(s.owner_id===actor.id,'Collection owner changed; nothing sent',409);
 const view=await collectionView(db,s);insist(view.status==='active'&&view.step===link.collection_step&&Date.parse(view.nextDueAt)<=atMs,'Collection is paused, paid, changed or not due; nothing sent',409);
 const u=await stmt(db,'SELECT * FROM s_client_reminder_authorizations WHERE id=?',s.authorization_id).first<Data>();
 return [accessGuard(db,actor,s.matter_id),guard(db,'EXISTS(SELECT 1 FROM s_matter_stage_profiles WHERE matter_id=? AND lawyer_email=?)',s.matter_id,actor.email),guard(db,'(SELECT COUNT(*) FROM s_collection_events WHERE collection_id=?)=?',s.id,view.events.length),guard(db,'EXISTS(SELECT 1 FROM s_client_reminder_authorizations WHERE id=? AND enabled=1 AND sequence=(SELECT MAX(sequence) FROM s_client_reminder_authorizations WHERE matter_id=?))',s.authorization_id,s.matter_id),updateContactCapGuard(db,s.recipient,u!.max_contacts,atMs),...(s.bill_id?[invoiceAvailableGuard(db,s.bill_id,view.funds.reservable_cents)]:[guard(db,'(SELECT COUNT(*) FROM s_trust_entries WHERE ledger_id=?)=?',s.ledger_id,view.entryCount),guard(db,'EXISTS(SELECT 1 FROM s_retainer_requests WHERE id=?)',s.replenishment_id)])];
}
