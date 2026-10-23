import {open} from './harness.mjs';
import {reviewed,scheme} from './invoice-numbering-fixture.mjs';
export const feeTerms={scope:'matter',mode:'simple_monthly',termsDays:30,graceDays:10,monthlyBps:100,flatCents:0,effectiveFrom:'2026-08-01',reference:'Counsel reviewed native engagement authorizing simple 1% monthly interest after thirty days and ten grace days',reviewed:true,authorized:true};
export async function lateFeeFixture(h){
 const m=await open(h),other=await open(h,'No-interest advice','Pine Studio','Other adverse'),operating=await h.json('/trust/accounts',{name:'Operating deposit account',kind:'operating',bankReference:'synthetic-satchel-301'},h.owner);await h.json('/invoice-numbering',scheme(),h.owner);
 const issue=async(matter,title)=>{const e=await h.json('/matters/'+matter.id+'/entries',{kind:'time',date:'2026-08-01',description:title,minutes:60,rateCents:10000},h.owner);let b=await h.json('/matters/'+matter.id+'/bills',{title,date:'2026-08-01',entryIds:[e.id]},h.owner);b=await reviewed(h,matter,b);await h.json('/invoices/issue',{bills:[{id:b.id,revision:b.revision}]},h.owner);return b;};
 return {m,other,operating,bill:await issue(m,'Agreement-authorized old invoice'),otherBill:await issue(other,'No-interest old invoice')};
}
export const partialReceipt=f=>({requestKey:'synthetic-satchel-302',payer:'Barton Workshop LLC',destination:'operating',confirmedReceived:true,method:'check',reference:'synthetic-satchel-303',receivedDate:'2026-10-15',depositDate:'2026-10-15',accountId:f.operating.id,cents:5000,mode:'explicit',allocations:[{billId:f.bill.id,cents:5000}]});
