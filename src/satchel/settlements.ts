import {atomic,audit,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,availabilitySql,guard} from './trust-guards';
import {officerGuard,trustOfficer} from './trust';
const cents=(v:unknown,label:string)=>integer(v,label,0,100000000000);
const share=(amount:number,bps:number)=>Number((BigInt(amount)*BigInt(bps)+5000n)/10000n);
const termsView=(r:Data)=>({...r,terms:JSON.parse(r.terms)});
const statementView=(r:Data):Data=>({...r,snapshot:JSON.parse(r.snapshot)});
async function access(db:D1Database,a:Actor,m:string){human(a);need(a,'owner','lawyer','trust_officer');return matter(db,a,m);}
const latest=(db:D1Database,table:string,m:string)=>stmt(db,`SELECT * FROM ${table} WHERE matter_id=? ORDER BY version DESC LIMIT 1`,m).first<Data>();
const versionGuard=(db:D1Database,table:string,m:string,v:number)=>guard(db,`COALESCE((SELECT MAX(version) FROM ${table} WHERE matter_id=?),0)=?`,m,v);
export async function settlements(db:D1Database,a:Actor,m:string){
 await access(db,a,m);const statements=(await rows(db,'SELECT * FROM s_settlement_statements WHERE matter_id=? ORDER BY version DESC',m)).map(statementView);
 for(const s of statements)s.approvals=await rows(db,'SELECT * FROM s_settlement_approvals WHERE statement_id=? ORDER BY capacity',s.id);
 return {ledgers:await rows(db,'SELECT l.id,a.name FROM s_trust_ledgers l JOIN s_trust_accounts a ON a.id=l.account_id WHERE l.matter_id=? ORDER BY l.created_at,l.id',m),terms:(await rows(db,'SELECT * FROM s_contingency_terms WHERE matter_id=? ORDER BY version DESC',m)).map(termsView),statements};
}
export async function saveContingency(db:D1Database,a:Actor,m:string,b:Data){
 await access(db,a,m);need(a,'owner','lawyer');
 const old=await latest(db,'s_contingency_terms',m),version=old?.version??0;
 insist(b.previousVersion===version,'Review the latest contingency terms',409);insist(b.reviewed===true,'Counsel must review these exact terms',422);
 insist(['gross','after_expenses'].includes(b.feeBasis),'Review whether fees apply before or after expense recovery',422);
 insist(Array.isArray(b.outcomes)&&b.outcomes.length>0&&b.outcomes.length<=20,'Record at least one reviewed outcome tier');
 const outcomes=b.outcomes.map((o:Data)=>({name:text(o.name,'Outcome tier',100),bps:integer(o.bps,'Contingency percentage in basis points',0,10000)}));
 insist(new Set(outcomes.map((o:Data)=>o.name)).size===outcomes.length,'Outcome tiers must have unique names');
 const terms={outcomes,feeBasis:b.feeBasis,reference:text(b.reference,'Reviewed agreement reference',2000),earningEvidence:text(b.earningEvidence,'Reviewed settlement earning condition',2000)};
 const key=id();await atomic(db,a,[accessGuard(db,a,m),versionGuard(db,'s_contingency_terms',m,version),stmt(db,'INSERT INTO s_contingency_terms VALUES(?,?,?,?,?,?)',key,m,version+1,JSON.stringify(terms),a.email,now()),audit(db,a,'settlement.terms_reviewed',key,'',{matterId:m,version:version+1})]);
 return termsView((await stmt(db,'SELECT * FROM s_contingency_terms WHERE id=?',key).first<Data>())!);
}
export async function prepareSettlement(db:D1Database,a:Actor,m:string,b:Data){
 const current=await access(db,a,m);need(a,'owner','lawyer');insist(current.lifecycle_status!=='closed','Reopen the matter before preparing a settlement',409);
 const t=await latest(db,'s_contingency_terms',m);insist(t&&t.id===b.termsId,'Select the current reviewed contingency terms',409);
 const terms=JSON.parse(t.terms),outcome=terms.outcomes.find((o:Data)=>o.name===b.outcome);insist(outcome,'Choose a reviewed outcome tier',422);
 insist(b.earnedConfirmed===true,'Confirm the reviewed settlement earning condition',422);
 const old=await latest(db,'s_settlement_statements',m),version=old?.version??0;insist(b.previousVersion===version,'Review the latest settlement statement',409);
 const gross=cents(b.grossCents,'Gross recovery');insist(gross>0,'Gross recovery must be positive');
 insist(Array.isArray(b.allocations)&&b.allocations.length<=100,'Record the settlement allocations');
 const allocations=b.allocations.map((r:Data)=>{insist(['expense','lien','medical'].includes(r.kind),'Choose expense, lien or medical provider');const original=cents(r.originalCents,'Original obligation'),reduction=cents(r.reductionCents,'Agreed reduction');insist(reduction<=original,'Reduction exceeds the original obligation');return {kind:r.kind,payee:text(r.payee,'Payee',200),originalCents:original,reductionCents:reduction,amountCents:original-reduction,reference:text(r.reference,'Obligation and reduction evidence',2000)};});
 const expenses=allocations.filter((r:Data)=>r.kind==='expense').reduce((v:number,r:Data)=>v+r.amountCents,0),costs=allocations.reduce((v:number,r:Data)=>v+r.amountCents,0);
 insist(costs<=gross,'Obligations exceed gross recovery',422);
 const feeBase=terms.feeBasis==='gross'?gross:gross-expenses,fee=share(feeBase,outcome.bps);
 insist(Array.isArray(b.referrals)&&b.referrals.length<=20,'Record referral allocations or an empty list');
 let totalBps=0;const referrals=b.referrals.map((r:Data)=>{const bps=integer(r.bps,'Referral share of counsel fee in basis points',0,10000);totalBps+=bps;return {kind:'referral',payee:text(r.payee,'Referral payee',200),bps,amountCents:share(fee,bps),reference:text(r.reference,'Reviewed referral agreement',2000)};});
 const referralTotal=referrals.reduce((v:number,r:Data)=>v+r.amountCents,0);insist(totalBps<=10000&&referralTotal<=fee,'Referral allocations exceed the counsel fee',422);
 const client=gross-costs-fee;insist(client>=0,'Fees and obligations exceed gross recovery',422);
 const snapshot={grossCents:gross,termsId:t.id,termsVersion:t.version,terms,outcome,feeBaseCents:feeBase,feeCents:fee,expensesCents:expenses,allocations:[...allocations,...referrals,{kind:'counsel',payee:'Firm counsel',amountCents:fee-referralTotal},{kind:'client',payee:current.client,amountCents:client}],earningEvidence:text(b.earningEvidence,'Completed earning event evidence',2000),reference:text(b.reference,'Recovery source reference',2000)};
 insist(snapshot.allocations.reduce((v:number,r:Data)=>v+r.amountCents,0)===gross,'Settlement does not reconcile to gross recovery',422);
 const key=id();await atomic(db,a,[accessGuard(db,a,m),versionGuard(db,'s_contingency_terms',m,t.version),versionGuard(db,'s_settlement_statements',m,version),stmt(db,'INSERT INTO s_settlement_statements VALUES(?,?,?,?,?,?,?)',key,m,version+1,t.id,JSON.stringify(snapshot),a.email,now()),audit(db,a,'settlement.prepared',key,'',{matterId:m,version:version+1})]);
 return statementView((await stmt(db,'SELECT * FROM s_settlement_statements WHERE id=?',key).first<Data>())!);
}
async function currentStatement(db:D1Database,a:Actor,m:string,b:Data){await access(db,a,m);const current=await matter(db,a,m);insist(current.lifecycle_status!=='closed','Reopen the matter before settlement approval or funds review',409);const s=await latest(db,'s_settlement_statements',m);insist(s&&s.id===b.statementId,'Review the current exact settlement revision',409);return s;}
export async function approveSettlement(db:D1Database,a:Actor,m:string,b:Data){
 const s=await currentStatement(db,a,m,b);insist(['counsel','finance'].includes(b.capacity),'Choose counsel or finance approval');
 if(b.capacity==='counsel')need(a,'owner','lawyer');else await trustOfficer(db,a);
 const approvals=await rows(db,'SELECT * FROM s_settlement_approvals WHERE statement_id=?',s.id);insist(!approvals.some(r=>r.actor===a.email&&r.capacity!==b.capacity),'Counsel and finance approvals require different people',403);
 const note=text(b.note,'Exact revision approval evidence',2000),existing=approvals.find(r=>r.capacity===b.capacity);if(existing){insist(existing.actor===a.email&&existing.note===note,'This capacity already approved this revision',409);return existing;}
 await atomic(db,a,[accessGuard(db,a,m),versionGuard(db,'s_settlement_statements',m,s.version),...(b.capacity==='finance'?[officerGuard(db,a)]:[]),guard(db,'NOT EXISTS(SELECT 1 FROM s_settlement_approvals WHERE statement_id=? AND actor=? AND capacity<>?)',s.id,a.email,b.capacity),stmt(db,'INSERT INTO s_settlement_approvals VALUES(?,?,?,?,?)',s.id,b.capacity,a.email,note,now()),audit(db,a,'settlement.approved',s.id,'',{matterId:m,capacity:b.capacity})]);
 return {statementId:s.id,capacity:b.capacity};
}
export async function checkSettlementFunds(db:D1Database,a:Actor,m:string,b:Data){
 const s=await currentStatement(db,a,m,b);await trustOfficer(db,a);
 const approvals=await rows(db,"SELECT p.*,CASE WHEN o.role='owner' THEN 'owner' ELSE member.role END role FROM s_settlement_approvals p JOIN oa_operators o ON o.email=p.actor AND o.status='active' LEFT JOIN s_members member ON member.email=p.actor AND member.active=1 WHERE p.statement_id=? AND ((p.capacity='counsel' AND (o.role='owner' OR member.role='lawyer')) OR (p.capacity='finance' AND member.role='trust_officer'))",s.id);
 for(const approval of approvals)await matter(db,{...a,email:approval.actor,role:approval.role},m);
 insist(approvals.length===2&&new Set(approvals.map(r=>r.actor)).size===2,'Current counsel and authorized finance approvals are required',409);
 const ledger=await stmt(db,'SELECT * FROM s_trust_ledgers WHERE id=? AND matter_id=?',text(b.ledgerId,'Same-matter trust ledger'),m).first<Data>();insist(ledger,'Use a trust ledger for this matter',409);
 const available=await stmt(db,`SELECT (${availabilitySql()}) cents`,ledger.id,ledger.id,'',ledger.id,'').first<Data>();const gross=JSON.parse(s.snapshot).grossCents;
 insist(available!.cents>=gross,'Cleared unreserved same-matter funds must cover the full gross recovery',409);
 await atomic(db,a,[accessGuard(db,a,m),officerGuard(db,a),versionGuard(db,'s_settlement_statements',m,s.version),audit(db,a,'settlement.funds_checked',s.id,'No authorization, reservation or money movement',{matterId:m,ledgerId:ledger.id})]);
 return {statementId:s.id,grossCents:gross,availableCents:available!.cents,moneyMoved:false,reserved:false,notice:'Readiness check only. Use the separately approved trust disbursement workflow; this check grants no spending authority.'};
}
