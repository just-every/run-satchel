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
 human(actor);need(actor,'owner','lawyer');const m=await matter(db,actor,matterId);
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
 let trust=null,ledesMapping=null;
 if(b.trust){insist(['permitted','prohibited'].includes(b.trust.eligibility),'Review tax trust eligibility explicitly',422);trust={eligibility:b.trust.eligibility,reference:text(b.trust.reference,'Tax trust eligibility review reference',1000)};}
 if(b.ledesMapping){const v=b.ledesMapping;
  const clientLedesId=text(v.clientLedesId,'Reviewed LEDES client ID',20),expenseCode=text(v.expenseCode,'Client-reviewed 1998B tax expense code',4).toUpperCase();
  insist(!/[|]|\[\]/.test(clientLedesId)&&/^E\d{3}$/.test(expenseCode),'Review a valid client ID and E000-shaped tax expense code');
  ledesMapping={client:m.client,clientLedesId,expenseCode,taxIdNumber:text(v.taxIdNumber,'XML tax registration/reference',30),taxType:text(v.taxType,'XML tax type',30),reference:text(v.reference,'Client tax mapping review reference',1000)};
 }
 const terms={trust,ledesMapping,state,jurisdiction:text(b.jurisdiction,'Reviewed jurisdiction including locality',200),rounding:b.rounding,reference:text(b.reference,'Counsel/accountant review reference',1000),...treatments};
 const ruleId=id();await atomic(db,actor,[accessGuard(db,actor,matterId),stmt(db,'INSERT INTO s_tax_rules VALUES(?,?,?,?,?)',ruleId,matterId,JSON.stringify(terms),actor.email,now()),audit(db,actor,'tax.rule_reviewed',ruleId,JSON.stringify(terms),{matterId})]);
 return rule((await stmt(db,'SELECT * FROM s_tax_rules WHERE id=?',ruleId).first<Data>())!);
}
// BigInt avoids loss of precision even where cents × rate exceeds Number's range.
export function rounded(cents:number,ppm:number,mode:string){
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
 insist(b.status==='draft','Tax review requires a current draft',409);
 insist(body.revision===b.revision,'Bill changed; review its current revision',409);
 const s=JSON.parse(b.snapshot),basis=s.taxBasis;
 insist(!b.corrects_bill_id||basis,'This legacy correction has no reviewed original tax basis; review the original treatment before correcting tax',422);
 if(basis)insist(body.ruleId===undefined||body.ruleId===basis.rule.id,'A correction retains the original reviewed tax rule',422);
 const r=await stmt(db,'SELECT * FROM s_tax_rules WHERE id=? AND matter_id=?',text(basis?.rule.id??body.ruleId,'Reviewed tax rule ID',100),b.matter_id).first<Data>();
 insist(r,'Unknown reviewed tax treatment for this matter',422);const t=basis?.rule??rule(r);
 const lines=s.lines.map((l:Data)=>{
  insist(['time','fee','disbursement'].includes(l.kind),'Unknown tax record kind: review treatment',422);
  const treatment=l.kind==='disbursement'?t.expense:t.service;
  if(basis){
   const priorBaseCents=integer(l.priorAmountCents,'Prior tax base in USD cents',0,1000000000000),correctedBaseCents=integer(l.correctedAmountCents,'Corrected tax base in USD cents',0,1000000000000);
   const priorTaxCents=rounded(priorBaseCents,treatment.ratePpm,t.rounding),correctedTaxCents=rounded(correctedBaseCents,treatment.ratePpm,t.rounding);
   insist(l.amountCents===correctedBaseCents-priorBaseCents,'Correction tax basis does not match its reviewed source',409);
   return {sourceId:l.sourceId,sourceRevision:l.sourceRevision,kind:l.kind,baseCents:l.amountCents,...treatment,priorBaseCents,correctedBaseCents,priorTaxCents,correctedTaxCents,taxCents:correctedTaxCents-priorTaxCents};
  }
  const baseCents=integer(l.amountCents,'Tax base in USD cents',0,1000000000000);
  return {sourceId:l.sourceId,sourceRevision:l.sourceRevision,kind:l.kind,baseCents,...treatment,taxCents:rounded(baseCents,treatment.ratePpm,t.rounding)};
 });
 const subtotalCents=lines.reduce((n:number,l:Data)=>n+l.baseCents,0),taxCents=lines.reduce((n:number,l:Data)=>n+l.taxCents,0),totalCents=subtotalCents+taxCents;
 insist(Number.isSafeInteger(totalCents),'Tax total exceeds exact integer range');
 const snapshot={label:'Native tax calculation review only; not issued, applied to trust or exported',provider:'native firm-reviewed calculation',providerResult:null,currency:'USD',rule:t,rounding:'per line '+t.rounding,...(basis?{correctionBasis:basis}:{}),lines,subtotalCents,taxCents,totalCents};
 const calcId=id();await atomic(db,actor,[accessGuard(db,actor,b.matter_id),guard(db,"EXISTS(SELECT 1 FROM s_bills WHERE id=? AND revision=? AND status='draft')",b.id,b.revision),stmt(db,'INSERT INTO s_tax_calculations VALUES(?,?,?,?,?,?,?)',calcId,b.id,b.matter_id,b.revision,JSON.stringify(snapshot),actor.email,now()),audit(db,actor,'tax.calculation_reviewed',calcId,JSON.stringify({ruleId:t.id,billId:b.id}),{matterId:b.matter_id})]);
 return calculation((await stmt(db,'SELECT * FROM s_tax_calculations WHERE id=?',calcId).first<Data>())!);
}

