import {useEffect,useState} from 'react';
import {api,Empty,Field,Form,type Row,type Run} from './common';
// INTAKE-002: lead pipeline, due follow-ups and the conversion report.
const qualification:Record<string,string>={pending:'pending qualification',qualified:'qualified',not_qualified:'not qualified'};
const percent=(part:number,whole:number)=>whole?`${Math.floor((part*100)/whole+0.5)}%`:'—';
function Lead({l,state,data,counsel,run}:{l:Row;state:Row;data:Row;counsel:boolean;run:Run}){
 return <article className="record" aria-label={'Lead '+l.name}><strong>{l.name} · {l.stageName??'No stage'}</strong>
  <p>{l.assignedEmail??'Unassigned'} · {qualification[l.qualification]} · referred by {l.referralSource}</p>
  <p>{l.nextAction?`Next: ${l.nextAction}${l.nextActionDate?' by '+l.nextActionDate:''}`:'No next action'}{l.overdue?' · overdue':''}{l.consultationOutcome?` · Consultation: ${l.consultationOutcome}`:''}</p>
  {l.stalled.length>0&&<p className="notice">Stalled: {l.stalled.join('; ')}</p>}
  {l.duplicates.map((d:Row)=><div key={d.id}><p className="notice">Possible duplicate of {d.name} ({d.reason})</p>{counsel&&<details><summary>Merge {l.name} into {d.name}</summary><Form label="Merge duplicate" submit={async f=>run(async()=>{const into=await api('/leads/'+d.id);await api('/leads/'+l.id+'/merge',{revision:l.revision,intoId:d.id,intoRevision:into.revision,reason:f.reason});},'Duplicate merged; its source is kept')}><Field label="Reason" name="reason"/></Form></details>}</div>)}
  <details><summary>Update {l.name}</summary><Form label="Save lead" submit={f=>run(()=>api('/leads/'+l.id,{revision:l.revision,stageId:f.stageId,qualification:f.qualification,consultationOutcome:f.consultationOutcome,nextAction:f.nextAction,nextActionDate:f.nextActionDate,...(counsel?{assignedEmail:f.assignedEmail}:{})}),'Lead saved')}>
   <Field label="Stage" name="stageId"><select name="stageId" defaultValue={l.stageId??''}><option value="">No stage</option>{data.stages.map((s:Row)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
   {counsel&&<Field label="Assigned to" name="assignedEmail" type="email" required={false} value={l.assignedEmail??''}/>}
   <Field label="Qualification" name="qualification"><select name="qualification" defaultValue={l.qualification}>{Object.entries(qualification).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></Field>
   <Field label="Consultation outcome" name="consultationOutcome" required={false} value={l.consultationOutcome}/><Field label="Next action" name="nextAction" required={false} value={l.nextAction}/><Field label="Next action date" name="nextActionDate" type="date" required={false} value={l.nextActionDate??''}/></Form></details>
  <details><summary>Mark {l.name} lost</summary><Form label="Mark lost" submit={f=>run(()=>api('/leads/'+l.id,{revision:l.revision,lostReason:f.lostReason}),'Lead marked lost')}><Field label="Reason the lead was lost" name="lostReason"/></Form></details>
  {state.matters.length>0&&<details><summary>Convert {l.name}</summary><Form label="Link opened matter" submit={f=>run(()=>api('/leads/'+l.id,{revision:l.revision,matterId:f.matterId}),'Lead converted')}><Field label="Matter opened after conflict review" name="matterId"><select name="matterId">{state.matters.map((m:Row)=><option key={m.id} value={m.id}>{m.matter_number} · {m.title}</option>)}</select></Field></Form></details>}
 </article>;
}
export function Leads({state,run,tick}:{state:Row;run:Run;tick:number}){
 const [data,setData]=useState<Row|null>(null),[report,setReport]=useState<Row|null>(null),role=state.actor.role,counsel=['owner','lawyer'].includes(role);
 useEffect(()=>{let active=true;if(role==='trust_officer')return;Promise.all([api('/leads'),api('/leads/report')]).then(([d,r])=>{if(active){setData(d);setReport(r);}}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;};},[tick,role]);
 if(role==='trust_officer')return null;
 if(!data||!report)return <section className="panel" aria-busy="true"><h2>Lead pipeline</h2><p>Opening leads…</p></section>;
 return <section className="panel"><h2>Lead pipeline</h2>
  <h3>Your due follow-ups</h3>{!data.dueQueue.length?<p>Nothing due today.</p>:<ul aria-label="Your due follow-ups">{data.dueQueue.map((l:Row)=><li key={l.id}>{l.name}: {l.nextAction} · {l.nextActionDate}{l.overdue?' · overdue':' · due today'}</li>)}</ul>}
  <h3>Open leads</h3>{!data.leads.length&&<Empty>No open leads.</Empty>}{data.leads.map((l:Row)=><Lead key={l.id} l={l} state={state} data={data} counsel={counsel} run={run}/>)}
  <details><summary>Add a lead</summary><Form label="Add lead" submit={f=>run(()=>api('/leads',{name:f.name,email:f.email,phone:f.phone,summary:f.summary,referralSource:f.referralSource,stageId:f.stageId,nextAction:f.nextAction,nextActionDate:f.nextActionDate||undefined,...(counsel?{assignedEmail:f.assignedEmail}:{})}),'Lead added')}>
   <Field label="Prospect name" name="name"/><Field label="Email" name="email" type="email" required={false}/><Field label="Phone" name="phone" required={false}/><Field label="Inquiry summary" name="summary"/><Field label="Referral source" name="referralSource"/>
   <Field label="Stage" name="stageId"><select name="stageId"><option value="">No stage</option>{data.stages.map((s:Row)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
   {counsel&&<Field label="Assigned to" name="assignedEmail" type="email" required={false}/>}<Field label="Next action" name="nextAction" required={false}/><Field label="Next action date" name="nextActionDate" type="date" required={false}/></Form></details>
  {counsel&&<details><summary>Edit lead stages</summary><p>{data.stages.map((s:Row)=>s.name).join(' → ')||'No stages yet.'}</p><Form key={data.stages.length} label="Add stage" submit={f=>run(()=>api('/lead-stages',{name:f.name,position:Number(f.position)}),'Lead stage added')}><Field label="Stage name" name="name"/><Field label="Position" name="position" type="number" value={data.stages.length}/></Form></details>}
  <h3>Conversion report</h3><p>{report.total} leads · {report.converted} converted ({percent(report.converted,report.total)}) · {report.lost} lost · merged duplicates not counted</p>
  <div className="table-scroll"><table aria-label="Conversion by referral source"><thead><tr><th>Referral source</th><th>Leads</th><th>Converted</th><th>Lost</th></tr></thead><tbody>{report.bySource.map((s:Row)=><tr key={s.name}><td>{s.name}</td><td>{s.leads}</td><td>{s.converted} ({percent(s.converted,s.leads)})</td><td>{s.lost}</td></tr>)}</tbody></table></div>
  {report.stalled.length>0&&<><h3>Stalled leads</h3><ul>{report.stalled.map((s:Row)=><li key={s.id}>{s.name}: {s.reasons.join('; ')}</li>)}</ul></>}
  {report.lostReasons.length>0&&<><h3>Lost leads</h3><ul>{report.lostReasons.map((s:Row)=><li key={s.id}>{s.name}: {s.reason}</li>)}</ul></>}
 </section>;
}
