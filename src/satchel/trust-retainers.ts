import {atomic,audit,digest,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {officerGuard,trustOfficer,trustReconciler} from './trust';
import {portalAccess} from './portal';

const clientKinds=['client','co_client'];
const principalSql="EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND email=? AND role='owner' AND status='active')";
async function principal(db:D1Database,actor:Actor){human(actor);need(actor,'owner');insist(await stmt(db,'SELECT 1 WHERE '+principalSql,actor.id,actor.email).first(),'Only the active principal can approve a retainer policy or request',403);}
async function ledgerFor(db:D1Database,actor:Actor,ledgerId:string){
 const ledger=await stmt(db,'SELECT * FROM s_trust_ledgers WHERE id=?',text(ledgerId,'Client ledger')).first<Data>();
 insist(ledger,'Client ledger not found',404);await matter(db,actor,ledger.matter_id);return ledger;
}
export async function setRetainerPolicy(db:D1Database,actor:Actor,ledgerId:string,b:Data){
 await principal(db,actor);const ledger=await ledgerFor(db,actor,ledgerId),threshold=integer(b.thresholdCents,'Low retainer USD cents',1),target=integer(b.targetCents,'Target retainer USD cents',threshold),reason=text(b.reason,'Policy approval reason',2000);
 insist(b.confirmed===true,'Explicitly approve this retainer policy');
 const revision=id(),at=now();
 await atomic(db,actor,[guard(db,principalSql,actor.id,actor.email),accessGuard(db,actor,ledger.matter_id),
  stmt(db,'INSERT INTO s_retainer_policies VALUES(?,?,?,?,?,?,?)',revision,ledger.id,threshold,target,actor.email,at,reason),
  audit(db,actor,'trust.retainer_policy_approved',revision,JSON.stringify({ledgerId:ledger.id,thresholdCents:threshold,targetCents:target,reason}),{matterId:ledger.matter_id})]);
 return {id:revision};
}
export async function retainerAlert(db:D1Database,actor:Actor,ledgerId:string){
 await trustReconciler(db,actor);const ledger=await ledgerFor(db,actor,ledgerId);
 const result=await db.batch<Data>([
  stmt(db,'SELECT * FROM s_retainer_policies WHERE ledger_id=? ORDER BY rowid DESC LIMIT 1',ledger.id),
  stmt(db,'SELECT id,cents,effective_date,at FROM s_trust_entries WHERE ledger_id=? ORDER BY rowid',ledger.id),
 ]),policy=result[0].results[0],entries=result[1].results;
 insist(policy,'Approve a retainer policy first',409);
 let balance=0,crossingEntryId:string|null=null;
 for(const e of entries){const before=balance;balance+=e.cents;insist(Number.isSafeInteger(balance),'Retainer balance exceeds exact integer cents',409);if(before>=policy.threshold_cents&&balance<policy.threshold_cents)crossingEntryId=e.id;else if(balance>=policy.threshold_cents)crossingEntryId=null;}
 const alert={ledgerId:ledger.id,matterId:ledger.matter_id,policyId:policy.id,thresholdCents:policy.threshold_cents,targetCents:policy.target_cents,balanceCents:balance,low:balance<policy.threshold_cents,crossingEntryId,requestedCents:Math.max(0,policy.target_cents-balance),entryIds:entries.map(e=>e.id)};
 return {...alert,reviewDigest:await digest(JSON.stringify(alert))};
}
export async function deliverReplenishment(db:D1Database,actor:Actor,ledgerId:string,b:Data){
 await principal(db,actor);await trustOfficer(db,actor);const ledger=await ledgerFor(db,actor,ledgerId),alert=await retainerAlert(db,actor,ledgerId);
 insist(alert.low&&alert.crossingEntryId,'A posted transaction must cross the approved low-retainer threshold',409);
 insist(b.confirmed===true&&b.reviewDigest===alert.reviewDigest,'Approve the exact current balance alert',409);
 const recipient=text(b.recipient,'Client portal email',254).toLowerCase(),reason=text(b.reason,'Request approval reason',2000);
 const grant=await stmt(db,`SELECT g.id FROM s_portal_grants g WHERE g.email=? AND g.matter_id=? AND g.kind IN('client','co_client') AND g.revoked_at IS NULL AND ${portalAccess('?',clientKinds)}`,recipient,ledger.matter_id,recipient,ledger.matter_id).first<Data>();
 insist(grant,'Choose a current client or co-client grant without an ethical wall',409);
 const requestId=id(),at=now();
 await atomic(db,actor,[guard(db,principalSql,actor.id,actor.email),officerGuard(db,actor),accessGuard(db,actor,ledger.matter_id),
  guard(db,'(SELECT id FROM s_retainer_policies WHERE ledger_id=? ORDER BY rowid DESC LIMIT 1)=?',ledger.id,alert.policyId),
  guard(db,'(SELECT COUNT(*) FROM s_trust_entries WHERE ledger_id=?)=?',ledger.id,alert.entryIds.length),
  guard(db,`EXISTS(SELECT 1 FROM s_portal_grants g WHERE g.id=? AND g.email=? AND g.matter_id=? AND g.revoked_at IS NULL AND g.kind IN('client','co_client') AND ${portalAccess('?',clientKinds)})`,grant.id,recipient,ledger.matter_id,recipient,ledger.matter_id),
  stmt(db,'INSERT INTO s_retainer_requests VALUES(?,?,?,?,?,?,?,?,?,?)',requestId,ledger.id,alert.policyId,alert.crossingEntryId,grant.id,recipient,JSON.stringify(alert),actor.email,at,reason),
  audit(db,actor,'trust.replenishment_delivered',requestId,JSON.stringify({ledgerId:ledger.id,policyId:alert.policyId,crossingEntryId:alert.crossingEntryId,requestedCents:alert.requestedCents,recipient,reviewDigest:alert.reviewDigest,reason,delivery:'authenticated portal only; request does not move money'}),{matterId:ledger.matter_id})]);
 return {id:requestId,deliveredAt:at,requestedCents:alert.requestedCents};
}
export async function portalReplenishments(db:D1Database,actor:Actor,matterId:string){
 human(actor);need(actor,'client');
 const result=await rows(db,`SELECT r.id,r.snapshot,r.created_at FROM s_retainer_requests r JOIN s_trust_ledgers l ON l.id=r.ledger_id JOIN s_portal_grants g ON g.id=r.grant_id WHERE l.matter_id=? AND r.recipient=? AND EXISTS(SELECT 1 FROM oa_operators approver WHERE approver.email=r.created_by AND approver.role='owner' AND approver.status='active') AND g.email=? AND g.matter_id=l.matter_id AND g.revoked_at IS NULL AND g.kind IN('client','co_client') AND ${portalAccess('l.matter_id',clientKinds)} ORDER BY r.created_at,r.id`,matterId,actor.email,actor.email,actor.email);
 return {requests:result.map(r=>{const s=JSON.parse(r.snapshot);return {id:r.id,deliveredAt:r.created_at,balanceCents:s.balanceCents,targetCents:s.targetCents,requestedCents:s.requestedCents,moneyMovement:false};})};
}
