import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {csvRows,setupMove,applyMove,commitMove} from './migration-fixture.mjs';
import {harness} from './harness.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function smokeballFixture(h,{zip=true}={}){
 if(!(await h.json('/matter-types',undefined,h.owner)).types.some(t=>t.name==='Migration source fields'))await setupMove(h);
 const {actor}=await h.json('/state',undefined,h.owner),types=await h.json('/matter-types',undefined,h.owner),type=types.types.find(t=>t.name==='Migration source fields');
 const sources={
  'Staff.csv':csvRows(['Staff ID','Name','Source Role'],[['staff-1','Synthetic Satchel Timekeeper','Administrator']]),
  'Contacts.csv':csvRows(['Contact ID','Contact Name','Legacy label'],[['client-1','Synthetic Satchel Smokeball Client','Keep original label']]),
  'Matters.csv':csvRows(['Matter ID','Matter Number','Name','Client ID','Opponent','Status','Opened','Practice','Fields','Limit'],[['matter-1','SB-2020-1','Smokeball source matter','client-1','Synthetic Satchel Smokeball Adverse','open','2020-01-01T12:00:00.000Z','LIT',JSON.stringify({caseNumber:'SB-42',court:'Source court',feeArrangement:'hourly'}),'1250.01']]),
  'Unbilled Time.csv':csvRows(['Work ID','Matter ID','Date','Narrative','Minutes','Hourly Cents','Amount Cents','Staff ID','Billable','AutoTime','Task','Activity'],[['work-1','matter-1','2020-02-02','AutoTime source review',7,10001,1167,'staff-1','true','true','L110','A101']]),
  'Unbilled Costs.csv':csvRows(['Work ID','Matter ID','Date','Narrative','Amount Cents','Staff ID','Billable','Category','Vendor','Reference','Account','Code'],[['cost-1','matter-1','2020-02-02','Source filing cost',1201,'staff-1','true','client_disbursement','Synthetic Satchel Court','SB-COST-1','filing','E101']]),
  'Invoices.csv':csvRows(['Invoice ID','Paid'],[['invoice-held','false']]),
 };
 const columns={contacts:{id:'Contact ID',name:'Contact Name'},matters:{id:'Matter ID',display_number:'Matter Number',description:'Name',client_id:'Client ID',adverse_party:'Opponent',status:'Status',opened_at:'Opened',practice_code:'Practice',fields:'Fields'},time:{id:'Work ID',matter_id:'Matter ID',date:'Date',description:'Narrative',minutes:'Minutes',rate_cents:'Hourly Cents',amount_cents:'Amount Cents',staff_id:'Staff ID',billable:'Billable',autotime:'AutoTime',utbms_task:'Task',utbms_activity:'Activity'},expenses:{id:'Work ID',matter_id:'Matter ID',date:'Date',description:'Narrative',amount_cents:'Amount Cents',staff_id:'Staff ID',billable:'Billable',category:'Category',vendor:'Vendor',vendor_reference:'Reference',accounting_code:'Account',utbms_expense:'Code'}};
 const file=(name,bytes)=>({name,sha256:hash(bytes),contentBase64:Buffer.from(bytes).toString('base64')});
 const sourceExports=zip?[file('Smokeball-export.zip',zipSync(Object.fromEntries(Object.entries(sources).map(([n,s])=>[n,strToU8(s)]))))]:Object.entries(sources).map(([n,s])=>file(n,Buffer.from(s)));
 return {schema:'satchel-smokeball-v1',sourceAccount:'synthetic-satchel-4',mappingRevision:'review-1',phase:'snapshot',extractedAt:'2020-04-03T12:00:00.000Z',sourceExports,staffFile:{file:'Staff.csv',id:'Staff ID',name:'Name'},staff:{'staff-1':actor.email},mappings:Object.fromEntries(Object.entries(columns).map(([kind,c])=>[kind,{file:kind==='contacts'?'Contacts.csv':kind==='matters'?'Matters.csv':kind==='time'?'Unbilled Time.csv':'Unbilled Costs.csv',columns:c,...(kind==='matters'?{typeId:type.id,typeVersion:1,custom:{source_value:'Limit'}}:{})}])),counts:{contacts:1,matters:1,time:1,expenses:1},coverage:{contacts:'complete',matters:'complete',time:'complete',expenses:'complete'},balances:{billedCents:0,unbilledCents:2368,arCents:0,trustCents:0}};
}
const preview=(h,p)=>h.json('/migration/preview',{package:p},h.owner);
const productRows=archive=>archive.trim().split('\n').map(JSON.parse).filter(r=>r.kind==='part').flatMap(p=>p.items).filter(r=>r.kind==='row'&&r.table!=='s_audit').map(JSON.stringify).sort();
export async function proveSmokeballMove(h){
 const p=await smokeballFixture(h),timekeeper='synthetic-satchel-4'+'@'+'example.test';
 await h.json('/team',{email:timekeeper,name:'Synthetic Satchel Timekeeper',role:'lawyer'},h.owner);p.staff['staff-1']=timekeeper;
 const before=await (await h.request('/api/satchel/backup',undefined,h.owner)).text(),plan=await preview(h,p),after=await (await h.request('/api/satchel/backup',undefined,h.owner)).text();
 assert.deepEqual(productRows(after),productRows(before),'Smokeball preview changes no native records or jobs');
 assert.deepEqual(plan.errors,[]);assert.equal(plan.work.find(w=>w.kind==='time').sourceStaffName,'Synthetic Satchel Timekeeper');assert.equal(plan.mappingVersion,'satchel-smokeball-v1:review-1');assert.ok(plan.coverageGaps.some(g=>g.includes('Legacy label')));assert.ok(plan.coverageGaps.some(g=>g.includes('Invoices.csv')));
 for(const kind of ['task','activity','expense'])await h.json('/ledes/codes',{kind,code:kind==='task'?'L110':kind==='activity'?'A101':'E101',label:'Synthetic Satchel code',active:true},h.owner);
 const invalid=structuredClone(p);invalid.staff['staff-1']='synthetic-satchel-no-member';assert.ok((await preview(h,invalid)).errors.some(e=>e.includes('active')));
 await h.json('/migration/commit',{package:invalid,fingerprint:(await preview(h,invalid)).fingerprint},h.owner,409);
 const badFields=structuredClone(p);badFields.mappings.matters.custom={unmapped:'Limit'};assert.ok((await preview(h,badFields)).errors.some(e=>e.includes('custom field')));
 const badCode=structuredClone(p);badCode.mappings.time.columns.utbms_task='Narrative';assert.ok((await preview(h,badCode)).errors.some(e=>e.includes('UTBMS')));
 const badWork=structuredClone(p);badWork.mappings.time.columns.amount_cents='Minutes';
 const rejected=await preview(h,badWork);assert.ok(rejected.errors.some(e=>e.includes('native pricing')));await h.json('/migration/commit',{package:badWork,fingerprint:rejected.fingerprint},h.owner,409);
 const good=await commitMove(h,p);let state=await applyMove(h,p,good,{stopAt:2});const mid=state.sources.find(s=>s.kind==='matters').target_id;
 await h.json('/migration/resume',{id:state.job.id},h.owner,409);assert.equal((await h.json('/matters/'+mid+'/billing',undefined,h.owner)).entries.length,0,'Source attribution grants no matter access');
 await h.json('/matters/'+mid+'/access',{email:timekeeper},h.owner);
 await h.json('/team',{email:timekeeper,name:'Synthetic Satchel Timekeeper',role:'lawyer',active:false},h.owner);
 await h.json('/migration/resume',{id:state.job.id},h.owner,409);assert.equal((await h.json('/matters/'+mid+'/billing',undefined,h.owner)).entries.length,0,'Revoked member cannot post through a retained package');
 await h.json('/team',{email:timekeeper,name:'Synthetic Satchel Timekeeper',role:'lawyer'},h.owner);
 await h.json('/ledes/codes',{kind:'task',code:'L110',label:'Synthetic Satchel code',active:false},h.owner);
 await h.json('/migration/resume',{id:state.job.id},h.owner,409);assert.equal((await h.json('/matters/'+mid+'/billing',undefined,h.owner)).entries.length,0);
 await h.json('/ledes/codes',{kind:'task',code:'L110',label:'Synthetic Satchel code',active:true},h.owner);
 const snapshot=await (await h.request('/api/satchel/backup',undefined,h.owner)).text();
 const restored=await harness();
 try{
  await restored.json('/restore',{archive:snapshot,confirm:'RESTORE'},restored.owner);await restored.restart();
  state=await restored.json('/migration/status',{id:state.job.id},restored.owner);state=await applyMove(restored,p,state);
  assert.equal(state.job.state,'completed');const work=(await restored.json('/matters/'+mid+'/billing',undefined,restored.owner)).entries;
  assert.equal(work.length,2);assert.equal(work.find(e=>e.kind==='time').amountCents,1167);assert.equal(work.find(e=>e.kind==='disbursement').amountCents,1201);assert.equal(work.find(e=>e.kind==='time').timekeeperEmail,p.staff['staff-1']);assert.equal(work.find(e=>e.kind==='time').utbmsTask,'L110');
  const provenance=(await restored.json('/matters/'+mid+'/migration',undefined,restored.owner)).sources.map(s=>({kind:s.kind,value:JSON.parse(s.source_json)}));
  assert.equal(provenance.find(s=>s.kind==='time').value.autotime,'true');assert.equal(JSON.parse(provenance.find(s=>s.kind==='time').value.source_staff).Name,'Synthetic Satchel Timekeeper');assert.equal(provenance.find(s=>s.kind==='time').value.source_mapping_revision,'review-1');
  const fields=await restored.json('/matters/'+mid+'/fields',undefined,restored.owner);assert.equal(fields.profile.custom.source_value,125001);
  assert.equal((await commitMove(restored,p)).job.id,state.job.id);await restored.json('/migration/resume',{id:state.job.id},restored.owner);assert.equal((await restored.json('/matters/'+mid+'/billing',undefined,restored.owner)).entries.length,2);
  const retained=await (await restored.request('/api/satchel/backup',undefined,restored.owner)).text();const chunks=retained.trim().split('\n').map(JSON.parse).filter(r=>r.kind==='part').flatMap(r=>r.items).filter(i=>i.kind==='row'&&i.table==='s_move_package_chunks'&&i.row.job_id===state.job.id).sort((a,b)=>a.row.ordinal-b.row.ordinal).map(i=>i.row.body).join('');assert.deepEqual(JSON.parse(chunks).sourceExports,p.sourceExports,'Exact ZIP bytes and hash survive restart and restore');
  const delta={...p,phase:'delta',previousFingerprint:state.job.fingerprint};const final=await applyMove(restored,delta,await commitMove(restored,delta)),report=await restored.json('/migration/reconcile',{id:final.job.id},restored.owner);
  assert.equal(report.report.nativeBalances.unbilledCents,2368);assert.ok(report.report.gaps.some(g=>g.includes('invoices')));assert.ok(report.report.gaps.some(g=>g.includes('trust')));await restored.json('/migration/cutover',{id:final.job.id,fingerprint:report.fingerprint,confirmed:true,declaration:'Source incomplete'},restored.owner,409);
  const changed={...p,mappingRevision:'review-2'};assert.ok((await preview(restored,changed)).errors.some(e=>e.includes('no overwrite')));
 }finally{await restored.close();}
 await proveSmokeballHistory(h);
}

