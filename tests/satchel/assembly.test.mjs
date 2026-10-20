import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createHash} from 'node:crypto';
import {harness,open} from './harness.mjs';
import {assemblyFoundation,engagement} from './assembly-fixture.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function file(h,id,format,preview=false){const r=await h.request(`/api/satchel/assembly/revisions/${id}/${preview?'preview':'file'}?format=${format}`,undefined,h.owner);assert.equal(r.status,200,r.ok?'file available':await r.text());return Buffer.from(await r.arrayBuffer());}
function wordText(bytes){return execFileSync('python3',['-c',"import sys,io,zipfile,xml.etree.ElementTree as E;z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));assert z.testzip() is None;print('\\n'.join(E.fromstring(z.read('word/document.xml')).itertext()))"],{input:bytes,encoding:'utf8'});}
async function pdfText(bytes){const doc=await getDocument({data:Uint8Array.from(bytes),useSystemFonts:false}).promise;try{const text=[];for(let n=1;n<=doc.numPages;n++)text.push((await (await doc.getPage(n)).getTextContent()).items.map(i=>i.str).join(' '));return text.join('\n');}finally{await doc.destroy();}}
test('DOC-006 versioned two-party engagement and court form, exact questionnaire review, conditional/repeating typed fields, revisions and blocked delivery round-trip through public doors',async()=>{
 const h=await harness();let restored;
 try{
  const {m,base,type}=await assemblyFoundation(h,open);
  await h.json('/team',{email:'assistant@example.test',name:'Case assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');
  const template=await h.json('/assembly/templates',{name:'Hourly engagement',definition:engagement},h.owner);
  await h.json('/assembly/templates',{name:'Invalid unknown merge',definition:{...engagement,paragraphs:[{text:'{{answer.missing}}'}]}},h.owner,400);
  const prepare=(answers,extra={})=>h.json(base+'/assembly',{templateId:template.id,templateVersion:1,answers,...extra},h.owner);
  let r=await prepare({expert:true,retainer:'1500.00'});assert.deepEqual(r.unresolved,['answer.scope']);
  await h.json('/assembly/revisions/'+r.id+'/approve',{sha256:r.sha256},h.owner,409);
  assert.equal((await h.request('/api/satchel/assembly/revisions/'+r.id+'/file?format=pdf',undefined,h.owner)).status,409);
  assert.ok(wordText(await file(h,r.id,'docx',true)).includes('[Unresolved: answer.scope]'));
  let state=await h.json(base+'/assembly',undefined,h.owner),assembly=state.assemblies[0];
  r=await prepare({scope:'Defend the contract claim',expert:true,retainer:'1500.00'},{assemblyId:assembly.id,expectedRevision:1});
  await h.json(base+'/assembly',{templateId:template.id,templateVersion:1,answers:{expert:'maybe'}},h.owner,400);
  const previewDocx=await file(h,r.id,'docx',true),previewPdf=await file(h,r.id,'pdf',true),words=wordText(previewDocx),pdf=await pdfText(previewPdf);
  for(const fragment of ['García Workshop LLC','Riverbend Holdings LLC','Supreme Court, New York County','2026-CV-208','125000.00','1500.00','Defend the contract claim','An expert will be retained.']){assert.ok(words.includes(fragment),fragment);assert.ok(pdf.includes(fragment),fragment);}
  assert.equal(sha(previewDocx),r.snapshot.hashes.docx);assert.equal(sha(previewPdf),r.snapshot.hashes.pdf);
  await h.json('/assembly/revisions/'+r.id+'/approve',{sha256:r.sha256},assistant,403);
  await h.json('/assembly/revisions/'+r.id+'/approve',{sha256:'wrong'},h.owner,409);
  const approved=await h.json('/assembly/revisions/'+r.id+'/approve',{sha256:r.sha256},h.owner);assert.equal(approved.approved.by,'owner@example.test');
  await h.json('/assembly/revisions/'+r.id+'/approve',{sha256:r.sha256},h.owner,409);
  assert.deepEqual(await file(h,r.id,'docx'),previewDocx);assert.deepEqual(await file(h,r.id,'pdf'),previewPdf);
  const revised=await prepare({scope:'Negotiate settlement only',expert:false,retainer:'1500.00'},{assemblyId:assembly.id,expectedRevision:2});assert.equal(revised.number,3);assert.ok(revised.paragraphs.join('\n').includes('Negotiate settlement only'));assert.ok(!revised.paragraphs.join('\n').includes('An expert will be retained.'));
  await h.json(base+'/assembly',{templateId:template.id,templateVersion:1,answers:{scope:'stale edit',expert:false,retainer:'1500.00'},assemblyId:assembly.id,expectedRevision:2},h.owner,409);
  const changed=await h.json('/assembly/templates',{id:template.id,expectedVersion:1,name:'Hourly engagement',definition:{...engagement,formVersion:'Hourly engagement 2027',paragraphs:[{text:'Replacement {{matter.title}}'}]}},h.owner);assert.equal(changed.version,2);
  await h.json('/assembly/templates',{id:template.id,expectedVersion:1,name:'Stale',definition:engagement},h.owner,409);
  await h.json('/matter-types',{id:type.id,revision:type.revision,name:'Litigation',practiceCode:'LIT',definition:{required:['court','caseNumber'],fields:[{key:'claim',label:'Claim (USD)',type:'money',required:true},{key:'new_field',label:'New required field',type:'text',required:true}],records:[]}},h.owner);
  const form=await h.json('/assembly/templates',{name:'NY request for conference',definition:{jurisdiction:'New York County',formVersion:'Request for conference 2026-01',questions:[{key:'hearing',label:'Requested hearing date',type:'date',required:true}],paragraphs:[{text:'New York County {{matter.court}} / {{matter.caseNumber}}'},{text:'Requested hearing {{answer.hearing}}. {{custom.claim}}'}]}},h.owner);
  await h.json(base+'/assembly',{templateId:form.id,templateVersion:form.version,answers:{hearing:'2026-02-30'}},h.owner,400);
  const court=await h.json(base+'/assembly',{templateId:form.id,templateVersion:form.version,answers:{hearing:'2026-11-20'}},h.owner);assert.equal(court.snapshot.typeVersion,1);assert.deepEqual(court.unresolved,[]);assert.ok((await pdfText(await file(h,court.id,'pdf',true))).includes('2026-11-20'));
  await h.json('/assembly/revisions/'+court.id+'/approve',{sha256:court.sha256},h.owner);
  state=await h.json(base+'/assembly',undefined,h.owner);assert.equal(state.assemblies[0].revisions[1].templateVersion,1);assert.ok(state.assemblies[0].revisions[1].paragraphs.join('\n').includes('Defend the contract claim'));assert.equal(state.assemblies[0].revisions[2].answers.scope,'Negotiate settlement only');
  assert.equal((await h.request('/api/satchel/assembly/revisions/'+r.id+'/file?format=pdf',undefined,assistant)).status,404);
  await h.json(base+'/access',{email:'assistant@example.test'},h.owner);assert.equal((await h.json(base+'/assembly',undefined,assistant)).assemblies.length,2);
  const templates=(await h.json('/assembly/templates',undefined,h.owner)).templates;assert.equal(templates.find(t=>t.id===template.id).versions.length,2);
  const archive=await (await h.request('/api/satchel/backup',undefined,h.owner)).text();restored=await harness();await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);
  const recovered=await restored.json(base+'/assembly',undefined,restored.owner);assert.deepEqual(recovered,state);assert.deepEqual(await file(restored,r.id,'docx'),previewDocx);assert.deepEqual(await file(restored,r.id,'pdf'),previewPdf);
  await h.json('/documents/'+approved.approved.pdfId+'/erase',{confirm:'Hourly engagement-revision-2.pdf',reason:'Authorized document disposal'},h.owner);
  assert.equal((await h.request('/api/satchel/assembly/revisions/'+r.id+'/file?format=pdf',undefined,h.owner)).status,404);
 }finally{await restored?.close();await h.close();}
});
