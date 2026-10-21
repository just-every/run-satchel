// BILL-004: counsel-reviewed inputs; no inferred jurisdiction, rate or eligibility.
import {atomic,audit,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
const states=new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
const rule=(r:Data)=>({id:r.id,matterId:r.matter_id,...JSON.parse(r.terms),reviewedBy:r.reviewed_by,reviewedAt:r.reviewed_at});
const calculation=(r:Data)=>({id:r.id,billId:r.bill_id,matterId:r.matter_id,billRevision:r.bill_revision,snapshot:JSON.parse(r.snapshot),createdBy:r.created_by,createdAt:r.created_at});
export async function taxRules(db:D1Database,actor:Actor,matterId:string){
 await matter(db,actor,matterId);return {rules:(await rows(db,'SELECT * FROM s_tax_rules WHERE matter_id=? ORDER BY reviewed_at,id',matterId)).map(rule)};
}
export async function saveTaxRule(db:D1Database,actor:Actor,matterId:string,b:Data){
 human(actor);need(actor,'owner','lawyer');await matter(db,actor,matterId);
 insist(b.reviewed===true,'Counsel must confirm the exact accountant/counsel-reviewed tax treatment',422);
 const state=text(b.state,'US state or DC',2).toUpperCase();insist(states.has(state),'Choose a US state or DC');
 insist(['half_up','half_even','down'].includes(b.rounding),'Choose per-line rounding: half_up, half_even or down');
 const treatments:Data={};
 for(const kind of ['service','expense']){
  const t=b[kind];insist(t&&typeof t==='object'&&!Array.isArray(t),'Review '+kind+' tax treatment',422);
  insist(['taxable','exempt'].includes(t.eligibility),'Unknown '+kind+' tax eligibility: explicit reviewed taxable or exempt treatment is required',422);
  const rate=integer(t.ratePpm,kind+' rate in parts per million',0,1000000);
  insist(t.eligibility!=='exempt'||rate===0,'Exempt treatment requires an explicit zero rate');
  treatments[kind]={eligibility:t.eligibility,ratePpm:rate,reference:text(t.reference,kind+' treatment or exemption reference',1000)};
 }
 const terms={state,jurisdiction:text(b.jurisdiction,'Reviewed jurisdiction including locality',200),rounding:b.rounding,reference:text(b.reference,'Counsel/accountant review reference',1000),...treatments};
 const ruleId=id();await atomic(db,actor,[accessGuard(db,actor,matterId),stmt(db,'INSERT INTO s_tax_rules VALUES(?,?,?,?,?)',ruleId,matterId,JSON.stringify(terms),actor.email,now()),audit(db,actor,'tax.rule_reviewed',ruleId,JSON.stringify(terms),{matterId})]);
 return rule((await stmt(db,'SELECT * FROM s_tax_rules WHERE id=?',ruleId).first<Data>())!);
}
// BigInt avoids loss of precision even where cents × rate exceeds Number's range.
function rounded(cents:number,ppm:number,mode:string){
 const n=BigInt(cents)*BigInt(ppm),d=1000000n,q=n/d,r=n%d;
 return Number(q+(mode==='down'?0n:mode==='half_even'?(r*2n>d||(r*2n===d&&q%2n===1n)?1n:0n):(r*2n>=d?1n:0n)));
}
async function billFor(db:D1Database,actor:Actor,billId:string){
 const b=await stmt(db,'SELECT * FROM s_bills WHERE id=?',billId).first<Data>();insist(b,'Bill not found',404);await matter(db,actor,b.matter_id);return b;
}
export async function taxCalculations(db:D1Database,actor:Actor,billId:string){
 const b=await billFor(db,actor,billId);return {calculations:(await rows(db,'SELECT * FROM s_tax_calculations WHERE bill_id=? ORDER BY created_at,id',b.id)).map(calculation)};
}
export async function calculateBillTax(db:D1Database,actor:Actor,billId:string,body:Data){
 human(actor);need(actor,'owner','lawyer');const b=await billFor(db,actor,billId);
 insist(b.status==='draft'&&!b.corrects_bill_id,'Tax review currently supports original drafts only',409);
 insist(body.revision===b.revision,'Bill changed; review its current revision',409);
 const r=await stmt(db,'SELECT * FROM s_tax_rules WHERE id=? AND matter_id=?',text(body.ruleId,'Reviewed tax rule ID',100),b.matter_id).first<Data>();
 insist(r,'Unknown reviewed tax treatment for this matter',422);const t=rule(r),s=JSON.parse(b.snapshot);
 const lines=s.lines.map((l:Data)=>{
  insist(['time','fee','disbursement'].includes(l.kind),'Unknown tax record kind: review treatment',422);
  const treatment=l.kind==='disbursement'?t.expense:t.service;
  const baseCents=integer(l.amountCents,'Tax base in USD cents',0,1000000000000);
  return {sourceId:l.sourceId,sourceRevision:l.sourceRevision,kind:l.kind,baseCents,...treatment,taxCents:rounded(baseCents,treatment.ratePpm,t.rounding)};
 });
 const subtotalCents=lines.reduce((n:number,l:Data)=>n+l.baseCents,0),taxCents=lines.reduce((n:number,l:Data)=>n+l.taxCents,0),totalCents=subtotalCents+taxCents;
 insist(Number.isSafeInteger(totalCents),'Tax total exceeds exact integer range');
 const snapshot={label:'Native tax calculation review only; not issued, applied to trust or exported',provider:'native firm-reviewed calculation',providerResult:null,currency:'USD',rule:t,rounding:'per line '+t.rounding,lines,subtotalCents,taxCents,totalCents};
 const calcId=id();await atomic(db,actor,[accessGuard(db,actor,b.matter_id),guard(db,"EXISTS(SELECT 1 FROM s_bills WHERE id=? AND revision=? AND status='draft')",b.id,b.revision),stmt(db,'INSERT INTO s_tax_calculations VALUES(?,?,?,?,?,?,?)',calcId,b.id,b.matter_id,b.revision,JSON.stringify(snapshot),actor.email,now()),audit(db,actor,'tax.calculation_reviewed',calcId,JSON.stringify({ruleId:t.id,billId:b.id}),{matterId:b.matter_id})]);
 return calculation((await stmt(db,'SELECT * FROM s_tax_calculations WHERE id=?',calcId).first<Data>())!);
}

// Interim BILL-004 integration: configured matters cannot silently bypass tax review.
// Unconfigured matters retain the legacy billing door until the full clause ships.
export async function approvalTax(db:D1Database,actor:Actor,bill:Data,body:Data,approvedAt:string){
 const configured=await stmt(db,'SELECT 1 FROM s_tax_rules WHERE matter_id=? LIMIT 1',bill.matterId).first();
 if(!body.taxReviewId){
  insist(!configured,'Unknown tax treatment: review and select the exact draft tax calculation before approval',422);
  return {snapshot:bill.snapshot,guards:[guard(db,'NOT EXISTS(SELECT 1 FROM s_tax_rules WHERE matter_id=?)',bill.matterId)]};
 }
 insist(!bill.correctsBillId,'Tax correction review is not implemented; this correction cannot be approved',422);
 const r=await stmt(db,'SELECT * FROM s_tax_calculations WHERE id=? AND bill_id=? AND matter_id=? AND bill_revision=?',text(body.taxReviewId,'Reviewed tax calculation ID',100),bill.id,bill.matterId,bill.revision).first<Data>();
 insist(r,'Unknown or stale tax calculation: review this exact bill revision',422);
 insist(!bill.snapshot.ledes,'Missing reviewed per-client LEDES 1998B/XML tax mapping; this bill cannot be approved',422);
 const review=calculation(r),t=review.snapshot,snapshot={...bill.snapshot,subtotalCents:t.subtotalCents,taxCents:t.taxCents,totalCents:t.totalCents,taxReview:review};
 return {snapshot,guards:[guard(db,'EXISTS(SELECT 1 FROM s_tax_calculations WHERE id=? AND bill_id=? AND bill_revision=?)',r.id,bill.id,bill.revision),stmt(db,'INSERT INTO s_bill_tax_approvals VALUES(?,?,?,?,?)',bill.id,r.id,JSON.stringify(snapshot),actor.email,approvedAt)]};
}
