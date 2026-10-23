import {open} from './harness.mjs';
import {reviewed,scheme} from './invoice-numbering-fixture.mjs';
async function issue(h,m,cents,title){const e=await h.json('/matters/'+m.id+'/entries',{kind:'time',date:'2026-10-01',description:title,minutes:60,rateCents:cents},h.owner);let b=await h.json('/matters/'+m.id+'/bills',{title,date:'2026-10-01',entryIds:[e.id]},h.owner);b=await reviewed(h,m,b);await h.json('/invoices/issue',{bills:[{id:b.id,revision:b.revision}]},h.owner);return b;}
export async function paymentFixture(h){
 const m=await open(h),other=await open(h,'Unrelated advice','Pine Studio','Barton'),sibling=await open(h,'Barton lease extension');
 const operating=await h.json('/trust/accounts',{name:'Community operating',kind:'operating',bankReference:'synthetic-satchel-1'},h.owner),trust=await h.json('/trust/accounts',{name:'Community trust',kind:'trust',bankReference:'synthetic-satchel-2'},h.owner);
 await h.json('/invoice-numbering',scheme(),h.owner);
 const bills=[];for(const [amount,title] of [[10000,'First lease advice'],[20000,'Second lease advice'],[30000,'Third lease advice']])bills.push(await issue(h,m,amount,title));
 return {m,other,sibling,operating,trust,bills,issue:(cents,title,target=m)=>issue(h,target,cents,title)};
}
export const receipt=(f,extra={})=>({requestKey:'synthetic-satchel-3',payer:'Barton Workshop LLC',destination:'operating',confirmedReceived:true,method:'check',reference:'synthetic-satchel-4',receivedDate:'2026-10-02',depositDate:'2026-10-03',accountId:f.operating.id,cents:45000,mode:'oldest',...extra});
