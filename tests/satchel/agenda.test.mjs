import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
test('CAL-008 firm agenda shows overlapping hearings, an unconfirmed limitation date, owners and absence coverage, and exports source and confirmation columns',async()=>{
 const h=await harness();try{
  const staff=async(email,name,role)=>{await h.json('/team',{email,name,role},h.owner);await h.json('/team/invite',{email},h.owner);return h.login(email);};
  const lawyer=await staff('lawyer@example.test','Marcus Lee','lawyer'),second=await staff('priya@example.test','Priya Shah','lawyer'),assistant=await staff('assistant@example.test','Dana Ortiz','assistant');
  const m=await open(h),m2=await open(h,'Pine Studio lease','Pine Studio','Cedar Property');
  for(const email of ['lawyer@example.test','assistant@example.test'])await h.json('/matters/'+m.id+'/access',{email},h.owner);
  await h.json('/matters/'+m2.id+'/access',{email:'lawyer@example.test'},h.owner);
  const once={frequency:'once',durationMinutes:60,timezone:'America/New_York',attendees:['lawyer@example.test']};
  await h.json('/matters/'+m.id+'/appointments',{...once,title:'Motion hearing',date:'2026-11-16',time:'09:30'},h.owner);
  await h.json('/matters/'+m2.id+'/appointments',{...once,title:'Deposition hearing',date:'2026-11-16',time:'10:00'},h.owner);
  const limitation=await h.json('/matters/'+m.id+'/deadlines',{kind:'limitation',title:'Statute of limitations',date:'2027-02-01',timezone:'America/New_York',source:'Injury date 2024-02-01; CPLR 214'},assistant);
  await h.json('/matters/'+m.id+'/deadlines',{kind:'appeal',title:'Bad kind',date:'2027-02-01',timezone:'America/New_York',source:'x'},assistant,400);
  let filing=await h.json('/matters/'+m.id+'/deadlines',{kind:'filing',title:'File opposition',date:'2026-11-17',timezone:'America/New_York',source:'Scheduling order ¶4'},h.owner);
  filing=await h.json('/deadlines/'+filing.id+'/confirm',{revision:filing.revision,note:'Checked order'},h.owner);
  await h.json('/deadlines/'+filing.id+'/owner',{email:'priya@example.test'},h.owner,400);
  await h.json('/deadlines/'+filing.id+'/owner',{email:'lawyer@example.test'},assistant,403);
  await h.json('/deadlines/'+filing.id+'/owner',{email:'lawyer@example.test'},h.owner);
  const range='from=2026-11-01&to=2027-02-28';
  let view=await h.json('/agenda?'+range,undefined,lawyer);
  const by=title=>view.items.find(i=>i.title===title);
  assert.deepEqual(by('Motion hearing').conflicts.map(c=>[c.title,c.matterNumber,c.people]),[['Deposition hearing',m2.matter_number,['owner@example.test','lawyer@example.test']]]);
  assert.equal(by('Deposition hearing').nextAction,'Resolve conflict with Motion hearing');
  assert.deepEqual([by('Statute of limitations').confirmation,by('Statute of limitations').nextAction,by('Statute of limitations').owner],['unconfirmed (proposed; needs lawyer confirmation)','Confirm the date against its source',null]);
  assert.deepEqual(view.limitations.map(l=>[l.id,l.date,l.confirmation]),[[limitation.id,'2027-02-01','unconfirmed']]);
  assert.deepEqual([by('File opposition').owner,by('File opposition').confirmation,by('File opposition').nextAction],['lawyer@example.test','confirmed by owner@example.test','Prepare and complete']);
  await h.json('/absences',{email:'lawyer@example.test',startDate:'2026-11-17',endDate:'2026-11-18',reason:'Medical leave'},assistant,403);
  const absence=await h.json('/absences',{startDate:'2026-11-17',endDate:'2026-11-18',reason:'Medical leave'},lawyer);
  assert.equal(absence.email,'lawyer@example.test');
  view=await h.json('/agenda?'+range,undefined,lawyer);assert.equal(by('File opposition').nextAction,'Assign coverage for Marcus Lee');
  assert.equal((await h.json('/absences',undefined,assistant)).absences[0].reason,undefined,'Absence reasons stay with the principal and the absent person');
  assert.equal((await h.json('/absences',undefined,h.owner)).absences[0].reason,'Medical leave');
  await h.json('/absences/'+absence.id+'/coverage',{email:'priya@example.test'},assistant,403);
  await h.json('/absences/'+absence.id+'/coverage',{email:'lawyer@example.test'},h.owner,400);
  await h.json('/absences/'+absence.id+'/coverage',{email:'priya@example.test'},lawyer);
  view=await h.json('/agenda?'+range,undefined,h.owner);
  assert.deepEqual([by('File opposition').coverage.coveredBy,by('File opposition').coverage.coverCanSee,by('File opposition').nextAction],['priya@example.test',false,'Grant priya@example.test matter access or reassign the owner']);
  assert.ok(!(await h.json('/agenda?'+range,undefined,second)).items.some(i=>i.matterId===m.id),'Coverage alone grants no matter access');
  await h.json('/matters/'+m.id+'/access',{email:'priya@example.test'},h.owner);
  view=await h.json('/agenda?'+range,undefined,second);assert.deepEqual([by('File opposition').coverage.coveredByName,by('File opposition').nextAction],['Priya Shah','Prepare and complete']);
  const scoped=await h.json('/agenda?'+range+'&matter='+m.id,undefined,assistant);
  assert.deepEqual(scoped.items.map(i=>i.title),['Motion hearing','File opposition','Statute of limitations']);assert.deepEqual(scoped.items[0].conflicts,[],'No conflict detail from a matter the viewer cannot see');
  assert.ok(!(await h.json('/agenda?'+range,undefined,assistant)).items.some(i=>i.matterId===m2.id));
  await h.json('/agenda?'+range+'&matter='+m2.id,undefined,assistant,404);
  const response=await h.request('/api/satchel/agenda/export?'+range,undefined,lawyer);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/csv/);
  const csv=(await response.text()).trim().split('\r\n');
  assert.equal(csv[0],'Date,Time,Timezone,Kind,Matter,Title,Source,Owner,Confirmation,Coverage,Conflicts,Next action');
  assert.deepEqual(csv.slice(1).map(l=>l.split(',').slice(0,2).concat(l.split(',')[5])),[['2026-11-16','09:30','Motion hearing'],['2026-11-16','10:00','Deposition hearing'],['2026-11-17','','File opposition'],['2027-02-01','','Statute of limitations']]);
  assert.ok(csv[3].includes('Scheduling order ¶4')&&csv[3].includes('confirmed by owner@example.test')&&csv[3].includes('lawyer@example.test absent; covered by priya@example.test'));
  assert.ok(csv[4].includes('unconfirmed (proposed; needs lawyer confirmation)')&&!csv[4].includes(',confirmed'));
  assert.ok((await h.json('/audit?action=agenda.exported',undefined,h.owner)).records.some(r=>r.actor.email==='lawyer@example.test'));
  const key=await h.json('/keys',{label:'Docket reader'},h.owner),auth={authorization:'Bearer '+key.key};
  const prepared=await h.json('/agent/prepare-deadline',{matterId:m2.id,kind:'limitation',title:'Extracted limitation',date:'2027-01-15',timezone:'America/New_York',source:'Lease clause 19 (agent extraction)'},'',200,auth);
  await h.json('/proposals/'+prepared.id+'/decide',{decision:'approve'},h.owner);
  view=await h.json('/agenda?'+range,undefined,lawyer);
  assert.match(by('Extracted limitation').confirmation,/^unconfirmed/);assert.equal(by('Extracted limitation').nextAction,'Confirm the date against its source');
  assert.equal(view.limitations.find(l=>l.title==='Extracted limitation').confirmation,'unconfirmed','An extracted date never appears as confirmed');
  // Upcoming dates outside the agenda range obey the source original's visibility too.
  const source=await h.json('/matters/'+m.id+'/documents',{name:'Private limitation source.txt',mime:'text/plain',visibility:'private',contentBase64:Buffer.from('Private limitation evidence').toString('base64')},lawyer);
  const privateDates=[];
  for(const date of ['2027-02-10','2028-03-01']){
   privateDates.push(await h.json('/matters/'+m.id+'/deadlines',{kind:'limitation',title:'Private limitation '+date,date,timezone:'America/New_York',source:'Private source paragraph 2',documentId:source.id},lawyer));
  }
  for(const who of [h.owner,lawyer]){
   const allowed=await h.json('/agenda?'+range,undefined,who);
   assert.ok(privateDates.every(d=>allowed.limitations.some(l=>l.id===d.id)),'Principal and source creator retain upcoming limitations beyond the range end');
   assert.ok(allowed.items.some(i=>i.id===privateDates[0].id));
  }
  for(const scope of ['', '&matter='+m.id]){
   const denied=await h.json('/agenda?'+range+scope,undefined,assistant);
   assert.ok(!JSON.stringify(denied).includes('Private limitation'),'Matter access alone exposes no private-source title, date or identifier');
   assert.ok(privateDates.every(d=>!denied.limitations.some(l=>l.id===d.id)&&!denied.items.some(i=>i.id===d.id)));
   assert.ok(denied.limitations.some(l=>l.id===limitation.id),'A visible source-free limitation remains available');
   const exported=await (await h.request('/api/satchel/agenda/export?'+range+scope,undefined,assistant)).text();
   assert.ok(!exported.includes('Private limitation'));
   assert.ok(exported.includes('Statute of limitations'));
  }
 }finally{await h.close();}
});
