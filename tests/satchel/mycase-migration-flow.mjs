import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {zipSync,strToU8,unzipSync} from 'fflate';
import {csvRows} from './migration-fixture.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const sourceFile=(name,bytes)=>({name,sha256:hash(bytes),contentBase64:Buffer.from(bytes).toString('base64')});
export function mycasePackage(){
 const csvs={
  'Full Backup/Contacts.csv':'\uFEFF'+csvRows(['Contact ID','Full Name','Former Name','Unmapped phone'],[['client-1','Synthetic Satchel MyCase Client','Old MyCase name','5550101']]),
  'Full Backup/Cases.csv':csvRows(['Case ID','Case Number','Case Name','Client ID','Adverse Party','Case Status','Opened','Archived','Court Number'],[['matter-1','MC-2020-1','MyCase active advice','missing-client','Synthetic Satchel MyCase Opponent','Active','2020-01-01T12:00:00.000Z','','MC-42'],['matter-2','MC-2019-2','MyCase archived estate','client-1','Synthetic Satchel MyCase Respondent','Archived','2019-01-01T12:00:00.000Z','2020-03-03T12:00:00.000Z','MC-43']]),
  'Full Backup/Documents.csv':csvRows(['Document ID','Case ID','Original ID','Document Date','Access'],[['document-1','missing-case','original-1','2020-04-01','Firm'],['document-2','matter-2','original-2','2020-03-01','Private']]),
  'Full Backup/Tasks.csv':csvRows(['Task ID','Case ID','Title'],[['task-1','matter-1','Unsupported source task']]),
  'Full Backup/Unknown.csv':csvRows(['Source ID','Raw Value'],[['synthetic-satchel-1','Retain this unsupported row']]),
 };
 const bytes=zipSync(Object.fromEntries(Object.entries(csvs).map(([name,value])=>[name,strToU8(value)])));
 return {schema:'satchel-mycase-v1',account:'synthetic-satchel-1',phase:'snapshot',extractedAt:'2020-04-03T12:00:00.000Z',backup:sourceFile('MyCase-Full-Backup.zip',bytes),mappingRevision:'review-1',mappings:{
  contacts:{file:'Full Backup/Contacts.csv',columns:{id:'Contact ID',name:'Full Name',aliases:'Former Name'}},
  cases:{file:'Full Backup/Cases.csv',columns:{id:'Case ID',display_number:'Case Number',description:'Case Name',client_id:'Client ID',adverse_party:'Adverse Party',status:'Case Status',opened_at:'Opened',closed_at:'Archived',case_number:'Court Number'},values:{status:{Active:'open',Archived:'closed'}}},
  documents:{file:'Full Backup/Documents.csv',columns:{id:'Document ID',matter_id:'Case ID',file_id:'Original ID',date:'Document Date',visibility:'Access'},values:{visibility:{Firm:'matter',Private:'private'}}},
 },files:[{id:'original-1',...sourceFile('MyCase-advice.txt',Buffer.from('Synthetic Satchel MyCase original advice.')),modifiedAt:'2020-04-01T12:00:00.000Z'},{id:'original-2',...sourceFile('MyCase-estate.txt',Buffer.from('Synthetic Satchel MyCase private estate original.')),modifiedAt:'2020-03-01T12:00:00.000Z'}],clientRepairs:{},caseRepairs:{}};
}
export function mycaseCsvPackage(p){
 const {backup,...copy}=structuredClone(p);
 const csvs=unzipSync(Buffer.from(backup.contentBase64,'base64'));
 return {...copy,csvFiles:Object.entries(csvs).map(([name,value])=>sourceFile(name,value))};
}
const preview=(h,p)=>h.json('/migration/preview',{package:p},h.owner);
export async function proveMyCaseMove(h){
 const p=mycasePackage(),allFiles=structuredClone(p.files);p.files=p.files.slice(0,1);
 const before=await h.json('/state',undefined,h.owner),beforeJobs=await h.json('/migration',undefined,h.owner),beforeContacts=await h.json('/contacts',undefined,h.owner);
 let plan=await preview(h,p);
 assert.equal(plan.provider,'MyCase');assert.deepEqual(plan.caseCounts,{active:1,archived:1});
 for(const missing of ['unmatched contacts identity missing-client','unmatched matters identity missing-case','missing original original-2'])assert.ok(plan.errors.some(e=>e.includes(missing)),missing);
 assert.deepEqual(await h.json('/state',undefined,h.owner),before);assert.deepEqual(await h.json('/contacts',undefined,h.owner),beforeContacts);assert.deepEqual(await h.json('/migration',undefined,h.owner),beforeJobs);
 for(const name of ['Tasks.csv','Unknown.csv'])assert.ok(plan.coverageGaps.some(g=>g.includes(name)));
 for(const name of ['fees','financial activity','portal history','email history','SMS history','historic invoice PDFs','AR and trust'])assert.ok(plan.coverageGaps.some(g=>g.includes(name)));
 await h.json('/migration/commit',{package:p,fingerprint:plan.fingerprint},h.owner,409);
 const invalid=structuredClone(p);invalid.mappings.cases.columns.id='Not a source header';await h.json('/migration/preview',{package:invalid},h.owner,400);
 const status=structuredClone(p);delete status.mappings.cases.values.status.Archived;assert.ok((await preview(h,status)).errors.some(e=>e.includes('explicitly map source status Archived')));
 p.files=allFiles;p.clientRepairs['missing-client']='client-1';p.caseRepairs['missing-case']='matter-1';plan=await preview(h,p);assert.deepEqual(plan.errors,[]);
 const revised=structuredClone(p);revised.mappingRevision='review-2';await h.json('/migration/commit',{package:revised,fingerprint:plan.fingerprint},h.owner,409);
 let job=await h.json('/migration/commit',{package:p,fingerprint:plan.fingerprint},h.owner);const id=job.job.id;
 await h.json('/migration/resume',{id},'',401);
 const email=['synthetic-satchel-member','example.test'].join('@');await h.json('/team',{email,name:'Synthetic Satchel Member',role:'lawyer'},h.owner);await h.json('/team/invite',{email},h.owner);const lawyer=await h.login(email);
 await h.json('/migration/source',{id},lawyer,403);await h.json('/migration/resume',{id},lawyer,403);
 job=await h.json('/migration/resume',{id},h.owner);assert.equal(job.job.checkpoint,1);
 await h.json('/migration/resume',{id},h.owner,409);assert.equal((await h.json('/migration/status',{id},h.owner)).job.checkpoint,1,'A source case grants no conflict clearance');
 const wrong=await h.json('/conflicts',{client:'Wrong client',adverse:job.next.adverse},h.owner);await h.json('/migration/resume',{id,review:{conflictId:wrong.id,confirmed:true,reviewNote:'Wrong source case review'}},h.owner,409);
 const clear=await h.json('/conflicts',{client:job.next.client,adverse:job.next.adverse},h.owner);job=await h.json('/migration/resume',{id,review:{conflictId:clear.id,confirmed:true,reviewNote:'Principal reviewed every match and source case relationship.'}},h.owner);assert.equal(job.job.checkpoint,2);
 await h.restart();job=await h.json('/migration/status',{id},h.owner);assert.equal(job.job.checkpoint,2);
 const interruptedArchive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),{harness}=await import('./harness.mjs'),restored=await harness();
 try{await restored.json('/restore',{archive:interruptedArchive,confirm:'RESTORE'},restored.owner);assert.equal((await restored.json('/migration/status',{id},restored.owner)).job.checkpoint,2);assert.deepEqual((await restored.json('/migration/source',{id},restored.owner)).source.backup,p.backup);}finally{await restored.close();}
 while(job.job.state==='applying'){
  let review;if(job.next.kind==='matters'){const search=await h.json('/conflicts',{client:job.next.client,adverse:job.next.adverse},h.owner);review={conflictId:search.id,confirmed:true,reviewNote:'Principal reviewed the archived source case and every match.'};}
  job=await h.json('/migration/resume',{id,review},h.owner);
 }
 const retained=await h.json('/migration/source',{id},h.owner);assert.deepEqual(retained.source.backup,p.backup);assert.deepEqual(retained.source.mappings,p.mappings);assert.deepEqual(retained.source.clientRepairs,p.clientRepairs);assert.equal(retained.source.mappingRevision,p.mappingRevision);
 const state=await h.json('/state',undefined,h.owner),active=state.matters.find(m=>m.matter_number==='MC-2020-1'),archived=state.matters.find(m=>m.matter_number==='MC-2019-2');
 assert.equal(active.lifecycle_status,'open');assert.equal(archived.lifecycle_status,'closed');assert.equal(active.opened_at,'2020-01-01T12:00:00.000Z');
 const history=await h.json('/matters/'+archived.id+'/migration',undefined,h.owner),source=JSON.parse(history.sources.find(s=>s.kind==='matters').source_json);assert.equal(source.closed_at,'2020-03-03T12:00:00.000Z');assert.equal(source.source_status,'Archived');assert.equal(source.source_mapping_revision,'review-1');
 const contacts=(await h.json('/contacts',undefined,h.owner)).contacts;assert.equal(contacts.filter(c=>c.name==='Synthetic Satchel MyCase Client').length,1);assert.ok(contacts.find(c=>c.name==='Synthetic Satchel MyCase Client').aliases.includes('Old MyCase name'));
 const docs=(await h.json('/matters/'+active.id+'/documents',undefined,h.owner));assert.equal(docs.length,1);const doc=docs[0];
 const original=await h.request('/api/satchel/documents/'+doc.id+'/file',undefined,h.owner);assert.equal(original.status,200);assert.equal(Buffer.from(await original.arrayBuffer()).toString('base64'),p.files[0].contentBase64);
 assert.equal((await h.request('/api/satchel/documents/'+doc.id+'/file',undefined,lawyer)).status,404);
 await h.json('/matters/'+active.id+'/access',{email},h.owner);const allowed=await h.request('/api/satchel/documents/'+doc.id+'/file',undefined,lawyer);assert.equal(allowed.status,200);assert.equal(Buffer.from(await allowed.arrayBuffer()).toString('base64'),p.files[0].contentBase64);
 await h.json('/matters/'+active.id+'/access',{email,remove:true},h.owner);assert.equal((await h.request('/api/satchel/documents/'+doc.id+'/file',undefined,lawyer)).status,404);
 const sourceHistory=await h.json('/matters/'+active.id+'/migration',undefined,h.owner);assert.equal(JSON.parse(sourceHistory.sources.find(s=>s.kind==='documents').source_json).matter_id,'matter-1');
 assert.equal(JSON.parse(sourceHistory.sources.find(s=>s.kind==='matters').source_json).client_id,'missing-client');
 const replay=await h.json('/migration/commit',{package:p,fingerprint:plan.fingerprint},h.owner);assert.equal(replay.job.id,id);assert.equal((await h.json('/migration/resume',{id},h.owner)).job.state,'completed');
 const csvPackage=mycaseCsvPackage(p),csvPlan=await preview(h,csvPackage);assert.deepEqual(csvPlan.errors,[]);let csvJob=await h.json('/migration/commit',{package:csvPackage,fingerprint:csvPlan.fingerprint},h.owner);while(csvJob.job.state==='applying')csvJob=await h.json('/migration/resume',{id:csvJob.job.id},h.owner);
 assert.deepEqual((await h.json('/migration/source',{id:csvJob.job.id},h.owner)).source.csvFiles,csvPackage.csvFiles);assert.equal((await h.json('/state',undefined,h.owner)).matters.length,state.matters.length);assert.equal((await h.json('/matters/'+active.id+'/documents',undefined,h.owner)).length,1);
 const delta=structuredClone(p);delta.phase='delta';delta.previousFingerprint=plan.fingerprint;const deltaPlan=await preview(h,delta);let deltaJob=await h.json('/migration/commit',{package:delta,fingerprint:deltaPlan.fingerprint},h.owner);while(deltaJob.job.state==='applying')deltaJob=await h.json('/migration/resume',{id:deltaJob.job.id},h.owner);
 const reconciliation=await h.json('/migration/reconcile',{id:deltaJob.job.id},h.owner);assert.ok(reconciliation.report.gaps.some(g=>g.includes('MyCase unsupported: financial activity')));await h.json('/migration/cutover',{id:deltaJob.job.id,fingerprint:reconciliation.fingerprint,confirmed:true,declaration:'Unsupported data must not permit source shutdown.'},h.owner,409);
 const changed=structuredClone(p);changed.mappings.documents.values.visibility.Firm='private';const changedPlan=await preview(h,changed);assert.ok(changedPlan.errors.some(e=>e.includes('source changed')));await h.json('/migration/commit',{package:changed,fingerprint:changedPlan.fingerprint},h.owner,409);
 await h.json('/documents/'+doc.id+'/erase',{confirm:doc.title,reason:'Principal approved erasure of the imported original.'},h.owner);assert.equal((await h.request('/api/satchel/documents/'+doc.id+'/file',undefined,h.owner)).status,404);
 const erased=await preview(h,p);assert.ok(erased.errors.some(e=>e.includes('no overwrite or resurrection')));await h.json('/migration/commit',{package:p,fingerprint:erased.fingerprint},h.owner,409);const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();assert.ok(!archive.includes(p.files[0].contentBase64));assert.ok(archive.includes(p.files[1].contentBase64));
 await h.json('/team',{email,name:'Synthetic Satchel Member',role:'lawyer',active:false},h.owner);await h.json('/migration/source',{id},lawyer,403);
}
