import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {harness} from './harness.mjs';
import {microsoftFixture} from './microsoft-security-flow.mjs';
import {paymentPlanEdge} from './payment-plan-edge.mjs';
import {recoveryOriginals} from './recovery-originals.mjs';
import {proveRecoveryConnectors} from './recovery-connector-flow.mjs';
import {paymentFixture} from './stripe-fixture.mjs';
import {periodFoundation,createPeriod,sign} from './trust-period-fixture.mjs';

export const archiveRows=archive=>archive.trim().split('\n').map(JSON.parse).filter(r=>r.kind==='part').flatMap(p=>p.items).filter(i=>i.kind==='row');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function recoveryFixture({largeOriginals=false}={}){
 const microsoft=microsoftFixture(),edge=paymentPlanEdge();Object.assign(edge,{webhookStatus:204,webhookResponse:async()=>new Response(null,{status:edge.webhookStatus}),microsoftResponse:microsoft.microsoftResponse,bindings:{...edge.bindings,...microsoft.bindings}});
 const h=await harness(edge);
 try{
  const finance=await paymentFixture(h),trust=await periodFoundation(h),owner=(await h.json('/state',undefined,h.owner)).actor.email;
  const closed=await createPeriod(h,trust,'2026-09-01','2026-09-30',100000);await sign(h,closed);
  const outstanding=await createPeriod(h,trust,'2026-10-01','2026-10-31',100000);
  const {originals:bucketOriginals,files:bucketFiles}=await recoveryOriginals(h,owner,largeOriginals);
  const bytes=Buffer.from('synthetic-satchel-supported-original\n'.repeat(512));
  const document=await h.json('/matters/'+finance.m.id+'/documents',{name:'Recovery-original.txt',mime:'text/plain',contentBase64:bytes.toString('base64'),visibility:'matter'},h.owner);
  const plan=await h.json('/bills/'+finance.card.id+'/payment-plans',{approve:true,billRevision:finance.card.revision,balanceCents:37500,startDate:'2026-11-01',reason:'Exact scheduled collection reviewed for recovery',installments:[{dueDate:'2026-11-01',cents:12500},{dueDate:'2026-12-01',cents:12500},{dueDate:'2027-01-01',cents:12500}]},h.owner);
  const setup=await h.json('/payment-plans/'+plan.id+'/mandate',{revision:plan.revision,agree:true,requestKey:'synthetic-satchel-recovery-mandate'},finance.client);edge.completeSetup(setup.id);
  await h.json('/payment-plans/'+plan.id+'/mandate/confirm',{revision:plan.revision,agree:true,setupId:setup.id},finance.client);
  await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);
  // The first slot follows this native creation time; the test does not depend on today's weekday.
  const at=new Date();at.setUTCDate(at.getUTCDate()+7);at.setUTCHours(12,0,0,0);const slot=at.toISOString();
  await h.json('/report-schedules',{name:'Recovery workload',dashboard:'workload',filters:{},weekday:at.getUTCDay()||7,time:'12:00',timezone:'UTC',channel:'email',recipients:[owner]},h.owner);
  return {h,edge,microsoft,finance,trust,document,bytes,plan,outstanding,closed,owner,slot,bucketOriginals,bucketFiles};
 }catch(error){await h.close();throw error;}
}
export async function proveRecoveryDiagnostics(){
 const f=await recoveryFixture({largeOriginals:true}),{h,edge,microsoft}=f;let target;
 try{
  const base='/security/microsoft',approve={approved:true,capability:'directory:read'};
  await h.json('/providers/microsoft/review',{termsUrl:'https://www.microsoft.com/licensing/terms/',confirmed:true},h.owner);
  await h.json(base,approve,h.owner);
  const queued=await h.json(base+'/jobs',{},h.owner),success=await h.json(base+'/jobs/'+queued.id+'/run',{},h.owner);assert.equal(success.job.status,'succeeded');
  const uncertain=await h.json(base+'/jobs',{},h.owner);microsoft.mode='lost';await h.json(base+'/jobs/'+uncertain.id+'/run',{},h.owner);microsoft.mode='success';
  const pending=await h.json(base+'/jobs',{},h.owner);
  let diagnostics=await h.json('/diagnostics',undefined,h.owner),connection=diagnostics.connectors.find(c=>c.id==='microsoft');
  assert.equal(connection.authorization,'connected');assert.equal(connection.lastSuccessfulReadAt,success.job.finishedAt);assert.ok(Date.parse(connection.tokenExpiresAt)>Date.parse(success.job.finishedAt));
  const native=await h.json(base,undefined,h.owner),counts=diagnostics.jobs.find(j=>j.id==='microsoft');
  assert.equal(counts.queued,native.jobs.filter(j=>j.status==='queued').length);assert.equal(counts.uncertain,1);assert.ok(counts.lagSeconds>=0);
  await h.json(base+'/revoke',{},h.owner);diagnostics=await h.json('/diagnostics',undefined,h.owner);connection=diagnostics.connectors.find(c=>c.id==='microsoft');assert.equal(connection.authorization,'revoked');assert.equal(connection.lastSuccessfulReadAt,success.job.finishedAt);assert.ok(connection.tokenExpiresAt,'The last observed expiry survives revocation, without claiming a usable token');assert.equal(diagnostics.jobs.find(j=>j.id==='microsoft').failed,1);assert.equal((await h.json(base,undefined,h.owner)).jobs.find(j=>j.id===pending.id).status,'refused');
  const staff=f.owner.replace('@','-diagnostics@');await h.json('/team',{email:staff,name:'Recovery assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:staff},h.owner);const assistant=await h.login(staff);
  await h.json('/diagnostics',undefined,assistant,403);await h.json('/diagnostics',undefined,'',401);await h.json('/diagnostics',undefined,f.finance.client,403);
  const key=await h.json('/keys',{label:'Recovery preparations'},h.owner);await h.json('/diagnostics',undefined,'',401,{authorization:'Bearer '+key.key});
  assert.deepEqual(diagnostics.trust.unreconciledPeriods.map(p=>p.id),[f.outstanding.id]);
  assert.equal(diagnostics.bankFeed.lastSuccessfulReadAt,null);assert.equal(diagnostics.bankFeed.staleSeconds,null);assert.ok(diagnostics.connectors.filter(c=>c.id!=='microsoft').every(c=>c.authorization==='unknown'&&c.tokenExpiresAt===null&&c.costCents===null));assert.equal(diagnostics.storage.quotaBytes,null);
  await proveRecoveryConnectors(h,edge,f.finance.m);
  // Reconcile the displayed storage against native archive rows, including retained versions.
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),records=archiveRows(archive),sourceRows=table=>records.filter(r=>r.table===table).map(r=>r.row);
  diagnostics=await h.json('/diagnostics',undefined,h.owner);
  assert.equal(diagnostics.storage.documentBytes,sourceRows('s_document_versions').filter(r=>r.content_base64!==null).reduce((n,r)=>n+r.size,0));
  assert.equal(diagnostics.storage.measuredOriginalBytes,diagnostics.storage.documentBytes+diagnostics.storage.conflictBytes+diagnostics.storage.bucketBytes);assert.ok(diagnostics.storage.documentBytes>=f.bytes.length);assert.equal(diagnostics.storage.bucketBytes,f.bucketOriginals.reduce((n,o)=>n+o.bytes.length,0));assert.equal(diagnostics.storage.bucketObjects,f.bucketFiles.length);
  assert.ok(diagnostics.storage.databaseBytes>=diagnostics.storage.documentBytes,'Allocated database storage includes embedded originals');assert.equal(diagnostics.storage.measuredAllocatedBytes,diagnostics.storage.databaseBytes+diagnostics.storage.bucketBytes,'Embedded originals are not counted twice');
  assert.equal(diagnostics.backup.lastVerified.sha256,sha256(archive));assert.equal(diagnostics.backup.lastVerified.bytes,Buffer.byteLength(archive));
  assert.ok(!records.some(r=>['s_recovery_authority','s_recovery_receipts','s_microsoft_connector','s_microsoft_jobs','s_scheduler_observation'].includes(r.table)));
  const beforeTrust=await h.json('/trust',undefined,h.owner);target=await harness(edge);
  assert.ok(Buffer.byteLength(archive)>24_000_000,'Recovery exercises an archive beyond the JSON convenience door');
  const streamRestore=await target.raw('/api/satchel/restore',{method:'POST',headers:{'content-type':'application/x-ndjson','x-satchel-confirm':'RESTORE'},body:archive},target.owner);
  assert.equal(streamRestore.status,200);assert.equal((await streamRestore.json()).phase,'complete');
  let restored=await target.json('/diagnostics',undefined,target.owner);assert.equal(restored.restore.lastVerified.sha256,sha256(archive));assert.ok(restored.restore.lastVerified.content_hash);assert.equal(restored.backup.lastVerified,null,'The destination cannot inherit source backup verification');assert.ok(restored.recovery.every(r=>r.authorized_at===null));
  const downloaded=Buffer.from(await(await target.request('/api/satchel/documents/'+f.document.id+'/file',undefined,target.owner)).arrayBuffer());assert.deepEqual(downloaded,f.bytes);assert.equal(sha256(downloaded),f.document.versions[0].sha256);
  for(const [index,file] of f.bucketFiles.entries()){
   const response=await target.request(file.downloadUrl,undefined,target.owner),restoredBucket=Buffer.from(await response.arrayBuffer());
   assert.equal(response.status,200);assert.deepEqual(restoredBucket,f.bucketOriginals[index].bytes);assert.equal(sha256(restoredBucket),file.sha256);assert.equal(response.headers.get('x-satchel-scan-status'),'not malware-scanned');
  }
  assert.ok(!restored.connectors.some(c=>c.id.startsWith('integration:')),'Restoration cannot inherit a scoped integration grant');
  console.log(`PROBE FIRM-007 streamed recovery: ${Buffer.byteLength(archive)} archive bytes with ${f.bucketFiles.length} supported multipart originals -> all hashes match; original scan status retained; no integration credentials imported`);
  const restoredTrust=await target.json('/trust',undefined,target.owner);assert.deepEqual(restoredTrust.ledgers.map(l=>[l.id,l.balance_cents]),beforeTrust.ledgers.map(l=>[l.id,l.balance_cents]));assert.deepEqual(await target.json('/trust/periods?accountId='+f.trust.account.id,undefined,target.owner),await h.json('/trust/periods?accountId='+f.trust.account.id,undefined,h.owner));
  await target.json('/team/invite',{email:staff},target.owner);const restoredAssistant=await target.login(staff);
  const requests=edge.chargeCalls,mailBefore=target.mails.length;
  // Both inherited active payment plans and email schedules are populated before the scheduler runs.
  const beforePlan=await target.json('/payment-plans/'+f.plan.id,undefined,target.owner);assert.equal(beforePlan.status,'active');assert.ok(beforePlan.consent);
  await target.scheduled(f.slot);await target.restart();await target.scheduled(f.slot);
  assert.equal(edge.chargeCalls,requests);assert.equal(target.mails.length,mailBefore);assert.deepEqual(await target.json('/payment-plans/'+f.plan.id,undefined,target.owner),beforePlan,'Paused recovery preserves the complete active plan and creates no attempt or stop task');
  assert.equal((await target.json('/report-schedules',undefined,target.owner)).deliveries.length,0,'Paused reports do not even create an outbound attempt');
  restored=await target.json('/diagnostics',undefined,target.owner);assert.equal(restored.scheduler.outcome,'succeeded');assert.equal(restored.scheduler.scheduled_at,f.slot);assert.ok(restored.jobs.find(j=>j.id==='payment-plans').restorePaused);assert.equal(restored.jobs.find(j=>j.id==='payment-plans').queued,3);assert.deepEqual(restored.trust.unreconciledPeriods.map(p=>p.id),[f.outstanding.id]);
  const lateSlot=new Date(Date.now()-120000).toISOString();await target.scheduled(lateSlot);const late=(await target.json('/diagnostics',undefined,target.owner)).scheduler;assert.equal(late.scheduled_at,lateSlot);assert.ok(late.lagSeconds>=120,'A delayed scheduled callback reports positive observed lag');
  const sending=restored.recovery.find(r=>r.channel==='sending'),decision={channel:'sending',restoreId:sending.restore_id,reason:'Principal reviewed schedules and recipients for this installation',confirmed:true};
  await target.json('/recovery/authorize',decision,restoredAssistant,403);assert.ok((await target.json('/diagnostics',undefined,target.owner)).recovery.every(r=>r.authorized_at===null));
  await target.json('/recovery/authorize',{...decision,restoreId:'synthetic-satchel-stale-receipt'},target.owner,409);await target.json('/recovery/authorize',decision,target.owner,409);
  await target.json('/portal/invoices/'+f.finance.card.id+'/checkout',{requestKey:'synthetic-satchel-paused-charge'},target.owner,409);
  await target.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},target.owner);
  await target.json('/recovery/authorize',{...decision,confirmed:false},target.owner,400);
  await target.json('/recovery/authorize',decision,target.owner);await target.json('/recovery/authorize',decision,target.owner,409);
  await target.scheduled(f.slot);assert.equal(target.mails.length,mailBefore+1,'Fresh local principal authorization releases the reviewed email schedule once');assert.equal(edge.chargeCalls,requests,'Sending authorization never authorizes charging');await target.scheduled(f.slot);assert.equal(target.mails.length,mailBefore+1);
  const charging=restored.recovery.find(r=>r.channel==='charging');await target.json('/recovery/authorize',{...decision,channel:'charging',restoreId:charging.restore_id},target.owner,409);
  assert.ok((await target.json('/audit?action=firm.recovery_authorized',undefined,target.owner)).records.some(r=>r.detail.channel==='sending'));
  const chargeDecision={...decision,channel:'charging',restoreId:charging.restore_id};
  await target.json('/providers/stripe/review',{termsUrl:'https://stripe.com/legal/ssa',confirmed:true},target.owner);
  await target.json('/recovery/authorize',chargeDecision,target.owner,409);
  await target.json('/stripe/settings',{kind:'operating',confirmed:true},target.owner);await target.json('/recovery/authorize',chargeDecision,target.owner);
  await target.scheduled(f.slot);assert.equal(edge.chargeCalls,requests,'Installation approval cannot inherit the former principal or client mandate');
  const renewed=await target.json('/bills/'+f.finance.card.id+'/payment-plans',{approve:true,planId:f.plan.id,revision:beforePlan.revision,billRevision:f.finance.card.revision,balanceCents:37500,startDate:'2026-11-01',reason:'Fresh principal approves the exact restored schedule in this installation',installments:[{dueDate:'2026-11-01',cents:12500},{dueDate:'2026-12-01',cents:12500},{dueDate:'2027-01-01',cents:12500}]},target.owner);
  assert.equal(renewed.status,'paused');assert.equal(renewed.consent,null);
  const clientEmail=beforePlan.consent.client_email;await target.json('/team/invite',{email:clientEmail},target.owner);const client=await target.login(clientEmail);
  const mandate=await target.json('/payment-plans/'+renewed.id+'/mandate',{revision:renewed.revision,agree:true,requestKey:'synthetic-satchel-restored-fresh-mandate'},client);edge.completeSetup(mandate.id);
  await target.json('/payment-plans/'+renewed.id+'/mandate/confirm',{revision:renewed.revision,agree:true,setupId:mandate.id},client);
  await target.scheduled(f.slot);await target.scheduled(f.slot);assert.equal(edge.chargeCalls,requests+1,'Fresh local principal approval and hosted client consent collect exactly once');assert.equal((await target.json('/portal/invoices/'+f.finance.card.id+'/payment',undefined,client)).paidCents,12500);
  // A source schedule can execute normally; the restore fence is what stopped the imported one.
  const beforeSource=edge.chargeCalls;await h.scheduled(f.slot);assert.equal(edge.chargeCalls,beforeSource+1);assert.equal((await h.json('/report-schedules',undefined,h.owner)).deliveries.length,1);
  console.log('PROBE FIRM-007 diagnostics: principal native records -> queue counts, retained successful read, expiry, storage and trust periods reconcile; unknown observations stay unknown; non-principal refused');
  console.log('PROBE FIRM-007 recovery: populated archive -> identical supported original hash and trust totals; scheduled sending and charging create no imported attempts; fresh local sending approval and renewed hosted client consent release each permitted effect once');
 }finally{await target?.close();await h.close();}
}
