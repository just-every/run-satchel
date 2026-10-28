import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {csvRows,setupMove,applyMove,commitMove} from './migration-fixture.mjs';
import {harness} from './harness.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function smokeballFixture(h,{zip=true}={}){
 const existing=await h.json('/matter-types',undefined,h.owner);
 if(!existing.types.some(t=>t.name==='Migration source fields'))await setupMove(h);
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
 const p=await smokeballFixture(h),before=await h.request('/api/satchel/backup',undefined,h.owner),plan=await preview(h,p),after=await h.request('/api/satchel/backup',undefined,h.owner);
 assert.deepEqual(productRows(await after.text()),productRows(await before.text()),'Smokeball preview changes no native records or jobs');
 assert.deepEqual(plan.errors,[]);assert.equal(plan.mappingVersion,'satchel-smokeball-v1:review-1');assert.ok(plan.coverageGaps.some(g=>g.includes('Legacy label')));assert.ok(plan.coverageGaps.some(g=>g.includes('Invoices.csv')));
 for(const kind of ['task','activity','expense'])await h.json('/ledes/codes',{kind,code:kind==='task'?'L110':kind==='activity'?'A101':'E101',label:'Synthetic Satchel code',active:true},h.owner);
 const invalid=structuredClone(p);invalid.staff['staff-1']='synthetic-satchel-no-member';assert.ok((await preview(h,invalid)).errors.some(e=>e.includes('active')));
 await h.json('/migration/commit',{package:invalid,fingerprint:(await preview(h,invalid)).fingerprint},h.owner,409);
 const badFields=structuredClone(p);badFields.mappings.matters.custom={unmapped:'Limit'};assert.ok((await preview(h,badFields)).errors.some(e=>e.includes('custom field')));
 const badCode=structuredClone(p);badCode.mappings.time.columns.utbms_task='Narrative';assert.ok((await preview(h,badCode)).errors.some(e=>e.includes('UTBMS')));
 const badWork=structuredClone(p);badWork.mappings.time.columns.amount_cents='Minutes';
 let stopped=await commitMove(h,badWork);stopped=await applyMove(h,badWork,stopped,{stopAt:2});
 const mid=stopped.sources.find(s=>s.kind==='matters').target_id;
 await h.json('/migration/resume',{id:stopped.job.id},h.owner,409);assert.equal((await h.json('/matters/'+mid+'/billing',undefined,h.owner)).entries.length,0,'Wrong source amount posts nothing');
 // A changed reviewed source identity cannot overwrite native records. Continue
 // the valid work in a delta with exactly the same contact and matter mapping.
 const good=await commitMove(h,p);let state=await applyMove(h,p,good,{stopAt:2});
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
}