export async function smokeballHistoryFixture(h){
 const p=await smokeballFixture(h,{zip:false});p.sourceAccount='synthetic-satchel-5';
 const update=(name,contents)=>{const f=p.sourceExports.find(f=>f.name===name);f.contentBase64=Buffer.from(contents).toString('base64');f.sha256=hash(Buffer.from(contents));};
 const matter=p.sourceExports.find(f=>f.name==='Matters.csv');update(matter.name,Buffer.from(matter.contentBase64,'base64').toString().replace('SB-2020-1','SB-2020-2').replace('Smokeball source matter','Smokeball historic matter'));
 const add=(kind,name,headers,rows,extra={})=>{
  const body=csvRows(headers,rows),entry={name,contentBase64:Buffer.from(body).toString('base64'),sha256:hash(Buffer.from(body))};
  const i=p.sourceExports.findIndex(f=>f.name===name);if(i<0)p.sourceExports.push(entry);else p.sourceExports[i]=entry;
  p.mappings[kind]={file:name,columns:Object.fromEntries(headers.map(h=>[h,h])),...extra};p.counts[kind]=rows.length;p.coverage[kind]='complete';
 };
 const {PDFDocument,StandardFonts}=await import('pdf-lib');
 const pdf=async text=>{const doc=await PDFDocument.create();doc.addPage().drawText(text,{font:await doc.embedFont(StandardFonts.Helvetica),size:14});return doc.save();};
 const file=(id,name,bytes)=>({id,name,sha256:hash(bytes),contentBase64:Buffer.from(bytes).toString('base64'),modifiedAt:'2020-04-02T13:14:15.000Z'});
 p.files=[file('paid-pdf','Smokeball-paid.pdf',await pdf('Smokeball SB-2020-201. Total 111.11. Paid 111.11.')),file('unpaid-pdf','Smokeball-unpaid.pdf',await pdf('Smokeball SB-2020-202. Total 222.22. Paid 22.21. Due 200.01.')),
  file('word-original','Advice.docx',zipSync({'[Content_Types].xml':strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),'word/document.xml':strToU8('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Synthetic Satchel historic advice</w:t></w:r></w:p></w:body></w:document>')})),
  file('email-original','Source-message.eml',Buffer.from('Subject: Synthetic Satchel historic advice\r\nDate: Thu, 2 Apr 2020 13:14:15 +0000\r\n\r\nOriginal source correspondence.\r\n')),
  file('trust-original','Source-trust-statement.txt',Buffer.from('Synthetic Satchel source statement. Client one balance USD 789.01 at 2020-04-01.'))];
 add('invoices','Invoices.csv',['id','matter_id','number','ordinal','date','total_cents','ar_cents','pdf_file_id'],[['paid-1','matter-1','SB-2020-201',201,'2020-04-01',11111,0,'paid-pdf'],['unpaid-1','matter-1','SB-2020-202',202,'2020-04-01',22222,20001,'unpaid-pdf']]);
 add('documents','Documents.csv',['id','matter_id','file_id','date','visibility','staff_id'],[['word-1','matter-1','word-original','2020-04-02','private','staff-1'],['email-1','matter-1','email-original','2020-04-02','matter','staff-1'],['statement-1','matter-1','trust-original','2020-04-01','matter','staff-1']]);
 add('notes','Memos.csv',['id','matter_id','title','body','occurred_at','visibility','staff_id'],[['memo-1','matter-1','Source confidential memo','Exact source memo body.','2020-04-02T13:14:15.000Z','Internal','staff-1']],{values:{visibility:{Internal:'private'}}});
 add('tasks','Tasks.csv',['id','matter_id','title','due_date','status','staff_id'],[['task-1','matter-1','Source open review','2020-04-06','Pending','staff-1'],['task-2','matter-1','Source completed review','2020-04-02','Completed','staff-1']],{values:{status:{Pending:'open',Completed:'done'}}});
 add('calendar','Calendar.csv',['id','matter_id','title','date','time','timezone','duration_minutes'],[['event-1','matter-1','Source client meeting','2020-04-03','09:30','America/New_York',60]]);
 add('trust','Trust.csv',['id','matter_id','client_id','balance_cents','statement_date','source_reference','document_id'],[['trust-1','matter-1','client-1',78901,'2020-04-01','Source closing statement','statement-1']]);
 const account=await h.json('/trust/accounts',{name:'Synthetic Satchel Smokeball trust',kind:'trust',bankReference:'Source bank ending 5678'},h.owner);p.trustAccountId=account.id;
 p.balances={billedCents:33333,unbilledCents:2368,arCents:20001,trustCents:78901};
 return p;
}

