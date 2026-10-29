import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
// 08:00 America/New_York on the next Monday after now (daylight saving decided by Intl, not by this test).
const nextMonday=(weeks=0)=>{for(let d=1+7*weeks;d<=8+7*weeks;d++){const probe=new Date(Date.now()+d*86400000),parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(probe).map(p=>[p.type,p.value]));if(parts.weekday!=='Mon')continue;for(const utcHour of [12,13]){const t=Date.UTC(+parts.year,+parts.month-1,+parts.day,utcHour,0);if(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(new Date(t))==='08')return t;}}};
test('REPORT-003 a weekly overdue-work report reaches current permitted recipients with counts only; a revoked recipient is excluded and a failed delivery opens an owned exception',async()=>{
 let failing=false;
 const h=await harness({mailResponse:(message)=>message.subject.startsWith('Weekly summary')&&message.to.includes('lawyer2@example.test')&&failing?Response.json({name:'validation_error',message:'Mailbox refused'},{status:failing==='uncertain'?503:422}):Response.json({id:'summary-'+Math.random()})});
 try{
  const people={};for(const [email,role] of [['lawyer@example.test','lawyer'],['lawyer2@example.test','lawyer'],['assistant@example.test','assistant']]){await h.json('/team',{email,name:email,role},h.owner);await h.json('/team/invite',{email},h.owner);people[email]=await h.login(email);}
  const m=await open(h,'Harper lease dispute','Harper Bakery LLC','Main Street Holdings');for(const e of ['lawyer@example.test','lawyer2@example.test'])await h.json('/matters/'+m.id+'/access',{email:e},h.owner);await h.json('/matters/'+m.id+'/tasks',{title:'Overdue: serve the notice',priority:'high',dueDate:'2026-09-01'},h.owner);
  await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);
  const staffCost=await h.json('/reports/staff-costs',{email:'owner@example.test',effectiveFrom:'2026-01-01',hourlyCents:19321,reason:'Synthetic confidential Satchel compensation basis',confirmed:true},h.owner);
  const slot=nextMonday(),slots=[0,1,2,3,4,5].map(nextMonday),def={name:'Weekly overdue work',dashboard:'workload',filters:{status:'open'},weekday:1,time:'08:00',timezone:'America/New_York',channel:'email',recipients:['owner@example.test','lawyer@example.test']};
  // Only the principal schedules; recipients must be able to open reports.
  await h.json('/report-schedules',def,people['lawyer@example.test'],403);await h.json('/report-schedules',{...def,recipients:['assistant@example.test']},h.owner,400);await h.json('/report-schedules',{...def,dashboard:'status'},h.owner,400);await h.json('/report-schedules',{...def,time:'25:00'},h.owner,400);
  const saved=await h.json('/report-schedules',def,h.owner),schedule=saved.schedules[0];assert.deepEqual(schedule.filters,{status:'open'});
  // Monday 08:00 sends one summary per current recipient, counts only, once.
  const before=h.mails.length;await h.scheduled(slot+5*60000);const first=h.mails.slice(before);assert.deepEqual(first.map(x=>x.to[0]).sort(),['lawyer@example.test','owner@example.test']);
  for(const mail of first){assert.match(mail.text,/1 overdue of 1 items/);assert.ok(!/Harper|Overdue: serve|Main Street/.test(JSON.stringify(mail)),'The email names no matter or client');}
  await h.scheduled(slot+10*60000);assert.equal(h.mails.length,before+2,'A slot is delivered once');
  await h.restart();await h.scheduled(slot+20*60000);assert.equal(h.mails.length,before+2,'A restarted worker never repeats a slot');
  let state=await h.json('/report-schedules',undefined,h.owner);assert.deepEqual(state.deliveries.map(d=>[d.recipient,d.status]).sort(),[['lawyer@example.test','accepted'],['owner@example.test','accepted']]);
  // Revoking a recipient excludes them from every later delivery.
  await h.json('/report-schedules/'+schedule.id+'/recipients/remove',{email:'lawyer@example.test',reason:'Left the litigation group'},people['lawyer@example.test'],403);
  await h.json('/report-schedules/'+schedule.id+'/recipients/remove',{email:'assistant@example.test',reason:'x'},h.owner,404);
  const revoked=await h.json('/report-schedules/'+schedule.id+'/recipients/remove',{email:'lawyer@example.test',reason:'Left the litigation group'},h.owner);assert.deepEqual(revoked.schedules[0].recipients,['owner@example.test']);
  const mark=h.mails.length;await h.scheduled(slots[1]+5*60000);assert.deepEqual(h.mails.slice(mark).map(x=>x.to[0]),['owner@example.test'],'Future delivery excludes the revoked recipient');
  await h.json('/report-schedules/'+schedule.id+'/recipients/remove',{email:'owner@example.test',reason:'x'},h.owner,409);
  // A failed delivery opens an exception owned by the principal with a due date; resolving it is recorded.
  await h.json('/report-schedules',{...def,id:schedule.id,revision:revoked.schedules[0].revision,recipients:['owner@example.test','lawyer2@example.test']},h.owner);
  failing=true;await h.scheduled(slots[2]+5*60000);
  state=await h.json('/report-schedules',undefined,h.owner);const failed=state.deliveries.find(d=>d.recipient==='lawyer2@example.test'),exception=state.exceptions[0];
  assert.equal(failed.status,'failed');assert.equal(exception.recipient,'lawyer2@example.test');assert.equal(exception.owner,'owner@example.test');assert.equal(exception.status,'open');assert.equal(exception.dueDate,new Date(slots[2]+5*60000+86400000).toISOString().slice(0,10));assert.doesNotMatch(JSON.stringify(exception),/Harper|serve the notice|Main Street/);const failedCount=h.mails.length;await h.scheduled(slots[2]+10*60000);assert.equal(h.mails.length,failedCount,'Failed deliveries are never automatically resent');assert.equal(state.deliveries.find(d=>d.recipient==='owner@example.test'&&d.slot===failed.slot).status,'accepted');
  await h.json('/report-exceptions/'+exception.id+'/resolve',{note:'Called the lawyer; mailbox fixed'},people['lawyer@example.test'],403);
  assert.equal((await h.json('/report-exceptions/'+exception.id+'/resolve',{note:'Called the lawyer; mailbox fixed'},h.owner)).exceptions[0].status,'resolved');await h.json('/report-exceptions/'+exception.id+'/resolve',{note:'again'},h.owner,404);
  failing='uncertain';await h.scheduled(slots[3]+5*60000);state=await h.json('/report-schedules',undefined,h.owner);const uncertain=state.deliveries.find(d=>d.recipient==='lawyer2@example.test'&&d.status==='uncertain');assert.ok(uncertain);const uncertainty=state.exceptions.find(e=>e.deliveryId===uncertain.id);assert.equal(uncertainty.dueDate,new Date(slots[3]+5*60000+86400000).toISOString().slice(0,10));assert.doesNotMatch(JSON.stringify(uncertainty),/Harper|serve the notice|Main Street/);const uncertainCount=h.mails.length;await h.scheduled(slots[3]+10*60000);assert.equal(h.mails.length,uncertainCount,'Uncertain deliveries are never automatically resent');await h.json('/report-exceptions/'+uncertainty.id+'/resolve',{note:'Provider outcome reviewed'},h.owner);
  // A recipient who loses report permission is skipped and the skip is an exception too.
  failing=false;const role=await h.json('/roles',{name:'No reports',permissions:{rates:'none',bank:'none',reports:'none',contacts:'none',documents:'none',billing:'none',settings:'none'},reason:'Matter work only'},h.owner);
  await h.json('/team',{email:'lawyer2@example.test',name:'lawyer2',role:'lawyer',customRoleId:role.id},h.owner);const skipped=h.mails.length;await h.scheduled(slots[4]+5*60000);
  state=await h.json('/report-schedules',undefined,h.owner);assert.equal(state.deliveries.find(d=>d.recipient==='lawyer2@example.test'&&d.status==='skipped')?.detail.includes('no longer has report permission'),true);assert.deepEqual(h.mails.slice(skipped).map(x=>x.to[0]),['owner@example.test']);assert.equal(state.exceptions.filter(e=>e.status==='open').length,1);
  // Portal summaries are shown to the recipient inside Satchel with counts only.
  await h.json('/report-schedules',{...def,name:'Overdue in the workspace',channel:'portal',recipients:['owner@example.test']},h.owner);await h.scheduled(slots[5]+5*60000);
  const mine=(await h.json('/report-summaries',undefined,h.owner)).summaries.find(s=>s.name==='Overdue in the workspace');assert.equal(mine.status,'available');assert.equal(mine.summary.overdue,1);assert.ok(!JSON.stringify(mine).includes('Harper'));await h.json('/report-summaries',undefined,people['assistant@example.test'],403);
  for(const outbound of [...h.mails.filter(mail=>mail.subject.startsWith('Weekly summary')),mine])for(const confidential of [staffCost.id,staffCost.reason,'hourly_cents','costBasis','profitCents'])assert.ok(!JSON.stringify(outbound).includes(confidential),'Scheduled email and portal summaries contain no staff costs or economics');
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();assert.ok(archive.includes('Weekly overdue work')&&archive.includes('"status":"open"'));
 }finally{await h.close();}
});

