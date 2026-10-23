import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
import {reportFoundation} from './report-fixture.mjs';
import {reviewed} from './invoice-numbering-fixture.mjs';
import {foundation} from './trust-fixture.mjs';
import {transaction} from './trust-period-fixture.mjs';
const everything={rates:'all',bank:'full',reports:'firm',contacts:'write',documents:'write',billing:'write',settings:'write'};
const csvIds=text=>text.trim().split('\r\n').slice(1).map(r=>r.split(',')[0].replaceAll('"',''));
async function assign(h,email,name,role,customRoleId){return h.json('/team',{email,name,role,customRoleId},h.owner);}
test('FIRM-008 custom roles narrow rates, reports and exports on every door at the next request and are audited',async()=>{
 const h=await harness();try{
  const f=await reportFoundation(h),base='/matters/'+f.active.id,entry=(cookie,cents,description)=>h.json(base+'/entries',{kind:'time',date:'2026-10-01',description,minutes:60,rateCents:cents},cookie);
  await h.json(base+'/access',{email:'assistant@example.test'},h.owner);
  const principal=await entry(h.owner,41000,'Principal strategy'),counsel=await entry(f.lawyer,33000,'Associate research'),clerk=await entry(f.assistant,12000,'Assistant chronology');
  const draft=await h.json(base+'/bills',{title:'Mixed timekeepers',date:'2026-10-01',entryIds:[principal.id,counsel.id,clerk.id]},h.owner),bill=await reviewed(h,f.active,draft);
  await h.json(base+'/rates',{scope:'matter',timekeeperEmail:'lawyer@example.test',effectiveFrom:'2026-10-01',rateCents:35000,incrementMinutes:6,discountBps:0,billable:true,note:'Matter agreement for the associate'},h.owner);
  await h.json(base+'/rates',{scope:'matter',effectiveFrom:'2026-10-01',rateCents:30000,incrementMinutes:6,discountBps:0,billable:true,note:'Matter agreement for everyone'},h.owner);
  const seen=async cookie=>{const b=await h.json(base+'/billing',undefined,cookie);return {entries:Object.fromEntries(b.entries.map(e=>[e.id,e])),bill:b.bills.find(x=>x.id===bill.id)};};
  // Without a custom role an assistant sees every timekeeper's rate, as before.
  let view=await seen(f.assistant);assert.equal(view.entries[principal.id].rateCents,41000);assert.equal(view.entries[counsel.id].rateCents,33000);assert.equal(view.bill.snapshot.lines.length,3);assert.ok(view.bill.artifact.includes('41000'));
  // The principal alone defines roles; a role can never grant trust authorization or legal approval.
  const own={rates:'own',bank:'none',reports:'none',contacts:'read',documents:'read',billing:'write',settings:'none'};
  for(const cookie of [f.lawyer,f.assistant])await h.json('/roles',{name:'Own rates',permissions:own,reason:'Not the principal'},cookie,403);
  for(const bad of [{...own,trustAuthorization:true},{...own,legalApproval:true}])await h.json('/roles',{name:'Authority',permissions:bad,reason:'Try to confer authority'},h.owner,422);
  await h.json('/roles',{name:'Unknown',permissions:{...own,payroll:'write'},reason:'Unknown area'},h.owner,400);await h.json('/roles',{name:'Partial',permissions:{rates:'own'},reason:'Missing areas'},h.owner,400);
  const role=await h.json('/roles',{name:'Own-rate assistant',permissions:own,reason:'Assistants see their own hourly rate and no trust bank records'},h.owner);
  await h.json('/team',{email:'assistant@example.test',name:'Case assistant',role:'assistant',customRoleId:'missing'},h.owner,404);
  await h.json('/team',{email:'owner@example.test',name:'Principal',role:'lawyer',customRoleId:role.id},h.owner,403);
  await assign(h,'assistant@example.test','Case assistant','assistant',role.id);
  // The very next request: own rate stays, every other timekeeper's rate, amount and frozen text is withheld.
  view=await seen(f.assistant);
  assert.equal(view.entries[clerk.id].rateCents,12000);assert.equal(view.entries[clerk.id].amountCents,12000);
  for(const e of [principal,counsel]){assert.equal(view.entries[e.id].rateCents,null);assert.equal(view.entries[e.id].amountCents,null);assert.equal(view.entries[e.id].rateRedacted,true);}
  const lines=Object.fromEntries(view.bill.snapshot.lines.map(l=>[l.sourceId,l]));assert.equal(lines[clerk.id].rateCents,12000);assert.equal(lines[principal.id].rateCents,null);assert.equal(lines[counsel.id].amountCents,null);assert.equal(view.bill.artifact,null);assert.equal(view.bill.snapshot.totalCents,bill.snapshot.totalCents);
  const rates=await h.json(base+'/rates',undefined,f.assistant),byNote=Object.fromEntries(rates.rules.map(r=>[r.note,r]));assert.equal(byNote['Matter agreement for the associate'].rateCents,null);assert.equal(byNote['Matter agreement for everyone'].rateCents,30000);
  const sheet=await h.json('/time',undefined,f.assistant);assert.equal(sheet.defaultRateCents,30000);
  await h.json(base+'/rates',{scope:'matter',effectiveFrom:'2026-11-01',rateCents:1,incrementMinutes:6,discountBps:0,billable:true,note:'Assistant cannot set rates'},f.assistant,403);
  // Report, export and IOLTA register routes refuse the restricted assistant.
  await h.json('/reports',undefined,f.assistant,403);await h.json('/reports/export?dashboard=status',undefined,f.assistant,403);await h.json('/trust',undefined,f.assistant,403);
  for(const path of ['/export','/invoice.pdf','/ledes'])assert.equal((await h.request('/api/satchel/bills/'+bill.id+path,undefined,f.assistant)).status,403);
  // A lawyer limited to own-matter reports and no rate visibility.
  const counselRole=await h.json('/roles',{name:'Own-matter lawyer',permissions:{...everything,rates:'none',reports:'own',bank:'none'},reason:'Associate sees own matters and no rates'},h.owner);
  const profile=await h.json('/matters/'+f.estate.id+'/stage',undefined,h.owner);await h.json('/matters/'+f.estate.id+'/stage-profile',{revision:profile.profile.revision,lawyerEmail:'owner@example.test'},h.owner);
  const firm=await h.json('/reports',undefined,f.lawyer),ids=r=>r.dashboards.flatMap(d=>d.rows.map(x=>x.matterId)).filter(Boolean);assert.ok(ids(firm).includes(f.estate.id));
  const firmCsv=csvIds(await(await h.request('/api/satchel/reports/export?dashboard=status',undefined,f.lawyer)).text());assert.ok(firmCsv.includes(f.estate.id));
  await assign(h,'lawyer@example.test','Jordan Lee','lawyer',counselRole.id);
  const narrowed=await h.json('/reports',undefined,f.lawyer);assert.ok(!ids(narrowed).includes(f.estate.id));assert.equal(narrowed.cohortCount,firm.cohortCount-1);assert.ok(ids(narrowed).includes(f.active.id));
  const narrowedCsv=csvIds(await(await h.request('/api/satchel/reports/export?dashboard=status',undefined,f.lawyer)).text());assert.ok(!narrowedCsv.includes(f.estate.id));assert.ok(narrowedCsv.includes(f.active.id));
  assert.ok(!JSON.stringify(narrowed).includes('rateCents'),'Reports never carry hourly rates');
  view=await seen(f.lawyer);for(const e of [principal,counsel,clerk])assert.equal(view.entries[e.id].rateCents,null);assert.equal((await h.json('/time',undefined,f.lawyer)).defaultRateCents,null);
  for(const path of ['/export','/invoice.pdf','/ledes','/ledes-xml'])assert.equal((await h.request('/api/satchel/bills/'+bill.id+path,undefined,f.lawyer)).status,403);
  assert.equal((await h.request('/api/satchel/bills/'+bill.id+'/export',undefined,h.owner)).status,200);
  // Widening takes effect on the next request without a new sign-in.
  const widened=await h.json('/roles',{id:counselRole.id,revision:counselRole.revision,name:'Own-matter lawyer',permissions:{...counselRole.permissions,rates:'all',reports:'firm'},reason:'Associate now sees every rate and firm-wide reports'},h.owner);assert.equal(widened.revision,counselRole.revision+1);
  await h.json('/roles',{id:counselRole.id,revision:counselRole.revision,name:'Own-matter lawyer',permissions:everything,reason:'Stale revision'},h.owner,409);
  assert.equal((await h.request('/api/satchel/bills/'+bill.id+'/export',undefined,f.lawyer)).status,200);
  view=await seen(f.lawyer);assert.equal(view.entries[principal.id].rateCents,41000);assert.ok(ids(await h.json('/reports',undefined,f.lawyer)).includes(f.estate.id));
  // Both changes, the assignment and the refused authority are in the audit with previous permissions.
  const audit=(await h.json('/audit?action=role.saved&limit=200',undefined,h.owner)).records.filter(r=>r.objectId===counselRole.id);
  assert.equal(audit.length,2);assert.equal(audit[0].detail.previous,null);assert.equal(audit[1].detail.previous.permissions.rates,'none');assert.equal(audit[1].detail.permissions.rates,'all');assert.equal(audit[1].actor.role,'owner');assert.equal(audit[1].evidence.record.recordType,'s_custom_roles');
  const assigned=(await h.json('/audit?action=member.saved&limit=200',undefined,h.owner)).records.find(r=>r.objectId==='lawyer@example.test'&&r.evidence.context.customRoleId===counselRole.id);assert.equal(assigned.evidence.context.previousCustomRoleId??null,null);
  const detail=await h.json('/roles',undefined,h.owner);assert.deepEqual(detail.roles.find(r=>r.id===role.id).members,['assistant@example.test']);await h.json('/roles',undefined,f.lawyer,403);
  // Removing the role restores the built-in role's own access, again at once.
  await assign(h,'assistant@example.test','Case assistant','assistant',null);view=await seen(f.assistant);assert.equal(view.entries[principal.id].rateCents,41000);
 }finally{await h.close();}
});
test('FIRM-008 custom roles gate bank, contacts, documents, settings, agent keys and every listed door without conferring authority',async()=>{
 const h=await harness();try{
  const f=await foundation(h),base='/matters/'+f.m.id,address={line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'};
  await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@example.test',phone:'212-555-0100',address,timezone:'America/New_York',billing:{defaultRateCents:30000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main',phone:'212-555-0100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'}]}},h.owner);
  for(const [role,name] of [['trust_officer','Taylor Officer'],['assistant','Morgan Assistant'],['lawyer','Nora Woods']]){const email=role+'@example.test';await h.json('/team',{email,name,role},h.owner);await h.json('/team/invite',{email},h.owner);for(const m of [f.m,f.other])await h.json('/matters/'+m.id+'/access',{email},h.owner);}
  const officer=await h.login('trust_officer@example.test'),assistant=await h.login('assistant@example.test'),lawyer=await h.login('lawyer@example.test');
  const receipt=await transaction(h,f,{reference:'balance-subject'});assert.ok(receipt);
  const role=name=>h.json('/roles',{name,permissions:{...everything},reason:'Start from full access'},h.owner);
  // Bank: balances only shows totals; none refuses the register; neither authorizes anything.
  const bank=await role('Bank ceiling'),set=(permissions,r)=>h.json('/roles',{id:r.id,revision:r.revision,name:r.name,permissions,reason:'Change bank access'},h.owner);
  await assign(h,'trust_officer@example.test','Taylor Officer','trust_officer',bank.id);
  assert.ok((await h.json('/trust',undefined,officer)).entries.length>0);
  let current=await set({...everything,bank:'balances'},bank);
  const balances=await h.json('/trust',undefined,officer);assert.ok(balances.accounts[0].balance_cents>0);assert.ok(balances.ledgers[0].balance_cents>0);assert.deepEqual([balances.entries,balances.openings,balances.clearings],[[],[],[]]);assert.equal(balances.accounts[0].bank_reference,undefined);
  for(const path of ['/trust/transactions','/trust/transfers','/trust/checks','/trust/periods?accountId='+f.account.id])await h.json(path,undefined,officer,403);
  await h.json('/trust/transactions',{accountId:f.account.id},officer,403);
  const billing=await h.json(base+'/billing',undefined,officer);assert.ok(billing.bills.every(b=>b.trustPayment===null||b.trustPayment===undefined));
  current=await set({...everything,bank:'none'},current);await h.json('/trust',undefined,officer,403);
  current=await set(everything,current);assert.ok((await h.json('/trust',undefined,officer)).entries.length>0);
  // A role granting everything to a non-officer confers no trust or legal authority.
  await assign(h,'assistant@example.test','Morgan Assistant','assistant',bank.id);
  for(const path of ['/trust','/trust/transactions','/trust/periods?accountId='+f.account.id])await h.json(path,undefined,assistant,403);
  await h.json('/conflicts',{client:'A',adverse:'B'},assistant,403);await h.json('/team',{email:'x@example.test',name:'X',role:'lawyer'},assistant,403);
  // Contacts, documents and settings: none refuses, read allows only reads, write leaves the built-in role in charge.
  const area=await role('Area ceiling');await assign(h,'lawyer@example.test','Nora Woods','lawyer',area.id);
  const doc=await h.json(base+'/documents',{name:'Lease.txt',mime:'text/plain',contentBase64:Buffer.from('lease').toString('base64'),visibility:'matter'},lawyer);
  let areas=area;const apply=async permissions=>{areas=await h.json('/roles',{id:area.id,revision:areas.revision,name:area.name,permissions,reason:'Change area access'},h.owner);};
  await apply({...everything,contacts:'none',documents:'none',settings:'none'});
  await h.json('/contacts',undefined,lawyer,403);await h.json('/leads',undefined,lawyer,403);await h.json('/conflicts',{client:'A',adverse:'B'},lawyer,403);
  await h.json(base+'/documents',undefined,lawyer,403);assert.equal((await h.request('/api/satchel/documents/'+doc.id+'/file',undefined,lawyer)).status,403);
  await h.json('/firm',undefined,lawyer,403);await h.json('/audit',undefined,lawyer,403);
  const state=await h.json('/state',undefined,lawyer);assert.deepEqual(Object.keys(state.firm).sort(),['currency','name','timezone']);
  await apply({...everything,contacts:'read',documents:'read',settings:'read'});
  await h.json('/contacts',undefined,lawyer);await h.json('/contacts',{name:'Denied Contact'},lawyer,403);await h.json(base+'/documents',undefined,lawyer);
  await h.json(base+'/documents',{name:'Denied.txt',mime:'text/plain',contentBase64:Buffer.from('x').toString('base64'),visibility:'matter'},lawyer,403);await h.json('/firm',undefined,lawyer);
  await apply(everything);await h.json(base+'/documents',{name:'Allowed.txt',mime:'text/plain',contentBase64:Buffer.from('x').toString('base64'),visibility:'matter'},lawyer);
  // Agent keys carry the sponsor's ceiling.
  const key=await h.json('/keys',{label:'lawyer preparation'},lawyer),agent=path=>h.request('/api/satchel'+path,undefined,'',{authorization:'Bearer '+key.key});
  assert.equal((await agent('/agent/matters/'+f.m.id)).status,200);await apply({...everything,documents:'none',rates:'none'});assert.equal((await agent('/agent/matters/'+f.m.id)).status,403);assert.equal((await agent('/agent/context')).status,200);
  await apply({...everything,rates:'none'});const sponsored=await(await agent('/agent/matters/'+f.m.id)).json();assert.ok(sponsored.billing.entries.every(e=>e.rateCents===null||e.rateCents===undefined));
  await apply({...everything,billing:'read'});
  assert.equal((await h.request('/api/satchel/agent/prepare-bill',{matterId:f.m.id},'',{authorization:'Bearer '+key.key})).status,403);
  // Every listed server door belongs to an area; none is left to chance.
  const doors=await h.json('/roles/doors',undefined,h.owner);assert.deepEqual(doors.unclassified,[]);assert.ok(doors.doors.length>200);
  for(const [method,path,area] of [['GET','/trust','bank:balances'],['POST','/trust/accounts','bank'],['GET','/reports','reports'],['GET','/contacts','contacts'],['GET','/matters/:id/documents','documents'],['GET','/matters/:id/billing','billing'],['GET','/firm','settings'],['GET','/matters/:id/rates','rates'],['GET','/bills/:id/export','rates:all']])assert.ok(doors.doors.find(d=>d.method===method&&d.path===path)?.areas.includes(area),method+' '+path);
  await h.json('/roles/doors',undefined,lawyer,403);
  // Roles and assignments survive an archive restore.
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),target=await harness();
  try{await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);const restored=await target.json('/roles',undefined,target.owner);assert.deepEqual(restored.roles.map(r=>r.name).sort(),['Area ceiling','Bank ceiling']);assert.deepEqual(restored.roles.find(r=>r.name==='Bank ceiling').members.sort(),['assistant@example.test','trust_officer@example.test']);}finally{await target.close();}
 }finally{await h.close();}
});