async function proveSmokeballHistory(h){
 const p=await smokeballHistoryFixture(h),original=structuredClone(p.files[2]);
 p.files=p.files.filter(f=>f.id!==original.id);
 const missing=await preview(h,p);assert.ok(missing.errors.some(e=>e.includes('missing original word-original')));await h.json('/migration/commit',{package:p,fingerprint:missing.fingerprint},h.owner,409);
 p.files.push(original);const plan=await preview(h,p);assert.deepEqual(plan.errors,[]);assert.equal(plan.counts.invoices.package,2);assert.equal(plan.mappings.tasks.values.status.Completed,'done');
 const malformed=structuredClone(p);malformed.mappings.invoices.columns.ar_cents='total_cents';const bad=await preview(h,malformed);assert.equal(bad.errors.length,0,'A different valid source mapping requires a fresh review');await h.json('/migration/commit',{package:malformed,fingerprint:plan.fingerprint},h.owner,409);
 let job=await commitMove(h,p);job=await applyMove(h,p,job,{stopAt:3});
 await h.restart();job=await h.json('/migration/status',{id:job.job.id},h.owner);
 const source=await h.json('/migration/source',{id:job.job.id},h.owner);assert.deepEqual(source.source.sourceExports,p.sourceExports);assert.equal(source.source.mappingRevision,p.mappingRevision);
 job=await applyMove(h,p,job,{stopAt:13});
 const trustBefore=productRows(await(await h.request('/api/satchel/backup',undefined,h.owner)).text());
 await h.json('/migration/resume',{id:job.job.id},h.owner,403);
 assert.deepEqual(productRows(await(await h.request('/api/satchel/backup',undefined,h.owner)).text()),trustBefore,'Importing a trust package grants no trust-officer authority and writes nothing');
 const {designate}=await import('./trust-fixture.mjs');await designate(h);
 await h.json('/migration/resume',{id:job.job.id},h.owner,400);
 job=await applyMove(h,p,job);assert.equal(job.job.state,'completed');
 const mid=job.sources.find(s=>s.kind==='matters').target_id,history=await h.json('/matters/'+mid+'/migration',undefined,h.owner);
 assert.deepEqual(history.invoices.map(i=>[i.number,i.total_cents,i.paid_cents]).sort(),[['SB-2020-201',11111,11111],['SB-2020-202',22222,2221]]);
 for(const invoice of history.invoices){const expected=p.files.find(f=>f.id===(invoice.number.endsWith('201')?'paid-pdf':'unpaid-pdf')),response=await h.request('/api/satchel/bills/'+invoice.id+'/invoice.pdf',undefined,h.owner);assert.equal(response.status,200);assert.equal(Buffer.from(await response.arrayBuffer()).toString('base64'),expected.contentBase64);}
 const collision=structuredClone(p);collision.sourceAccount='synthetic-satchel-6';const duplicate=await preview(h,collision);assert.ok(duplicate.errors.some(e=>e.includes('source number is already registered')));await h.json('/migration/commit',{package:collision,fingerprint:duplicate.fingerprint},h.owner,409);
 await h.json('/invoice-numbering',{prefix:'SB-NATIVE',padding:3,separator:'-',year:false,nextNumber:202,revision:null},h.owner,422);
 const numbering=await h.json('/invoice-numbering',{prefix:'SB-NATIVE',padding:3,separator:'-',year:false,nextNumber:203,revision:null},h.owner);assert.equal(numbering.counter.next_number,203,'First saved numbering scheme starts above every imported source ordinal');
 const timeline=await h.json('/matters/'+mid+'/timeline',undefined,h.owner);assert.ok(JSON.stringify(timeline.entries).includes('Exact source memo body.'));
 const memo=history.sources.find(s=>s.kind==='notes');assert.equal(JSON.parse(memo.source_json).source_visibility,'Internal');assert.equal(JSON.parse(memo.source_json).body,'Exact source memo body.');
 const tasks=await h.json('/matters/'+mid+'/tasks',undefined,h.owner);assert.ok(JSON.stringify(tasks).includes('Source open review'));assert.ok(JSON.stringify(tasks).includes('Source completed review'));const nativeTasks=tasks;assert.equal(nativeTasks.find(t=>t.title==='Source completed review').status,'done');
 const calendar=await h.json('/matters/'+mid+'/calendar',undefined,h.owner);assert.equal(calendar.appointments.find(a=>a.title==='Source client meeting').occurrences[0].time,'09:30');
 const documents=await h.json('/matters/'+mid+'/documents',undefined,h.owner);
 for(const [id,name] of [['word-original','Advice.docx'],['email-original','Source-message.eml']]){const d=documents.find(d=>d.name===name),response=await h.request('/api/satchel/documents/'+d.id+'/file?version=1',undefined,h.owner);assert.equal(response.status,200);assert.equal(Buffer.from(await response.arrayBuffer()).toString('base64'),p.files.find(f=>f.id===id).contentBase64);}
 const trust=await h.json('/trust',undefined,h.owner);assert.equal(trust.ledgers.find(l=>l.matter_id===mid).balance_cents,78901);
 const delta={...p,phase:'delta',previousFingerprint:job.job.fingerprint},final=await applyMove(h,delta,await commitMove(h,delta)),report=await h.json('/migration/reconcile',{id:final.job.id},h.owner);assert.deepEqual(report.report.nativeBalances,p.balances);assert.equal(report.report.counts.invoices.native,2);assert.ok(report.report.gaps.some(g=>g.includes('Full source trust activity')));
 await h.json('/migration/cutover',{id:final.job.id,fingerprint:report.fingerprint,confirmed:true,declaration:'Source history is not complete'},h.owner,409);
 assert.equal((await commitMove(h,p)).job.id,job.job.id);assert.equal((await h.json('/matters/'+mid+'/migration',undefined,h.owner)).invoices.length,2);
 // Imported originals use the same erasure fence as native documents.
 const email=documents.find(d=>d.name==='Source-message.eml');await h.json('/documents/'+email.id+'/erase',{confirm:email.title,reason:'Permitted source correspondence erasure'},h.owner);
 await h.json('/migration/source',{id:job.job.id},h.owner);await h.json('/migration/preview',{package:p},h.owner).then(r=>assert.ok(r.errors.some(e=>e.includes('erased'))));
 const download=await h.request('/api/satchel/documents/'+email.id+'/file?version=1',undefined,h.owner);assert.equal(download.status,404);
 const archived=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),restored=await harness();
 try{await restored.json('/restore',{archive:archived,confirm:'RESTORE'},restored.owner);await restored.json('/migration/commit',{package:p,fingerprint:(await preview(restored,p)).fingerprint},restored.owner,409);const erased=await restored.request('/api/satchel/documents/'+email.id+'/file?version=1',undefined,restored.owner);assert.equal(erased.status,404);const text=Buffer.from(p.files.find(f=>f.id==='email-original').contentBase64,'base64').toString();assert.ok(!archived.includes(p.files.find(f=>f.id==='email-original').contentBase64));assert.ok(!archived.includes(text));}finally{await restored.close();}
}
