import assert from 'node:assert/strict';
import {foundation} from './trust-fixture.mjs';
import {exemptTaxReview} from './tax-fixture.mjs';
import {scheme} from './invoice-numbering-fixture.mjs';
import {invoiceTemplate,setupInvoicePayers} from './invoice-delivery-fixture.mjs';
export const economicsClock='2030-10-01T16:00:00.000Z';
export async function economicsFoundation(h){
 const f=await foundation(h),m=f.m,base='/matters/'+m.id,address={line1:'100 Example Street',city:'New York',state:'NY',zip:'10001'};
 await h.json('/firm',{settings:{name:'Synthetic Satchel Counsel',email:'firm@example.test',phone:'212-555-0100',address,timezone:'America/New_York',billing:{defaultRateCents:20000,incrementMinutes:1,paymentTermsDays:0},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main',phone:'212-555-0100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'}]}},h.owner);
 await h.json('/invoice-numbering',scheme(),h.owner);
 const template=await h.json('/invoice-templates',invoiceTemplate(null,{includeTrustBalance:false,dueDays:0}),h.owner);await h.json(base+'/invoice-template',{templateId:template.id,reason:'Reviewed aging source template'},h.owner);await setupInvoicePayers(h,m);
 const invoices=[];
 // Amounts and expected buckets are independent of the economics implementation.
 for(const [index,days] of [0,1,30,31,60,61,90,91,null].map((days,index)=>[index,days]).toSorted((a,b)=>(b[1]??0)-(a[1]??0))){
  const issued=new Date('2030-10-01T16:00:00Z');issued.setUTCDate(issued.getUTCDate()-(days??0));
  await h.setClock(issued.toISOString());h.owner=await h.login('owner@example.test');
  const date=issued.toISOString().slice(0,10),cents=10000+index*1000;
  const entry=await h.json(base+'/entries',{kind:'time',date,description:'Synthetic aging source '+index,minutes:60,rateCents:cents},h.owner);
  let bill=await h.json(base+'/bills',{title:'Synthetic aging invoice '+index,date,entryIds:[entry.id]},h.owner);bill=await h.json('/bills/'+bill.id+'/approve',{revision:bill.revision,taxReviewId:await exemptTaxReview(h,'/bills/'+bill.id+'/approve'),reviewNote:'Reviewed aging invoice and explicit tax allocation'},h.owner);await h.json('/invoices/issue',{bills:[{id:bill.id,revision:bill.revision}]},h.owner);
  if(days!==null){const delivery=await h.json('/bills/'+bill.id+'/deliveries',{recipient:'client@example.test',payerName:m.client,templateId:template.id},h.owner);assert.equal(delivery.dueDate,date);}
  invoices[index]={bill,entry,days,cents};
 }
 await h.setClock(economicsClock);h.owner=await h.login('owner@example.test');
 const costInput={email:'owner@example.test',effectiveFrom:'2030-01-01',hourlyCents:6000,reason:'Synthetic reviewed staff costing basis'},draft=await h.json('/reports/staff-costs/drafts',costInput,h.owner);
 const opening=await h.json('/trust/openings',{accountId:f.account.id,ledgerId:f.ledger.id,cents:5000,statementDate:'2030-10-01',documentId:f.source.id,note:'Synthetic cleared opening'},h.owner);await h.json('/trust/openings/'+opening.id+'/approve',{revision:opening.revision,reviewNote:'Reviewed exact opening'},h.owner);
 const transfer=async(index,cents,clear)=>{const t=await h.json('/trust/transfers',{billId:invoices[index].bill.id,ledgerId:f.ledger.id,operatingAccountId:f.operating.id,requestKey:'synthetic-satchel-aging-'+index,allocation:{earnedCents:cents,taxCents:0,reference:'Reviewed aging allocation'}},h.owner);if(clear){await h.json('/trust/transfers/'+t.id+'/decide',{revision:t.revision,decision:'approved',reviewNote:'Reviewed partial application'},h.owner);for(const outcome of ['submitted','cleared'])await h.json('/trust/transfers/'+t.id+'/bank-result',{revision:t.revision,outcome,bankDate:'2030-10-01',bankReference:'synthetic-satchel-aging-bank-'+index,documentId:f.source.id,evidence:'Synthetic exact bank confirmation'},h.owner);}return t;};
 await transfer(1,500,true);await transfer(3,200,false);
 await h.json('/team',{email:'lawyer@example.test',name:'Synthetic counsel',role:'lawyer'},h.owner);await h.json('/team/invite',{email:'lawyer@example.test'},h.owner);await h.json(base+'/access',{email:'lawyer@example.test'},h.owner);
 return {...f,invoices,draft,costInput,expectedAging:{current:10000,'1–30':22500,'31–60':27000,'61–90':31000,'91+':17000,unknown:18000}};
}