test('matter field projections require document permission',async()=>{
 const h=await harness();try{
  const f=await reportFoundation(h),base='/matters/'+f.active.id;
  await h.json(base+'/access',{email:'assistant@example.test'},h.owner);
  const doc=await h.json(base+'/documents',{name:'synthetic-satchel-1',mime:'text/plain',visibility:'matter',contentBase64:Buffer.from('synthetic-satchel-1').toString('base64')},h.owner);
  const preview=await h.json(base+'/document-sets/preview',{documents:[{id:doc.id,revision:doc.revision}],documentType:'Complaint'},h.owner);
  await h.json(base+'/document-sets/apply',{previewId:preview.id},h.owner);
  const type=(await h.json('/matter-types',{name:'Litigation records',practiceCode:'LIT',definition:{required:[],fields:[],records:['Complaint']}},h.owner)).types[0];
  const fields=await h.json(base+'/fields',undefined,h.owner);
  await h.json(base+'/fields',{revision:fields.profile.revision,typeId:type.id,typeVersion:type.version},h.owner);
  assert.ok(JSON.stringify(await h.json(base+'/fields',undefined,f.assistant)).includes(doc.id));
  const role=await h.json('/roles',{name:'Document ceiling',permissions:{...everything,documents:'none'},reason:'Withhold documents'},h.owner);
  await assign(h,'assistant@example.test','Assistant','assistant',role.id);
  const response=await h.request('/api/satchel'+base+'/fields',undefined,f.assistant);
  assert.equal(response.status,403,await response.text());
 }finally{await h.close();}
});
async function compositeCounsel(h){
 await h.json('/team',{email:'lawyer@example.test',name:'Counsel',role:'lawyer'},h.owner);
 await h.json('/team/invite',{email:'lawyer@example.test'},h.owner);const lawyer=await h.login('lawyer@example.test');
 const m=await open(h),base='/matters/'+m.id;await h.json(base+'/access',{email:'lawyer@example.test'},h.owner);
 const entry=await h.json(base+'/entries',{kind:'time',date:'2026-10-01',description:'synthetic-satchel-2',minutes:60,rateCents:41000},h.owner);
 return {lawyer,m,base,entry};
}
test('lifecycle projections require financial source permissions',async()=>{
 const h=await harness();try{
  const f=await compositeCounsel(h);
  assert.ok(JSON.stringify(await h.json(f.base+'/lifecycle',undefined,f.lawyer)).includes('41000'));
  const statuses=[];
  for(const ceiling of [{billing:'none'},{rates:'none'},{rates:'own'},{bank:'none'}]){
   const role=await h.json('/roles',{name:'Lifecycle ceiling '+statuses.length,permissions:{...everything,...ceiling},reason:'Restrict source data'},h.owner);
   await assign(h,'lawyer@example.test','Counsel','lawyer',role.id);
   for(const [suffix,body] of [['/lifecycle',undefined],['/closure-preview',{}]])statuses.push((await h.request('/api/satchel'+f.base+suffix,body,f.lawyer)).status);
  }
  assert.deepEqual(statuses,Array(8).fill(403));
 }finally{await h.close();}
});
test('audit reads and raw exports require permissions for their source records',async()=>{
 const h=await harness();try{
  const f=await compositeCounsel(h);
  await h.json(f.base+'/wall',{custodianEmail:'lawyer@example.test',members:['owner@example.test'],reason:'Counsel custody',revision:null},h.owner);
  const path='/audit?matterId='+f.m.id,exportPath='/audit/export?matterId='+f.m.id;
  assert.ok(JSON.stringify(await h.json(path,undefined,f.lawyer)).includes('41000'));
  assert.ok((await(await h.request('/api/satchel'+exportPath,undefined,f.lawyer)).text()).includes('41000'));
  const statuses=[];
  for(const ceiling of [{rates:'none'},{rates:'own'},{billing:'none'},{documents:'none'},{bank:'balances'},{contacts:'none'}]){
   const role=await h.json('/roles',{name:'Audit ceiling '+statuses.length,permissions:{...everything,settings:'read',...ceiling},reason:'Restrict source data'},h.owner);
   await assign(h,'lawyer@example.test','Counsel','lawyer',role.id);
   for(const p of [path,exportPath]){const r=await h.request('/api/satchel'+p,undefined,f.lawyer);statuses.push(r.status);await r.text();}
  }
  assert.deepEqual(statuses,Array(12).fill(403));
 }finally{await h.close();}
});