// BILL-004: every approval door, including unconfigured legacy drafts, requires exact reviewed treatment.
export async function approvalTax(db:D1Database,actor:Actor,bill:Data,body:Data,approvedAt:string){
 insist(body.taxReviewId,'Unknown tax treatment: review and select the exact draft tax calculation before approval, including legacy drafts and exemptions',422);
 const r=await stmt(db,'SELECT * FROM s_tax_calculations WHERE id=? AND bill_id=? AND matter_id=? AND bill_revision=?',text(body.taxReviewId,'Reviewed tax calculation ID',100),bill.id,bill.matterId,bill.revision).first<Data>();
 insist(r,'Unknown or stale tax calculation: review this exact bill revision',422);
 const review=calculation(r),t=review.snapshot,snapshot={...bill.snapshot,subtotalCents:t.subtotalCents,taxCents:t.taxCents,totalCents:t.totalCents,taxReview:review};
 if(snapshot.ledes){
  const mapping=t.rule.ledesMapping;
  insist(mapping&&mapping.client===snapshot.client&&mapping.clientLedesId===snapshot.ledes.clientId,'Missing reviewed per-client LEDES 1998B/XML tax mapping; review the exact client ID',422);
  // A replacement LEDES file contains the complete corrected invoice, while the
  // native correction CSV/PDF carries only its signed additive difference.
  const lines=snapshot.ledes.lines.map((line:Data)=>{const treatment=line.type==='E'?t.rule.expense:t.rule.service;return {sourceId:line.sourceId,type:line.type,baseCents:line.totalCents,taxCents:rounded(line.totalCents,treatment.ratePpm,t.rule.rounding)};});
  snapshot.ledes={...snapshot.ledes,tax:{rule:t.rule,mapping,lines,totalCents:lines.reduce((n:number,l:Data)=>n+l.taxCents,0)}};
 }
 return {snapshot,guards:[guard(db,'EXISTS(SELECT 1 FROM s_tax_calculations WHERE id=? AND bill_id=? AND bill_revision=?)',r.id,bill.id,bill.revision),stmt(db,'INSERT INTO s_bill_tax_approvals VALUES(?,?,?,?,?)',bill.id,r.id,JSON.stringify(snapshot),actor.email,approvedAt)]};
}
