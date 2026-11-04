import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
import {authorizeAgent} from './agent-fixture.mjs';
import {exemptTaxReview} from './tax-fixture.mjs';

const address=n=>['synthetic-satchel-'+n,'example.test'].join('@');
const deadline=(matterId,title,date='2099-12-01')=>({matterId,title,date,timezone:'America/New_York',source:'Practitioner-recorded native source; independent review required'});
const entry=(h,matterId,minutes,description)=>h.json('/matters/'+matterId+'/entries',{kind:'time',date:'2026-10-15',description,minutes,rateCents:12000},h.owner);
const unit=(d,entries)=>({deadlineId:d.id,revision:d.revision,entries:entries.map(e=>({id:e.id,revision:e.revision}))});
async function complete(h,d){const confirmed=await h.json('/deadlines/'+d.id+'/confirm',{revision:d.revision,note:'Source and legal date independently reviewed'},h.owner);return h.json('/deadlines/'+d.id+'/complete',{revision:confirmed.revision,evidence:'Completed native milestone; retained delivery receipt synthetic-satchel-31'},h.owner);}

// Shared disposable records for the public API journey and the browser proof.
export async function agentMetricsFixture(h,matterId){
 const m=matterId?{id:matterId}:await open(h,'Agent results matter','Synthetic metrics client','Synthetic metrics adverse'),base='/matters/'+m.id;
 const source=await h.json(base+'/documents',{name:'Measured preparation source.txt',mime:'text/plain',visibility:'matter',contentBase64:Buffer.from('synthetic-satchel-30 original provenance').toString('base64')},h.owner),key=await h.json('/keys',{label:'Measured preparation assistant'},h.owner),grant=await authorizeAgent(h,key,m.id,{delegation:{sources:[{documentId:source.id,version:1,kind:'matter'}]}});
 const prepare=payload=>h.json('/agent/prepare-deadline',payload,'',200,grant.auth);
 const pending=await prepare(deadline(m.id,'Pending evidence review')),accepted=await prepare(deadline(m.id,'Accepted milestone preparation')),declined=await prepare(deadline(m.id,'Declined source recommendation'));
 const native=await h.json('/proposals/'+accepted.id+'/decide',{decision:'approve'},h.owner);
 await h.json('/proposals/'+declined.id+'/decide',{decision:'decline',reason:'Human override: original source does not establish this date'},h.owner);
 const work=await entry(h,m.id,30,'Confirmed previously unbilled client work'),billProposal=await h.json('/agent/prepare-bill',{matterId:m.id,title:'Recovered work preparation',date:'2026-10-15',entryIds:[work.id]},'',200,grant.auth),bill=await h.json('/proposals/'+billProposal.id+'/decide',{decision:'approve'},h.owner);
 const jobBody={action:'prepare-deadline',requestKey:'synthetic-satchel-32',dueAt:'2099-01-01T00:00:00.000Z',payload:deadline(m.id,'Refused queued preparation')},queued=await h.json('/agent/jobs',jobBody,'',200,grant.auth);
 await h.json('/agent/jobs',jobBody,'',200,grant.auth);
 await h.json('/agent/prepare-deadline',{...deadline(m.id,'Refused authority field'),authority:'principal'},'',403,grant.auth);
 return {m,base,source,key,grant,pending,accepted,declined,native,work,billProposal,bill,queued};
}

