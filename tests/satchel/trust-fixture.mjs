import {exemptTaxReview} from './tax-fixture.mjs';
import {open} from './harness.mjs';
export async function designate(h,email='owner@example.test',name='Principal') {await h.json('/team',{email,name,role:'trust_officer'},h.owner);}
export async function statement(h,m,name='September bank statement.txt') {return h.json('/matters/'+m.id+'/documents',{name,mime:'text/plain',contentBase64:Buffer.from('Bank statement September 30, 2026. Client opening funds supported by bank records.').toString('base64'),visibility:'matter'},h.owner);}
export async function foundation(h){
 await designate(h);const m=await open(h),other=await open(h,'Pine advice','Pine Studio','Other owner'),source=await statement(h,m),otherSource=await statement(h,other);
 const account=await h.json('/trust/accounts',{name:'Community Bank IOLTA',kind:'trust',bankReference:'4821'},h.owner),operating=await h.json('/trust/accounts',{name:'Community Bank Operating',kind:'operating',bankReference:'1192'},h.owner);
 const ledger=await h.json('/trust/ledgers',{accountId:account.id,matterId:m.id},h.owner),otherLedger=await h.json('/trust/ledgers',{accountId:account.id,matterId:other.id},h.owner);
 return {m,other,source,otherSource,account,operating,ledger,otherLedger};
}
export async function earnedBill(h,m,cents,title){const e=await h.json('/matters/'+m.id+'/entries',{kind:'time',date:'2026-10-01',description:title,minutes:60,rateCents:cents},h.owner);let b=await h.json('/matters/'+m.id+'/bills',{title,date:'2026-10-01',entryIds:[e.id]},h.owner);b=await h.json('/bills/'+b.id+'/approve',{...({revision:b.revision,reviewNote:'Legal services earned; exact lines and client authorization reviewed'}),taxReviewId:await exemptTaxReview(h,'/bills/'+b.id+'/approve')},h.owner);const exported=await h.request('/api/satchel/bills/'+b.id+'/export',undefined,h.owner);if(exported.status!==200)throw new Error('Reviewed bill export failed');return (await h.json('/matters/'+m.id+'/billing',undefined,h.owner)).bills.find(v=>v.id===b.id);}
