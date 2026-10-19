import {open} from './harness.mjs';
export async function designate(h,email='owner@example.test',name='Principal') {await h.json('/team',{email,name,role:'trust_officer'},h.owner);}
export async function statement(h,m,name='September bank statement.txt') {return h.json('/matters/'+m.id+'/documents',{name,mime:'text/plain',contentBase64:Buffer.from('Bank statement September 30, 2026. Client opening funds supported by bank records.').toString('base64'),visibility:'matter'},h.owner);}
export async function foundation(h){
 await designate(h);const m=await open(h),other=await open(h,'Pine advice','Pine Studio','Other owner'),source=await statement(h,m),otherSource=await statement(h,other);
 const account=await h.json('/trust/accounts',{name:'Community Bank IOLTA',kind:'trust',bankReference:'4821'},h.owner),operating=await h.json('/trust/accounts',{name:'Community Bank Operating',kind:'operating',bankReference:'1192'},h.owner);
 const ledger=await h.json('/trust/ledgers',{accountId:account.id,matterId:m.id},h.owner),otherLedger=await h.json('/trust/ledgers',{accountId:account.id,matterId:other.id},h.owner);
 return {m,other,source,otherSource,account,operating,ledger,otherLedger};
}
