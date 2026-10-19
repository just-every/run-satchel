import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {harness} from './harness.mjs';
import {formInput,intakeTeam,inquiry,sendInquiry,pdf} from './intake-fixture.mjs';

test('INTAKE-001 publish a versioned conditional family-law form, atomically receive one private lead with consent, source, receipt and a 10 MiB R2 original, then archive and restore it',async()=>{
 const h=await harness(),restored=await harness();try{
  const users=await intakeTeam(h),assistant=users['assistant@example.test'],lawyer=users['lawyer@example.test'],other=users['other@example.test'],officer=users['officer@example.test'];
  await h.json('/intake/forms',formInput,assistant,403);await h.json('/intake/forms',undefined,officer,403);
  const form=await h.json('/intake/forms',formInput,h.owner),token=await h.json('/intake/public/'+form.id),file=pdf(10*1024*1024),mailCount=h.mails.length;
  assert.equal(token.assignedEmail,undefined,'Anonymous form does not expose internal assignment');
  const attachments=[file,{...file,name:'financial-disclosure.pdf'},{...file,name:'proposed-parenting-plan.pdf'}];const receipt=await sendInquiry(h,form,inquiry(token),attachments);assert.deepEqual(Object.keys(receipt).sort(),['receipt','receivedAt']);
  assert.deepEqual(await sendInquiry(h,form,inquiry(token),[file]),receipt,'Replay yields one receipt');
  let pipeline=await h.json('/leads',undefined,assistant);assert.equal(pipeline.leads.length,1);const lead=pipeline.leads[0];
  assert.equal(lead.assignedEmail,'assistant@example.test');assert.match(lead.referralSource,new RegExp(form.id));assert.equal(lead.createdBy,'system:public-intake');
  await h.json('/leads/'+lead.id+'/intake',undefined,other,404);await h.json('/leads/'+lead.id+'/intake',undefined,officer,403);
  const history=await h.json('/leads/'+lead.id+'/intake',undefined,assistant),submission=history.submissions[0];assert.equal(history.submissions.length,1);
  assert.deepEqual(submission.consent,{text:formInput.consentText,accepted:true,at:receipt.receivedAt});assert.equal(submission.receipt,receipt.receipt);assert.equal(submission.formVersion,1);
  assert.deepEqual(submission.answers.map(a=>[a.key,a.value]),[['children','yes'],['ages','5 and 8'],['hearing','2026-11-18']]);
  assert.equal(submission.files.length,3);const original=submission.files[0];assert.equal(original.size,file.bytes.length);assert.equal(original.sha256,createHash('sha256').update(file.bytes).digest('hex'));
  const downloaded=await h.request(original.downloadUrl,undefined,assistant);assert.equal(downloaded.status,200);assert.equal(downloaded.headers.get('x-content-type-options'),'nosniff');assert.match(downloaded.headers.get('content-disposition'),/^attachment/);assert.match(downloaded.headers.get('content-security-policy'),/sandbox/);assert.equal(downloaded.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),file.bytes);
  assert.equal((await h.request(original.downloadUrl,undefined,other)).status,404);assert.equal((await h.request(original.downloadUrl,undefined,officer)).status,403);
  assert.equal(h.mails.length,mailCount,'Inquiry creates no mail or sensitive notification subject');
  const contacts=await h.json('/contacts',undefined,h.owner);assert.equal(contacts.contacts.length,0,'Submission never claims an existing contact identity or channel consent');
  const changed=await h.json('/intake/forms',{...form,title:'Family law: revised',consentText:'Revised inquiry review consent'},lawyer);assert.equal(changed.version,2);assert.equal((await h.json('/leads/'+lead.id+'/intake',undefined,assistant)).submissions[0].consent.text,formInput.consentText);
  const moved=await h.json('/leads/'+lead.id,{revision:lead.revision,assignedEmail:'lawyer@example.test'},h.owner);await h.json('/leads/'+lead.id+'/intake',undefined,assistant,404);assert.equal((await h.request(original.downloadUrl,undefined,assistant)).status,404);
  assert.equal((await h.json('/leads/'+moved.id+'/intake',undefined,lawyer)).submissions[0].receipt,receipt.receipt);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();assert.ok(archive.length>24_000_000,'Three full-size originals use the stream beyond the JSON convenience limit');assert.ok(!archive.includes(token.token));
  const response=await restored.raw('/api/satchel/restore',{method:'POST',headers:{'content-type':'application/x-ndjson','x-satchel-confirm':'RESTORE'},body:archive},restored.owner);assert.equal(response.status,200,await response.text());
  const recovered=await restored.json('/leads/'+lead.id+'/intake',undefined,restored.owner);assert.deepEqual(recovered,await h.json('/leads/'+lead.id+'/intake',undefined,h.owner));
  assert.deepEqual(Buffer.from(await(await restored.request(original.downloadUrl,undefined,restored.owner)).arrayBuffer()),file.bytes);
  const audit=await h.json('/audit',undefined,h.owner);for(const action of ['intake.form_saved','intake.received','intake.file_downloaded'])assert.ok(audit.records.some(a=>a.action===action));const receivedAudit=audit.records.find(a=>a.action==='intake.received');assert.equal(receivedAudit.evidence.record.source.consent.text,formInput.consentText);assert.equal(receivedAudit.evidence.record.files[0].sha256,original.sha256);assert.equal(receivedAudit.revision,form.revision);assert.equal(receivedAudit.actor.role,'system');
 }finally{await restored.close();await h.close();}
});