export async function proveAgentMetrics(){
 const h=await harness();try{
  const f=await agentMetricsFixture(h),get=()=>h.json('/agent-metrics',undefined,h.owner),before=await get();
  assert.deepEqual(before.counts,{pending:2,accepted:2,declined:1,refused:1});
  assert.equal(before.items.length,6);assert.equal(before.completedMilestones,0);assert.equal(before.recoveredMinutes,0);assert.equal(before.recoveredBillableCents,0);assert.deepEqual(before.studies,[]);assert.equal(before.sourceAccuracy.rate,null);
  const attribution={entryId:f.work.id,revision:f.work.revision,reason:'Principal confirmed this recommendation recovered omitted confirmed work'};
  await h.json('/agent-metrics/'+f.billProposal.id+'/recovery',attribution,h.owner,409);
  const original=before.items.find(i=>i.id===f.pending.id).provenance,originalHash=f.source.versions[0].sha256;
  assert.deepEqual(original.inputs,f.pending.payload);assert.equal(original.agreement.id,f.grant.agreement.id);assert.equal(original.agreement.model_revision,'synthetic-satchel-1');assert.equal(original.policy.delegationId,f.grant.delegation.id);assert.ok(original.policy.revision);assert.equal(original.documents[0].documentId,f.source.id);assert.equal(original.documents[0].documentRevision,f.source.revision);assert.equal(original.documents[0].version,1);assert.equal(original.documents[0].sha256,originalHash);assert.ok(!JSON.stringify(original).includes('original provenance'),'No original bytes are retained in metrics');
  const preparedAudit=(await h.json('/audit?action=proposal.prepared&matterId='+f.m.id,undefined,h.owner)).records.find(a=>a.objectId===f.pending.id);assert.deepEqual(preparedAudit.evidence.record.preparationProvenance,original);
  const changed=await h.json(f.base+'/documents',{documentId:f.source.id,revision:f.source.revision,name:f.source.title,mime:'text/plain',visibility:'matter',contentBase64:Buffer.from('synthetic-satchel-33 changed provenance').toString('base64')},h.owner);
  await h.json('/agent-agreements',{keyId:f.key.id,processor:'Later native preparation',modelRevision:'synthetic-satchel-34',agreementReference:'synthetic-satchel-35',retentionTerms:'Firm records only',trainingTerms:'No training',trainingAllowed:false,expiresAt:'2099-12-31T00:00:00.000Z',confirmed:true},h.owner);
  await h.json('/agent-agreements/'+f.grant.agreement.id+'/withdraw',{reason:'Replace processing terms'},h.owner);
  await h.json('/keys/'+f.key.id+'/revoke',{},h.owner);await h.json('/agent/context',undefined,'',401,f.grant.auth);
  await h.scheduled('2099-01-02T00:00:00.000Z');
  let report=await get();assert.deepEqual(report.counts,{pending:1,accepted:2,declined:1,refused:2});assert.equal(report.items.length,Object.values(report.counts).reduce((a,b)=>a+b,0));const rejected=report.items.find(i=>i.id===f.declined.id);assert.equal(rejected.decision.by,(await h.json('/me',undefined,h.owner)).email);assert.ok(rejected.audit.some(a=>a.action==='proposal.declined'&&a.detail==='Human override: original source does not establish this date'));assert.equal(report.items.find(i=>i.id===f.billProposal.id).result.id,f.bill.id);assert.deepEqual(report.items.find(i=>i.id===f.pending.id).provenance,original);assert.equal(report.items.find(i=>i.id===f.queued.id).outcome,'agreement_withdrawn');
  const sourceReview={verdict:'inaccurate',reason:'Reviewed exact original: recommendation interpreted the source incorrectly'},review=await h.json('/agent-metrics/'+f.declined.id+'/source-review',sourceReview,h.owner);
  await h.json('/agent-metrics/'+f.declined.id+'/source-review',{verdict:'accurate',reason:'Stale source decision'},h.owner,409);
  await h.json('/agent-metrics/'+f.declined.id+'/source-review',{verdict:'accurate',reason:'Append-only correction after independent source review',supersedesId:review.id},h.owner);
  await h.json('/agent-metrics/'+f.pending.id+'/source-review',sourceReview,h.owner);
  report=await get();assert.deepEqual(report.sourceAccuracy,{accurate:1,inaccurate:1,unreviewed:2,rate:0.5});assert.equal(report.items.find(i=>i.id===f.declined.id).reviews.length,2);
  const completed=await complete(h,f.native);assert.equal((await get()).completedMilestones,1);
  const approved=await h.json('/bills/'+f.bill.id+'/approve',{revision:f.bill.revision,reviewNote:'Confirmed work and amount independently reviewed',taxReviewId:await exemptTaxReview(h,'/bills/'+f.bill.id+'/approve')},h.owner);
  await h.json('/agent-metrics/'+f.billProposal.id+'/recovery',{...attribution,revision:'synthetic-satchel-36'},h.owner,409);
  await h.json('/agent-metrics/'+f.billProposal.id+'/recovery',attribution,h.owner);await h.json('/agent-metrics/'+f.billProposal.id+'/recovery',attribution,h.owner);
  report=await get();assert.equal(report.recoveredMinutes,30);assert.equal(report.recoveredBillableCents,6000);assert.equal(report.recovered.length,1);assert.equal(report.recovered[0].entryId,f.work.id);assert.equal(report.recovered[0].billId,approved.id);assert.equal(report.recovered[0].revision,f.work.revision);
  const baseline1=await complete(h,await h.json(f.base+'/deadlines',deadline(f.m.id,'Baseline milestone one','2000-01-01'),h.owner)),baseline2=await complete(h,await h.json(f.base+'/deadlines',deadline(f.m.id,'Baseline milestone two','2000-01-02'),h.owner)),baseTime1=await entry(h,f.m.id,60,'Baseline measured work one'),baseTime2=await entry(h,f.m.id,40,'Baseline measured work two'),assistedTime=await entry(h,f.m.id,20,'Measured assisted preparation and review');
  const comparison={requestKey:'synthetic-satchel-37',label:'Comparable source review cohort',basis:'Same native source-review milestone; actual posted preparation and review time; observational selection, no causal claim',baseline:[unit(baseline1,[baseTime1]),unit(baseline2,[baseTime2])],assisted:[unit(completed,[assistedTime])]};
  await h.json('/agent-metrics/comparisons',{...comparison,baseline:[unit(completed,[assistedTime])]},h.owner,409);
  await h.json('/agent-metrics/comparisons',{...comparison,baseline:[{...comparison.baseline[0],revision:'synthetic-satchel-38'}]},h.owner,409);
  await h.json('/agent-metrics/comparisons',{...comparison,assisted:[unit(f.native,[assistedTime])]},h.owner,409);
  const study=await h.json('/agent-metrics/comparisons',comparison,h.owner);assert.equal((await h.json('/agent-metrics/comparisons',comparison,h.owner)).id,study.id);await h.json('/agent-metrics/comparisons',{...comparison,basis:'Changed replay'},h.owner,409);
  report=await get();const measured=report.studies[0];assert.equal(measured.baselineMinutes,100);assert.equal(measured.assistedMinutes,20);assert.equal(measured.baselineMinutesPerMilestone,50);assert.equal(measured.minutesSaved,30);assert.equal(measured.baselineOverdue,2);assert.equal(measured.assistedOverdue,0);assert.equal(measured.overdueReductionPercentagePoints,100);assert.equal(measured.baseline[0].entries[0].revision,baseTime1.revision);assert.equal(measured.assisted[0].proposalId,f.accepted.id);assert.equal(measured.assisted[0].completionEvidence,completed.completionEvidence);
  // A slower observed cohort reports a negative difference rather than hiding it.
  const slower=await entry(h,f.m.id,75,'Measured slower assisted review');await h.json('/agent-metrics/comparisons',{...comparison,requestKey:'synthetic-satchel-39',assisted:[unit(completed,[slower])]},h.owner);assert.equal((await get()).studies[1].minutesSaved,-25);
  for(const role of ['lawyer','assistant','billing','accountant','trust_officer','client']){
   const email=address(role);await h.json('/team',{email,name:'Synthetic metrics reader',role},h.owner);await h.json('/team/invite',{email},h.owner);const cookie=await h.login(email);
   await h.json('/agent-metrics',undefined,cookie,403);await h.json('/agent-metrics/'+f.pending.id+'/source-review',sourceReview,cookie,403);await h.json('/agent-metrics/'+f.billProposal.id+'/recovery',attribution,cookie,403);await h.json('/agent-metrics/comparisons',{...comparison,requestKey:'synthetic-satchel-'+role},cookie,403);
  }
  await h.json('/agent-metrics',undefined,'',401);await h.json('/agent-metrics',undefined,'',401,f.grant.auth);
  assert.equal((await get()).studies.length,2);
  const custodian=address(40);await h.json('/team',{email:custodian,name:'Metric wall custodian',role:'lawyer'},h.owner);await h.json('/team/invite',{email:custodian},h.owner);const inside=await h.login(custodian);await h.json(f.base+'/access',{email:custodian},h.owner);
  const wall=await h.json(f.base+'/wall',{custodianEmail:custodian,members:[],reason:'Current ethical screen excludes the principal',revision:null},h.owner);
  report=await get();assert.deepEqual(report.counts,{pending:0,accepted:0,declined:0,refused:0});assert.equal(report.completedMilestones,0);assert.equal(report.recoveredMinutes,0);assert.equal(report.sourceAccuracy.rate,null);assert.deepEqual(report.studies,[]);assert.ok(!JSON.stringify(report).includes(f.source.id));assert.ok(!JSON.stringify(report).includes(f.m.id));await h.json('/agent-metrics/'+f.pending.id+'/source-review',sourceReview,h.owner,404);await h.json('/agent-metrics/'+f.billProposal.id+'/recovery',attribution,h.owner,404);await h.json('/agent-metrics/comparisons',comparison,h.owner,404);
  await h.json(f.base+'/wall',{custodianEmail:custodian,members:[(await h.json('/me',undefined,h.owner)).email],reason:'Admit principal to retained review history',revision:wall.revision},inside);
  const beforeRestart=await get();await h.restart();report=await get();assert.deepEqual(report.items,beforeRestart.items);assert.deepEqual(report.studies,beforeRestart.studies);assert.deepEqual(report.recovered,beforeRestart.recovered);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),restored=await harness();try{
   await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);const recovered=await restored.json('/agent-metrics',undefined,restored.owner);assert.deepEqual(recovered.items,beforeRestart.items);assert.deepEqual(recovered.studies,beforeRestart.studies);assert.deepEqual(recovered.recovered,beforeRestart.recovered);await restored.json('/agent/context',undefined,'',401,f.grant.auth);
  }finally{await restored.close();}
  // A legacy preparation has no captured provenance. Restore valid historical
  // archive input through the public door rather than editing native storage.
  const records=archive.trim().split('\n').map(JSON.parse),manifest=records[0];
  manifest.tables.find(t=>t.name==='s_agent_provenance').count=0;
  const {makePart}=await import('@runeditrun/rer/modules/portability'),{ArchiveVerifier,ContentVerifier}=await import('../../node_modules/@runeditrun/rer/modules/portability/format.mjs');
  const groups=records.filter(r=>r.kind==='part').map(p=>p.items.filter(i=>i.kind!=='row'||i.table!=='s_agent_provenance')).filter(items=>items.length);manifest.partCount=groups.length;
  const integrity=new ArchiveVerifier(manifest),content=new ContentVerifier(manifest),parts=[];
  for(const items of groups){const part=await makePart(parts.length,items);parts.push(part);integrity.add(part);for(const item of items)content.add(item);}
  const legacyArchive=[manifest,...parts,{kind:'closing',partCount:parts.length,archiveHash:integrity.digest(),contentHash:content.digest()}].map(JSON.stringify).join('\n')+'\n',legacy=await harness();
  try{await legacy.json('/restore',{archive:legacyArchive,confirm:'RESTORE'},legacy.owner);const old=(await legacy.json('/agent-metrics',undefined,legacy.owner)).items.find(i=>i.id===f.pending.id);assert.equal(old.provenance,null);assert.deepEqual(old.inputs,f.pending.payload);assert.equal(old.status,'pending');await legacy.json('/agent-metrics/'+f.pending.id+'/source-review',sourceReview,legacy.owner,409);}finally{await legacy.close();}
  await h.json('/documents/'+f.source.id+'/erase',{confirm:f.source.title,reason:'Erase originals while retaining bounded decision provenance'},h.owner);await h.json('/documents/'+f.source.id+'/file?version=1',undefined,h.owner,404);assert.deepEqual((await get()).items.find(i=>i.id===f.pending.id).provenance,original);
  assert.equal(changed.currentVersion,2);
 }finally{await h.close();}
}
