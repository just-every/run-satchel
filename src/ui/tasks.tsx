import {useEffect,useState,type FormEvent} from 'react';
import {api,Empty,Field,Form,type Row,type Run} from './common';
// MATTER-003: dependent matter work with history; legal dates stay with their deadlines.
function Options({people,blank}:{people:Row[];blank:string}){return <>{[<option key="" value="">{blank}</option>,...people.map(p=><option key={p.email} value={p.email}>{p.name}</option>)]}</>;}
function Task({t,people,run,selected,toggle}:{t:Row;people:Row[];run:Run;selected:boolean;toggle:()=>void}){
 const name=(email:string)=>people.find(p=>p.email===email)?.name??email;
 return <article className="record"><strong>{t.title}</strong><small>{t.status==='done'?`Done by ${name(t.completedBy)}`:`Owner: ${t.owner?name(t.owner):'unassigned'}`} · <span className="badge">{t.priority}</span>{t.recurrence!=='none'&&` · repeats ${t.recurrence}`}</small>
  <p>{t.legalDate?`Due with legal date ${t.dueDate} (${t.legalDate.title}, ${t.legalDate.status})`:t.dueDate?`Due ${t.dueDate}`:'No due date'}</p>
  {t.coverage&&<p>{name(t.coverage.absent)} is absent{t.coverage.coveredBy?`; covered by ${name(t.coverage.coveredBy)}`:''}. Reassign to keep it moving.</p>}
  {t.blockers.length>0&&<p>Blocked by: {t.blockers.map((b:Row)=>`${b.title}${b.kind==='subtask'?' (subtask)':''}`).join(', ')}</p>}
  {t.status==='done'&&<p>Evidence: {t.evidence}</p>}
  <details><summary>History for {t.title}</summary>{t.history.map((e:Row,n:number)=><small key={n}>{e.kind} by {e.actor}{e.detail.reason?`: ${e.detail.reason}`:''}<br/></small>)}</details>
  {t.status==='open'&&<>
   <label className="check"><input type="checkbox" checked={selected} onChange={toggle}/>Select {t.title}</label>
   <Form label={`Reassign ${t.title}`} submit={b=>run(()=>api('/tasks/'+t.id+'/assign',{...b,revision:t.revision}),'Task reassigned')}><Field name="email" label="New owner"><select name="email" required><Options people={people} blank="Choose a person"/></select></Field><Field name="reason" label="Reassignment reason"/></Form>
   {!t.blockers.length&&<Form label={`Complete ${t.title}`} submit={b=>run(()=>api('/tasks/'+t.id+'/complete',b),'Task completed')}><Field name="evidence" label="Completion evidence"/></Form>}
  </>}</article>;
}
export function Tasks({matterId,actor,members,run,tick}:{matterId:string;actor:Row;members:Row[];run:Run;tick:number}){
 const [tasks,setTasks]=useState<Row[]>([]),[deadlines,setDeadlines]=useState<Row[]>([]),[notes,setNotes]=useState<Row[]>([]),[selected,setSelected]=useState<string[]>([]),[skipped,setSkipped]=useState<Row[]>([]);
 useEffect(()=>{setTasks([]);setSelected([]);setSkipped([]);},[matterId]);
 useEffect(()=>{api('/notifications').then(setNotes).catch(e=>run(async()=>{throw e;}));if(matterId)Promise.all([api('/matters/'+matterId+'/tasks'),api('/matters/'+matterId+'/deadlines')]).then(([t,d])=>{setTasks(t);setDeadlines(d.filter((x:Row)=>['proposed','confirmed'].includes(x.status)));}).catch(e=>run(async()=>{throw e;}));},[matterId,tick]);
 const people=[...(actor.role==='owner'?[{email:actor.email,name:actor.name}]:[]),...members.filter(m=>m.active)];
 const open=tasks.filter(t=>t.status==='open');
 const create=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const form=e.currentTarget,f=new FormData(form),v=Object.fromEntries(f) as Row;await run(async()=>{await api('/matters/'+matterId+'/tasks',{title:v.title,priority:v.priority,recurrence:v.recurrence,ownerEmail:v.ownerEmail||undefined,dueDate:v.dueDate||undefined,deadlineId:v.deadlineId||undefined,parentId:v.parentId||undefined,prerequisites:f.getAll('prerequisites')});form.reset();},'Task added');};
 const bulk=async(b:Row)=>run(async()=>{const r=await api('/matters/'+matterId+'/tasks/bulk',{taskIds:selected,ownerEmail:b.ownerEmail||undefined,priority:b.priority||undefined,shiftDays:b.shiftDays?Number(b.shiftDays):undefined,reason:b.reason});setSkipped(r.skipped);setSelected([]);},'Selected tasks updated');
 return <div className="grid">
  <section className="panel"><h2>Your notifications</h2>{!notes.length&&<Empty>No notifications.</Empty>}{notes.map(n=><p key={n.id}>{n.message} {n.readAt?<small>read</small>:<button type="button" onClick={()=>run(()=>api('/notifications/'+n.id+'/read',{}),'Marked read')}>Mark read</button>}</p>)}</section>
  {!matterId?<Empty>Choose or open a matter first.</Empty>:<section className="panel"><h2>Matter tasks</h2><p>Prerequisites and open subtasks block completion. A task tied to a legal date always shows that deadline’s date; reassignment and bulk changes never move it.</p>
   <form onSubmit={create} aria-label="Add task"><Field name="title" label="Task title"/><Field name="ownerEmail" label="Owner"><select name="ownerEmail"><Options people={people} blank="Unassigned"/></select></Field>
    <Field name="priority" label="Priority"><select name="priority" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field>
    <Field name="dueDate" label="Due date" type="date" required={false}/>
    <Field name="deadlineId" label="Or tie to a legal date"><select name="deadlineId"><option value="">No legal date</option>{deadlines.map(d=><option key={d.id} value={d.id}>{d.date} · {d.title}</option>)}</select></Field>
    <Field name="parentId" label="Subtask of"><select name="parentId"><option value="">Top-level task</option>{open.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
    <Field name="recurrence" label="Repeats"><select name="recurrence" defaultValue="none"><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></Field>
    {open.length>0&&<fieldset><legend>Prerequisites</legend>{open.map(t=><label key={t.id} className="check"><input type="checkbox" name="prerequisites" value={t.id}/>{t.title}</label>)}</fieldset>}
    <button type="submit">Add task</button></form>
   {!tasks.length&&<Empty>No tasks yet.</Empty>}
   {tasks.map(t=><Task key={t.id} t={t} people={people} run={run} selected={selected.includes(t.id)} toggle={()=>setSelected(s=>s.includes(t.id)?s.filter(x=>x!==t.id):[...s,t.id])}/>)}
   {selected.length>0&&<Form label="Apply to selected tasks" submit={bulk}><p>{selected.length} selected</p><Field name="ownerEmail" label="New owner for all"><select name="ownerEmail"><Options people={people} blank="Keep owners"/></select></Field><Field name="priority" label="New priority for all"><select name="priority"><option value="">Keep priorities</option><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field><Field name="shiftDays" label="Shift due dates by days" type="number" required={false}/><Field name="reason" label="Reason for the change"/></Form>}
   {skipped.length>0&&<p role="note">Dates not moved: {skipped.map(s=>`${s.title} (${s.reason})`).join('; ')}</p>}
  </section>}
 </div>;
}
