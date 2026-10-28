import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {csvRows} from './migration-fixture.mjs';
const sourceFile=(name,contents)=>({name,contentBase64:Buffer.from(contents).toString('base64'),sha256:createHash('sha256').update(contents).digest('hex')});
export function filevinePackage(types){
 return {schema:'satchel-filevine-v1',account:'synthetic-satchel-1',phase:'snapshot',extractedAt:'2020-04-03T12:00:00.000Z',mappingRevision:'review-1',clientRepairs:{},files:[],csvFiles:[
  sourceFile('Contacts.csv','\uFEFF'+csvRows(['Contact ID','Name','Former name','Unmapped phone'],[['client-1','Synthetic Satchel Filevine Client','Filevine Former Client','5550101'],['client-2','Synthetic Satchel Filevine Witness','',''],['unused-1','Synthetic Satchel Filevine Unused','','']])),
  sourceFile('Projects.csv',csvRows(['Project ID','Project Number','Project Name','Client ID','Adverse','Status','Opened','Type','Incident date','Estate value','Unmapped label'],[['matter-1','FV-2020-1','Filevine injury review','client-1','Synthetic Satchel Filevine Opponent','Active','2020-01-01T12:00:00.000Z','Injury','2020-01-01','','Retain project metadata'],['matter-2','FV-2020-2','Filevine estate review','client-1','Synthetic Satchel Filevine Respondent','Active','2020-02-01T12:00:00.000Z','Estate','','250000.50','']])),
  sourceFile('Injury-details.csv',csvRows(['Project ID','Court'],[['matter-1','Synthetic Satchel Court']])),
  sourceFile('Treatments.csv',csvRows(['Project ID','Row ID','Provider','Cost','Visits','Reviewed','Date'],[['matter-1','row-1','Synthetic Satchel Clinic','120.50','2','yes','2020-03-01'],['matter-1','row-2','Synthetic Satchel Clinic','120.50','2','yes','2020-03-01']])),
  sourceFile('Beneficiaries.csv',csvRows(['Project ID','Row ID','Name','Share'],[['matter-2','row-1','Synthetic Satchel Heir','50.5'],['matter-2','row-2','Synthetic Satchel Other Heir','49.5']])),
  sourceFile('Relationships.csv',csvRows(['Link ID','Project ID','Contact ID','Role'],[['link-1','matter-1','client-2','Witness']])),
  sourceFile('Roles.csv',csvRows(['Project ID','Person ID','Role'],[['matter-1','synthetic-satchel-member','Project Administrator']])),
  sourceFile('Activity.csv',csvRows(['ID','Description'],[['synthetic-satchel-1','Source activity remains uncovered']])),
 ],mappings:{
  contacts:{file:'Contacts.csv',columns:{id:'Contact ID',name:'Name',aliases:'Former name'}},
  projects:{file:'Projects.csv',columns:{id:'Project ID',display_number:'Project Number',description:'Project Name',client_id:'Client ID',adverse_party:'Adverse',status:'Status',opened_at:'Opened',project_type:'Type'},values:{status:{Active:'open'}}},
  relationships:{file:'Relationships.csv',columns:{id:'Link ID',matter_id:'Project ID',contact_id:'Contact ID',relation:'Role'},values:{relation:{Witness:'witness'}}},
  roles:{file:'Roles.csv',columns:{matter_id:'Project ID',source_person:'Person ID',source_role:'Role'}},
 },projectTypes:{Injury:{typeId:types.injury,typeVersion:1,practiceCode:'LIT',custom:{incident:'Incident date'}},Estate:{typeId:types.estate,typeVersion:1,practiceCode:'LIT',custom:{estate_value:'Estate value'}}},sections:[
  {key:'case_details',file:'Injury-details.csv',projectType:'Injury',projectId:'Project ID',fields:{source_court:'Court'}},
  {key:'treatment',file:'Treatments.csv',projectType:'Injury',projectId:'Project ID',rowId:'Row ID',fields:{provider:'Provider',cost:'Cost',visits:'Visits',reviewed:'Reviewed',visit_date:'Date'}},
  {key:'beneficiary',file:'Beneficiaries.csv',projectType:'Estate',projectId:'Project ID',rowId:'Row ID',fields:{beneficiary:'Name',share:'Share'}},
 ],roleMappings:{'Project Administrator':'owner'}};
}
export async function setupFilevine(h){
 const current=await h.json('/firm',undefined,h.owner),address={line1:'100 Example Street',city:'New York',state:'NY',zip:'10001'};
 const settings=current.settings??{name:'Synthetic Satchel Counsel',email:(await h.json('/state',undefined,h.owner)).actor.email,phone:'2125550123',address,timezone:'America/New_York',billing:{defaultRateCents:10000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main',phone:'2125550123',timezone:'America/New_York',address}],practiceAreas:[]};
 if(!settings.practiceAreas.some(a=>a.code==='LIT'))settings.practiceAreas.push({code:'LIT',name:'Litigation'});
 await h.json('/firm',{settings,revision:current.revision},h.owner);
 const field=(key,type,required=false)=>({key,label:key.replaceAll('_',' '),type,required});
 const types={};
 for(const [key,name,fields] of [['injury','Filevine injury',[field('incident','date',true),field('source_court','text',true),field('provider','text'),field('cost','money'),field('visits','number'),field('reviewed','yesno'),field('visit_date','date')]],['estate','Filevine estate',[field('estate_value','money',true),field('beneficiary','text'),field('share','number')]]]){
  const result=await h.json('/matter-types',{name,practiceCode:'LIT',definition:{required:[],fields,records:[]}},h.owner);types[key]=result.types.find(t=>t.name===name).id;
 }
 return filevinePackage(types);
}
const preview=(h,p)=>h.json('/migration/preview',{package:p},h.owner);
export async function finishFilevine(h,job){
 while(job.job.state==='applying'){
  let review;if(job.next.kind==='matters'){const search=await h.json('/conflicts',{client:job.next.client,adverse:job.next.adverse},h.owner);review={conflictId:search.id,confirmed:true,reviewNote:'Principal reviewed source relationships and every conflict match.'};}
  job=await h.json('/migration/resume',{id:job.job.id,review},h.owner);
 }
 return job;
}
export async function proveFilevineMove(h){
 const p=await setupFilevine(h),before={state:await h.json('/state',undefined,h.owner),contacts:await h.json('/contacts',undefined,h.owner),jobs:await h.json('/migration',undefined,h.owner),team:await h.json('/team',undefined,h.owner)};
 let plan=await preview(h,p);assert.equal(plan.provider,'Filevine');assert.deepEqual(plan.errors,[]);assert.equal(plan.proposedRoles[0].proposedRole,'owner');assert.equal(plan.proposedRoles[0].applied,false);
 for(const gap of ['Unmapped phone','Unmapped label','Activity.csv','Doc Zipping','finance','tasks','billing'])assert.ok(plan.coverageGaps.some(g=>g.includes(gap)),gap);
 assert.deepEqual(await h.json('/state',undefined,h.owner),before.state);assert.deepEqual(await h.json('/contacts',undefined,h.owner),before.contacts);assert.deepEqual(await h.json('/migration',undefined,h.owner),before.jobs);assert.deepEqual(await h.json('/team',undefined,h.owner),before.team);
 const invalid=structuredClone(p);invalid.mappings.projects.columns.id='Missing header';await h.json('/migration/preview',{package:invalid},h.owner,400);
 for(const [file,from,to,message] of [['Relationships.csv','client-2','missing-contact','unmatched contacts'],['Relationships.csv','Witness','Administrator','supported native matter role'],['Treatments.csv','120.50','invalid money','must be US dollars'],['Treatments.csv','row-2','row-1','duplicate source row'],['Treatments.csv','matter-1','missing-project','unmatched project']]){
  const bad=structuredClone(p),f=bad.csvFiles.find(f=>f.name===file);Object.assign(f,sourceFile(file,Buffer.from(f.contentBase64,'base64').toString().replaceAll(from,to)));if(to==='Administrator')bad.mappings.relationships.values.relation.Administrator='owner';
  const rejected=await preview(h,bad);assert.ok(rejected.errors.some(e=>e.includes(message)),JSON.stringify(rejected.errors));await h.json('/migration/commit',{package:bad,fingerprint:rejected.fingerprint},h.owner,409);
 }
 const secret=structuredClone(p);secret.csvFiles.push(sourceFile('Credentials.csv',csvRows(['Password'],[['synthetic-satchel-1']])));await h.json('/migration/preview',{package:secret},h.owner,400);
 const revised=structuredClone(p);revised.mappingRevision='review-2';await h.json('/migration/commit',{package:revised,fingerprint:plan.fingerprint},h.owner,409);
 const email=['synthetic-satchel-filevine-member','example.test'].join('@');await h.json('/team',{email,name:'Synthetic Satchel Filevine Member',role:'lawyer'},h.owner);await h.json('/team/invite',{email},h.owner);const lawyer=await h.login(email);
 await h.json('/migration/preview',{package:p},lawyer,403);
 let job=await h.json('/migration/commit',{package:p,fingerprint:plan.fingerprint},h.owner);const id=job.job.id;
 for(let i=0;i<3;i++)job=await h.json('/migration/resume',{id},h.owner);
 await h.json('/migration/resume',{id},lawyer,403);await h.json('/migration/resume',{id},h.owner,409);assert.equal((await h.json('/migration/status',{id},h.owner)).job.checkpoint,3);
 const wrong=await h.json('/conflicts',{client:'Wrong client',adverse:job.next.adverse},h.owner);await h.json('/migration/resume',{id,review:{conflictId:wrong.id,confirmed:true,reviewNote:'Wrong source relationship'}},h.owner,409);
 const clear=await h.json('/conflicts',{client:job.next.client,adverse:job.next.adverse},h.owner);job=await h.json('/migration/resume',{id,review:{conflictId:clear.id,confirmed:true,reviewNote:'Principal reviewed exact Filevine project and conflicts.'}},h.owner);
 await h.restart();assert.equal((await h.json('/migration/status',{id},h.owner)).job.checkpoint,4);job=await finishFilevine(h,job);assert.equal(job.job.checkpoint,6);
 const state=await h.json('/state',undefined,h.owner),injury=state.matters.find(m=>m.matter_number==='FV-2020-1'),estate=state.matters.find(m=>m.matter_number==='FV-2020-2');
 const injuryFields=await h.json('/matters/'+injury.id+'/fields',undefined,h.owner),estateFields=await h.json('/matters/'+estate.id+'/fields',undefined,h.owner);
 assert.equal(injuryFields.profile.typeId,p.projectTypes.Injury.typeId);assert.equal(estateFields.profile.typeId,p.projectTypes.Estate.typeId);assert.notEqual(injuryFields.profile.typeId,estateFields.profile.typeId);
 assert.deepEqual(injuryFields.profile.custom,{incident:'2020-01-01',source_court:'Synthetic Satchel Court'});assert.deepEqual(estateFields.profile.custom,{estate_value:25000050});
 assert.deepEqual(injuryFields.collections.map(r=>r.sourceId),['row-1','row-2']);assert.deepEqual(injuryFields.collections[0].values,{provider:'Synthetic Satchel Clinic',cost:12050,visits:'2',reviewed:true,visit_date:'2020-03-01'});assert.deepEqual(injuryFields.collections[1].values,injuryFields.collections[0].values);assert.deepEqual(estateFields.collections.map(r=>r.values.share),['50.5','49.5']);
 const source=await h.json('/migration/source',{id},h.owner);assert.deepEqual(source.source.csvFiles,p.csvFiles);assert.deepEqual(source.source.projectTypes,p.projectTypes);assert.deepEqual(source.source.sections,p.sections);assert.deepEqual(source.source.mappings,p.mappings);
 const history=await h.json('/matters/'+injury.id+'/migration',undefined,h.owner),raw=JSON.parse(history.sources.find(s=>s.kind==='matters').source_json);assert.equal(JSON.parse(raw.source_row)['Unmapped label'],'Retain project metadata');assert.equal(raw.source_mapping_revision,'review-1');
 const graph=(await h.json('/contacts',undefined,h.owner)).contacts;assert.ok(graph.find(c=>c.name==='Synthetic Satchel Filevine Witness').matterRoles.some(r=>r.matter_id===injury.id&&r.role==='witness'));
 assert.deepEqual((await h.json('/state',undefined,h.owner)).members.map(m=>[m.email,m.role]).sort(),[...(before.state.members??[]).map(m=>[m.email,m.role]),[email,'lawyer']].sort());
 await h.json('/matters/'+injury.id+'/fields',undefined,lawyer,404);await h.json('/matters/'+injury.id+'/migration',undefined,lawyer,404);await h.json('/migration/source',{id},lawyer,403);
 await h.json('/matters/'+injury.id+'/access',{email},h.owner);assert.deepEqual((await h.json('/matters/'+injury.id+'/fields',undefined,lawyer)).collections,injuryFields.collections);
 await h.json('/matters/'+injury.id+'/access',{email,remove:true},h.owner);await h.json('/matters/'+injury.id+'/fields',undefined,lawyer,404);
 const replay=await h.json('/migration/commit',{package:p,fingerprint:plan.fingerprint},h.owner);assert.equal(replay.job.id,id);await h.json('/migration/resume',{id},h.owner);assert.equal((await h.json('/state',undefined,h.owner)).matters.length,state.matters.length);
 // Same source IDs in another product or source account remain distinct.
 assert.ok((await preview(h,p)).counts.contacts.imported===3);
 const other=structuredClone(p);other.account='synthetic-satchel-2';other.csvFiles=other.csvFiles.map(f=>sourceFile(f.name,Buffer.from(f.contentBase64,'base64').toString().replaceAll('FV-2020-','FV-OTHER-')));const otherPlan=await preview(h,other);assert.deepEqual(otherPlan.errors,[]);assert.equal(otherPlan.counts.contacts.imported,0);const otherJob=await h.json('/migration/commit',{package:other,fingerprint:otherPlan.fingerprint},h.owner);await finishFilevine(h,otherJob);assert.equal((await h.json('/contacts',undefined,h.owner)).contacts.filter(c=>c.name==='Synthetic Satchel Filevine Client').length,2);
 const delta=structuredClone(p);delta.phase='delta';delta.previousFingerprint=plan.fingerprint;const deltaPlan=await preview(h,delta);const deltaJob=await finishFilevine(h,await h.json('/migration/commit',{package:delta,fingerprint:deltaPlan.fingerprint},h.owner));const reconciliation=await h.json('/migration/reconcile',{id:deltaJob.job.id},h.owner);assert.ok(reconciliation.report.gaps.some(g=>g.includes('Filevine unsupported: Doc Zipping')));await h.json('/migration/cutover',{id:deltaJob.job.id,fingerprint:reconciliation.fingerprint,confirmed:true,declaration:'No cutover until all source history and totals reconcile.'},h.owner,409);
 const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),{harness}=await import('./harness.mjs'),restored=await harness();
 try{await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);assert.deepEqual((await restored.json('/matters/'+injury.id+'/fields',undefined,restored.owner)).collections,injuryFields.collections);assert.deepEqual((await restored.json('/migration/source',{id},restored.owner)).source.csvFiles,p.csvFiles);assert.equal((await restored.json('/migration/commit',{package:p,fingerprint:plan.fingerprint},restored.owner)).job.id,id);}finally{await restored.close();}
 // Removed source rows are fenced; replay is never an erasure recovery door.
 await h.json('/migration/undo',{id:otherJob.job.id},h.owner);const undone=await preview(h,other);assert.ok(undone.errors.some(e=>e.includes('no overwrite or resurrection')));await h.json('/migration/commit',{package:other,fingerprint:undone.fingerprint},h.owner,409);
 await h.json('/team',{email,name:'Synthetic Satchel Filevine Member',role:'lawyer',active:false},h.owner);await h.json('/migration/source',{id},lawyer,403);
}
