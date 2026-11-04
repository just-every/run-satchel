import {useEffect,useState} from 'react';
import {api,dollars,Empty,Field,Form,type Row,type Run} from './common';

const nativePath=(r:Row)=>r.kind==='matter'?'/api/satchel/matters/'+r.id:null;
function Preparation({item,run}:{item:Row;run:Run}){
 const p=item.provenance;
 return <article className="record agent-result" id={'preparation-'+item.id}>
 <h3>{item.inputs.title??item.action} · {item.status}</h3><p>{item.action} · {item.createdAt}</p>
 <p>Native {item.origin}: <code>{item.id}</code>{item.jobId&&<> · Job <code>{item.jobId}</code></>}</p>
 {item.decision&&<p>Human decision: {item.decision.by} · {item.decision.at}</p>}{item.outcome&&<p>Outcome: {item.outcome}</p>}
 {item.result&&<p>Resulting {item.result.kind}: <a href={nativePath(item.result)??'/api/satchel/matters/'+item.matterId+(item.result.kind==='bill'?'/billing':'/deadlines')}><code>{item.result.id}</code></a> · final native review and completion remain separate.</p>}
 <details><summary>Inspect recommendation inputs</summary><pre>{JSON.stringify(p?.inputs??item.inputs,null,2)}</pre></details>
 {!p?<p>Legacy provenance: unknown. Original inputs and decision labels are retained; no agreement, model or source revision is inferred.</p>:<>
 <details><summary>Original provenance and policy</summary>
 <p>Prepared by {p.preparer.name} for {p.sponsor.name} · {p.preparer.channel}</p>
 <p>Preparation policy: {p.policy.revision} · Delegation <code>{p.policy.delegationId??'Unknown'}</code></p>
 <p>Agreement <code>{p.agreement?.id??'Unknown'}</code> · Model revision: {p.agreement?.model_revision??'Unknown'}</p>
 <pre>{JSON.stringify({agreement:p.agreement,policy:p.policy},null,2)}</pre>
 {p.documents.map((d:Row)=><p key={d.documentId}><a href={'/api/satchel/documents/'+d.documentId+'/file?version='+d.version}>{d.name??d.documentId} · version {d.version}</a><br/><code>{d.sha256}</code> · {d.kind}</p>)}
 {!p.documents.length&&<p>No document context selected.</p>}
 {p.entries.map((e:Row)=><p key={e.id}>Work <code>{e.id}</code> · revision <code>{e.revision}</code> · {e.minutes??0} minutes · {dollars(e.amountCents)} · {e.reservedBy?'Reserved when recommended':'Unbilled when recommended'}</p>)}
 </details>
 {item.origin==='proposal'&&<details><summary>Review source accuracy</summary>
 <p>{item.sourceReview?'Current review: '+item.sourceReview.verdict:'Source accuracy unknown until reviewed.'}</p>
 {item.reviews.map((r:Row)=><p key={r.id}>{r.verdict} · {r.reviewed_by} · {r.reviewed_at}<br/>{r.reason}</p>)}
 <Form label="Record source review" submit={b=>run(()=>api('/agent-metrics/'+item.id+'/source-review',{...b,supersedesId:item.sourceReview?.id??null}),'Source review recorded')}>
 <Field name="verdict" label="Source accuracy"><select name="verdict"><option value="accurate">Accurate</option><option value="inaccurate">Inaccurate</option></select></Field><Field name="reason" label="Source review evidence"/>
 </Form></details>}
 {item.status==='accepted'&&item.result?.kind==='bill'&&p.entries.length>0&&<details><summary>Confirm recovered billable work</summary><p>Use only previously unbilled, confirmed work now in a counsel-approved bill. A draft contributes nothing.</p>
 {p.entries.filter((e:Row)=>e.billable&&!e.reservedBy).map((e:Row)=><Form key={e.id} label={'Confirm recovery '+e.id.slice(0,8)} submit={b=>run(()=>api('/agent-metrics/'+item.id+'/recovery',{...b,entryId:e.id,revision:e.revision}),'Recovery attribution recorded')}><p>Work <code>{e.id}</code> · {e.minutes??0} minutes · {dollars(e.amountCents)}</p><Field name="reason" label="Confirmed recovery attribution"/></Form>)}
 </details>}
 </>}
 <details><summary>Native decision trail</summary>{item.audit.map((a:Row)=><p key={a.id}>{a.action} · {a.actor} · {a.at}<br/>{a.detail}<br/><code>{a.id}</code></p>)}{!item.audit.length&&<p>No proposal decision; inspect the retained job outcome.</p>}</details>
 </article>;
}
function CohortForm({metrics,run}:{metrics:Row;run:Run}){
 const [which,setWhich]=useState('baseline'),[milestone,setMilestone]=useState(''),[entryIds,setEntryIds]=useState<string[]>([]),[units,setUnits]=useState<Row>({baseline:[],assisted:[]});
 const candidates=metrics.measurementCandidates??[],selected=candidates.find((d:Row)=>d.id===milestone);
 return <details><summary>Compare measured cohorts</summary><p>Select comparable completed milestones and the actual posted time spent on each. Selection, completion evidence and exact source revisions remain inspectable. Include preparation and human review time in the assisted cohort.</p>
 <label>Cohort<select value={which} onChange={e=>{setWhich(e.target.value);setMilestone('');setEntryIds([]);}}><option value="baseline">Chosen baseline</option><option value="assisted">Agent assisted</option></select></label>
 <label>Completed milestone<select value={milestone} onChange={e=>{setMilestone(e.target.value);setEntryIds([]);}}><option value="">Choose a completed milestone</option>{candidates.filter((d:Row)=>d.assisted===(which==='assisted')).map((d:Row)=><option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
 {selected&&<fieldset><legend>Measured native time</legend>{selected.entries.map((e:Row)=><label className="check" key={e.id}><input type="checkbox" checked={entryIds.includes(e.id)} onChange={event=>setEntryIds(old=>event.target.checked?[...old,e.id]:old.filter(id=>id!==e.id))}/>{e.description} · {e.date} · {e.minutes} minutes</label>)}</fieldset>}
 <button type="button" className="quiet" disabled={!selected||!entryIds.length} onClick={()=>{setUnits((old:Row)=>({...old,[which]:[...old[which],{deadlineId:selected.id,revision:selected.revision,entries:selected.entries.filter((e:Row)=>entryIds.includes(e.id)).map((e:Row)=>({id:e.id,revision:e.revision}))}]}));setMilestone('');setEntryIds([]);}}>Add cohort milestone</button>
 <p>{units.baseline.length} baseline milestones · {units.assisted.length} assisted milestones</p><button className="quiet" type="button" onClick={()=>setUnits({baseline:[],assisted:[]})}>Clear selection</button>
 <Form label="Record measured comparison" submit={b=>run(()=>api('/agent-metrics/comparisons',{...b,...units,requestKey:crypto.randomUUID()}),'Measured comparison recorded')}><Field name="label" label="Comparison title"/><Field name="basis" label="Comparable work and selection rationale"/></Form>
 </details>;
}
export function AgentMetrics({state,run,tick}:{state:Row;run:Run;tick:number}){
 const [metrics,setMetrics]=useState<Row>(),[error,setError]=useState(''),[status,setStatus]=useState('all');
 useEffect(()=>{let current=true;setError('');if(state.actor.role==='owner')api('/agent-metrics').then(value=>{if(current)setMetrics(value);}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[tick,state.actor.role]);
 return <section className="panel agent-metrics"><h2>Agent results</h2>
 {state.actor.role!=='owner'?<p>Only the principal can inspect agent results. Matter access alone does not grant this view.</p>:error?<p role="alert">{error}</p>:!metrics?<p>Loading current results…</p>:<>
 <p>Current permitted records · {metrics.asOf}</p><p>{metrics.rules.decisions}</p>
 <dl className="metric-counts">{Object.entries(metrics.counts).map(([name,count])=><div key={name}><dt>{name[0].toUpperCase()+name.slice(1)}</dt><dd data-count={name}>{String(count)}</dd></div>)}</dl>
 <p>Completed agent-assisted milestones: <strong>{metrics.completedMilestones}</strong> · Confirmed recovered work: <strong>{metrics.recoveredMinutes} minutes</strong>, {dollars(metrics.recoveredBillableCents)} billable value</p><p>{metrics.rules.recovery}</p>
 <details><summary>Inspect completed and recovered sources</summary>{metrics.milestones.map((m:Row)=><p key={m.id}>{m.title} · <code>{m.id}</code> · {m.completedBy} · {m.completedAt}<br/>{m.evidence}</p>)}{metrics.recovered.map((r:Row)=><p key={r.entryId}>Work <code>{r.entryId}</code> · revision <code>{r.revision}</code> · {r.minutes} minutes · {dollars(r.amountCents)}<br/>Bill <code>{r.billId}</code> · {r.confirmedBy}<br/>{r.reason} · {r.reviewedBy}</p>)}</details>
 <p>Source reviews: {metrics.sourceAccuracy.accurate} accurate, {metrics.sourceAccuracy.inaccurate} inaccurate, {metrics.sourceAccuracy.unreviewed} unreviewed. Reviewed accuracy: {metrics.sourceAccuracy.rate===null?'Unknown':(100*metrics.sourceAccuracy.rate).toFixed(1)+'%'}.</p><p>{metrics.rules.accuracy}</p>
 <CohortForm metrics={metrics} run={run}/><p>{metrics.rules.comparison}</p>
 {!metrics.studies.length&&<p>Measured time saved and overdue reduction: unknown. No measured comparison has been recorded.</p>}
 {metrics.studies.map((s:Row)=><article className="record agent-comparison" key={s.id}><h3>{s.label}</h3><p>{s.basis}</p><p>Measured baseline: {s.baselineMinutes} minutes across {s.baseline.length} completed milestones ({s.baselineMinutesPerMilestone.toFixed(2)} minutes each). Assisted: {s.assistedMinutes} minutes across {s.assisted.length} completed milestones.</p><p>Observed minutes saved: <strong>{s.minutesSaved.toFixed(2)}</strong> = baseline minutes per milestone × assisted completed milestones − assisted recorded minutes.</p><p>Overdue completions: baseline {s.baselineOverdue} of {s.baseline.length}; assisted {s.assistedOverdue} of {s.assisted.length}. Reduction: {s.overdueReductionPercentagePoints.toFixed(2)} percentage points. Completion day uses each milestone’s recorded timezone.</p><p>Recorded by {s.reviewedBy} · {s.reviewedAt}</p><details><summary>Inspect cohort source records</summary><pre>{JSON.stringify({baseline:s.baseline,assisted:s.assisted},null,2)}</pre></details></article>)}
 <label>Preparation outcome<select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All permitted outcomes</option>{['pending','accepted','declined','refused'].map(s=><option key={s} value={s}>{s}</option>)}</select></label>
 {!metrics.items.length&&<Empty>No permitted preparations recorded.</Empty>}{metrics.items.filter((i:Row)=>status==='all'||i.status===status).map((item:Row)=><Preparation key={item.id} item={item} run={run}/>)}
 </>}
 </section>;
}
