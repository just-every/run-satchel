import {useEffect,useState,type FormEvent} from 'react';
import {api,Empty,Field,Form,today,type Row,type Run} from './common';
// CAL-001: matter appointments sit beside, never inside, legal deadlines.
const when=(o:Row,zone:string)=>`${o.date} ${o.time} ${zone}`;
function plus(day:string,days:number){const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function Occurrences({a,run,canChange}:{a:Row;run:Run;canChange:boolean}){
 return <ol className="occurrences">{a.occurrences.map((o:Row)=><li key={o.index}><span>{when(o,a.timezone)}</span> <span className="badge">{o.status}</span>{o.status==='moved'&&<small> moved from {o.original.date} {o.original.time}</small>}{o.history.map((c:Row)=><small key={c.id}><br/>{c.kind} by {c.by}: {c.reason}</small>)}
  {canChange&&o.status!=='cancelled'&&<details><summary>Change occurrence {o.index+1}</summary>
   <Form label={`Cancel occurrence ${o.index+1}`} danger submit={b=>run(()=>api('/appointments/'+a.id+'/occurrences/'+o.index+'/cancel',b),'Occurrence cancelled')}><Field name="reason" label="Cancellation reason"/></Form>
   <Form label={`Move occurrence ${o.index+1}`} submit={b=>run(()=>api('/appointments/'+a.id+'/occurrences/'+o.index+'/move',b),'Occurrence moved')}><Field name="date" label="New date" type="date" value={o.date}/><Field name="time" label="New start time" type="time" value={o.time}/><Field name="reason" label="Reason for the move"/></Form>
  </details>}</li>)}</ol>;
}
function Appointment({a,run,canChange}:{a:Row;run:Run;canChange:boolean}){
 return <article className="record"><strong>{a.title}</strong><small>Matter {a.matterNumber}</small><p>{a.frequency==='once'?'One appointment':`Every ${a.interval>1?a.interval+' ':''}${a.frequency==='daily'?'day':'week'}${a.interval>1?'s':''}`} · {a.durationMinutes} min · {a.timezone}</p>{a.location&&<p>{a.location}</p>}{a.videoUrl&&<p><a href={a.videoUrl} rel="noreferrer" target="_blank">Video link</a></p>}<p>Attendees: {a.attendees.length?a.attendees.map((x:Row)=>x.name).join(', '):'organizer only'}</p><Occurrences a={a} run={run} canChange={canChange}/></article>;
}
export function Calendar({matterId,actor,firm,run,tick}:{matterId:string;actor:Row;firm?:Row|null;run:Run;tick:number}){
 const [view,setView]=useState<Row>(),[range,setRange]=useState({from:today(),to:plus(today(),30)}),[firmView,setFirmView]=useState<Row>(),[busy,setBusy]=useState<Row>(),[frequency,setFrequency]=useState('weekly');
 const canChange=['owner','lawyer','assistant'].includes(actor.role);
 useEffect(()=>{setView(undefined);setBusy(undefined);},[matterId]);
 useEffect(()=>{if(matterId)api('/matters/'+matterId+'/calendar').then(setView).catch(e=>run(async()=>{throw e;}));},[matterId,tick]);
 useEffect(()=>{api(`/calendar?from=${range.from}&to=${range.to}`).then(setFirmView).catch(e=>run(async()=>{throw e;}));},[range,tick]);
 const book=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget),v=Object.fromEntries(f) as Row;await run(()=>api('/matters/'+matterId+'/appointments',{...v,durationMinutes:Number(v.durationMinutes),interval:Number(v.interval??1),occurrences:Number(v.occurrences??1),attendees:f.getAll('attendees')}),'Appointment booked');setBusy(undefined);};
 const check=async(form:HTMLFormElement|null)=>{if(!form)return;const f=new FormData(form),emails=[actor.email,...f.getAll('attendees')].join(','),day=String(f.get('date')||today());await run(async()=>setBusy(await api(`/availability?from=${day}&to=${plus(day,frequency==='once'?0:90)}&emails=${encodeURIComponent(emails)}`)),'Availability shown');};
 return <div className="grid">
  {!matterId?<Empty>Choose or open a matter to see its calendar.</Empty>:<section className="panel"><h2>Matter appointments</h2><p>Appointments repeat at the same local time in their timezone. Cancelling or moving one occurrence keeps its history and never moves a deadline.</p>
   {canChange&&view&&<form onSubmit={book} aria-label="Book appointment">
    <Field name="title" label="Appointment title"/><Field name="date" label="First date" type="date" value={today()}/><Field name="time" label="Start time" type="time" value="10:00"/><Field name="durationMinutes" label="Duration in minutes" type="number" value={60}/>
    <Field name="timezone" label="Timezone" value={firm?.timezone??'America/New_York'}/>
    <label>Repeats<select name="frequency" value={frequency} onChange={e=>setFrequency(e.target.value)}><option value="once">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
    {frequency!=='once'&&<><Field name="interval" label="Repeat every" type="number" value={1}/><Field name="occurrences" label="Number of occurrences" type="number" value={4}/></>}
    <Field name="location" label="Location" required={false}/><Field name="videoUrl" label="Video link" type="url" required={false}/>
    <fieldset><legend>Attendees</legend>{view.attendeeCandidates.filter((c:Row)=>c.email!==actor.email).map((c:Row)=><label key={c.email} className="check"><input type="checkbox" name="attendees" value={c.email}/>{c.name}</label>)}{view.attendeeCandidates.length<2&&<small>Grant matter access to invite colleagues.</small>}</fieldset>
    <button type="button" onClick={e=>check(e.currentTarget.form)}>Check availability</button> <button type="submit">Book appointment</button>
   </form>}
   {busy&&<div className="availability"><h3>Availability</h3>{busy.people.map((p:Row)=><p key={p.email}><strong>{p.email}</strong>: {p.busy.length?p.busy.map((b:Row)=>`${new Date(b.start).toLocaleString()} ${b.title??'busy'}`).join('; '):'free'}</p>)}</div>}
   {view&&!view.appointments.length&&<Empty>No appointments yet.</Empty>}
   {view?.appointments.map((a:Row)=><Appointment key={a.id} a={a} run={run} canChange={canChange}/>)}
   <h3>Legal deadlines (separate)</h3>{view?.deadlines.length?view.deadlines.map((d:Row)=><p key={d.id}>{d.date} · {d.title} <span className="badge">{d.status}</span></p>):<p>No deadlines.</p>}
  </section>}
  <section className="panel"><h2>Firm calendar</h2><p>Every matter you may see. Dates are inclusive and read in each item’s own timezone.</p>
   <Form label="Show firm calendar" submit={async b=>setRange({from:b.from,to:b.to})}><Field name="from" label="From" type="date" value={range.from}/><Field name="to" label="To" type="date" value={range.to}/></Form>
   {firmView&&!firmView.appointments.length&&!firmView.deadlines.length&&<Empty>Nothing scheduled in this range.</Empty>}
   {firmView?.appointments.map((a:Row)=><article className="record" key={a.id}><strong>{a.title}</strong><small>Matter {a.matterNumber}</small><Occurrences a={a} run={run} canChange={false}/></article>)}
   {firmView?.deadlines.map((d:Row)=><p key={d.id}>Deadline {d.date} · Matter {d.matterNumber} · {d.title} <span className="badge">{d.status}</span></p>)}
  </section>
 </div>;
}
