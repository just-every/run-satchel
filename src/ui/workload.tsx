import {useEffect,useState,type FormEvent} from 'react';
import {api,Empty,Field,type Row,type Run} from './common';
// MATTER-006: workload for the principal; handoffs for their receivers to acknowledge.
function Work({w}:{w:Row}){return <li>{w.due??'no date'} · {w.kind} · Matter {w.matterNumber} · {w.title}{w.overdue&&<span className="badge">overdue</span>}</li>;}
export function Workload({actor,state,run,tick}:{actor:Row;state:Row;run:Run;tick:number}){
 const [load,setLoad]=useState<Row>(),[handoffs,setHandoffs]=useState<Row[]>([]);
 const principal=actor.role==='owner';
 useEffect(()=>{api('/handoffs').then(setHandoffs).catch(e=>run(async()=>{throw e;}));if(principal)api('/workload').then(setLoad).catch(e=>run(async()=>{throw e;}));},[tick]);
 const mine=handoffs.filter(h=>h.to===actor.email&&!h.acknowledgedAt);
 const handOff=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form);await run(async()=>{await api('/handoffs',{from:f.get('from'),to:f.get('to'),reason:f.get('reason'),matterIds:f.getAll('matterIds'),kinds:f.getAll('kinds')});form.reset();},'Handoff recorded');};
 const name=(email:string)=>load?.people.find((p:Row)=>p.email===email)?.name??email;
 return <div className="grid">
  {mine.length>0&&<section className="panel"><h2>Handoffs to you</h2>{mine.map(h=><article className="record" key={h.id}><strong>From {name(h.from)}</strong><p>{h.reason}</p><ul>{h.items.map((i:Row)=><li key={i.kind+i.id}>{i.kind} · {i.title}</li>)}</ul><button type="button" onClick={()=>run(()=>api('/handoffs/'+h.id+'/acknowledge',{}),'Handoff acknowledged')}>Acknowledge handoff from {name(h.from)}</button></article>)}</section>}
  {principal&&load&&<section className="panel"><h2>Workload and coverage</h2><p>Due soon means overdue or due within {load.soonDays} days of {load.today} in the firm’s timezone.</p>
   {load.people.map((p:Row)=><article className="record" key={p.email}><strong>{p.name}</strong><small>{p.role} · {p.open} open · {p.overdue} overdue{p.pendingHandoffs>0&&` · ${p.pendingHandoffs} handoff awaiting acknowledgment`}</small>
    {p.absences.map((a:Row)=><p key={a.id}>Absent {a.startDate} to {a.endDate}; {a.coveredBy?`covered by ${name(a.coveredBy)}`:'no coverage'}</p>)}
    {p.dueSoon.length>0&&<ul>{p.dueSoon.map((w:Row)=><Work key={w.kind+w.id} w={w}/>)}</ul>}</article>)}
   <h3>Imminent work without an owner</h3>{load.imminentUnowned.length?<ul>{load.imminentUnowned.map((w:Row)=><Work key={w.kind+w.id} w={w}/>)}</ul>:<p>Every imminent task and deadline has an active owner.</p>}
   <h3>Unowned matters</h3>{load.unownedMatters.length?<ul>{load.unownedMatters.map((m:Row)=><li key={m.id}>Matter {m.matterNumber} · {m.title}</li>)}</ul>:<p>None.</p>}
   <h3>Hand off responsibilities</h3>
   <form onSubmit={handOff} aria-label="Hand off work"><Field name="from" label="Hand off from"><select name="from" required defaultValue="">{[<option key="" value="" disabled>Choose a person</option>,...load.people.map((p:Row)=><option key={p.email} value={p.email}>{p.name}</option>)]}</select></Field>
    <Field name="to" label="Hand off to"><select name="to" required defaultValue="">{[<option key="" value="" disabled>Choose a person</option>,...load.people.map((p:Row)=><option key={p.email} value={p.email}>{p.name}</option>)]}</select></Field>
    <fieldset><legend>Matters</legend>{state.matters.map((m:Row)=><label key={m.id} className="check"><input type="checkbox" name="matterIds" value={m.id}/>{m.matter_number} · {m.title}</label>)}</fieldset>
    <fieldset><legend>Responsibilities</legend><label className="check"><input type="checkbox" name="kinds" value="task" defaultChecked/>Open tasks</label><label className="check"><input type="checkbox" name="kinds" value="deadline" defaultChecked/>Deadline ownership</label></fieldset>
    <Field name="reason" label="Handoff reason"/><p>The receiver must already have access to each matter; a handoff grants none.</p><button type="submit">Hand off</button></form>
   {handoffs.length>0&&<><h3>Handoff history</h3>{handoffs.map(h=><p key={h.id}>{name(h.from)} to {name(h.to)} · {h.items.length} items · {h.acknowledgedAt?'acknowledged':'awaiting acknowledgment'}</p>)}</>}
  </section>}
  {!principal&&!mine.length&&<Empty>No handoffs waiting for you.</Empty>}
 </div>;
}
