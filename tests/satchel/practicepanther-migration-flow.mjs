import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {harness} from './harness.mjs';
import {csvRows} from './migration-fixture.mjs';

export async function practicePantherFixture(h){
 const types=await h.json('/matter-types',undefined,h.owner);
 let type=types.types.find(t=>t.name==='PracticePanther reviewed fields');
 if(!type){
  const result=await h.json('/matter-types',{name:'PracticePanther reviewed fields',practiceCode:'LIT',definition:{required:['caseNumber'],fields:[{key:'claim_value',label:'Claim value',type:'money',required:true},{key:'hearing',label:'Hearing date',type:'date',required:true},{key:'priority',label:'Source priority',type:'choice',options:['Normal','Urgent'],required:true},{key:'reviewed',label:'Source reviewed',type:'yesno',required:true}],records:[]}},h.owner);
  type=result.types.find(t=>t.name==='PracticePanther reviewed fields');
 }
 const original=(name,text)=>({name,contentBase64:Buffer.from(text).toString('base64')});
 return {schema:'satchel-practicepanther-v1',phase:'snapshot',extractedAt:'2020-04-03T12:00:00.000Z',clientRepairs:{},coverage:{contacts:'complete',matters:'complete'},practicePanther:{account:'synthetic-satchel-1',exports:{
  messages:original('PracticePanther-Messages.csv',csvRows(['Message ID','Matter ID','Body'],[['message-1','matter-1','Synthetic Satchel source message retained without a native mapping']])),
  contacts:original('PracticePanther-Contacts.csv','\uFEFF'+csvRows(['Contact ID','Display Name','Former Names','Source label'],[['client-1','Synthetic Satchel Panther Client','Panther former name','Retained contact custom value'],['client-2','Synthetic Satchel Panther Spare','','Retained second value']])),
  matters:original('PracticePanther-Matters.csv',csvRows(['Matter ID','Matter Number','Matter Name','Client ID','Reviewed Adverse','Status','Opened At','Case Reference','Claim Amount','Hearing','Priority','Reviewed','Unsupported field'],[['matter-1','PP-2020-42','Panther custom-field advice','client-1','Synthetic Satchel Panther Adverse','Open','2020-01-01T12:00:00.000Z','PANTHER-42','250000.50','2020-05-06','Urgent','yes','Retain the source-only value']])),
 },mapping:{revision:'synthetic-satchel-review-1',columns:{contacts:{id:'Contact ID',name:'Display Name',aliases:'Former Names'},matters:{id:'Matter ID',display_number:'Matter Number',description:'Matter Name',client_id:'Client ID',adverse_party:'Reviewed Adverse',status:'Status',opened_at:'Opened At'}},matterType:{id:type.id,version:type.version,practiceCode:'LIT'},fields:{caseNumber:'Case Reference'},custom:{claim_value:'Claim Amount',hearing:'Hearing',priority:'Priority',reviewed:'Reviewed'},statuses:{Open:'open',Closed:'closed'}}}};
}
const preview=(h,p)=>h.json('/migration/preview',{package:p},h.owner);
export const commitPracticePanther=async(h,p)=>{const plan=await preview(h,p);assert.deepEqual(plan.errors,[]);return h.json('/migration/commit',{package:p,fingerprint:plan.fingerprint,mappingConfirmed:true},h.owner);};
const productRows=archive=>archive.trim().split('\n').map(JSON.parse).filter(p=>p.kind==='part').flatMap(p=>p.items).filter(i=>i.kind==='row'&&i.table!=='s_audit').map(JSON.stringify).sort();
const backup=async h=>(await h.request('/api/satchel/backup',undefined,h.owner)).text();

