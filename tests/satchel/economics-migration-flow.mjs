import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
import {designate} from './trust-fixture.mjs';
import {setupMove,commitMove,applyMove} from './migration-fixture.mjs';

// A source invoice's old issue date is evidence, not a local observation time.
export async function proveMigratedEconomics(){
 const first='2030-01-10T16:00:00.000Z',later='2030-01-11T16:00:00.000Z',h=await harness({clock:first});let restored;
 try{
  const ownerEmail=(await h.json('/state',undefined,h.owner)).actor.email;await importEconomicsSource(h);
  const read=async(cookie=h.owner,asOf)=>h.json('/reports/economics'+(asOf?'?asOf='+encodeURIComponent(asOf):''),undefined,cookie);
  const report=await read(),billed=report.matters.find(m=>m.billedCents===12000),unbilled=report.matters.find(m=>m.unbilledCents===5000);
  assert.ok(billed);assert.ok(unbilled);assert.equal(report.totals.billedCents,12000);assert.equal(report.totals.unbilledCents,5000);assert.equal(report.totals.paidCents,0);assert.equal(report.totals.sourceReportedPaidCents,2000);assert.equal(report.totals.collectionRate,0);assert.equal(report.totals.profitCents,null);
  assert.deepEqual(report.totals.aging,{current:0,'1–30':0,'31–60':0,'61–90':0,'91+':0,unknown:10000});
  assert.equal(billed.source.invoices[0].sourceObservation.recordedAt,first);assert.equal(billed.source.invoices[0].sourceObservation.reference.sourceId,'invoice-1');assert.equal(billed.source.invoices[0].sourceReportedPaidCents,2000);assert.equal(billed.source.invoices[0].issuedAt,'2020-04-01T00:00:00.000Z');
  await h.json('/reports/economics?asOf=2020-04-02T00:00:00.000Z',undefined,h.owner,422);
  await h.setClock(later);h.owner=await h.login(ownerEmail);
  await h.json('/matters/'+unbilled.matterId+'/entries',{kind:'time',date:'2030-01-11',description:'Synthetic later native work',minutes:60,rateCents:6000},h.owner);
  const historical=await read(h.owner,first);assert.equal(historical.totals.billedCents,12000);assert.equal(historical.totals.unbilledCents,5000);assert.equal(historical.totals.paidCents,0);assert.equal(historical.totals.sourceReportedPaidCents,2000);assert.equal(historical.totals.collectionRate,0);assert.deepEqual(historical.totals.aging,report.totals.aging);assert.equal((await read()).totals.unbilledCents,11000);
  const artifact=await h.json('/reports/economics/exports',{confirmed:true,filters:{asOf:first}},h.owner),file=await(await h.request(artifact.downloadPath,undefined,h.owner)).text();assert.equal(JSON.parse(file).totals.sourceReportedPaidCents,2000);assert.equal(JSON.parse(file).totals.paidCents,0);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();restored=await harness({clock:later});await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);assert.deepEqual((await restored.json('/reports/economics?asOf='+first,undefined,restored.owner)).totals,historical.totals);assert.equal(await(await restored.request(artifact.downloadPath,undefined,restored.owner)).text(),file);
 }finally{await restored?.close();await h.close();}
}

export async function importEconomicsSource(h){
 const ownerEmail=(await h.json('/state',undefined,h.owner)).actor.email,source=await setupMove(h);source.clientRepairs={'missing-client':'client-1'};await designate(h,ownerEmail);
 return applyMove(h,source,await commitMove(h,source));
}

// An ordinary original captured before the confidentiality fence shipped.
export async function withLegacyEconomicsCapture(archive,documentId,value){
 const records=archive.trim().split('\n').map(JSON.parse),manifest=records[0],bytes=Buffer.from(JSON.stringify(value));
 const {createHash}=await import('node:crypto');
 const {makePart}=await import('@runeditrun/rer/modules/portability');
 const {ArchiveVerifier,ContentVerifier}=await import('../../node_modules/@runeditrun/rer/modules/portability/format.mjs');
 const groups=records.filter(r=>r.kind==='part').map(p=>p.items);let changed=false;
 for(const items of groups)for(const item of items)if(item.kind==='row'&&item.table==='s_document_versions'&&item.row.document_id===documentId){item.row.content_base64=bytes.toString('base64');item.row.size=bytes.length;item.row.sha256=createHash('sha256').update(bytes).digest('hex');changed=true;}
 assert.ok(changed);const integrity=new ArchiveVerifier(manifest),content=new ContentVerifier(manifest),parts=[];
 for(const items of groups){const part=await makePart(parts.length,items);parts.push(part);integrity.add(part);for(const item of items)content.add(item);}
 return [manifest,...parts,{kind:'closing',partCount:parts.length,archiveHash:integrity.digest(),contentHash:content.digest()}].map(JSON.stringify).join('\n')+'\n';
}
