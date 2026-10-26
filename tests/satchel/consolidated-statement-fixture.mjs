import assert from 'node:assert/strict';
import {open} from './harness.mjs';
import {draft,reviewed} from './invoice-numbering-fixture.mjs';
export async function consolidatedFixture(h,m,template){
 const other=await open(h,'Synthetic second selected matter',m.client,'Synthetic second adverse'),excluded=await open(h,'Synthetic excluded matter',m.client,'Synthetic third adverse');
 const issue=async target=>{
  await h.json('/matters/'+target.id+'/stage-profile',{revision:null,lawyerEmail:'owner@example.test',stageId:null},h.owner);
  await h.json('/matters/'+target.id+'/rates',{scope:'matter',effectiveFrom:'2026-01-01',rateCents:25000,incrementMinutes:1,discountBps:0,billable:true,note:'Synthetic approved matter fee agreement'},h.owner);
  const e=await h.json('/matters/'+target.id+'/entries',{kind:'time',date:'2026-10-01',description:'Synthetic confidential source',minutes:60},h.owner);
  const bill=await reviewed(h,target,await h.json('/matters/'+target.id+'/bills',{title:'Synthetic selected invoice',date:'2026-10-01',entryIds:[e.id]},h.owner));
  await h.json('/invoices/issue',{bills:[{id:bill.id,revision:bill.revision}]},h.owner);
  await h.json('/bills/'+bill.id+'/deliveries',{recipient:'client@example.test',payerName:'Synthetic Satchel Client',templateId:template.id},h.owner);
  return bill;
 };
 for(const target of [other,excluded])await h.json('/matters/'+target.id+'/portal',{email:'client@example.test',kind:'payer',reason:'Exact recipient invoice access'},h.owner);
 const first=await issue(other),third=await issue(excluded);
 return {other,excluded,first,third};
}