// Folded into the existing installed-app import sanity journey, without adding
// registrations. These are the real migration and native matter HTTP doors.
export async function provePracticePantherMove(h){
 const p=await practicePantherFixture(h),before=await backup(h),plan=await preview(h,p);
 assert.deepEqual(productRows(await backup(h)),productRows(before),'Preview retains no package, contact, matter or checkpoint');
 assert.deepEqual(plan.errors,[]);assert.equal(plan.mappingVersion,p.practicePanther.mapping.revision);
 assert.deepEqual(plan.sourceExports.find(f=>f.kind==='matters').unsupportedFields,['Unsupported field']);
 assert.ok(plan.sourceExports.find(f=>f.kind==='contacts').unsupportedFields.includes('Source label'));
 assert.ok(plan.coverageGaps.some(g=>g.startsWith('payments:')));assert.ok(plan.coverageGaps.some(g=>g.startsWith('messages:')));assert.equal(plan.sourceExports.find(f=>f.kind==='messages').supported,false);
 assert.ok(plan.coverageGaps.some(g=>g.startsWith('tasks:')));assert.ok(plan.coverageGaps.some(g=>g.startsWith('trust:')));
 await h.json('/migration/preview',{package:p},'',401);
 await h.json('/migration/commit',{package:p,fingerprint:plan.fingerprint,mappingConfirmed:false},h.owner,400);
 const unmapped=structuredClone(p);unmapped.practicePanther.mapping.columns.matters.id='Absent column';await h.json('/migration/preview',{package:unmapped},h.owner,400);
 const invalid=structuredClone(p);invalid.practicePanther.exports.matters.contentBase64=Buffer.from(Buffer.from(invalid.practicePanther.exports.matters.contentBase64,'base64').toString().replace('250000.50','250000.501')).toString('base64');
 const invalidPlan=await preview(h,invalid);assert.ok(invalidPlan.errors.some(e=>e.includes('Claim value must be US dollars')));await h.json('/migration/commit',{package:invalid,fingerprint:invalidPlan.fingerprint,mappingConfirmed:true},h.owner,409);
 assert.deepEqual(productRows(await backup(h)),productRows(before),'Invalid mapping and typed data cannot write native records');
 let job=await commitPracticePanther(h,p);job=await h.json('/migration/resume',{id:job.job.id},h.owner);
 const saved=await backup(h),restored=await harness();
 try{
  await restored.json('/restore',{archive:saved,confirm:'RESTORE'},restored.owner);
  job=await restored.json('/migration/status',{id:job.job.id},restored.owner);
  assert.equal(job.job.checkpoint,1);assert.equal(job.columnMapping.revision,p.practicePanther.mapping.revision);assert.ok(job.mappingReview.by);assert.ok(job.mappingReview.at);
  for(const [kind,file] of Object.entries(p.practicePanther.exports)){
   const retained=job.sourceExports.find(f=>f.kind===kind);assert.equal(retained.contentBase64,file.contentBase64);assert.equal(retained.sha256,createHash('sha256').update(Buffer.from(file.contentBase64,'base64')).digest('hex'));
  }
  job=await restored.json('/migration/resume',{id:job.job.id},restored.owner);
  await restored.json('/migration/resume',{id:job.job.id},restored.owner,409);
  assert.equal((await restored.json('/migration/status',{id:job.job.id},restored.owner)).job.checkpoint,2);
  const search=await restored.json('/conflicts',{client:'Synthetic Satchel Panther Client',adverse:'Synthetic Satchel Panther Adverse'},restored.owner);
  const review={conflictId:search.id,confirmed:true,reviewNote:'Principal reviewed the PracticePanther identities and cleared every native conflict.'};
  await restored.json('/migration/resume',{id:job.job.id,review:{...review,confirmed:false}},restored.owner,400);
  job=await restored.json('/migration/resume',{id:job.job.id,review},restored.owner);assert.equal(job.job.state,'completed');
  const source=job.sources.find(s=>s.kind==='matters'),matter=(await restored.json('/state',undefined,restored.owner)).matters.find(m=>m.id===source.target_id);
  assert.equal(matter.matter_number,'PP-2020-42');assert.equal(matter.client,'Synthetic Satchel Panther Client');
  const fields=await restored.json('/matters/'+matter.id+'/fields',undefined,restored.owner);
  assert.equal(fields.profile.typeId,p.practicePanther.mapping.matterType.id);assert.equal(fields.profile.caseNumber,'PANTHER-42');
  assert.deepEqual(fields.profile.custom,{claim_value:25000050,hearing:'2020-05-06',priority:'Urgent',reviewed:true});
  assert.ok(fields.history.some(e=>e.kind==='imported'&&e.detail.source.mappingRevision===p.practicePanther.mapping.revision));
  const history=await restored.json('/matters/'+matter.id+'/migration',undefined,restored.owner),raw=JSON.parse(JSON.parse(history.sources.find(s=>s.kind==='matters').source_json)._source);
  assert.equal(raw.provider,'practicepanther');assert.equal(raw.raw['Unsupported field'],'Retain the source-only value');assert.equal(raw.raw['Claim Amount'],'250000.50');assert.ok(raw.headers.includes('Matter ID'));assert.equal(raw.mappingRevision,p.practicePanther.mapping.revision);
  const contacts=(await restored.json('/contacts',undefined,restored.owner)).contacts;
  const native=contacts.find(c=>c.name==='Synthetic Satchel Panther Client'),clio=contacts.find(c=>c.name==='Synthetic Satchel Workshop');
  assert.ok(native&&clio);assert.notEqual(native.id,clio.id,'The same account and contact source ID in Clio and PracticePanther remain distinct');
  assert.equal(job.sources.find(s=>s.kind==='contacts'&&s.source_id==='client-1').target_id,native.id);
  const stateBefore=await restored.json('/state',undefined,restored.owner),replay=await commitPracticePanther(restored,p);assert.equal(replay.job.id,job.job.id);
  await restored.json('/migration/resume',{id:job.job.id},restored.owner);await restored.restart();await restored.json('/migration/resume',{id:job.job.id},restored.owner);
  assert.equal((await restored.json('/state',undefined,restored.owner)).matters.length,stateBefore.matters.length);assert.equal((await restored.json('/contacts',undefined,restored.owner)).contacts.length,contacts.length);
  const changed=structuredClone(p);changed.practicePanther.mapping.revision='synthetic-satchel-review-2';const changedPlan=await preview(restored,changed);assert.ok(changedPlan.errors.some(e=>e.includes('source changed')));await restored.json('/migration/commit',{package:changed,fingerprint:changedPlan.fingerprint,mappingConfirmed:true},restored.owner,409);
  const delta=structuredClone(p);delta.phase='delta';delta.previousFingerprint=job.job.fingerprint;
  // Even a declared complete inventory cannot promote unsupported history.
  delta.coverage=Object.fromEntries(Object.keys(plan.counts).map(k=>[k,'complete']));let final=await commitPracticePanther(restored,delta);
  while(final.job.state==='applying')final=await restored.json('/migration/resume',{id:final.job.id},restored.owner);
  const report=await restored.json('/migration/reconcile',{id:final.job.id},restored.owner);assert.ok(report.report.gaps.some(g=>g.startsWith('tasks:')));assert.ok(report.report.gaps.some(g=>g.startsWith('invoices:')));assert.ok(report.report.gaps.some(g=>g.startsWith('trust:')));
  await restored.json('/migration/cutover',{id:final.job.id,fingerprint:report.fingerprint,confirmed:true,declaration:'Source inventory reviewed; missing history must still refuse cutover.'},restored.owner,409);
  assert.equal((await restored.json('/migration/status',{id:final.job.id},restored.owner)).cutover,null);
  assert.ok(report.report.gaps.some(g=>g.startsWith('payments:')));assert.ok(report.report.gaps.some(g=>g.startsWith('messages:')));
  assert.equal((await restored.json('/state',undefined,restored.owner)).matters.length,stateBefore.matters.length);
 }finally{await restored.close();}
}
