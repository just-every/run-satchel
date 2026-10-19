import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';

const day=n=>{const d=new Date();d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
test('INTAKE-002 staff qualify, assign and move leads through edited stages, merge a duplicate with provenance, miss a follow-up into the due queue and report conversion, stalled and lost leads',async()=>{
 const h=await harness();let restored;
 try{
  const people={};for(const [email,role] of [['lawyer@example.test','lawyer'],['assistant@example.test','assistant'],['trust@example.test','trust_officer']]){await h.json('/team',{email,name:email,role},h.owner);await h.json('/team/invite',{email},h.owner);people[role]=await h.login(email);}
  const {lawyer,assistant,trust_officer:officer}=people,mailCount=h.mails.length;
  await h.json('/lead-stages',{name:'Unauthorized',position:0},assistant,403);
  let stages=await h.json('/lead-stages',{name:'New inquiry',position:0},h.owner);stages=await h.json('/lead-stages',{name:'Consultation booked',position:1},lawyer);
  const renamed=await h.json('/lead-stages',{id:stages[1].id,revision:stages[1].revision,name:'Consultation held',position:1},h.owner);assert.deepEqual(renamed.map(s=>s.name),['New inquiry','Consultation held']);
  const [inquiry,consult]=renamed;

  // Assign two prospects; a third arrives as a duplicate of the first.
  const maria=await h.json('/leads',{name:'Maria Lopez',email:'maria@example.test',phone:'(212) 555-0199',summary:'Slip and fall at a grocery store',referralSource:'Google Ads',stageId:inquiry.id,assignedEmail:'lawyer@example.test',nextAction:'Call back about medical records',nextActionDate:day(-2)},h.owner);
  const james=await h.json('/leads',{name:'James Chen',summary:'Lease dispute with landlord',referralSource:'Referral: Smith & Co',stageId:inquiry.id,assignedEmail:'assistant@example.test',nextAction:'Send intake questionnaire',nextActionDate:day(3)},h.owner);
  const dup=await h.json('/leads',{name:' maria  LOPEZ',email:'MARIA@example.test',summary:'Website chat about a fall',referralSource:'Website chat',nextAction:'Reply to chat',nextActionDate:day(1)},lawyer);
  assert.deepEqual(dup.duplicates.map(d=>[d.id,d.reason]),[[maria.id,'same email']]);
  await h.json('/leads',{name:'Bad',summary:'x',referralSource:'x',assignedEmail:'trust@example.test'},h.owner,400);
  const ellis=await h.json('/leads',{name:'Ellis Park',summary:'Estate question',referralSource:'Google Ads',assignedEmail:'lawyer@example.test'},h.owner);

  // Visibility: assistants work only their own leads; trust officers see none.
  await h.json('/leads',undefined,officer,403);
  let pipeline=await h.json('/leads',undefined,assistant);assert.deepEqual(pipeline.leads.map(l=>l.id),[james.id]);
  await h.json('/leads/'+maria.id,undefined,assistant,404);
  const own=await h.json('/leads',{name:'Dana Fox',summary:'Contract review',referralSource:'Walk-in',assignedEmail:'lawyer@example.test'},assistant);assert.equal(own.assignedEmail,'assistant@example.test');
  await h.json('/leads/'+james.id,{revision:james.revision,assignedEmail:'lawyer@example.test'},assistant,403);
  await h.json('/leads/'+dup.id+'/merge',{revision:dup.revision,intoId:maria.id,intoRevision:maria.revision,reason:'Same prospect'},assistant,403);

  // Qualify, move and record the consultation outcome; stale revisions are refused.
  let m=await h.json('/leads/'+maria.id,{revision:maria.revision,qualification:'qualified',stageId:consult.id,consultationOutcome:'Strong premises-liability claim'},lawyer);
  assert.deepEqual([m.qualification,m.stageName,m.consultationOutcome],['qualified','Consultation held','Strong premises-liability claim']);
  await h.json('/leads/'+maria.id,{revision:maria.revision,qualification:'pending'},lawyer,409);

  // Merge the duplicate with preserved provenance.
  m=await h.json('/leads/'+dup.id+'/merge',{revision:dup.revision,intoId:maria.id,intoRevision:m.revision,reason:'Same prospect contacted twice'},lawyer);
  assert.deepEqual(m.mergedFrom.map(x=>[x.id,x.referralSource,x.email,x.createdBy]),[[dup.id,'Website chat','maria@example.test','lawyer@example.test']]);
  assert.equal(m.history.at(-1).kind,'absorbed');assert.equal(m.history.at(-1).detail.from.referralSource,'Website chat');assert.deepEqual(m.duplicates,[]);
  const merged=await h.json('/leads/'+dup.id,undefined,h.owner);assert.deepEqual([merged.status,merged.mergedInto,merged.referralSource],['merged',maria.id,'Website chat']);
  await h.json('/leads/'+dup.id,{revision:merged.revision,nextAction:'x'},h.owner,409);

  // The missed follow-up is in its owner's due queue, overdue and stalled.
  pipeline=await h.json('/leads',undefined,lawyer);assert.deepEqual(pipeline.dueQueue.map(l=>[l.id,l.overdue]),[[maria.id,true]]);
  assert.deepEqual(pipeline.leads.find(l=>l.id===maria.id).stalled,['Next action overdue']);
  assert.deepEqual((await h.json('/leads',undefined,assistant)).dueQueue,[]);
  const jamesNow=(await h.json('/leads',undefined,assistant)).leads.find(l=>l.id===james.id);
  await h.json('/leads/'+james.id,{revision:jamesNow.revision,nextActionDate:day(0)},assistant);assert.deepEqual((await h.json('/leads',undefined,assistant)).dueQueue.map(l=>[l.id,l.overdue]),[[james.id,false]]);

  // Lose a lead with a reason; convert another into a conflict-reviewed matter.
  await h.json('/leads/'+own.id,{revision:own.revision,lostReason:''},assistant,400);
  await h.json('/leads/'+own.id,{revision:own.revision,lostReason:'Chose another firm on price'},assistant);
  const matter=await open(h,'Lopez v. Fresh Market','Maria Lopez','Fresh Market LLC');
  m=await h.json('/leads/'+maria.id,{revision:m.revision,matterId:matter.id},lawyer,404);
  await h.json('/matters/'+matter.id+'/access',{email:'lawyer@example.test'},h.owner);
  m=await h.json('/leads/'+maria.id,{revision:(await h.json('/leads/'+maria.id,undefined,lawyer)).revision,matterId:matter.id},lawyer);assert.deepEqual([m.status,m.matterId],['converted',matter.id]);
  const e=await h.json('/leads/'+ellis.id,undefined,h.owner);await h.json('/leads/'+ellis.id,{revision:e.revision,matterId:matter.id},h.owner,409);

  // Conversion report: merged duplicates are not counted; stalled and lost leads carry reasons.
  const report=await h.json('/leads/report',undefined,h.owner);
  assert.deepEqual([report.total,report.converted,report.lost],[4,1,1]);
  assert.deepEqual(report.bySource.map(s=>[s.name,s.leads,s.converted,s.lost]),[['Google Ads',2,1,0],['Referral: Smith & Co',1,0,0],['Walk-in',1,0,1]]);
  assert.deepEqual(report.byStage.map(s=>[s.name,s.leads]),[['Consultation held',1],['New inquiry',1],['No stage',2]]);
  assert.deepEqual(report.stalled,[],'A missing next action alone is not stalled under ct’s approved rule');
  assert.deepEqual(report.lostReasons.map(l=>[l.id,l.reason]),[[own.id,'Chose another firm on price']]);
  assert.equal((await h.json('/leads/report',undefined,assistant)).total,2,'An assistant reports only their own leads');

  const audit=await h.json('/audit',undefined,h.owner);for(const action of ['lead.created','lead.updated','lead.merged','lead.absorbed','lead.lost','lead.converted'])assert.ok(audit.records.some(r=>r.action===action),action);
  assert.equal(h.mails.length,mailCount,'Lead operations never send names or details in notification subjects');
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();restored=await harness();await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);
  assert.deepEqual(await restored.json('/leads/report',undefined,restored.owner),report);assert.deepEqual(await restored.json('/leads/'+maria.id,undefined,restored.owner),await h.json('/leads/'+maria.id,undefined,h.owner));
  const first=await h.json('/leads',{name:'Nadia Patel',phone:'(212) 555-0144',summary:'Property question',referralSource:'Telephone'},h.owner);
  const second=await h.json('/leads',{name:'Different spelling',phone:'2125550144',summary:'Second inquiry',referralSource:'Telephone'},h.owner);
  assert.ok(second.duplicates.some(d=>d.id===first.id&&d.reason==='same phone'));
  const named=await h.json('/leads',{name:'  NADIA   Patel  ',summary:'Third inquiry',referralSource:'Walk-in'},h.owner);
  assert.ok(named.duplicates.some(d=>d.id===first.id&&d.reason==='same name'));
  const nextMatter=await open(h,'Patel property advice','Nadia Patel','Oak Street LLC');
  const raced=await Promise.all([first,second].map(l=>h.request('/api/satchel/leads/'+l.id,{revision:l.revision,matterId:nextMatter.id},h.owner)));
  assert.deepEqual(raced.map(r=>r.status).sort(),[200,409],'Concurrent conversion cannot attach two leads to one matter');
  const restricted=await h.json('/leads',{name:'James Chen',email:'private-james@example.test',summary:'Confidential duplicate intake',referralSource:'Counsel referral',assignedEmail:'lawyer@example.test'},h.owner);
  const visibleJames=await h.json('/leads/'+james.id,undefined,assistant);
  await h.json('/leads/'+restricted.id+'/merge',{revision:restricted.revision,intoId:james.id,intoRevision:visibleJames.revision,reason:'Same prospect, preserve separate source'},lawyer);
  const ownHistory=await h.json('/leads/'+james.id,undefined,assistant);
  assert.deepEqual(ownHistory.mergedFrom,[],'Assigned-only visibility also covers merged-source summaries');
  assert.ok(!JSON.stringify(ownHistory.history).includes(restricted.id),'Immutable history must not expose an unassigned source snapshot');
  const counselHistory=await h.json('/leads/'+james.id,undefined,lawyer);assert.equal(counselHistory.mergedFrom[0].id,restricted.id);assert.ok(counselHistory.history.some(e=>e.kind==='absorbed'&&e.detail.from.id===restricted.id));
 }finally{await restored?.close();await h.close();}
});