test('INTAKE-001 server enforces conditions, consent, exact origin, revision/unpublish, spam limits, upload size/type, concurrent replay and merged lead file access',async()=>{
 const h=await harness();try{
  const users=await intakeTeam(h),assistant=users['assistant@example.test'],other=users['other@example.test'];let form=await h.json('/intake/forms',formInput,h.owner);
  const token=await h.json('/intake/public/'+form.id),body=inquiry(token);
  await sendInquiry(h,form,{...body,consent:false},[],400);await sendInquiry(h,form,{...body,answers:{children:'yes'}},[],400);await sendInquiry(h,form,{...body,answers:{children:'no',ages:'hidden'}},[],400);await sendInquiry(h,form,{...body,website:'spam'},[],400);
  await sendInquiry(h,form,body,[],403,{origin:'https://outside.example.test'});await sendInquiry(h,form,body,[],403,{'sec-fetch-site':'cross-site'});
  await sendInquiry(h,form,body,[pdf(),{name:'false.pdf',mime:'application/pdf',bytes:Buffer.from('not a PDF')}],400);
  await sendInquiry(h,form,body,[pdf(10*1024*1024+1)],413);assert.equal((await h.json('/leads',undefined,h.owner)).leads.length,0);
  form=await h.json('/intake/forms',{...form,title:'Changed'},h.owner);await sendInquiry(h,form,body,[],409);
  const pausedToken=await h.json('/intake/public/'+form.id);form=await h.json('/intake/forms',{...form,published:false},h.owner);await h.json('/intake/public/'+form.id,undefined,'',404);await sendInquiry(h,form,inquiry(pausedToken),[],404);
  form=await h.json('/intake/forms',{...form,published:true},h.owner);const concurrent=await h.json('/intake/public/'+form.id);
  const [a,b]=await Promise.all([sendInquiry(h,form,inquiry(concurrent),[pdf()]),sendInquiry(h,form,inquiry(concurrent),[pdf()])]);assert.deepEqual(a,b);assert.equal((await h.json('/leads',undefined,h.owner)).leads.length,1);
  for(let n=0;n<9;n++){const t=await h.json('/intake/public/'+form.id);await sendInquiry(h,form,{...inquiry(t),name:'Prospect '+n},[]);}
  const over=await h.json('/intake/public/'+form.id);await sendInquiry(h,form,inquiry(over),[],429);assert.equal((await h.json('/leads',undefined,h.owner)).leads.length,10);
  const source=(await h.json('/leads',undefined,h.owner)).leads.find(l=>l.name==='Elena Rivera'),file=(await h.json('/leads/'+source.id+'/intake',undefined,h.owner)).submissions[0].files[0];
  const survivor=await h.json('/leads',{name:'Same prospect',summary:'Follow-up',referralSource:'Telephone',assignedEmail:'other@example.test'},h.owner);
  await h.json('/leads/'+source.id+'/merge',{revision:source.revision,intoId:survivor.id,intoRevision:survivor.revision,reason:'Same prospective client'},h.owner);
  assert.equal((await h.request(file.downloadUrl,undefined,assistant)).status,404,'Source assignee cannot follow file into an invisible survivor');assert.equal((await h.request(file.downloadUrl,undefined,other)).status,404,'Survivor assignee cannot inherit an invisible source original');
  assert.deepEqual((await h.json('/leads/'+survivor.id+'/intake',undefined,other)).submissions,[]);assert.equal((await h.json('/leads/'+survivor.id+'/intake',undefined,h.owner)).submissions.length,1);
  const archive=await h.request('/api/satchel/backup',undefined,h.owner);assert.equal(archive.status,200);await archive.text();
 }finally{await h.close();}
});
