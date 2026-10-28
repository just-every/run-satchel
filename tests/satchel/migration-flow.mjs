import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {harness} from './harness.mjs';
import {movePackage,setupMove,applyMove,commitMove,csvRows} from './migration-fixture.mjs';
import {invoiceTemplate,setupInvoicePayers} from './invoice-delivery-fixture.mjs';
import {designate} from './trust-fixture.mjs';
import {reviewed,draft} from './invoice-numbering-fixture.mjs';

export async function proveWholeFirmMove(h){
 const p=await setupMove(h),allFiles=structuredClone(p.files);p.calendarMatters={'event-1':'matter-2'};p.datasets.calendar='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:event-1\r\nDTSTART;TZID=America/New_York:20200304T093000\r\nDTEND;TZID=America/New_York:20200304T103000\r\nSUMMARY:Historic meeting\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';p.files=p.files.filter(f=>f.id!=='original-2');p.datasets.relationships=csvRows(['id','matter_id','contact_id','relation','other_contact_id'],[['relationship-1','matter-1','client-1','client',''],['relationship-2','matter-1','client-2','insurer',''],['relationship-3','matter-1','client-1','Source business affiliate','client-2']]);p.counts.relationships=3;
 const before=(await h.json('/state',undefined,h.owner)).matters.length,jobs=(await h.json('/migration',undefined,h.owner)).jobs.length;
 let preview=await h.json('/migration/preview',{package:p},h.owner);
 assert.ok(preview.errors.some(e=>e.includes('unmatched contacts identity missing-client')));
 assert.ok(preview.errors.some(e=>e.includes('missing original original-2')));
 assert.deepEqual(preview.counts.matters,{package:3,source:3,imported:0});assert.equal(preview.mappingVersion,'satchel-clio-v1');
 assert.equal((await h.json('/state',undefined,h.owner)).matters.length,before);assert.equal((await h.json('/migration',undefined,h.owner)).jobs.length,jobs);
 await h.json('/migration/commit',{package:p,fingerprint:preview.fingerprint},h.owner,409);
 p.clientRepairs['missing-client']='client-1';p.files=allFiles;
 preview=await h.json('/migration/preview',{package:p},h.owner);assert.deepEqual(preview.errors,[]);assert.equal(preview.files.length,3);assert.equal(preview.files.find(f=>f.id==='pdf-1').sha256,p.files[0].sha256);assert.ok(preview.relationships.some(r=>r.from==='matter-1'&&r.to==='client-1'));
 await h.json('/migration/commit',{package:p,fingerprint:'changed'},h.owner,409);
 let job=await commitMove(h,p);job=await applyMove(h,p,job,{stopAt:4});assert.equal(job.job.checkpoint,4);assert.equal(job.job.state,'applying');
 const interrupted=(await h.json('/state',undefined,h.owner)).matters.length;assert.equal(interrupted,before+1);
 const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),restored=await harness();
 try{
  await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);
  assert.equal((await restored.json('/migration/status',{id:job.job.id},restored.owner)).job.checkpoint,4);
  // Repeating the reviewed commit returns its durable checkpoint after restore.
  assert.equal((await commitMove(restored,p)).job.id,job.job.id);
  await designate(restored);
  job=await applyMove(restored,p,job);assert.equal(job.job.state,'completed');assert.equal(job.job.checkpoint,23);
  const state=await restored.json('/state',undefined,restored.owner),m1=state.matters.find(m=>m.matter_number==='2020-C1'),m2=state.matters.find(m=>m.matter_number==='2020-C2'),m3=state.matters.find(m=>m.matter_number==='2019-C3');
  assert.deepEqual([m1.lifecycle_status,m2.lifecycle_status,m3.lifecycle_status],['open','open','closed']);assert.equal(m1.opened_at,'2020-01-01T12:00:00.000Z');
  const profile=(await restored.json('/matters/'+m1.id+'/fields',undefined,restored.owner)).profile;assert.equal(profile.caseNumber,'CASE-42');assert.equal(profile.court,'Source court');assert.equal(profile.insuranceLimitCents,100000001);assert.equal(profile.feeArrangement,'hourly');assert.equal(profile.typeVersion,1);assert.deepEqual(profile.custom,{source_value:25000050});
  const journal=await restored.json('/matters/'+m1.id+'/migration',undefined,restored.owner);
  assert.ok(journal.sources.some(s=>s.kind==='emails'&&JSON.parse(s.source_json).body==='Exact historic email body'));
  const graph=(await restored.json('/contacts',undefined,restored.owner)).contacts,clientOne=graph.find(c=>c.name==='Synthetic Satchel Workshop'),clientTwo=graph.find(c=>c.name==='Synthetic Satchel Studio');assert.ok(clientTwo.matterRoles.some(r=>r.matter_id===m1.id&&r.role==='insurer'));assert.ok(clientOne.relationships.some(r=>r.toId===clientTwo.id&&r.relationship==='Source business affiliate'));
  const billing=await restored.json('/matters/'+m1.id+'/billing',undefined,restored.owner);
  assert.equal(billing.entries.length,2);assert.equal(billing.entries[0].timekeeperEmail,p.staff['staff-1']);assert.ok(billing.entries.every(e=>e.reservedBy));
  const unbilled=await restored.json('/matters/'+m2.id+'/billing',undefined,restored.owner);assert.equal(unbilled.entries[0].amountCents,5000);assert.equal(unbilled.entries[0].reservedBy,null);
  const documents=await restored.json('/matters/'+m1.id+'/documents',undefined,restored.owner);assert.equal(documents[0].versions[0].createdAt,'2020-04-02T13:14:15.000Z');
  const original=await restored.request('/api/satchel/documents/'+documents[0].id+'/file?version=1',undefined,restored.owner);assert.equal(original.status,200);assert.equal(createHash('sha256').update(Buffer.from(await original.arrayBuffer())).digest('hex'),p.files.find(f=>f.id==='original-1').sha256);
  const trust=await restored.json('/trust',undefined,restored.owner);assert.deepEqual(trust.ledgers.map(l=>l.balance_cents).sort((a,b)=>a-b),[150001,300003]);
  const calendar=await restored.json('/matters/'+m2.id+'/calendar',undefined,restored.owner),appointment=calendar.appointments.find(a=>a.title==='Historic meeting');assert.equal(appointment.timezone,'America/New_York');assert.equal(appointment.occurrences[0].date,'2020-03-04');assert.equal(appointment.occurrences[0].time,'09:30');
  const leads=await restored.json('/leads',undefined,restored.owner);assert.ok(JSON.stringify(leads).includes('Historic Grow intake lead'));
  const reconcile=await restored.json('/migration/reconcile',{id:job.job.id},restored.owner);assert.equal(reconcile.report.nativeBalances.billedCents,12000);assert.equal(reconcile.report.nativeBalances.unbilledCents,5000);assert.equal(reconcile.report.nativeBalances.arCents,10000);assert.equal(reconcile.report.nativeBalances.trustCents,450004);assert.deepEqual(reconcile.report.nativeBalances,{billedCents:12000,unbilledCents:5000,arCents:10000,trustCents:450004});assert.deepEqual(reconcile.report.gaps,[]);
  await restored.json('/migration/cutover',{id:job.job.id,fingerprint:reconcile.fingerprint,confirmed:true,declaration:'Reviewed source balances'},restored.owner,409);
  const invoice=journal.invoices[0];assert.equal(invoice.number,'CLIO-2020-81');assert.equal(invoice.paid_cents,2000);
  const pdf=await restored.request('/api/satchel/bills/'+invoice.id+'/invoice.pdf',undefined,restored.owner);assert.equal(pdf.status,200);assert.equal(Buffer.from(await pdf.arrayBuffer()).toString('base64'),p.files[0].contentBase64);
  // A later native numbering cutover must advance beyond imported source ordinals.
  await restored.json('/invoice-numbering',{prefix:'NEW',padding:3,separator:'-',year:false,nextNumber:81,revision:null},restored.owner,422);
  const scheme=await restored.json('/invoice-numbering',{prefix:'NEW',padding:3,separator:'-',year:false,nextNumber:82,revision:null},restored.owner);assert.equal(scheme.counter.next_number,82);
  const repeat=await commitMove(restored,p);assert.equal(repeat.job.id,job.job.id);await restored.json('/migration/resume',{id:job.job.id},restored.owner);
  assert.equal((await restored.json('/state',undefined,restored.owner)).matters.length,before+3);assert.equal((await restored.json('/matters/'+m1.id+'/billing',undefined,restored.owner)).bills.length,1);
  // A final reviewed delta carries the complete cumulative inventory, including a new note.
  const delta=structuredClone(p);delta.phase='delta';delta.previousFingerprint=job.job.fingerprint;delta.extractedAt='2020-04-04T12:00:00.000Z';delta.datasets.notes=csvRows(['id','matter_id','title','body','occurred_at','visibility','staff_id'],[['note-2','matter-2','Final delta note','Last source change','2020-04-03T12:00:00.000Z','team','staff-1']]);delta.counts.notes=2;
  // Repeated identities retain their source bytes; a final delta need not repeat them.
  for(const kind of Object.keys(delta.datasets))if(kind!=='notes')delta.datasets[kind]=delta.datasets[kind].split('\r\n')[0]+'\r\n';
  delta.files=[];delta.datasets.calendar=csvRows(['id','matter_id','title','date','time','timezone','duration_minutes']);
  for(const [field,message] of [['count','time: source count does not reconcile'],['balance','arCents: source and native totals differ'],['coverage','emails: retrieve missing source history through an authorized export']]){
   const isolated=structuredClone(delta);
   if(field==='count')isolated.counts.time=3;
   if(field==='balance')isolated.balances.arCents=10001;
   if(field==='coverage')isolated.coverage.emails='missing';
   let attempt=await commitMove(restored,isolated);attempt=await applyMove(restored,isolated,attempt);
   const onlyGap=await restored.json('/migration/reconcile',{id:attempt.job.id},restored.owner);assert.deepEqual(onlyGap.report.gaps,[message]);
   await restored.json('/migration/cutover',{id:attempt.job.id,fingerprint:onlyGap.fingerprint,confirmed:true,declaration:'Source '+field+' is not reconciled'},restored.owner,409);
   assert.equal((await restored.json('/migration/status',{id:attempt.job.id},restored.owner)).cutover,null);
   delta.previousFingerprint=attempt.job.fingerprint;
  }
  const wrong=structuredClone(delta);wrong.counts.time=3;wrong.balances.arCents=10001;wrong.coverage.emails='missing';
  let rejected=await commitMove(restored,wrong);rejected=await applyMove(restored,wrong,rejected);
  const mismatch=await restored.json('/migration/reconcile',{id:rejected.job.id},restored.owner);
  assert.ok(mismatch.report.gaps.includes('time: source count does not reconcile'));assert.ok(mismatch.report.gaps.includes('arCents: source and native totals differ'));assert.ok(mismatch.report.gaps.some(g=>g.startsWith('emails: retrieve missing source history')));
  await restored.json('/migration/cutover',{id:rejected.job.id,fingerprint:mismatch.fingerprint,confirmed:true,declaration:'Counts are not reconciled'},restored.owner,409);
  delta.previousFingerprint=rejected.job.fingerprint;
  let final=await commitMove(restored,delta);final=await applyMove(restored,delta,final);
  let report=await restored.json('/migration/reconcile',{id:final.job.id},restored.owner);assert.deepEqual(report.report.gaps,[]);assert.equal(report.report.counts.notes.native,2);
  await restored.json('/migration/cutover',{id:final.job.id,fingerprint:report.fingerprint,confirmed:false,declaration:'Reviewed'},restored.owner,400);
  const signed=await restored.json('/migration/cutover',{id:final.job.id,fingerprint:report.fingerprint,confirmed:true,declaration:'Principal signs complete source counts, originals and cent balances after final delta.'},restored.owner);assert.equal(signed.cutover.report_digest,report.fingerprint);
  await restored.json('/migration/undo',{id:job.job.id},restored.owner,409);
  const template=await restored.json('/invoice-templates',invoiceTemplate(null,{includeTrustBalance:false}),restored.owner);await setupInvoicePayers(restored,m1);
  const recipient=(await restored.json('/contacts',undefined,restored.owner)).contacts.find(c=>c.name===m1.client).emails[0];
  const delivery=await restored.json('/bills/'+invoice.id+'/deliveries',{recipient,payerName:m1.client,templateId:template.id},restored.owner);assert.equal(delivery.pdfDigest,p.files[0].sha256);
  const client=await restored.login(recipient),portal=await restored.json('/portal/matters/'+m1.id+'/invoices',undefined,client);
  const portalPdf=await restored.request(portal.invoices.find(i=>i.id===invoice.id).pdfUrl,undefined,client);assert.equal(portalPdf.status,200);assert.equal(Buffer.from(await portalPdf.arrayBuffer()).toString('base64'),p.files[0].contentBase64);
  const resend=await restored.json('/bills/'+invoice.id+'/deliveries',{recipient,payerName:m1.client,templateId:template.id},restored.owner);assert.equal(resend.pdfDigest,p.files[0].sha256);
  const sourceEntry=unbilled.entries[0],prepared=await restored.json('/matters/'+m2.id+'/bills',{title:'First native bill after source cutover',date:'2020-04-05',entryIds:[sourceEntry.id]},restored.owner),approved=await reviewed(restored,m2,prepared);
  const issue=await restored.json('/invoices/issue',{bills:[{id:approved.id,revision:approved.revision}]},restored.owner);assert.equal(issue.issues[0].number,'NEW-082');
  const numbers=await restored.json('/invoice-numbering',undefined,restored.owner);
  await restored.json('/invoice-numbering',{prefix:'LATER',padding:3,separator:'-',year:false,nextNumber:83,revision:numbers.counter.revision},restored.owner);
  const later=await reviewed(restored,m2,await draft(restored,m2,'Later native bill with a prospective prefix'));
  const nextIssue=await restored.json('/invoices/issue',{bills:[{id:later.id,revision:later.revision}]},restored.owner);assert.equal(nextIssue.issues[0].number,'LATER-083');
  assert.equal((await restored.json('/matters/'+m1.id+'/migration',undefined,restored.owner)).invoices[0].number,'CLIO-2020-81');
  const unchanged=await restored.request('/api/satchel/bills/'+invoice.id+'/invoice.pdf',undefined,restored.owner);assert.equal(Buffer.from(await unchanged.arrayBuffer()).toString('base64'),p.files[0].contentBase64);
  const backup=await(await restored.request('/api/satchel/backup',undefined,restored.owner)).text(),roundtrip=await harness();
  try{await roundtrip.json('/restore',{archive:backup,confirm:'RESTORE'},roundtrip.owner);const bill=await roundtrip.request('/api/satchel/bills/'+invoice.id+'/invoice.pdf',undefined,roundtrip.owner);assert.equal(Buffer.from(await bill.arrayBuffer()).toString('base64'),p.files[0].contentBase64);assert.equal((await roundtrip.json('/invoice-numbering',undefined,roundtrip.owner)).counter.next_number,84);}finally{await roundtrip.close();}
  const grants=await restored.json('/matters/'+m1.id+'/portal',undefined,restored.owner),grant=grants.grants.find(g=>g.email===recipient&&!g.revokedAt);await restored.json('/portal-grants/'+grant.id+'/revoke',{reason:'Client access withdrawn'},restored.owner);await restored.json('/portal/matters/'+m1.id+'/invoices',undefined,client,404);
 }finally{await restored.close();}
}

