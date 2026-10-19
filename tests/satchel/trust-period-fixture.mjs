import {foundation} from './trust-fixture.mjs';
export async function transaction(h,f,{ledgerId=f.ledger.id,cents=1250,direction='receipt',day='2026-09-20',cleared=true,reference='receipt',documentId=f.source.id}={}){
 const t=await h.json('/trust/transactions',{accountId:f.account.id,ledgerId,direction,kind:direction==='receipt'?'receipt':'check',cents,counterparty:direction==='receipt'?'Barton Workshop LLC':'County filing office',bankReference:reference,receivedDate:day,depositDate:day,clearedDate:cleared?day:undefined,requestKey:reference,documentId,purpose:'Client trust funds supported by retained bank original'},h.owner);
 await h.json('/trust/transactions/'+t.id+'/decide',{revision:t.revision,decision:'approved',reviewNote:'Bank original, client ownership and amount reviewed'},h.owner);
 return (await h.json('/trust',undefined,h.owner)).entries.find(e=>e.source_id===t.id);
}
export async function periodFoundation(h){
 const f=await foundation(h);const o=await h.json('/trust/openings',{accountId:f.account.id,ledgerId:f.ledger.id,cents:100000,statementDate:'2026-09-01',documentId:f.source.id,note:'Dated September opening statement'},h.owner);
 await h.json('/trust/openings/'+o.id+'/approve',{revision:o.revision,reviewNote:'Opening source and client ownership reviewed'},h.owner);
 return f;
}
export async function correction(h,f,entry,day='2026-09-20'){
 const r=await h.json('/trust/entries/'+entry.id+'/reversal',{effectiveDate:day,documentId:f.source.id,reason:'Misallocated receipt; retain original and replace with correct subsidiary'},h.owner);
 const b={revision:r.revision,decision:'approved',reviewNote:'Exact original, source and correcting subsidiary reviewed'};
 await h.json('/trust/journal-reversals/'+r.id+'/decide',b,h.owner);return r;
}

export const createPeriod=(h,f,startDate='2026-09-01',endDate='2026-09-30',closingBalanceCents=101250)=>h.json('/trust/periods',{accountId:f.account.id,startDate,endDate,closingBalanceCents,documentId:f.source.id},h.owner);
export async function sign(h,p){const r=await h.json('/trust/periods/'+p.id,undefined,h.owner);return h.json('/trust/periods/'+p.id+'/sign',{reportDigest:r.reportDigest},h.owner);}
