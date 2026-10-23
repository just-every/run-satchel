import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';
// REPORT-003: saved weekly report summaries, the people who receive them, delivery status and the owner's exceptions.
const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export function ReportSchedules({state,run,tick}:{state:Row;run:Run;tick:number}){
 const owner=state.actor.role==='owner',[data,setData]=useState<Row|null>(null),[mine,setMine]=useState<Row[]>([]);
 useEffect(()=>{let live=true;Promise.all([owner?api('/report-schedules'):null,api('/report-summaries')]).then(([s,m])=>{if(live){setData(s);setMine(m.summaries);}}).catch(e=>{if(live)void run(async()=>{throw e;});});return()=>{live=false;};},[tick,owner]);
 return <section className="panel report-schedules" aria-label="Scheduled report summaries"><h2>Scheduled summaries</h2>
  <p>A weekly summary carries counts only and is built with each recipient’s own report permission when it is sent. A failed delivery opens an exception the principal must resolve.</p>
  {mine.length>0&&<><h3>Your portal summaries</h3><ul>{mine.map(m=><li key={m.id}>{m.name} · {new Date(m.slot).toLocaleDateString('en-US')} · {m.status}{m.summary?` · ${m.summary.overdue} overdue of ${m.summary.count}`:''}</li>)}</ul></>}
  {owner&&data&&<>
   {data.schedules.map((s:Row)=><article className="record" key={s.id} aria-label={'Schedule '+s.name}><strong>{s.name} · {s.active?'active':'paused'}</strong><p>{s.dashboard} report · {days[s.weekday-1]} {s.time} {s.timezone} · {s.channel}{Object.keys(s.filters).length?' · filters '+Object.entries(s.filters).map(([k,v])=>k+'='+v).join(', '):''}</p>
    <p>Recipients: {s.recipients.join(', ')}</p>
    {s.recipients.length>1&&<Form label={'Remove a recipient from '+s.name} danger submit={d=>run(()=>api('/report-schedules/'+s.id+'/recipients/remove',{email:d.email,reason:d.reason}),'Recipient removed')}><Field label={'Recipient to remove from '+s.name} name="email"><select name="email" required defaultValue="">{[<option key="" value="">Choose one</option>,...s.recipients.map((e:string)=><option key={e} value={e}>{e}</option>)]}</select></Field><Field label={'Reason for removing from '+s.name} name="reason"/></Form>}
    <ul>{data.deliveries.filter((d:Row)=>d.scheduleId===s.id).slice(0,6).map((d:Row)=><li key={d.id}>{new Date(d.slot).toLocaleDateString('en-US')} · {d.recipient} · {d.status}{d.status==='failed'||d.status==='skipped'?' · '+d.detail:''}</li>)}</ul></article>)}
   <h3>Exceptions</h3>{!data.exceptions.length&&<p>No delivery exceptions.</p>}
   {data.exceptions.map((e:Row)=><article className="record" key={e.id} aria-label={'Exception for '+e.recipient}><strong>{e.recipient} · {e.status} · due {e.dueDate}</strong>{e.note&&<p>{e.note}</p>}{e.status==='open'&&<Form label={'Resolve exception for '+e.recipient} submit={d=>run(()=>api('/report-exceptions/'+e.id+'/resolve',{note:d.note}),'Exception resolved')}><Field label={'What was done for '+e.recipient} name="note"/></Form>}</article>)}
   <details><summary>Schedule a weekly summary</summary><Form label="Save schedule" submit={d=>run(()=>api('/report-schedules',{name:d.name,dashboard:d.dashboard,filters:d.practice?{practice:d.practice}:{},weekday:Number(d.weekday),time:d.time,timezone:d.timezone,channel:d.channel,recipients:String(d.recipients).split(',').map(x=>x.trim()).filter(Boolean)}),'Schedule saved')}>
    <Field label="Report name" name="name"/><Field label="Report" name="dashboard"><select name="dashboard"><option value="workload">Workload (overdue work)</option><option value="deadlines">Deadlines</option></select></Field>
    <Field label="Practice filter (code, optional)" name="practice" required={false}/><Field label="Day" name="weekday"><select name="weekday">{days.map((n,i)=><option key={n} value={i+1}>{n}</option>)}</select></Field><Field label="Time" name="time" type="time" value="08:00"/><Field label="Timezone (IANA)" name="timezone" value={state.firm?.timezone??'America/New_York'}/>
    <Field label="Delivery" name="channel"><select name="channel"><option value="email">Email</option><option value="portal">In Satchel</option></select></Field><Field label="Recipients (emails, comma separated)" name="recipients"/></Form></details></>}
 </section>;
}