export async function proveMoveRefusals(h,lawyer){
 const p=await setupMove(h);p.clientRepairs['missing-client']='client-1';
 const other=(await h.json('/state',undefined,lawyer)).actor;
 p.staff['staff-private']=other.email;
 p.datasets.notes=csvRows(['id','matter_id','title','body','occurred_at','visibility','staff_id'],[['note-1','matter-1','Private source note','Synthetic Satchel private source content','2020-03-01T12:00:00.000Z','private','staff-private']]);
 await h.json('/migration',undefined,lawyer,403);await h.json('/migration/preview',{package:p},lawyer,403);
 const crossClient=structuredClone(p);crossClient.datasets.trust=crossClient.datasets.trust.replace('trust-1\",\"matter-1\",\"client-1','trust-1\",\"matter-1\",\"client-2');const crossReview=await h.json('/migration/preview',{package:crossClient},h.owner);assert.ok(crossReview.errors.some(e=>e.includes('source client does not match')));
 const crossMatter=structuredClone(p);crossMatter.datasets.time=crossMatter.datasets.time.replace('time-1\",\"matter-1','time-1\",\"matter-2');const wrongInvoice=await h.json('/migration/preview',{package:crossMatter},h.owner);assert.ok(wrongInvoice.errors.some(e=>e.includes('billed work and source invoice must belong')));
 const changed=structuredClone(p);changed.files[0].sha256='0'.repeat(64);await h.json('/migration/preview',{package:changed},h.owner,400);
 const missing=structuredClone(p);missing.coverage.emails='missing';let plan=await h.json('/migration/preview',{package:missing},h.owner);assert.ok(plan.coverageGaps.some(g=>g.startsWith('emails:')));
 const bad=structuredClone(p);bad.staff['staff-1']='synthetic-satchel-unmapped';plan=await h.json('/migration/preview',{package:bad},h.owner);assert.ok(plan.errors.some(e=>e.includes('active firm staff member')));
 let job=await commitMove(h,p);job=await applyMove(h,p,job,{stopAt:3});await h.json('/migration/resume',{id:job.job.id},h.owner,409);
 await h.json('/migration/status',{id:job.job.id},lawyer,403);
 job=await applyMove(h,p,job,{stopAt:18});
 await h.json('/migration/resume',{id:job.job.id,review:{confirmed:true,reviewNote:'Not a designated officer'}},h.owner,403);
 await designate(h);
 await h.json('/migration/resume',{id:job.job.id,review:{confirmed:false,reviewNote:'Not yet approved'}},h.owner,400);
 job=await applyMove(h,p,job);
 const imported=(await h.json('/state',undefined,h.owner)).matters.find(m=>m.matter_number==='2020-C1');
 await h.json('/matters/'+imported.id+'/migration',undefined,lawyer,404);
 await h.json('/matters/'+imported.id+'/access',{email:other.email},h.owner);
 const principalView=await h.json('/matters/'+imported.id+'/migration',undefined,h.owner);assert.ok(!JSON.stringify(principalView).includes('Synthetic Satchel private source content'));
 const authorView=await h.json('/matters/'+imported.id+'/migration',undefined,lawyer);assert.ok(authorView.sources.some(s=>s.kind==='notes'&&JSON.parse(s.source_json).body==='Synthetic Satchel private source content'));
 const docs=await h.json('/matters/'+imported.id+'/documents',undefined,h.owner),doc=docs[0],original=p.files.find(f=>f.id==='original-1');
 await h.json('/documents/'+doc.id+'/erase',{confirm:doc.title,reason:'Principal approved source original erasure'},h.owner);
 assert.equal((await h.request('/api/satchel/documents/'+doc.id+'/file',undefined,h.owner)).status,404);
 await h.json('/migration/commit',{package:p,fingerprint:job.job.fingerprint},h.owner,409);
 await h.json('/migration/resume',{id:job.job.id},h.owner);
 assert.equal((await h.request('/api/satchel/documents/'+doc.id+'/file',undefined,h.owner)).status,404);
 const erasedArchive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();assert.ok(!erasedArchive.includes(original.contentBase64));assert.ok(erasedArchive.includes(p.files.find(f=>f.id==='original-2').contentBase64),'Erasure retains unrelated original bytes');
 await h.json('/team',{email:other.email,name:other.name,role:'lawyer',active:false},h.owner);await h.json('/matters/'+imported.id+'/migration',undefined,lawyer,403);
 // Safe undo is a contacts-only package: one used contact, one native edit and one untouched contact.
 const only=structuredClone(p);only.account='synthetic-satchel-undo';only.staff={'staff-1':p.staff['staff-1']};only.phase='snapshot';only.files=[];only.balances={billedCents:0,unbilledCents:0,arCents:0,trustCents:0};
 for(const kind of Object.keys(only.datasets))if(kind!=='contacts'){only.datasets[kind]=only.datasets[kind].split('\r\n')[0]+'\r\n';only.counts[kind]=0;}
 only.datasets.contacts=csvRows(['id','name'],[['undo-linked','Synthetic Satchel Linked'],['undo-edited','Synthetic Satchel Edited'],['undo-safe','Synthetic Satchel Safe']]);
 let undo=await commitMove(h,only);undo=await applyMove(h,only,undo);
 const contacts=await h.json('/contacts',undefined,h.owner),edited=contacts.contacts.find(c=>c.name==='Synthetic Satchel Edited');
 await h.json('/contacts',{id:edited.id,revision:contacts.revision,kind:'organization',name:'Synthetic Satchel Edited natively'},h.owner);
 const {open}=await import('./harness.mjs');await open(h,'Native use after migration','Synthetic Satchel Linked','Synthetic Satchel Unrelated');
 undo=await h.json('/migration/undo',{id:undo.job.id},h.owner);
 const nativeAfterUndo=await h.json('/contacts',undefined,h.owner);assert.ok(nativeAfterUndo.contacts.some(c=>c.name==='Synthetic Satchel Edited natively'),'Undo preserves the actual natively edited contact');assert.ok(nativeAfterUndo.contacts.some(c=>c.name==='Synthetic Satchel Linked'),'Undo preserves the actual natively used contact');assert.ok(!nativeAfterUndo.contacts.some(c=>c.name==='Synthetic Satchel Safe'),'Undo removes the actual unused unchanged contact');
 assert.deepEqual(undo.sources.map(s=>s.disposition),['preserved','preserved','removed']);
 const after=await h.json('/contacts',undefined,h.owner);assert.ok(after.contacts.some(c=>c.name==='Synthetic Satchel Linked'));assert.ok(after.contacts.some(c=>c.name==='Synthetic Satchel Edited natively'));assert.ok(!after.contacts.some(c=>c.name==='Synthetic Satchel Safe'));
 await h.json('/migration/commit',{package:only,fingerprint:undo.job.fingerprint},h.owner,409);
 await h.json('/migration/resume',{id:undo.job.id},h.owner,409);
}
