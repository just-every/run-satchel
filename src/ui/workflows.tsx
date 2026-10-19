import {useEffect,useState} from 'react';
import {api,Empty,Field,Form,type Row,type Run} from './common';
import {formatSteps,parseSteps,stepHelp} from './workflow-steps';
// MATTER-004: firm workflow templates, reviewed rollout, and this matter's runs.
const kindName:Record<string,string>={task:'Task',appointment:'Appointment',document_request:'Document request',draft_document:'Draft document'};
const triggerName=(w:Row,stages:Row[])=>w.trigger==='stage'?`on moving to ${stages.find(s=>s.id===w.triggerStageId)?.name??'a stage'}`:w.trigger==='opening'?'on matter opening':'started by counsel';
function Template({w,stages,run}:{w:Row;stages:Row[];run:Run}){
 const [rollout,setRollout]=useState<Row|null>(null),current=w.versions.find((v:Row)=>v.version===w.currentVersion);
 return <article className="record" aria-label={'Workflow '+w.name}><strong>{w.name} · version {w.currentVersion}</strong><p>{triggerName(w,stages)} · {current.steps.length} steps</p>
  <ol>{current.steps.map((s:Row)=><li key={s.key}>{kindName[s.kind]}: {s.title} · day {s.offsetDays}</li>)}</ol>
  <details><summary>Edit {w.name}</summary><Form label="Save new version" submit={d=>run(()=>api('/workflows/'+w.id+'/versions',{version:w.currentVersion,steps:parseSteps(d.steps),note:d.note}),'Workflow version saved; generated history unchanged')}><label>Steps<textarea name="steps" rows={5} defaultValue={formatSteps(current.steps)}/></label><small>{stepHelp}</small><Field label="Version note" name="note"/></Form></details>
  <button type="button" className="quiet" onClick={()=>run(async()=>setRollout(await api('/workflows/'+w.id+'/rollout')),'Rollout previewed')}>Preview rollout of {w.name}</button>
  {rollout&&(rollout.matters.length?<Form label="Roll out to chosen matters" submit={d=>run(async()=>setRollout(await api('/workflows/'+w.id+'/rollout',{version:rollout.version,matterIds:rollout.matters.filter((m:Row)=>d['m:'+m.matterId]==='on').map((m:Row)=>m.matterId)})),'Rolled out to chosen matters')}>
   {rollout.matters.map((m:Row)=><label className="check" key={m.matterId}><input type="checkbox" name={'m:'+m.matterId}/>{m.matterNumber} · {m.title}: from version {m.fromVersion}, adds {m.newSteps.map((s:Row)=>s.title).join(', ')||'no new steps'}</label>)}</Form>:<p>No open matter runs an older version.</p>)}
 </article>;
}
export function Workflows({matterId,actor,run,tick}:{matterId:string;actor:Row;run:Run;tick:number}){
 const [firm,setFirm]=useState<Row|null>(null),[mine,setMine]=useState<Row|null>(null),[stages,setStages]=useState<Row[]>([]),[preview,setPreview]=useState<Row|null>(null),[docs,setDocs]=useState<Row[]>([]);
 useEffect(()=>{setPreview(null);setMine(null);setDocs([]);},[matterId]);
 useEffect(()=>{let active=true;Promise.all([api('/workflows'),api('/stages')]).then(([w,s])=>{if(active){setFirm(w);setStages(s.stages);}}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;};},[tick]);
 useEffect(()=>{let active=true;if(!matterId)return;Promise.all([api('/matters/'+matterId+'/workflows'),api('/matters/'+matterId+'/documents')]).then(([m,d])=>{if(active){setMine(m);setDocs(d);}}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;};},[matterId,tick]);
 const counsel=['owner','lawyer'].includes(actor.role);
 if(!firm||(matterId&&!mine))return <section className="panel" aria-busy="true"><h2>Workflows</h2><p>Opening workflows…</p></section>;
 const runFor=(id:string)=>mine?.runs.find((r:Row)=>r.id===id);
 return <section className="panel"><h2>Workflows</h2>
  <h3>This matter</h3>{!matterId&&<p>Choose a matter to inspect its workflow runs.</p>}{mine&&!mine.runs.length&&<p>No workflow runs on this matter.</p>}
  {mine?.runs.map((r:Row)=><article className="record" key={r.id} aria-label={`Run ${r.workflowName} ${r.status}`}><strong>{r.workflowName} · version {r.version} · {r.status}</strong><p>Started {r.source==='manual'?'by counsel':r.source==='stage'?'by a stage transition (review below)':'on matter opening (review below)'}</p>
   <ul>{r.steps.map((s:Row)=><li key={s.key}>{kindName[s.kind]}: {s.title} · {s.item?'created':s.approved?'approved, not created':'not approved'}</li>)}</ul>
   {counsel&&r.status!=='stopped'&&<details><summary>Stop {r.workflowName}</summary><Form label="Stop run" submit={d=>run(()=>api('/workflow-runs/'+r.id+'/stop',{revision:r.revision,reason:d.reason}),'Run stopped; completed work kept')}><Field label="Reason" name="reason"/></Form></details>}
   {counsel&&r.status==='stopped'&&<details><summary>Restart {r.workflowName}</summary><Form label="Restart run" submit={d=>run(()=>api('/workflow-runs/'+r.id+'/restart',{revision:r.revision,reason:d.reason}),'Run restarted; only missing steps created')}><Field label="Reason" name="reason"/></Form></details>}
  </article>)}
  {matterId&&counsel&&firm.workflows.length>0&&<Form label="Preview workflow" submit={d=>run(async()=>setPreview(await api('/matters/'+matterId+'/workflow-preview',{workflowId:d.workflowId})),'Workflow previewed')}><Field label="Workflow" name="workflowId"><select name="workflowId">{firm.workflows.map((w:Row)=><option key={w.id} value={w.id}>{w.name}</option>)}</select></Field></Form>}
  {preview&&<Form label="Approve selected steps" submit={d=>run(async()=>{await api('/matters/'+matterId+'/workflow-runs',{workflowId:preview.workflowId,version:preview.version,revision:preview.run?runFor(preview.run.id)?.revision:undefined,steps:preview.steps.filter((s:Row)=>d['s:'+s.key]==='on').map((s:Row)=>s.key)});setPreview(null);},'Selected steps created once')}>
   <p>Preview of {preview.name} version {preview.version}{preview.run?` (${preview.run.status} run)`:''}</p>
   {preview.steps.map((s:Row)=><label className="check" key={s.key}><input type="checkbox" name={'s:'+s.key} disabled={s.created} defaultChecked={s.created}/>{kindName[s.kind]}: {s.title} · {s.date}{s.time?' '+s.time:''}{s.created?' · already created':''}</label>)}</Form>}
  {mine&&mine.documentRequests.length>0&&<><h3>Document requests</h3><p>Recorded in Satchel; nothing is sent to the client.</p>{mine.documentRequests.map((q:Row)=><article className="record" key={q.id} aria-label={'Request '+q.title}><strong>{q.title}</strong><p>{q.status==='open'?`Open · due ${q.dueDate}`:`Received ${q.receivedAt.slice(0,10)} · ${q.receivedBy}`}</p>
   {counsel&&q.status==='open'&&docs.length>0&&<Form label="Mark received" submit={d=>run(()=>api('/document-requests/'+q.id+'/receive',{documentId:d.documentId}),'Request marked received')}><Field label="Received document" name="documentId"><select name="documentId">{docs.map((x:Row)=><option key={x.id} value={x.id}>{x.title}</option>)}</select></Field></Form>}</article>)}</>}
  <h3>Firm workflows</h3>{!firm.workflows.length&&<Empty>No workflows yet.</Empty>}
  {firm.workflows.map((w:Row)=><Template key={w.id} w={w} stages={stages} run={run}/>)}
  {counsel&&<details><summary>New workflow</summary><Form label="Create workflow" submit={d=>run(()=>api('/workflows',{name:d.name,trigger:d.trigger,triggerStageId:d.trigger==='stage'?d.triggerStageId:undefined,steps:parseSteps(d.steps),note:d.note}),'Workflow created')}>
   <Field label="Workflow name" name="name"/><Field label="Starts" name="trigger"><select name="trigger"><option value="manual">When counsel starts it</option><option value="opening">On matter opening (proposed for review)</option><option value="stage">On an approved stage transition (proposed for review)</option></select></Field>
   {stages.length>0&&<Field label="Trigger stage" name="triggerStageId"><select name="triggerStageId">{stages.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
   <label>Steps<textarea name="steps" rows={5} required/></label><small>{stepHelp}</small><Field label="Version note" name="note"/></Form></details>}
 </section>;
}
