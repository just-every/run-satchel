import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
import {periodFoundation,transaction,correction,createPeriod,sign} from './trust-period-fixture.mjs';
test('TRUST-005: import original statements, drill $12.50 suspense and outstanding check, correct by journal, sign exact consecutive monthly packets',async()=>{
 const h=await harness();try{
 const f=await periodFoundation(h),suspense=await transaction(h,f,{ledgerId:null,reference:'unallocated-1250',day:'2026-09-10'}),check=await transaction(h,f,{cents:20000,direction:'disbursement',day:'2026-09-15',cleared:false,reference:'CHECK-1042'});
 const p=await createPeriod(h,f);let r=await h.json('/trust/periods/'+p.id,undefined,h.owner);
 assert.equal(r.registerCents,81250);assert.equal(r.subsidiaryCents,80000);assert.equal(r.adjustedBankCents,81250);assert.equal(r.balanced,false);
 assert.equal(r.outstandingChecksCents,20000);assert.equal(r.outstandingChecks[0].id,check.id);assert.equal(r.outstandingChecks[0].sources[0].bank_reference,'CHECK-1042');assert.equal(r.suspense[0].id,suspense.id);assert.ok(r.differences.some(d=>Math.abs(d.cents)===1250&&d.entryIds.includes(suspense.id)));
 assert.equal(r.sourceDocument.id,f.source.id);assert.equal((await h.request('/api/satchel/documents/'+f.source.id+'/file?version='+r.sourceDocument.version,undefined,h.owner)).status,200);
 await h.json('/trust/periods/'+p.id+'/sign',{reportDigest:r.reportDigest},h.owner,409);
 await correction(h,f,suspense);await transaction(h,f,{reference:'correct-client-1250'});
 r=await h.json('/trust/periods/'+p.id,undefined,h.owner);assert.deepEqual([r.adjustedBankCents,r.registerCents,r.subsidiaryCents],[81250,81250,81250]);assert.equal(r.balanced,true);
 const packet=await sign(h,p),download=await h.request('/api/satchel/trust/packets/'+packet.id,undefined,h.owner);assert.equal(download.status,200);const original=await download.text();assert.ok(download.headers.get('content-disposition').includes('attachment'));
 await transaction(h,f,{day:'2026-10-02',cents:5000,reference:'october-deposit'});const october=await createPeriod(h,f,'2026-10-01','2026-10-18',106250),oct=await h.json('/trust/periods/'+october.id,undefined,h.owner);assert.deepEqual([oct.adjustedBankCents,oct.registerCents,oct.subsidiaryCents],[86250,86250,86250]);await sign(h,october);
 assert.equal(await(await h.request('/api/satchel/trust/packets/'+packet.id,undefined,h.owner)).text(),original);
 const cutoff=await h.json('/trust/ledgers/'+f.ledger.id+'/statement?cutoffDate=2026-09-30',undefined,h.owner);assert.equal(cutoff.closingBalanceCents,81250);assert.ok(cutoff.entries.every(e=>e.effective_date<='2026-09-30'));
 await h.json('/team',{email:'assistant@example.test',name:'Case assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');await h.json('/trust/periods/'+p.id,undefined,assistant,403);await h.json('/trust/periods/'+p.id+'/sign',{reportDigest:r.reportDigest},assistant,403);
 const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),target=await harness();try{await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);assert.equal(await(await target.request('/api/satchel/trust/packets/'+packet.id,undefined,target.owner)).text(),original);}finally{await target.close();}
 }finally{await h.close();}
});