test('INTAKE-002 stalled inactivity uses inclusive firm-local dates across UTC midnight, while new unplanned leads are not stalled',async()=>{
 const h=await harness(),target=await harness();
 try{
  // Build a historical native backup fixture, then use the real restore and read doors.
  const calendar=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}),today=calendar.format(new Date());
  const address={line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'};
  await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@example.test',phone:'212-555-0100',address,timezone:'America/New_York',billing:{defaultRateCents:30000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Manhattan',phone:'212-555-0100',timezone:'America/New_York',address}],practiceAreas:[{code:'FAM',name:'Family law'}]}},h.owner);
  const leads=[];for(const name of ['Fourteen days','Thirteen days','Unplanned today'])leads.push(await h.json('/leads',{name,summary:'Historical inquiry',referralSource:'Telephone'},h.owner));
  const records=(await(await h.request('/api/satchel/backup',undefined,h.owner)).text()).trim().split('\n').map(JSON.parse);
  const localOffset=n=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  // 02:00Z belongs to the preceding New York date in both EST and EDT.
  const historical=[localOffset(-13)+'T02:00:00.000Z',localOffset(-12)+'T02:00:00.000Z'];
  for(const part of records.filter(r=>r.kind==='part'))for(const item of part.items)if(item.kind==='row'&&item.table==='s_leads'){
   const index=leads.findIndex(l=>l.id===item.row.id);if(index<2)item.row.last_activity_at=historical[index];
  }
  const {makePart}=await import('@runeditrun/rer/modules/portability');
  const {ArchiveVerifier,ContentVerifier}=await import('../../node_modules/@runeditrun/rer/modules/portability/format.mjs');
  const manifest=records[0],content=new ContentVerifier(manifest),integrity=new ArchiveVerifier(manifest),parts=[];
  for(const old of records.filter(r=>r.kind==='part')){const part=await makePart(old.index,old.items);parts.push(part);integrity.add(part);for(const item of part.items)content.add(item);}
  const archive=[manifest,...parts,{kind:'closing',partCount:parts.length,contentHash:content.digest(),archiveHash:integrity.digest()}].map(JSON.stringify).join('\n')+'\n';
  await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);
  const pipeline=await target.json('/leads',undefined,target.owner);assert.equal(pipeline.today,today);
  assert.deepEqual(pipeline.leads.filter(l=>l.stalled.length).map(l=>[l.name,l.stalled]),[['Fourteen days',['No activity for 14 days']]]);
  assert.deepEqual((await target.json('/leads/'+leads[0].id,undefined,target.owner)).stalled,['No activity for 14 days']);
  assert.deepEqual((await target.json('/leads/report',undefined,target.owner)).stalled.map(l=>[l.name,l.reasons]),[['Fourteen days',['No activity for 14 days']]]);
 }finally{await target.close();await h.close();}
});