test('Saved report definitions preserve filters in CSV and archive without creating a schedule',async()=>{
 const h=await harness();try{
  const m=await open(h,'synthetic-satchel-1');await h.json('/matters/'+m.id+'/tasks',{title:'synthetic-satchel-work',priority:'high',dueDate:'2026-09-01'},h.owner);
  const saved=await h.json('/saved-reports',{name:'synthetic-satchel-open',dashboard:'workload',filters:{status:'open',from:'2020-01-01',to:'2099-01-01'}},h.owner),d=saved.definitions[0];assert.deepEqual(d.filters,{status:'open',from:'2020-01-01',to:'2099-01-01'});
  assert.equal((await h.json('/report-schedules',undefined,h.owner)).schedules.length,0);
  assert.match(await(await h.request('/api/satchel/saved-reports/'+d.id+'/export',undefined,h.owner)).text(),/synthetic-satchel-work/);
  await h.json('/saved-reports',{id:d.id,revision:d.revision,name:d.name,dashboard:d.dashboard,filters:{status:'closed'}},h.owner);
  assert.doesNotMatch(await(await h.request('/api/satchel/saved-reports/'+d.id+'/export?status=open',undefined,h.owner)).text(),/synthetic-satchel-work/,'Request parameters cannot override the saved definition');
  await h.restart();assert.deepEqual((await h.json('/saved-reports',undefined,h.owner)).definitions[0].filters,{status:'closed'});
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();assert.ok(archive.includes('s_saved_reports')&&archive.includes('synthetic-satchel-open'));
 }finally{await h.close();}
});
test('Portal report recipients receive shared counts only and revoked readers receive neither future nor stored summaries',async()=>{
 const h=await harness();try{
  const m=await open(h,'synthetic-satchel-private');for(const email of ['client@example.test','payer@example.test']){await h.json('/team',{email,name:email,role:'client'},h.owner);await h.json('/team/invite',{email},h.owner);}
  const client=await h.login('client@example.test'),payer=await h.login('payer@example.test');const grants=await h.json('/matters/'+m.id+'/portal',{email:'client@example.test',reason:'Client'},h.owner),grant=grants.grants[0];await h.json('/matters/'+m.id+'/portal',{email:'payer@example.test',kind:'payer',reason:'Payer'},h.owner);
  await h.json('/matters/'+m.id+'/tasks',{title:'synthetic-satchel-hidden',priority:'high',dueDate:'2026-09-01'},h.owner);
  await h.json('/matters/'+m.id+'/requests',{title:'synthetic-satchel-shared',instructions:'Upload text',criteria:'Complete',clientVisible:true,dueDate:'2026-09-01'},h.owner);
  const def={name:'synthetic-satchel-sensitive-filter',dashboard:'workload',filters:{status:'open'},weekday:1,time:'08:00',timezone:'America/New_York',channel:'portal',recipients:['client@example.test']};
  await h.json('/report-schedules',{...def,recipients:['payer@example.test']},h.owner,400);await h.json('/report-schedules',def,h.owner);await h.scheduled(nextMonday()+60000);
  const mine=await h.json('/report-summaries',undefined,client);assert.equal(mine.summaries[0].summary.count,1);assert.equal(mine.summaries[0].summary.overdue,1);assert.doesNotMatch(JSON.stringify(mine),/synthetic-satchel|matterId|filters/);await h.json('/report-summaries',undefined,payer,403);
  await h.json('/portal-grants/'+grant.id+'/revoke',{reason:'Authority ended'},h.owner);await h.json('/report-summaries',undefined,client,403);const before=h.mails.length;await h.scheduled(nextMonday(1)+60000);await h.scheduled(nextMonday(1)+120000);assert.equal(h.mails.length,before);
  const state=await h.json('/report-schedules',undefined,h.owner);assert.equal(state.deliveries.find(d=>d.recipient==='client@example.test'&&d.status==='skipped')?.status,'skipped');assert.equal(state.exceptions.length,1);assert.doesNotMatch(JSON.stringify(state.exceptions),/synthetic-satchel/);
 }finally{await h.close();}
});
