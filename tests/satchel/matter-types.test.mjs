import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';

test('MATTER-001 versioned litigation and estate types, typed values, imported case numbers, closed-matter history and the docket citation',async()=>{
 const h=await harness();let restored;
 try{
  const address={line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'};await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@example.test',phone:'212-555-0100',address,timezone:'America/New_York',billing:{defaultRateCents:30000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main',phone:'212-555-0100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'},{code:'EST',name:'Estates'}]}},h.owner);
  for(const [email,role] of [['lawyer@example.test','lawyer'],['assistant@example.test','assistant']]){await h.json('/team',{email,name:email.split('@')[0],role},h.owner);await h.json('/team/invite',{email},h.owner);}
  const lawyer=await h.login('lawyer@example.test'),assistant=await h.login('assistant@example.test');
  const opened=async(title,client,adverse,practiceCode)=>{const s=await h.json('/conflicts',{client,adverse},h.owner);return h.json('/matters',{title,practiceCode,conflictId:s.id,reviewNote:'Reviewed',confirmed:true},h.owner);};
  const lit=await opened('Harper v. Reed','Harper family','Reed Logistics','LIT'),est=await opened('Pine estate','Pine family','Elm Trustee','EST');
  for(const email of ['lawyer@example.test','assistant@example.test'])await h.json('/matters/'+lit.id+'/access',{email},h.owner);

  // Templates: the principal defines litigation and estate types requiring different fields.
  const litigation={required:['caseNumber','court'],fields:[{label:'Claim value',type:'money',required:false},{label:'Jury demanded',type:'yesno',required:true}],records:['Complaint']};
  const estate={required:['feeArrangement'],fields:[{label:'Decedent date of death',type:'date',required:true},{label:'Estate value',type:'money',required:false}],records:['Death certificate']};
  await h.json('/matter-types',{name:'Civil litigation',practiceCode:'LIT',definition:litigation},lawyer,403);
  await h.json('/matter-types',{name:'Civil litigation',practiceCode:'LIT',definition:litigation},assistant,403);
  await h.json('/matter-types',{name:'Bad',practiceCode:'LIT',definition:{...litigation,fields:[{label:'Colour',type:'color',required:false}]}},h.owner,400);
  await h.json('/matter-types',{name:'Bad',practiceCode:'TAX',definition:litigation},h.owner,400);
  await h.json('/matter-types',{name:'Civil litigation',practiceCode:'LIT',definition:litigation},h.owner);
  let types=(await h.json('/matter-types',{name:'Probate estate',practiceCode:'EST',definition:estate},h.owner)).types;
  const litType=types.find(t=>t.name==='Civil litigation'),estType=types.find(t=>t.name==='Probate estate');
  assert.deepEqual(litType.definition.required,['caseNumber','court']);assert.deepEqual(estType.definition.required,['feeArrangement']);
  assert.deepEqual(litType.definition.fields.map(f=>f.key),['claim_value','jury_demanded']);

  // Adopting a type validates required and typed values against its exact version.
  const litBase='/matters/'+lit.id+'/fields';let f=await h.json(litBase,undefined,lawyer);assert.equal(f.type,null);
  const save=(base,body,who=lawyer,expected=200)=>h.json(base,body,who,expected);
  await save(litBase,{revision:f.profile.revision,typeId:estType.id,typeVersion:1,feeArrangement:'hourly',custom:{decedent_date_of_death:'2026-03-14'}},lawyer,400);
  assert.match((await save(litBase,{revision:f.profile.revision,typeId:litType.id,typeVersion:1,court:'S.D.N.Y.',custom:{jury_demanded:'yes'}},lawyer,400)).error,/Case number is required/);
  assert.match((await save(litBase,{revision:f.profile.revision,typeId:litType.id,typeVersion:1,caseNumber:'1:26-cv-04417',court:'S.D.N.Y.',custom:{jury_demanded:'yes',claim_value:'lots'}},lawyer,400)).error,/Claim value/);
  assert.match((await save(litBase,{revision:f.profile.revision,typeId:litType.id,typeVersion:1,caseNumber:'1:26-cv-04417',court:'S.D.N.Y.',insuranceLimit:'1000000.005',custom:{jury_demanded:'yes'}},lawyer,400)).error,/Insurance limit/);
  await save(litBase,{revision:f.profile.revision,typeId:litType.id,typeVersion:1,caseNumber:'1:26-cv-04417',court:'S.D.N.Y.',custom:{jury_demanded:'yes',unknown:'x'}},lawyer,400);
  await save(litBase,{revision:f.profile.revision,typeId:litType.id,typeVersion:1,caseNumber:'1:26-cv-04417',court:'S.D.N.Y.',custom:{jury_demanded:'yes'}},assistant,403);
  f=await save(litBase,{revision:f.profile.revision,typeId:litType.id,typeVersion:1,caseNumber:'1:26-cv-04417',court:'S.D.N.Y.',insuranceLimit:'1000000.00',feeArrangement:'contingency',feeTerms:'33% of recovery',custom:{jury_demanded:'yes',claim_value:'250000.5'}});
  assert.deepEqual({...f.profile,revision:undefined},{typeId:litType.id,typeVersion:1,caseNumber:'1:26-cv-04417',court:'S.D.N.Y.',insuranceLimitCents:100000000,feeArrangement:'contingency',feeTerms:'33% of recovery',custom:{jury_demanded:true,claim_value:25000050},revision:undefined});
  assert.deepEqual(f.opponents,['Reed Logistics']);
  await save(litBase,{revision:'stale',court:'E.D.N.Y.'},lawyer,409);
  assert.deepEqual((await h.json(litBase,undefined,assistant)).profile,f.profile);

  // The estate type requires different fields than litigation.
  const estBase='/matters/'+est.id+'/fields';let e=await h.json(estBase,undefined,h.owner);
  await save(estBase,{revision:e.profile.revision,typeId:litType.id,typeVersion:1,caseNumber:'X',court:'Y',custom:{jury_demanded:'no'}},h.owner,400);
  assert.match((await save(estBase,{revision:e.profile.revision,typeId:estType.id,typeVersion:1,feeArrangement:'flat_fee'},h.owner,400)).error,/Decedent date of death is required/);
  assert.match((await save(estBase,{revision:e.profile.revision,typeId:estType.id,typeVersion:1,custom:{decedent_date_of_death:'2026-03-14'}},h.owner,400)).error,/Fee arrangement is required/);
  assert.match((await save(estBase,{revision:e.profile.revision,typeId:estType.id,typeVersion:1,feeArrangement:'flat_fee',custom:{decedent_date_of_death:'2026-02-30'}},h.owner,400)).error,/valid YYYY-MM-DD/);
  e=await save(estBase,{revision:e.profile.revision,typeId:estType.id,typeVersion:1,feeArrangement:'flat_fee',custom:{decedent_date_of_death:'2026-03-14',estate_value:'1200000'}},h.owner);
  assert.equal(e.profile.caseNumber,null);assert.deepEqual(e.profile.custom,{decedent_date_of_death:'2026-03-14',estate_value:120000000});
  assert.deepEqual(e.records,[{type:'Death certificate',status:'missing',documents:[]}]);

  // Required records are on file only as an available original of exactly that type.
  assert.equal(f.records[0].status,'missing');
  let complaint=await h.json('/matters/'+lit.id+'/documents',{name:'Complaint.txt',mime:'text/plain',contentBase64:Buffer.from('Complaint original').toString('base64'),visibility:'matter'},h.owner);
  const filing=await h.json('/matters/'+lit.id+'/document-sets/preview',{documents:[{id:complaint.id,revision:complaint.revision}],documentType:'Complaint'},h.owner);await h.json('/matters/'+lit.id+'/document-sets/apply',{previewId:filing.id},h.owner);
  f=await h.json(litBase,undefined,lawyer);assert.deepEqual(f.records,[{type:'Complaint',status:'on file',documents:[{id:complaint.id,title:'Complaint.txt',version:1}]}]);

  // A new type version never rewrites matters; open matters adopt it explicitly.
  const litV2={...litigation,fields:[...litType.definition.fields,{label:'Assigned judge',type:'text',required:true}]};
  types=(await h.json('/matter-types',{id:litType.id,revision:'stale',name:'Civil litigation',practiceCode:'LIT',definition:litV2},h.owner,409));
  types=(await h.json('/matter-types',{id:litType.id,revision:litType.revision,name:'Civil litigation',practiceCode:'LIT',definition:litV2},h.owner)).types;
  const lit2=types.find(t=>t.id===litType.id);assert.equal(lit2.version,2);assert.deepEqual(lit2.versions.map(v=>v.version),[1,2]);assert.deepEqual(lit2.versions[0].definition,litType.definition);
  f=await h.json(litBase,undefined,lawyer);assert.equal(f.profile.typeVersion,1);assert.equal(f.latestVersion,2);assert.equal(f.type.definition.fields.length,2);
  assert.match((await save(litBase,{revision:f.profile.revision,typeId:litType.id,typeVersion:2},lawyer,400)).error,/Assigned judge is required/);
  f=await save(litBase,{revision:f.profile.revision,typeId:litType.id,typeVersion:2,custom:{assigned_judge:'Hon. A. Torres'}});
  assert.equal(f.profile.typeVersion,2);assert.equal(f.profile.custom.claim_value,25000050);assert.ok(f.history.some(x=>x.kind==='adopted'&&x.detail.previous.typeVersion===1&&x.detail.profile.typeVersion===2));

  // A closed matter keeps its recorded type version and values.
  const declarations={clientPromisesReviewed:true,clientPromises:[],originalReturn:{status:'not_held',note:'No originals held'}};
  const p=await h.json('/matters/'+est.id+'/closure-preview',declarations,h.owner);
  await h.json('/matters/'+est.id+'/close',{previewId:p.id,digest:p.digest,revision:p.revision,reason:'Estate administration complete',exceptions:p.checks.map(c=>({key:c.key,reason:'Carried'}))},h.owner);
  await h.json('/matter-types',{id:estType.id,revision:estType.revision,name:'Probate estate',practiceCode:'EST',definition:{...estate,fields:[{label:'Decedent date of death',type:'text',required:true},{label:'Probate court',type:'text',required:true}]}},h.owner);
  const closed=await h.json(estBase,undefined,h.owner);assert.equal(closed.lifecycleStatus,'closed');assert.deepEqual(closed.profile,e.profile);assert.equal(closed.type.version,1);assert.equal(closed.type.definition.fields[0].type,'date');assert.equal(closed.latestVersion,2);
  assert.match((await save(estBase,{revision:closed.profile.revision,typeId:estType.id,typeVersion:2,custom:{probate_court:'Surrogate’s Court'}},h.owner,409)).error,/Closed matters keep/);

  // The docket shows court, case number and each date with its exact source version.
  const order=await h.json('/matters/'+lit.id+'/documents',{name:'Scheduling order.txt',mime:'text/plain',contentBase64:Buffer.from('Scheduling order\n¶ 4. Fact discovery shall close on November 14, 2026.').toString('base64'),visibility:'matter'},h.owner);
  const deadline=await h.json('/matters/'+lit.id+'/deadlines',{title:'Fact discovery closes',date:'2026-11-14',timezone:'America/New_York',source:'Scheduling order ¶ 4',documentId:order.id,version:1},lawyer);
  await h.json('/deadlines/'+deadline.id+'/confirm',{revision:deadline.revision,note:'Checked against order'},lawyer);
  f=await h.json(litBase,undefined,lawyer);
  assert.deepEqual(f.docket,[{id:deadline.id,title:'Fact discovery closes',kind:'deadline',status:'confirmed',date:'2026-11-14',timezone:'America/New_York',citation:'Scheduling order ¶ 4',documentId:order.id,documentTitle:'Scheduling order.txt',version:1}]);
  assert.match(await (await h.request(`/api/satchel/documents/${order.id}/file?version=1`,undefined,lawyer)).text(),/¶ 4\. Fact discovery shall close on November 14, 2026/);

  // Imported Clio rows carry their case number with provenance; invalid ones are diagnosed.
  const csv='id,display_number,description,client,adverse_party,case_number\r\n901,2019-0042,Boundary dispute,Cedar family,Oak Builders,2:19-cv-00042\r\n';
  const plan=await h.json('/matter-import/preview',{csv,filename:'clio.csv'},h.owner);assert.ok(!plan.diagnostics.some(d=>d.code==='UNMAPPED_COLUMNS'));
  const bad=await h.json('/matter-import/preview',{csv:csv.replace('2:19-cv-00042','9'.repeat(101)),filename:'clio.csv'},h.owner);assert.ok(bad.diagnostics.some(d=>d.code==='INVALID_FIELD'&&/case_number/.test(d.message)));
  const s=await h.json('/conflicts',{client:'Cedar family',adverse:'Oak Builders'},h.owner);
  const imported=await h.json('/matter-import/commit',{csv,filename:'clio.csv',fingerprint:plan.fingerprint,sourceId:'901',conflictId:s.id,confirmed:true,reviewNote:'Reviewed'},h.owner);
  const fi=await h.json('/matters/'+imported.matter.id+'/fields',undefined,h.owner);assert.equal(fi.profile.caseNumber,'2:19-cv-00042');assert.equal(fi.history[0].kind,'imported');assert.equal(fi.history[0].detail.source.sourceId,'901');
  assert.match((await save('/matters/'+imported.matter.id+'/fields',{revision:fi.profile.revision,typeId:litType.id,typeVersion:1,court:'D.N.J.',custom:{jury_demanded:'no'}},h.owner,409)).error,/newer version/);

  const audit=await h.json('/audit?matterId='+lit.id,undefined,h.owner);assert.ok(audit.records.some(r=>r.action==='matter.fields_adopted'));
  const archived=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();restored=await harness();await restored.json('/restore',{archive:archived,confirm:'RESTORE'},restored.owner);
  assert.deepEqual(await restored.json(litBase,undefined,restored.owner),await h.json(litBase,undefined,h.owner));
  assert.deepEqual(await restored.json('/matter-types',undefined,restored.owner),await h.json('/matter-types',undefined,h.owner));
  await h.json('/matters/'+lit.id+'/access',{email:'lawyer@example.test',remove:true},h.owner);await h.json(litBase,undefined,lawyer,404);
 }finally{await restored?.close();await h.close();}
});
