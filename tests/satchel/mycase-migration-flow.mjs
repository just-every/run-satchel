import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {zipSync,strToU8,unzipSync} from 'fflate';
import {csvRows} from './migration-fixture.mjs';
export const mycaseAuthority={confirmed:true,reference:'Principal confirmed the source administrator authorization for this exact supplemental export.'};
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

// Additional Full Backup datasets use the same reviewed checkpoint as cases.
export async function mycaseHistoryPackage(h){
 const {movePackage}=await import('./migration-fixture.mjs'),{actor}=await h.json('/state',undefined,h.owner);
 const account=await h.json('/trust/accounts',{name:'Synthetic Satchel MyCase history',kind:'trust',bankReference:'Prepared source statement'},h.owner);
 const native=await movePackage(actor.email,account.id),p=mycaseCsvPackage(mycasePackage());
 p.account='synthetic-satchel-mycase-history';p.currency='USD';p.staff={'staff-1':actor.email};p.clientRepairs={'missing-client':'client-1'};p.caseRepairs={'missing-case':'matter-1'};
 p.trustAccountId=account.id;p.balances={billedCents:15000,unbilledCents:10000,arCents:13000,trustCents:150001};
 const contactCsv=p.csvFiles.find(f=>f.name.endsWith('Contacts.csv'));Object.assign(contactCsv,sourceFile(contactCsv.name,Buffer.from(Buffer.from(contactCsv.contentBase64,'base64').toString().replaceAll('Synthetic Satchel MyCase Client','Synthetic Satchel MyCase History Client'))));
 p.csvFiles=p.csvFiles.filter(f=>!f.name.endsWith('Tasks.csv')&&!f.name.endsWith('Unknown.csv'));
 const cases=p.csvFiles.find(f=>f.name.endsWith('Cases.csv'));Object.assign(cases,sourceFile(cases.name,Buffer.from(Buffer.from(cases.contentBase64,'base64').toString().replaceAll('MC-2020-1','MCH-2020-1').replaceAll('MC-2019-2','MCH-2019-2'))));
 for(const kind of ['relationships','notes','calls','emails','calendar','tasks','time','expenses','fees','invoices','trust','financial','portal','sms']){
  let contents=native.datasets[kind];
  if(kind==='invoices')contents=csvRows(['id','matter_id','number','ordinal','date','total_cents','ar_cents','pdf_file_id','due_date'],[['invoice-1','matter-1','MYCASE-2020-81',81,'2020-04-01',15000,13000,'pdf-1','2020-04-15']]);
  if(kind==='trust')contents=csvRows(['id','matter_id','client_id','balance_cents','statement_date','source_reference','document_id'],[['trust-1','matter-1','client-1',150001,'2020-04-01','Source statement page one','document-1']]);
  if(kind==='time')contents=csvRows(['id','matter_id','date','description','minutes','rate_cents','amount_cents','invoice_id','staff_id','billable'],[['time-1','matter-1','2020-03-01','MyCase billed advice',60,10000,10000,'invoice-1','staff-1','Yes'],['time-2','matter-2','2020-03-02','MyCase unbilled advice',30,10000,5000,'','staff-1','Yes']]);
  if(kind==='expenses')contents=csvRows(['id','matter_id','date','description','amount_cents','invoice_id','staff_id','billable','category','vendor','vendor_reference','accounting_code'],[['expense-1','matter-1','2020-03-01','MyCase filing expense',2000,'invoice-1','staff-1','Yes','advanced_cost','Synthetic Satchel Court','MC-COST-1','5010']]);
  if(kind==='fees')contents=csvRows(['id','matter_id','date','description','amount_cents','invoice_id','terms','fee_type'],[['fee-1','matter-1','2020-03-01','Historic MyCase fixed fee',2000,'invoice-1','','fee'],['fee-interest','matter-1','2020-03-01','Historic source interest',600,'invoice-1','','interest'],['fee-late','matter-1','2020-03-01','Historic source late fee',400,'invoice-1','','late_fee'],['fee-2','matter-2','2020-03-01','MyCase reviewed fixed fee',5000,'',JSON.stringify({kind:'flat',recurrence:'once',endDate:'2020-03-01',earning:'on_approval',trustDraw:'prohibited',includedWork:'Source engagement review',exceptions:'none',reference:'Synthetic Satchel source signed agreement'}),'fee']]);
  if(kind==='financial')contents=csvRows(['id','matter_id','client_id','ledger','kind','date','amount_cents','invoice_id','document_id','source_reference','related_id'],[
   ['finance-1','matter-1','client-1','ar','invoice','2020-04-01',15000,'invoice-1','document-1','Source invoice issue',''],
   ['finance-2','matter-1','client-1','ar','payment','2020-04-02',2000,'invoice-1','document-1','Source recorded operating receipt',''],
   ['finance-3','matter-1','client-1','trust','deposit','2020-03-01',160001,'','document-1','Source trust deposit',''],
   ['finance-4','matter-1','client-1','trust','withdrawal','2020-03-02',10000,'','document-1','Source trust disbursement',''],
   ['finance-6','matter-1','client-1','ar','credit','2020-04-03',250,'invoice-1','document-1','Source approved invoice credit',''],
   ['finance-7','matter-1','client-1','ar','refund','2020-04-03',250,'invoice-1','document-1','Source partial payment refund','finance-2'],
   ['finance-8','matter-1','client-1','ar','payment','2020-04-03',50,'invoice-1','document-1','Source second payment',''],
   ['finance-9','matter-1','client-1','ar','payment_reversal','2020-04-03',50,'invoice-1','document-1','Source reversed payment','finance-8'],
   ['finance-10','matter-1','client-1','ar','credit','2020-04-03',25,'invoice-1','document-1','Source second credit',''],
   ['finance-11','matter-1','client-1','ar','credit_reversal','2020-04-03',25,'invoice-1','document-1','Source reversed credit','finance-10'],
   ['finance-12','matter-1','client-1','ar','dispute','2020-04-02',500,'invoice-1','document-1','Source disputed services',''],
   ['finance-13','matter-1','client-1','ar','dispute_clear','2020-04-03',500,'invoice-1','document-1','Source counsel resolved dispute','finance-12'],
  ]);
  if(['portal','sms'].includes(kind))contents=csvRows(['id','matter_id','title','body','occurred_at','visibility','thread_id','author','recipient'],[[kind+'-1','matter-1',kind==='portal'?'Historic portal discussion':'Historic SMS conversation',kind==='portal'?'Source portal body retained without sending.':'Source SMS body retained without sending.','2020-03-03T12:00:00.000Z','private','thread-1','Synthetic Satchel Sender','Synthetic Satchel Recipient']]);
  const name='Full Backup/'+kind+'.csv',headers=contents.split('\r\n')[0].split(',').map(s=>s.slice(1,-1));
  p.csvFiles.push(sourceFile(name,Buffer.from(contents)));p.mappings[kind]={file:name,columns:Object.fromEntries(headers.map(key=>[key,key]))};
  if(['notes','calls','emails','portal','sms'].includes(kind))p.mappings[kind].values={visibility:{team:'team',private:'private'}};
  if(kind==='tasks')p.mappings[kind].values={status:{open:'open',done:'done'}};
  if(['time','expenses'].includes(kind))p.mappings[kind].values={billable:{Yes:'true',No:'false'}};
 }
 const {PDFDocument,StandardFonts}=await import('pdf-lib'),pdf=await PDFDocument.create();pdf.addPage().drawText('Historic MyCase invoice MYCASE-2020-81. Total USD 150.00. Paid USD 20.00.',{font:await pdf.embedFont(StandardFonts.Helvetica),size:14});p.files.push({id:'pdf-1',...sourceFile('MyCase-2020-81.pdf',await pdf.save()),modifiedAt:'2020-04-02T13:14:15.000Z'});
 const members=p.files.map(f=>({id:f.id,path:'originals/'+f.name,modifiedAt:f.modifiedAt}));
 const originals=zipSync(Object.fromEntries(p.files.map((f,i)=>[members[i].path,Buffer.from(f.contentBase64,'base64')])));
 p.binaryArchive={file:sourceFile('MyCase-originals.zip',originals),members};p.files=[];
 const supplemental=p.csvFiles.find(f=>f.name.endsWith('/portal.csv'));p.csvFiles=p.csvFiles.filter(f=>f!==supplemental);p.supplements=[{file:supplemental,sourceReference:'Authorized MyCase administrator supplied the omitted portal history.'}];
 return p;
}
export async function proveMyCaseHistoryMove(h){
 const {applyMove,commitMove}=await import('./migration-fixture.mjs'),{designate}=await import('./trust-fixture.mjs');
 const p=await mycaseHistoryPackage(h),before=await h.json('/state',undefined,h.owner),jobs=await h.json('/migration',undefined,h.owner);
 const plan=await preview(h,p);assert.deepEqual(plan.errors,[]);assert.equal(plan.counts.invoices.package,1);assert.equal(plan.counts.time.package,2);assert.equal(plan.counts.calendar.package,1);
 assert.deepEqual(await h.json('/state',undefined,h.owner),before);assert.deepEqual(await h.json('/migration',undefined,h.owner),jobs);
 const bad=structuredClone(p);bad.staff['staff-1']='synthetic-satchel-unmapped';assert.ok((await preview(h,bad)).errors.some(e=>e.includes('Staff staff-1')));await h.json('/migration/commit',{package:bad,fingerprint:(await preview(h,bad)).fingerprint},h.owner,409);
 const amount=structuredClone(p),time=amount.csvFiles.find(f=>f.name.endsWith('/time.csv'));Object.assign(time,sourceFile(time.name,Buffer.from(Buffer.from(time.contentBase64,'base64').toString().replace('"10000","invoice-1"','"10001","invoice-1"'))));assert.ok((await preview(h,amount)).errors.some(e=>e.includes('Source work amount')));await h.json('/migration/commit',{package:amount,fingerprint:(await preview(h,amount)).fingerprint},h.owner,409);
 await h.json('/migration/commit',{package:p,fingerprint:plan.fingerprint},h.owner,409);
 await h.json('/migration/commit',{package:p,fingerprint:plan.fingerprint,supplementalAuthority:{...mycaseAuthority,confirmed:false}},h.owner,409);
 assert.deepEqual(await h.json('/migration',undefined,h.owner),jobs);
 const foreign=structuredClone(p);foreign.currency='EUR';const foreignPlan=await preview(h,foreign);assert.ok(foreignPlan.errors.some(e=>e.includes('source currency USD')));await h.json('/migration/commit',{package:foreign,fingerprint:foreignPlan.fingerprint,supplementalAuthority:mycaseAuthority},h.owner,409);
 const wrongInvoice=structuredClone(p),invoiceCsv=wrongInvoice.csvFiles.find(f=>f.name.endsWith('/invoices.csv'));
 Object.assign(invoiceCsv,sourceFile(invoiceCsv.name,Buffer.from(Buffer.from(invoiceCsv.contentBase64,'base64').toString().replace('"15000","13000"','"15001","13000"'))));
 const refusedInvoice=await preview(h,wrongInvoice);assert.ok(refusedInvoice.errors.some(e=>e.includes('source lines and tax do not reconcile')));await h.json('/migration/commit',{package:wrongInvoice,fingerprint:refusedInvoice.fingerprint,supplementalAuthority:mycaseAuthority},h.owner,409);
 const cancelledError=structuredClone(p),activityCsv=cancelledError.csvFiles.find(f=>f.name.endsWith('/financial.csv'));
 Object.assign(activityCsv,sourceFile(activityCsv.name,Buffer.from(Buffer.from(activityCsv.contentBase64,'base64').toString().replace('"15000","invoice-1"','"15001","invoice-1"').replace('"2000","invoice-1"','"2001","invoice-1"'))));
 const cancelledPlan=await preview(h,cancelledError);assert.ok(cancelledPlan.errors.some(e=>e.includes('financial issue must match its original invoice total exactly once')));await h.json('/migration/commit',{package:cancelledError,fingerprint:cancelledPlan.fingerprint,supplementalAuthority:mycaseAuthority},h.owner,409);assert.deepEqual(await h.json('/migration',undefined,h.owner),jobs);
 const excessReversal=structuredClone(p),reversalsCsv=excessReversal.csvFiles.find(f=>f.name.endsWith('/financial.csv'));
 Object.assign(reversalsCsv,sourceFile(reversalsCsv.name,Buffer.from(Buffer.from(reversalsCsv.contentBase64,'base64').toString().replace('"payment_reversal","2020-04-03","50"','"payment_reversal","2020-04-03","51"'))));
 const excessPlan=await preview(h,excessReversal);assert.ok(excessPlan.errors.some(e=>e.includes('cumulative reversals exceed their original source amount')));await h.json('/migration/commit',{package:excessReversal,fingerprint:excessPlan.fingerprint,supplementalAuthority:mycaseAuthority},h.owner,409);assert.deepEqual(await h.json('/migration',undefined,h.owner),jobs);
 const newInterest=structuredClone(p),feesCsv=newInterest.csvFiles.find(f=>f.name.endsWith('/fees.csv'));
 Object.assign(feesCsv,sourceFile(feesCsv.name,Buffer.from(Buffer.from(feesCsv.contentBase64,'base64').toString().replace('agreement""}","fee"','agreement""}","interest"'))));
 const interestPlan=await preview(h,newInterest);assert.ok(interestPlan.errors.some(e=>e.includes('no new assessment is authorized')));await h.json('/migration/commit',{package:newInterest,fingerprint:interestPlan.fingerprint,supplementalAuthority:mycaseAuthority},h.owner,409);assert.deepEqual(await h.json('/migration',undefined,h.owner),jobs);
 let job=await commitMove(h,p,{supplementalAuthority:mycaseAuthority});job=await applyMove(h,p,job,{stopAt:7});await h.restart();assert.equal((await h.json('/migration/status',{id:job.job.id},h.owner)).job.checkpoint,7);await designate(h);
 while(job.job.state==='applying'){
  let review;
  if(job.next.kind==='matters'){const search=await h.json('/conflicts',{client:job.next.client,adverse:job.next.adverse},h.owner);review={conflictId:search.id,confirmed:true,reviewNote:'Principal reviewed the source case and every match.'};}
  if(job.next.kind==='trust')review={confirmed:true,reviewNote:'Designated officer checked the source statement and exact client allocation.'};
  if(job.next.needsFeeReview){const checkpoint=job.job.checkpoint;await h.json('/migration/resume',{id:job.job.id},h.owner,409);assert.equal((await h.json('/migration/status',{id:job.job.id},h.owner)).job.checkpoint,checkpoint);review={confirmed:true,reviewNote:'Principal reviewed exact source fee terms, earning and prohibited trust draw.'};}
  try{job=await h.json('/migration/resume',{id:job.job.id,review},h.owner);}catch(error){throw new Error('MyCase '+job.next.kind+' '+job.next.sourceId+' checkpoint '+job.job.checkpoint+': '+error.message,{cause:error});}
 }
 assert.equal(job.job.state,'completed');
 const state=await h.json('/state',undefined,h.owner),active=state.matters.find(m=>m.matter_number==='MCH-2020-1'),archived=state.matters.find(m=>m.matter_number==='MCH-2019-2');
 const history=await h.json('/matters/'+active.id+'/migration',undefined,h.owner);
 for(const [kind,body] of [['notes','Exact historic note body'],['calls','Exact historic call body'],['emails','Exact historic email body']])assert.equal(JSON.parse(history.sources.find(s=>s.kind===kind).source_json).body,body);
 assert.equal(history.invoices[0].number,'MYCASE-2020-81');assert.equal(history.invoices[0].paid_cents,2000);
 const pdf=await h.request('/api/satchel/bills/'+history.invoices[0].id+'/invoice.pdf',undefined,h.owner);assert.equal(pdf.status,200);assert.equal(Buffer.from(await pdf.arrayBuffer()).toString('base64'),Buffer.from(unzipSync(Buffer.from(p.binaryArchive.file.contentBase64,'base64'))['originals/MyCase-2020-81.pdf']).toString('base64'));
 const work=await h.json('/matters/'+active.id+'/billing',undefined,h.owner);assert.deepEqual(work.entries.map(e=>e.amountCents).sort((a,b)=>a-b),[2000,10000]);assert.ok(work.entries.every(e=>e.reservedBy===history.invoices[0].id));assert.equal(work.entries.find(e=>e.kind==='disbursement').expense.vendorReference,'MC-COST-1');
 const unbilled=await h.json('/matters/'+archived.id+'/billing',undefined,h.owner);assert.equal(unbilled.entries[0].amountCents,5000);assert.equal(unbilled.entries[0].reservedBy,null);
 const fees=await h.json('/matters/'+archived.id+'/fee-plans',undefined,h.owner);assert.ok(fees.plans.some(f=>f.title==='MyCase reviewed fixed fee'&&f.amountCents===5000&&f.trustDraw==='prohibited'));
 for(const channel of ['portal','sms']){const message=JSON.parse(history.sources.find(s=>s.kind===channel).source_json);assert.equal(message.thread_id,'thread-1');assert.equal(message.author,'Synthetic Satchel Sender');}
 assert.equal(JSON.parse(history.sources.find(s=>s.kind==='financial').source_json).ledger,'ar');
 const tasks=await h.json('/matters/'+archived.id+'/tasks',undefined,h.owner);assert.ok(JSON.stringify(tasks).includes('Source review task'));
 const calendar=await h.json('/matters/'+archived.id+'/calendar',undefined,h.owner);assert.equal(calendar.appointments[0].timezone,'America/New_York');assert.equal(calendar.appointments[0].occurrences[0].time,'09:30');
 const reconciliation=await h.json('/migration/reconcile',{id:job.job.id},h.owner);assert.deepEqual(reconciliation.report.nativeBalances,p.balances);assert.deepEqual(reconciliation.report.activity.map(a=>[a.ledger,a.sourceBalanceCents,a.activityBalanceCents,a.records]),[['ar',13000,13000,10],['trust',150001,150001,2]]);
 assert.ok(reconciliation.report.gaps.some(g=>g.includes('authorized supplemental')));
 const receipt=(await h.json('/migration/source',{id:job.job.id},h.owner)).source;
 assert.deepEqual(receipt.binaryArchive,p.binaryArchive);assert.deepEqual(receipt.supplements,p.supplements);assert.equal(receipt.supplementalAuthority.reference,mycaseAuthority.reference);assert.equal(receipt.supplementalAuthority.actor,(await h.json('/state',undefined,h.owner)).actor.email);assert.equal(receipt.supplementalAuthority.files[0].sha256,p.supplements[0].file.sha256);
 assert.equal((await commitMove(h,p)).job.id,job.job.id);await h.json('/migration/resume',{id:job.job.id},h.owner);assert.equal((await h.json('/matters/'+active.id+'/billing',undefined,h.owner)).bills.length,1);assert.equal((await h.json('/matters/'+archived.id+'/tasks',undefined,h.owner)).length,tasks.length);
 const saved=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),{harness}=await import('./harness.mjs'),restored=await harness();
 try{await restored.json('/restore',{archive:saved,confirm:'RESTORE'},restored.owner);const restoredHistory=await restored.json('/matters/'+active.id+'/migration',undefined,restored.owner);assert.equal(restoredHistory.invoices[0].number,'MYCASE-2020-81');const original=await restored.request('/api/satchel/bills/'+history.invoices[0].id+'/invoice.pdf',undefined,restored.owner);assert.equal(Buffer.from(await original.arrayBuffer()).toString('base64'),Buffer.from(unzipSync(Buffer.from(p.binaryArchive.file.contentBase64,'base64'))['originals/MyCase-2020-81.pdf']).toString('base64'));assert.equal((await commitMove(restored,p)).job.id,job.job.id);assert.deepEqual((await restored.json('/migration/source',{id:job.job.id},restored.owner)).source.csvFiles,p.csvFiles);
  const {invoiceTemplate,setupInvoicePayers}=await import('./invoice-delivery-fixture.mjs');
  await setupInvoicePayers(restored,active);const templates=await restored.json('/invoice-templates',undefined,restored.owner),template=await restored.json('/invoice-templates',invoiceTemplate(templates.templates.at(-1)?.id??null,{includeTrustBalance:false}),restored.owner),recipient=(await restored.json('/contacts',undefined,restored.owner)).contacts.find(c=>c.name===active.client).emails[0];
  const delivery=await restored.json('/bills/'+history.invoices[0].id+'/deliveries',{recipient,payerName:active.client,templateId:template.id},restored.owner),originalBytes=Buffer.from(unzipSync(Buffer.from(p.binaryArchive.file.contentBase64,'base64'))['originals/MyCase-2020-81.pdf']);
  const delivered=await restored.request('/api/satchel/invoice-deliveries/'+delivery.id+'/pdf',undefined,restored.owner);assert.equal(delivered.status,200);assert.equal(Buffer.from(await delivered.arrayBuffer()).toString('base64'),originalBytes.toString('base64'));
  await restored.json('/invoice-numbering',{prefix:'MYCASE',padding:3,separator:'-',year:false,nextNumber:81,revision:null},restored.owner,422);
  await restored.json('/invoice-numbering',{prefix:'MYCASE',padding:3,separator:'-',year:false,nextNumber:82,revision:null},restored.owner);
  const {draft,reviewed}=await import('./invoice-numbering-fixture.mjs'),approved=await reviewed(restored,active,await draft(restored,active,'Native bill after preserved MyCase source number'));
  const issued=await restored.json('/invoices/issue',{bills:[{id:approved.id,revision:approved.revision}]},restored.owner);assert.equal(issued.issues[0].number,'MYCASE-082');
  const again=await restored.request('/api/satchel/bills/'+history.invoices[0].id+'/invoice.pdf',undefined,restored.owner);assert.equal(Buffer.from(await again.arrayBuffer()).toString('base64'),originalBytes.toString('base64'));
}finally{await restored.close();}
 await (await import('./mycase-ledger-flow.mjs')).proveMyCaseLedger(h,job,active,archived);
 const delta=structuredClone(p);delta.phase='delta';delta.previousFingerprint=plan.fingerprint;
 const finance=delta.csvFiles.find(f=>f.name.endsWith('/financial.csv')),contents=Buffer.from(finance.contentBase64,'base64').toString();
 Object.assign(finance,sourceFile(finance.name,Buffer.from(contents+csvRows(['id','matter_id','client_id','ledger','kind','date','amount_cents','invoice_id','document_id','source_reference','related_id'],[['finance-5','matter-1','client-1','ar','credit','2020-04-03',1,'invoice-1','document-1','Unreconciled source credit','']]).split('\r\n').slice(1).join('\r\n'))));
 let changed=await commitMove(h,delta,{supplementalAuthority:mycaseAuthority});while(changed.job.state==='applying')changed=await h.json('/migration/resume',{id:changed.job.id},h.owner);
 const mismatch=await h.json('/migration/reconcile',{id:changed.job.id},h.owner);assert.equal(mismatch.report.activity.find(a=>a.ledger==='ar').activityBalanceCents,12999);assert.ok(mismatch.report.gaps.some(g=>g.includes('ar invoice-1: source financial activity does not reconcile')));await h.json('/migration/cutover',{id:changed.job.id,fingerprint:mismatch.fingerprint,confirmed:true,declaration:'Unreconciled source credit must prevent cutover.'},h.owner,409);
 const email=['synthetic-satchel-history-reader','example.test'].join('@');await h.json('/team',{email,name:'Synthetic Satchel History Reader',role:'lawyer'},h.owner);await h.json('/team/invite',{email},h.owner);const reader=await h.login(email);await h.json('/matters/'+active.id+'/access',{email},h.owner);
 const limited=await h.json('/matters/'+active.id+'/migration',undefined,reader);assert.ok(!limited.sources.some(s=>['trust','financial','portal','sms'].includes(s.kind)));await h.json('/migration/source',{id:job.job.id},reader,403);await h.json('/matters/'+active.id+'/access',{email,remove:true},h.owner);await h.json('/matters/'+active.id+'/migration',undefined,reader,404);
 const documents=await h.json('/matters/'+active.id+'/documents',undefined,h.owner);await h.json('/documents/'+documents[0].id+'/erase',{confirm:documents[0].title,reason:'Principal approved disposal of the imported source original.'},h.owner);
 for(const id of [job.job.id,changed.job.id])assert.equal((await h.json('/migration/source',{id},h.owner)).source.binaryArchive.file.contentBase64,undefined);
 const erasedArchive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();assert.ok(!erasedArchive.includes(p.binaryArchive.file.contentBase64));assert.ok((await preview(h,p)).errors.some(e=>e.includes('no overwrite or resurrection')));
 const hidden=structuredClone(p);hidden.phase='delta';hidden.previousFingerprint=changed.job.fingerprint;
 for(const file of [...hidden.csvFiles,...hidden.supplements.map(s=>s.file)])Object.assign(file,sourceFile(file.name,Buffer.from(Buffer.from(file.contentBase64,'base64').toString().split('\r\n')[0]+'\r\n')));
 const note=hidden.csvFiles.find(f=>f.name.endsWith('/notes.csv'));Object.assign(note,sourceFile(note.name,Buffer.from(csvRows(['id','matter_id','title','body','occurred_at','visibility','staff_id'],[['note-after-erasure','matter-1','Later source capture','A new capture cannot retain disposed bytes.','2020-04-03T12:00:00.000Z','team','staff-1']]))));
 hidden.binaryArchive.members=hidden.binaryArchive.members.filter(m=>m.id!=='original-1');
 hidden.binaryArchive.file=sourceFile('Repacked-MyCase-originals.zip',zipSync(unzipSync(Buffer.from(p.binaryArchive.file.contentBase64,'base64')),{level:0}));
 const denied=await preview(h,hidden);assert.ok(denied.errors.some(e=>e.includes('later capture or changed binary archive cannot resurrect')));
 const jobsBefore=await h.json('/migration',undefined,h.owner);await h.json('/migration/commit',{package:hidden,fingerprint:denied.fingerprint,supplementalAuthority:mycaseAuthority},h.owner,409);assert.deepEqual(await h.json('/migration',undefined,h.owner),jobsBefore);
 const missingStatement=await h.json('/migration/reconcile',{id:changed.job.id},h.owner);assert.ok(missingStatement.report.gaps.some(g=>g.includes('source statement original unavailable')));
}
