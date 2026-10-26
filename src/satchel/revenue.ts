import {accountWallScope} from './trust-wall-scope';
import {atomic,audit,Fault,human,id,insist,integer,matter,need,now,rows,stmt,text,digest,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {requireArea} from './role-areas';
import {sourceDocument,sourceGuard} from './trust';
import {documentAccess} from './documents';
import {invoiceFunds} from './trust-transfers';
import {revenueSources} from './revenue-sources';
import {calculateRevenue,revenueBasis,revenueFormula,reversedCalculation} from './revenue-calculation';

function principal(actor:Actor){human(actor);need(actor,'owner');requireArea(actor,'reports','firm');requireArea(actor,'rates','all');requireArea(actor,'bank','full');}
const ruleJson=(r:Data):Data=>({id:r.id,version:r.version,basis:r.basis,reference:r.reference,splits:JSON.parse(r.splits),source:{id:r.source_document_id,version:r.source_version,digest:r.source_digest},approvedBy:r.approved_by,approvedAt:r.approved_at});
async function rulesFor(db:D1Database,matterId:string){return (await rows(db,'SELECT * FROM s_revenue_rules WHERE matter_id=? ORDER BY version',matterId)).map(ruleJson);}
async function attorney(db:D1Database,actor:Actor,email:string,matterId:string){
 const o=await stmt(db,`SELECT o.id,o.role,m.role member_role,m.active FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email WHERE o.email=? AND o.status='active' AND (o.role='owner' OR (m.role='lawyer' AND m.active=1))`,email).first<Data>();
 insist(o,'Allocation beneficiaries must be active principal or lawyer staff',409);
 const person:Actor={...actor,id:o.id,email,role:o.role==='owner'?'owner':'lawyer',channel:'person'};await matter(db,person,matterId);
 return [guard(db,`EXISTS(SELECT 1 FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email WHERE o.id=? AND o.email=? AND o.status='active' AND (o.role='owner' OR (m.role='lawyer' AND m.active=1)))`,o.id,email),accessGuard(db,person,matterId)];
}
async function replay(db:D1Database,table:string,key:string,request:string){const r=await stmt(db,`SELECT * FROM ${table} WHERE request_key=?`,key).first<Data>();if(r)insist(r.request_json===request,'This request reference retains different approved terms',409);return r;}
export async function approveRevenueRule(db:D1Database,actor:Actor,matterId:string,b:Data){
 principal(actor);await matter(db,actor,matterId);insist(b.approve===true,'Explicit principal approval is required',403);
 const key=text(b.requestKey,'Request reference',100),reference=text(b.reference,'Agreement citation',1000);insist(b.basis==='proportional_fee_receipts','Choose the collected fee proportion basis');
 insist(Array.isArray(b.splits)&&b.splits.length===2,'Review origination and responsible-attorney shares');
 const splits=b.splits.map((s:Data)=>({kind:text(s.kind,'Allocation kind',30),email:text(s.email,'Attorney email',254).toLowerCase(),shareBps:integer(s.shareBps,'Revenue share basis points',0,10000),commissionBps:integer(s.commissionBps,'Commission basis points',0,10000)}));
 insist(splits.some(s=>s.kind==='origination')&&splits.some(s=>s.kind==='responsible')&&splits.reduce((n,s)=>n+s.shareBps,0)<=10000,'Give one origination and one responsible share totaling at most 10000 basis points');
 const request=JSON.stringify({matterId,previousId:b.previousId??null,basis:b.basis,reference,splits,sourceDocumentId:b.sourceDocumentId,sourceVersion:b.sourceVersion,sourceDigest:b.sourceDigest});
 const prior=await replay(db,'s_revenue_rules',key,request);if(prior)return ruleJson(prior);
 const rules=await rulesFor(db,matterId),current=rules.at(-1);insist((b.previousId??null)===(current?.id??null),'The approved rule changed; review its current version',409);
 const source=await sourceDocument(db,actor,b.sourceDocumentId,matterId),checks:D1PreparedStatement[]=[];insist(b.sourceVersion===source.version&&b.sourceDigest===source.digest,'The supporting agreement changed; review its exact current version',409);
 for(const s of splits)checks.push(...await attorney(db,actor,s.email,matterId));
 const ruleId=id(),at=now(),version=(current?.version??0)+1;
 try{await atomic(db,actor,[accessGuard(db,actor,matterId),...checks,sourceGuard(db,source,actor),guard(db,'EXISTS(SELECT 1 FROM s_documents WHERE id=? AND current_version=?)',source.id,source.version),guard(db,'(SELECT COUNT(*) FROM s_revenue_rules WHERE matter_id=?)=?',matterId,rules.length),stmt(db,'INSERT INTO s_revenue_rules VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',ruleId,matterId,version,key,request,b.basis,reference,JSON.stringify(splits),source.id,source.version,source.digest,actor.email,at),audit(db,actor,'revenue.rule_approved',ruleId,request,{matterId})]);}
 catch(e){if(!(e instanceof Fault)||e.status!==409)throw e;const p=await replay(db,'s_revenue_rules',key,request);if(!p)throw e;return ruleJson(p);}
 return ruleJson((await stmt(db,'SELECT * FROM s_revenue_rules WHERE id=?',ruleId).first<Data>())!);
}
function sourceChecks(db:D1Database,s:Data){
 if(s.kind==='offline')return [guard(db,'EXISTS(SELECT 1 FROM s_offline_allocations WHERE id=? AND bill_id=? AND cents=?)',s.id,s.billId,s.cents),guard(db,'(SELECT COUNT(*) FROM s_offline_releases WHERE allocation_id=?)=?',s.id,s.reversals.length)];
 if(s.kind==='operating')return [s.components?guard(db,'EXISTS(SELECT 1 FROM s_operating_payments p JOIN s_tax_trust_allocations a ON a.transfer_id=p.transfer_id WHERE p.id=? AND a.earned_cents=? AND a.tax_cents=?)',s.id,s.components.earnedCents,s.components.taxCents):guard(db,'NOT EXISTS(SELECT 1 FROM s_operating_payments p JOIN s_tax_trust_allocations a ON a.transfer_id=p.transfer_id WHERE p.id=?)',s.id),guard(db,'EXISTS(SELECT 1 FROM s_operating_payments WHERE id=? AND bill_id=? AND cents=?)',s.id,s.billId,s.cents),guard(db,'(SELECT COALESCE(SUM(cents),0) FROM s_operating_payment_reversals WHERE payment_id=?)=?',s.id,s.cents-s.netCents)];
 return [guard(db,"EXISTS(SELECT 1 FROM s_stripe_checkouts WHERE id=? AND bill_id=? AND cents=? AND purpose='operating' AND status IN('paid','returned'))",s.id,s.billId,s.cents),guard(db,'(SELECT COALESCE(SUM(cents),0) FROM s_stripe_adjustments WHERE checkout_id=?)=?',s.id,s.cents-s.netCents)];
}
async function proposal(db:D1Database,s:Data,rule:Data){
 const basis:Data=await revenueBasis(db,s.billId);if(s.components){insist(s.components.earnedCents+s.components.taxCents===s.cents,'Retained bank component allocation does not match the receipt',409);basis.receiptComponents=s.components;}insist(s.netCents<=basis.totalCents,'Collection exceeds the current invoice basis; resolve its credit before allocation',409);
 const snapshot={sourceKey:s.key,billId:s.billId,cents:s.netCents,sourceCents:s.cents,reversalIds:s.reversals.map((r:Data)=>r.id),basis,ruleId:rule.id,splits:rule.splits};
 return {snapshot,reviewDigest:await digest(JSON.stringify({snapshot,netCents:s.netCents,reversals:s.reversals})),...calculateRevenue(s.netCents,basis,rule.splits),ruleId:rule.id};
}
export async function approveRevenueAllocation(db:D1Database,actor:Actor,matterId:string,b:Data){
 principal(actor);await matter(db,actor,matterId);insist(b.approve===true,'Explicit principal allocation approval is required',403);
 const key=text(b.requestKey,'Request reference',100),sourceKey=text(b.sourceKey,'Collection source',150),ruleId=text(b.ruleId,'Approved rule',100),reviewDigest=text(b.reviewDigest,'Reviewed calculation',100),request=JSON.stringify({matterId,sourceKey,ruleId,reviewDigest});
 const prior=await replay(db,'s_revenue_allocations',key,request);if(prior)return {id:prior.id};
 const rules=await rulesFor(db,matterId),rule=rules.at(-1);insist(rule&&rule.id===ruleId,'Review the current approved allocation rule',409);
 const source=(await revenueSources(db,matterId)).find(s=>s.key===sourceKey);insist(source&&source.netCents>0,'Choose an actual applied operating receipt',409);
 insist(!await stmt(db,'SELECT 1 FROM s_revenue_allocations WHERE source_key=?',sourceKey).first(),'This source already has an approved allocation',409);
 const p=await proposal(db,source,rule);insist(p.reviewDigest===reviewDigest,'The source, invoice or rule changed; review the exact calculation',409);
 const checks:D1PreparedStatement[]=[];for(const s of rule.splits)checks.push(...await attorney(db,actor,s.email,matterId));
 const allocationId=id(),at=now();
 const branchSql="WITH RECURSIVE branch AS (SELECT * FROM s_bills WHERE id=? UNION ALL SELECT b.* FROM s_bills b JOIN branch p ON b.corrects_bill_id=p.id WHERE b.status<>'void') SELECT COUNT(*) FROM branch";
 try{await atomic(db,actor,[accessGuard(db,actor,matterId),...checks,...sourceChecks(db,source),guard(db,'(SELECT MAX(version) FROM s_revenue_rules WHERE matter_id=?)=?',matterId,rule.version),sourceGuard(db,rule.source,actor),guard(db,'('+branchSql+')=?',source.billId,p.snapshot.basis.bills.length),...p.snapshot.basis.bills.map((v:Data)=>guard(db,"EXISTS(SELECT 1 FROM s_bills WHERE id=? AND revision=? AND status IN('approved','exported'))",v.id,v.revision)),stmt(db,'INSERT INTO s_revenue_allocations VALUES(?,?,?,?,?,?,?,?,?,?)',allocationId,matterId,sourceKey,source.billId,ruleId,key,request,JSON.stringify(p.snapshot),actor.email,at),audit(db,actor,'revenue.collection_allocated',allocationId,request,{matterId})]);}
 catch(e){if(!(e instanceof Fault)||e.status!==409)throw e;const p=await replay(db,'s_revenue_allocations',key,request);if(!p)throw e;return {id:p.id};}
 return {id:allocationId};
}
function allocationJson(r:Data,source:Data){
 const snap=JSON.parse(r.snapshot),original=calculateRevenue(snap.cents,snap.basis,snap.splits);let left=snap.cents,previous=original;
 const reversals=source.reversals.filter((event:Data)=>!snap.reversalIds.includes(event.id)).map((event:Data)=>{left-=event.cents;insist(left>=0,'Collection reversal exceeds original receipt',409);const after=calculateRevenue(left,snap.basis,snap.splits),calculation=reversedCalculation(previous,after);previous=after;return {...event,calculation};});
 return {id:r.id,sourceKey:r.source_key,billId:r.bill_id,ruleId:r.rule_id,approvedBy:r.approved_by,approvedAt:r.approved_at,original,current:previous,reversals};
}
export async function revenueState(db:D1Database,actor:Actor,matterId:string){
 principal(actor);const m=await matter(db,actor,matterId),rules=await rulesFor(db,matterId),current=rules.at(-1)??null,sources=await revenueSources(db,matterId),retained=await rows(db,'SELECT * FROM s_revenue_allocations WHERE matter_id=? ORDER BY approved_at,id',matterId);
 const allocations=retained.map(r=>{const source=sources.find(s=>s.key===r.source_key);insist(source,'Retained collection source is unavailable',409);return allocationJson(r,source);});
 for(const s of sources){s.allocationId=retained.find(r=>r.source_key===s.key)?.id??null;s.preview=null;if(!s.allocationId&&s.netCents>0&&current){try{const {snapshot,...p}=await proposal(db,s,current);s.preview=p;}catch(e){if(!(e instanceof Fault))throw e;s.blockedReason=e.message;}}}
 const bills:Data[]=[];for(const b of await rows(db,"SELECT id,snapshot,revision FROM s_bills WHERE matter_id=? AND corrects_bill_id IS NULL AND status IN('approved','exported') ORDER BY created_at,id",matterId)){const f=await invoiceFunds(db,b.id);bills.push({id:b.id,title:JSON.parse(b.snapshot).title,totalCents:f.earned_cents+f.tax_cents,dueCents:f.due_cents,revision:b.revision});}
 const da=documentAccess(actor),documents=await rows(db,`SELECT d.id,d.title FROM s_documents d WHERE d.matter_id=? AND d.erased_at IS NULL AND ${da.sql} ORDER BY d.title`,matterId,...da.params);
 for(const r of rules){const visible=documents.some(d=>d.id===r.source.id);if(!visible)r.source={unavailable:true};}
 return {client:m.client,rules,current,sources,allocations,bills,documents,accounts:await rows(db,`SELECT a.id,a.name FROM s_trust_accounts a CROSS JOIN (SELECT ? email) scope_viewer WHERE a.kind='operating' AND ${accountWallScope('a.id','scope_viewer.email')} ORDER BY a.created_at,a.id`,actor.email),formula:revenueFormula,totals:{collectedCents:sources.reduce((n,s)=>n+s.netCents,0),allocatedFeeCents:allocations.reduce((n,a)=>n+a.current.feeCents,0),commissionCents:allocations.reduce((n,a)=>n+a.current.allocations.reduce((v:number,p:Data)=>v+p.commissionCents,0),0)}};
}
