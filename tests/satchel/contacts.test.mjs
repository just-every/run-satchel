import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';

test('INTAKE-004 INTAKE-005 imported insurer aliases retain every source, relationship, matter role, consent and conflict snapshot through reviewed merge and restore',async()=>{
 const h=await harness();let target;
 try{
  const m1=await open(h,'Harper injury claim','Harper Family','Pine Transport'),m2=await open(h,'Rivera property claim','Rivera Partners','Cedar Property');
  const csv='id,first_name,last_name,company,email_address,aliases\n901,,,Summit Mutual,claims@summit.example,SMI; Summit Insurance\n902,,,Summit Underwriters,desk@summit.example,Summit Mutual\n';
  const before=await h.json('/contacts',undefined,h.owner),preview=await h.json('/import/preview',{csv,filename:'insurers.csv'},h.owner);
  assert.deepEqual(await h.json('/contacts',undefined,h.owner),before,'Preview creates no contacts or graph edits');
  const imported=await h.json('/import/commit',{csv,filename:'insurers.csv',fingerprint:preview.fingerprint},h.owner);
  assert.equal(imported.job.state,'completed');
  let state=await h.json('/contacts',undefined,h.owner);
  const a=state.contacts.find(c=>c.name==='Summit Mutual'),b=state.contacts.find(c=>c.name==='Summit Underwriters');
  assert.ok(a.identities[0].sources.length&&b.identities[0].sources.length);assert.equal(a.identities[0].sources[0].sourceId,'901');assert.equal(b.identities[0].sources[0].sourceId,'902');
  const identities=structuredClone([...a.identities,...b.identities].map(i=>({id:i.id,sources:i.sources})));
  const save=async(c,extra={})=>{state=await h.json('/contacts',undefined,h.owner);return h.json('/contacts',{id:c?.id,revision:state.revision,kind:'organization',name:c?.name??'Blue Harbor Brokerage',aliases:c?.aliases??[],formerNames:[],emails:c?.emails??[],phones:['+1 212 555 0112'],addresses:['10 Park Avenue, New York NY 10001'],...extra},h.owner);};
  await save(a,{formerNames:['Summit Assurance Company']});await save(b,{aliases:[...b.aliases,'Summit Risk Group']});
  const broker=await save(null);
  const act=async(id,op,body)=>{const s=await h.json('/contacts',undefined,h.owner);return h.json('/contacts/'+id+'/'+op,{...body,revision:s.revision},h.owner);};
  await act(a.id,'matter-role',{matterId:m1.id,role:'insurer'});await act(b.id,'matter-role',{matterId:m2.id,role:'insurer'});
  await act(b.id,'relationship',{otherId:broker.id,relationship:'represented by'});
  await act(broker.id,'matter-role',{matterId:m1.id,role:'counsel'});
  const person=await save(null,{kind:'person',name:'Dana Cho',formerNames:['Dana Lee']});
  for(const role of ['witness','expert'])await act(person.id,'matter-role',{matterId:m1.id,role});
  state=await h.json('/contacts',undefined,h.owner);assert.ok(state.contacts.some(c=>c.matterRoles.some(r=>r.role==='client')));assert.ok(state.contacts.some(c=>c.matterRoles.some(r=>r.role==='adverse')));
  for(const [partyId,channel,decision] of [[a.id,'email','allowed'],[b.id,'email','denied'],[a.id,'sms','allowed']])await act(partyId,'consent',{channel,decision,evidenceDate:'2026-10-15',source:'Signed communication instructions, source '+partyId});
  assert.equal((await h.json('/contacts',undefined,h.owner)).contacts.find(c=>c.id===a.id).effectiveConsent.post,'unknown');
  const search=await h.json('/conflicts',{client:'Summit Assurance Company',adverse:'Unrelated review'},h.owner);assert.ok(search.matches.some(c=>c.id===a.id));
  const historic=await h.json('/matters',{title:'Insurer historical review',conflictId:search.id,confirmed:true,reviewNote:'Counsel reviewed the recorded insurer aliases and source identities.'},h.owner);
  const historicMatches=(await h.json('/matters/'+historic.id,undefined,h.owner)).conflict.matches;
  await h.json('/team',{email:'reader@example.test',name:'Case assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'reader@example.test'},h.owner);const reader=await h.login('reader@example.test');
  await h.json('/contacts',{name:'Denied'},reader,403);await h.json('/contacts/merge-preview',{survivorId:a.id,duplicateId:b.id,reason:'Denied'},reader,403);
  await h.json('/team',{email:'lawyer@example.test',name:'Associate',role:'lawyer'},h.owner);await h.json('/team/invite',{email:'lawyer@example.test'},h.owner);const lawyer=await h.login('lawyer@example.test'),mails=h.mails.length;
  const lawyerPreview=await h.json('/contacts/merge-preview',{survivorId:a.id,duplicateId:b.id,reason:'Review contact identities without unrelated matter detail'},lawyer);assert.ok(!JSON.stringify(lawyerPreview).includes(m2.title));
  let p=await h.json('/contacts/merge-preview',{survivorId:a.id,duplicateId:b.id,reason:'Same insurer, reviewed source export and company records'},h.owner);
  await h.json('/contacts/merge',{previewId:p.id},lawyer,404);
  await act(b.id,'consent',{channel:'post',decision:'unknown',evidenceDate:'2026-10-15',source:'No postal consent evidence supplied'});
  await h.json('/contacts/merge',{previewId:p.id},h.owner,409);
  await h.json('/contacts/merge-preview',{survivorId:a.id,duplicateId:person.id,reason:'Wrong kinds'},h.owner,400);
  p=await h.json('/contacts/merge-preview',{survivorId:a.id,duplicateId:b.id,reason:'Same insurer, reviewed source export and company records'},h.owner);
  const stale=await h.json('/conflicts',{client:'Summit Mutual',adverse:'Other insurer'},h.owner);
  state=await h.json('/contacts/merge',{previewId:p.id,duplicateId:person.id},h.owner);
  await h.json('/contacts/merge',{previewId:p.id},h.owner,409);
  await h.json('/matters',{title:'Must re-review merged graph',conflictId:stale.id,confirmed:true,reviewNote:'Old graph'},h.owner,409);
  assert.equal((await h.json('/contacts/'+b.id,undefined,h.owner)).id,a.id);
  const replay=await h.json('/import/commit',{csv,filename:'insurers.csv',fingerprint:preview.fingerprint},h.owner);assert.equal(replay.job.id,imported.job.id);
  const merged=state.contacts.find(c=>c.id===a.id);assert.ok(!state.contacts.some(c=>c.id===b.id));assert.deepEqual(new Set(merged.identityIds),new Set([a.id,b.id]));
  for(const old of identities)assert.deepEqual(merged.identities.find(i=>i.id===old.id).sources,old.sources);
  for(const alias of ['SMI','Summit Insurance','Summit Risk Group'])assert.ok(merged.aliases.includes(alias));assert.ok(merged.formerNames.includes('Summit Assurance Company'));
  assert.ok(merged.addresses.includes('10 Park Avenue, New York NY 10001'));assert.ok(merged.phones.includes('+1 212 555 0112'));
  assert.equal(merged.effectiveConsent.email,'denied');assert.equal(merged.effectiveConsent.sms,'unknown');assert.equal(h.mails.length,mails,'Contact edits, previews and merges send no messages');
  assert.deepEqual(new Set(merged.matterRoles.filter(r=>r.role==='insurer').map(r=>r.matter_id)),new Set([m1.id,m2.id]));assert.ok(merged.relationships.some(r=>r.toId===broker.id&&r.fromId===a.id));
  assert.equal((await h.json('/matters/'+historic.id,undefined,h.owner)).conflict.matches,historicMatches);
  for(const q of ['SMI','Summit Assurance','Summit Risk','represented by','Blue Harbor','Rivera property','insurer','901','902'])assert.ok((await h.json('/contacts?q='+encodeURIComponent(q),undefined,h.owner)).contacts.some(c=>c.id===a.id),q+' finds retained relationship');
  assert.ok((await h.json('/conflicts',{client:'Blue Harbor',adverse:'Unrelated'},h.owner)).matches.some(c=>c.id===a.id),'Conflict search includes related entities');
  await act(b.id,'consent',{channel:'sms',decision:'allowed',evidenceDate:'2026-10-16',source:'Separate signed SMS instructions for source identity 902'});
  assert.equal((await h.json('/contacts',undefined,h.owner)).contacts.find(c=>c.id===a.id).effectiveConsent.sms,'allowed');
  await h.json('/matters/'+m1.id+'/access',{email:'reader@example.test'},h.owner);
  const scoped=await h.json('/contacts',undefined,reader),shared=scoped.contacts.find(c=>c.id===a.id);assert.ok(shared);assert.ok(shared.matterRoles.every(r=>r.matter_id===m1.id));assert.ok(!JSON.stringify(scoped).includes('Rivera property claim'));
  await h.json('/matters/'+m1.id+'/access',{email:'reader@example.test',remove:true},h.owner);assert.equal((await h.json('/contacts',undefined,reader)).contacts.length,0);await h.json('/contacts/'+b.id,undefined,reader,404);assert.ok(!JSON.stringify(await h.json('/contacts',undefined,lawyer)).includes(m2.title));
  // Undo cannot remove either merged source or the native graph using it.
  await h.json('/import/undo',{id:imported.job.id},h.owner);assert.ok((await h.json('/contacts',undefined,h.owner)).contacts.find(c=>c.id===a.id).identityIds.includes(b.id));
  // Search the whole imported register, retaining each merged physical identity.
  const importedNames=Array.from({length:125},(_,i)=>'Exhaustive Registry '+(i+1));
  const many='id,first_name,last_name,company,email_address,aliases\n'+importedNames.map((name,i)=>`${2000+i},,,${name},,Registry alias ${i+1}`).join('\n')+'\n';
  const manyPreview=await h.json('/import/preview',{csv:many,filename:'whole-register.csv'},h.owner);
  let manyJob=(await h.json('/import/commit',{csv:many,filename:'whole-register.csv',fingerprint:manyPreview.fingerprint},h.owner)).job;
  while(manyJob.state!=='completed'){const previous=manyJob.checkpoint;manyJob=(await h.json('/import/resume',{id:manyJob.id},h.owner)).job;assert.notDeepEqual(manyJob.checkpoint,previous,'Resuming the reviewed import advances its public checkpoint');}
  const completeGraph=await h.json('/contacts',undefined,h.owner),completeSearch=await h.json('/conflicts',{client:'Exhaustive Registry',adverse:'No matching adverse name'},h.owner);
  assert.deepEqual(completeSearch.matches.map(c=>c.name).sort(),[...importedNames].sort(),'Every imported contact is searched without a hidden first page');
  assert.equal(completeSearch.searchedContacts,completeGraph.contacts.length);
  assert.equal(completeSearch.searchedIdentities,completeGraph.contacts.reduce((sum,c)=>sum+c.identities.length,0));
  assert.equal(completeSearch.searchedIdentities-completeSearch.searchedContacts,1,'Merged physical identities remain in the search population');
  await act(a.id,'matter-role',{matterId:m1.id,role:'client'});
  let clientSearch=await h.json('/conflicts',{client:'Summit Assurance',adverse:'No matching adverse name'},h.owner);
  assert.equal(clientSearch.matches.find(c=>c.id===a.id).matterContext.find(c=>c.matterId===m1.id&&c.role==='client').classification,'current_client');
  const closePreview=await h.json('/matters/'+m1.id+'/closure-preview',{clientPromisesReviewed:true,clientPromises:[],originalReturn:{status:'not_held',note:'No client originals held'}},h.owner);
  const closed=await h.json('/matters/'+m1.id+'/close',{previewId:closePreview.id,digest:closePreview.digest,revision:closePreview.revision,reason:'Representation completed after counsel review',outcome:'settled',exceptions:closePreview.checks.map(c=>({key:c.key,reason:'Reviewed continuing responsibility'}))},h.owner);
  clientSearch=await h.json('/conflicts',{client:'Summit Assurance',adverse:'No matching adverse name'},h.owner);
  const former=clientSearch.matches.find(c=>c.id===a.id).matterContext.find(c=>c.matterId===m1.id&&c.role==='client');
  assert.equal(former.classification,'former_client');assert.equal(former.status,'closed');assert.equal(former.closedAt,closed.history.find(e=>e.kind==='closed').at);
  assert.equal(former.closedYear,new Intl.DateTimeFormat('en-US',{timeZone:clientSearch.timezone,year:'numeric'}).format(new Date(former.closedAt)));assert.equal(former.number,m1.matter_number);
  assert.ok(clientSearch.matches.find(c=>c.id===a.id).matterContext.filter(c=>c.role!=='client').every(c=>c.classification===null),'An insurer association never invents a client relationship');
  const cleared=await h.json('/matters',{title:'Partner cleared former-client follow-on',conflictId:clientSearch.id,confirmed:true,reviewNote:'Partner reviewed each source identity and former matter; cleared this engagement'},h.owner);
  const recorded=(await h.json('/matters/'+cleared.id,undefined,h.owner)).conflict;
  assert.deepEqual(JSON.parse(recorded.search_summary),{searchedContacts:clientSearch.searchedContacts,searchedIdentities:clientSearch.searchedIdentities,timezone:clientSearch.timezone});
  assert.deepEqual(JSON.parse(recorded.matches),clientSearch.matches);
  await h.json('/matters/'+cleared.id+'/access',{email:'lawyer@example.test'},h.owner);
  const restricted=(await h.json('/matters/'+cleared.id,undefined,lawyer)).conflict;
  for(const hidden of [m1.id,m1.title,m2.id,m2.title,former.closedAt])assert.ok(!restricted.matches.includes(hidden),'Recorded conflict associations reapply current access: '+hidden);
  const scopedSearch=await h.json('/conflicts',{client:'Summit Assurance',adverse:'No matching adverse name'},lawyer);
  assert.ok(scopedSearch.matches.some(c=>c.id===a.id),'Firm contact review does not grant confidential matter context');
  assert.ok(scopedSearch.matches.find(c=>c.id===a.id).matterContext.every(c=>c.matterId===cleared.id));
  await h.json('/matters/'+m1.id+'/reopen',{revision:closed.revision,reason:'Additional instructions received',workflows:[],access:[]},h.owner);
  const reopenedSearch=await h.json('/conflicts',{client:'Summit Assurance',adverse:'No matching adverse name'},h.owner);
  const current=reopenedSearch.matches.find(c=>c.id===a.id).matterContext.find(c=>c.matterId===m1.id&&c.role==='client');assert.equal(current.classification,'current_client');assert.equal(current.closedAt,null);assert.equal(current.closedYear,null);
  assert.deepEqual((await h.json('/matters/'+cleared.id,undefined,h.owner)).conflict,recorded,'Reopening never rewrites the reviewed search or its clearance evidence');
  const audit=await h.json('/audit?action=contact.merged',undefined,h.owner);assert.equal(audit.records[0].evidence.record.recordType,'s_contact_merges');assert.equal(audit.records[0].evidence.record.survivor_id,a.id);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();target=await harness();assert.equal((await target.json('/restore',{archive,confirm:'RESTORE'},target.owner)).phase,'complete');
  assert.deepEqual(await target.json('/contacts',undefined,target.owner),await h.json('/contacts',undefined,h.owner));assert.equal((await target.json('/matters/'+historic.id,undefined,target.owner)).conflict.matches,historicMatches);assert.deepEqual((await target.json('/matters/'+cleared.id,undefined,target.owner)).conflict,recorded);await target.restart();assert.deepEqual((await target.json('/matters/'+cleared.id,undefined,target.owner)).conflict,recorded);
 }finally{await target?.close();await h.close();}
});

test('whole-firm conflict labels, opaque principal and wall routes, closed dispositions, structured waivers and enforced exclusions survive recovery',async()=>{
 const h=await harness();try{
  const hidden=await open(h,'Screened acquisition advice','Restricted client','Restricted affiliate');
  for(const [email,role] of [['custodian@example.test','lawyer'],['outside@example.test','lawyer'],['assistant@example.test','assistant'],['trust@example.test','trust_officer']]){await h.json('/team',{email,name:email,role},h.owner);await h.json('/team/invite',{email},h.owner);}
  const custodian=await h.login('custodian@example.test'),outside=await h.login('outside@example.test'),assistant=await h.login('assistant@example.test'),trust=await h.login('trust@example.test');
  const contact=async(name,aliases=[])=>{const s=await h.json('/contacts',undefined,h.owner);return h.json('/contacts',{revision:s.revision,kind:'organization',name,aliases,formerNames:[],emails:[],phones:[],addresses:[]},h.owner);};
  const prospect=await contact('Pioneer Manufacturing',['Pioneer affiliate']),staff=await contact('Partner family business',['StaffPartner']);
  const stage=(await h.json('/lead-stages',{name:'Consultation review',position:1},h.owner)).find(s=>s.name==='Consultation review');
  await h.json('/leads',{name:'Pioneer Manufacturing',summary:'synthetic-satchel-1',referralSource:'Native inquiry',stageId:stage.id},h.owner);
  let graph=await h.json('/contacts',undefined,h.owner);await h.json('/contacts/'+staff.id+'/conflict-classification',{revision:graph.revision,classification:'staff_relationship',staffEmail:'custodian@example.test',kind:'family ownership',startDate:'2026-01-01',endDate:'2026-06-01',note:'synthetic-satchel-2'},h.owner);
  // Current grants: ordinary hidden matter has one principal route, never its title,
  // role, number or count. The permitted name and alias remain available.
  const native=await h.json('/conflicts',{client:'Restricted affiliate',adverse:'Elsewhere'},outside);
  assert.equal(native.matches.filter(c=>c.restricted).length,1);assert.equal(native.matches.find(c=>c.restricted).custodianRoutes[0].route,'principal');assert.ok(native.matches.some(c=>c.name==='Restricted affiliate'));
  for(const value of [hidden.id,hidden.title,hidden.number])assert.ok(!JSON.stringify(native.matches).includes(value));
  const nativeOpen={title:'Native restricted engagement',conflictId:native.id,reviewNote:'Counsel review',confirmed:true};
  await h.json('/conflicts/'+native.id+'/disposition',{decision:'cleared',note:'Not a closed-set value',restrictions:[]},outside,400);
  await h.json('/conflicts/'+native.id+'/disposition',{decision:'no_conflict',note:'Applicant review',restrictions:[]},outside);
  const nativeReferral=await h.json('/conflicts/'+native.id+'/referrals',{wallId:'principal'},outside);
  await h.json('/matters',nativeOpen,outside,409);await h.json('/conflict-referrals/'+nativeReferral.id+'/decide',{decision:'no_conflict',note:'Not the custodian'},outside,404);
  await h.json('/conflict-referrals/'+nativeReferral.id+'/decide',{decision:'decline',note:'Private principal review'},h.owner);await h.json('/matters',nativeOpen,outside,409);
  const identities=(await h.json('/contacts',undefined,h.owner)).contacts,client=identities.find(c=>c.name==='Restricted client'),adverse=identities.find(c=>c.name==='Restricted affiliate');
  const metadata={date:'2026-10-21',scope:'Limited acquisition advice',matchId:adverse.id,parties:[client.id]};
  await h.json('/conflict-referrals/'+nativeReferral.id+'/decide',{decision:'waiver_recorded',note:'No missing waiver'},h.owner,409);
  await h.json('/conflict-referrals/'+nativeReferral.id+'/decide',{decision:'waiver_recorded',note:'Bad waiving party',waiver:{...metadata,parties:[adverse.id],confirmation:'synthetic-satchel-3'}},h.owner,409);
  await h.json('/conflict-referrals/'+nativeReferral.id+'/decide',{decision:'waiver_recorded',note:'Private principal waiver',restrictions:['Advice excludes the adverse acquisition'],excludedStaff:['assistant@example.test'],waiver:{...metadata,confirmation:'synthetic-satchel-4'}},h.owner);
  const principalDecision=(await h.json('/conflict-referrals',undefined,h.owner)).custodian.find(r=>r.id===nativeReferral.id);assert.equal(principalDecision.waiver.label,'practitioner-recorded, not signed through Satchel');
  await h.json('/conflict-waivers/'+principalDecision.waiver.id+'/file',undefined,outside,404);
  const disclosed=(await h.json('/conflict-referrals',undefined,outside)).own[0];assert.equal(disclosed.status,'waiver_recorded');assert.equal(disclosed.custodian,'owner@example.test');assert.ok(disclosed.at);assert.deepEqual(disclosed.restrictions,['Advice excludes the adverse acquisition']);assert.ok(!JSON.stringify(disclosed).includes('Private principal'));
  await h.json('/matters',nativeOpen,outside,409);const nativeMatter=await h.json('/matters',{...nativeOpen,restrictionsAcknowledged:true},outside);
  const nativeTerms=(await h.json('/matters/'+nativeMatter.id,undefined,outside)).conflictTerms;
  const refusal=await h.json('/matters/'+nativeMatter.id+'/access',{email:'assistant@example.test'},h.owner,409);assert.match(refusal.error,/Advice excludes/);
  await h.json('/matters/'+nativeMatter.id,undefined,assistant,404);
  await h.json('/matters/'+nativeMatter.id+'/restrictions/remove',{email:'assistant@example.test',reason:'Unauthorized'},assistant,403);
  // Every conflict door refuses non-counsel and unauthenticated agent credentials.
  for(const cookie of [assistant,trust])for(const [path,body] of [['/conflicts',{client:'A',adverse:'B'}],['/conflicts/'+native.id+'/review',undefined],['/conflicts/'+native.id+'/disposition',{decision:'no_conflict'}],['/conflicts/'+native.id+'/referrals',{wallId:'principal'}],['/conflict-referrals',undefined],['/conflict-referrals/'+nativeReferral.id+'/decide',{decision:'no_conflict'}],['/conflict-waivers/'+principalDecision.waiver.id+'/file',undefined]])await h.json(path,body,cookie,403);
  await h.json('/conflicts',{client:'A',adverse:'B'},'',401,{authorization:'Bearer synthetic-satchel-5'});
  // Party changes stale all dispositions, not just overall counsel review.
  const stale=await h.json('/conflicts',{client:'Restricted affiliate',adverse:'Elsewhere'},outside);await h.json('/conflicts/'+stale.id+'/disposition',{decision:'no_conflict',note:'Before party change',restrictions:[]},outside);await contact('New identity');await h.json('/matters',{...nativeOpen,conflictId:stale.id},outside,409);
  const ownMatter=await open(h,'Applicant source','Pioneer Manufacturing','Unrelated opposing company');
  graph=await h.json('/contacts',undefined,h.owner);await h.json('/contacts/'+prospect.id+'/relationship',{revision:graph.revision,otherId:adverse.id,relationship:'prospective adverse affiliate'},h.owner);
  const wall=await h.json('/matters/'+hidden.id+'/wall',{custodianEmail:'custodian@example.test',members:[],reason:'Screen existing adverse representation',revision:null},h.owner);
  const search=await h.json('/conflicts',{client:'Pioneer affiliate',adverse:'StaffPartner'},h.owner);
  const label=search.matches.find(c=>c.id===prospect.id).classifications.find(c=>c.classification==='prospective_client');assert.equal(label.stage,'Consultation review');assert.match(label.year,/^20\d\d$/);assert.equal(search.matches.find(c=>c.id===staff.id).classifications.find(c=>c.classification==='staff_relationship').staff_email,'custodian@example.test');assert.ok(search.matches.some(c=>c.restricted));assert.ok(!JSON.stringify(search.matches).includes(hidden.id));
  const opening={title:'Limited new engagement',conflictId:search.id,reviewNote:'Counsel reviewed the whole-firm search',confirmed:true};await h.json('/matters',opening,h.owner,409);
  // A permitted client association supplies the structured ordinary waiver.
  const original='Signed ordinary waiver original: synthetic-satchel-6';
  // Opening added parties, so refresh the review before recording any disposition.
  const fresh=await h.json('/conflicts',{client:'Pioneer affiliate',adverse:'StaffPartner'},h.owner);opening.conflictId=fresh.id;
  const waiver={name:'counsel-waiver.txt',mime:'text/plain',contentBase64:Buffer.from(original).toString('base64'),date:'2026-10-21',scope:'Applicant limited scope',matchId:prospect.id,parties:[prospect.id]};
  let review=await h.json('/conflicts/'+fresh.id+'/disposition',{decision:'restrictions',note:'Applicant scope',restrictions:['Advice excludes the adverse acquisition'],waiver},h.owner);
  assert.equal(await(await h.request('/api/satchel/conflict-waivers/'+review.waiver.id+'/file',undefined,h.owner)).text(),original);await h.json('/conflict-waivers/'+review.waiver.id+'/file',undefined,outside,404);
  const referral=await h.json('/conflicts/'+fresh.id+'/referrals',{wallId:wall.id},h.owner);assert.equal((await h.json('/conflicts/'+fresh.id+'/referrals',{wallId:wall.id},h.owner)).id,referral.id);
  await h.json('/conflict-referrals/'+referral.id+'/decide',{decision:'no_conflict',note:'Principal cannot dispose'},h.owner,404);
  await h.json('/matters/'+hidden.id+'/wall',{custodianEmail:'owner@example.test',members:[],reason:'Cannot redesignate',revision:wall.revision},h.owner,403);
  const privateBytes='Privileged restricted consent: synthetic-satchel-7',privateWaiver={...metadata,name:'restricted-consent.txt',mime:'text/plain',contentBase64:Buffer.from(privateBytes).toString('base64')};
  await h.json('/conflict-referrals/'+referral.id+'/decide',{decision:'decline',note:'Private representation requires review',waiver:privateWaiver},custodian);
  let custodial=(await h.json('/conflict-referrals',undefined,custodian)).custodian.find(r=>r.id===referral.id);assert.equal(custodial.status,'decline');assert.equal(await(await h.request('/api/satchel/conflict-waivers/'+custodial.waiver.id+'/file',undefined,custodian)).text(),privateBytes);await h.json('/conflict-waivers/'+custodial.waiver.id+'/file',undefined,h.owner,404);
  await h.json('/matters',{...opening,restrictionsAcknowledged:true},h.owner,409);
  await h.json('/conflict-referrals/'+referral.id+'/decide',{decision:'waiver_recorded',note:'Private waiver permits disclosed conditions',restrictions:['Disclosed counsel scope'],waiver:privateWaiver},custodian);
  await h.json('/conflicts/'+fresh.id+'/disposition',{decision:'decline',note:'Applicant pauses',restrictions:[]},h.owner);await h.json('/matters',{...opening,restrictionsAcknowledged:true},h.owner,409);
  review=await h.json('/conflicts/'+fresh.id+'/disposition',{decision:'restrictions',note:'Applicant approves',restrictions:['Advice excludes the adverse acquisition'],waiver},h.owner);
  await h.json('/matters',opening,h.owner,409);const opened=await h.json('/matters',{...opening,restrictionsAcknowledged:true},h.owner);
  const terms=(await h.json('/matters/'+opened.id,undefined,h.owner)).conflictTerms;assert.equal(terms.review_id,review.id);assert.deepEqual(terms.restrictions,['Advice excludes the adverse acquisition','Disclosed counsel scope']);
  await h.restart();assert.deepEqual((await h.json('/matters/'+opened.id,undefined,h.owner)).conflictTerms,terms);
  const emergency=await h.json('/ethical-walls/'+wall.id+'/requests',{reason:'Authorized archival custody'},h.owner);await h.json('/wall-requests/'+emergency.id+'/decide',{approve:true,note:'Archive continuity',minutes:30},custodian);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),restored=await harness();try{await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);assert.deepEqual((await restored.json('/matters/'+opened.id,undefined,restored.owner)).conflictTerms,terms);assert.deepEqual((await restored.json('/matters/'+nativeMatter.id,undefined,restored.owner)).conflictTerms,nativeTerms);assert.equal(await(await restored.request('/api/satchel/conflict-waivers/'+review.waiver.id+'/file',undefined,restored.owner)).text(),original);assert.equal((await restored.json('/conflicts/'+fresh.id+'/review',undefined,restored.owner)).review.id,review.id);await restored.json('/matters/'+nativeMatter.id+'/access',{email:'assistant@example.test'},restored.owner,409);}finally{await restored.close();}
  await h.json('/matters/'+nativeMatter.id+'/restrictions/remove',{email:'assistant@example.test',reason:'Counsel reviewed changed scope'},outside);await h.json('/matters/'+nativeMatter.id+'/access',{email:'assistant@example.test'},h.owner);await h.json('/matters/'+nativeMatter.id,undefined,assistant);
 }finally{await h.close();}
});
