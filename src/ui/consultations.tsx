import {useEffect,useState} from 'react';
import {api,dollars,Field,Form,type Row,type Run} from './common';
// INTAKE-003: approved consultation availability, the public booking link and the consultations that reached the lawyer.
const days=[[1,'Monday'],[2,'Tuesday'],[3,'Wednesday'],[4,'Thursday'],[5,'Friday'],[6,'Saturday'],[7,'Sunday']] as const;
const consent='I consent to this firm reviewing my inquiry and booking a consultation.';
export function Consultations({state,run,tick}:{state:Row;run:Run;tick:number}){
 const [data,setData]=useState<Row>({offers:[]}),[booked,setBooked]=useState<Row[]>([]),[forms,setForms]=useState<Row[]>([]),[picked,setPicked]=useState<number[]>([1,2,3,4,5]),[editing,setEditing]=useState<Row|null>(null);
 const counsel=['owner','lawyer'].includes(state.actor.role),staff=counsel||state.actor.role==='assistant';
 useEffect(()=>{let live=true;if(!staff)return;Promise.all([counsel?api('/consult/offers'):{offers:[]},api('/consultations'),counsel?api('/intake/forms'):{forms:[]}]).then(([o,b,f])=>{if(live){setData(o);setBooked(b.consultations);setForms(f.forms);}}).catch(e=>{if(live)void run(async()=>{throw e;});});return()=>{live=false;};},[tick,counsel,staff]);
 if(!staff)return null;
 const origin=typeof window==='undefined'?'':window.location.origin,toggle=(n:number)=>setPicked(p=>p.includes(n)?p.filter(x=>x!==n):[...p,n].sort());
 const edit=(o:Row)=>{setEditing(o);setPicked([...new Set<number>(o.windows.map((w:Row)=>w.day))]);};
 return <section className="panel consultations"><h2>Consultations</h2>
  <p>Prospects book only the availability you approve here. A booking creates one lead for the responsible lawyer, and the same intake record as the linked form. Reminders go out only to prospects who agreed to them.</p>
  {counsel&&<><h3>Approved availability</h3>{!data.offers.length&&<p>No availability is published yet.</p>}
  {data.offers.map((o:Row)=><article className="record" key={o.id} aria-label={'Availability '+o.title}><strong>{o.title} · {o.published?'published':'unpublished'}</strong><p>{o.lawyerEmail} · {o.timezone} · {o.durationMinutes} minutes · buffers {o.bufferBefore}/{o.bufferAfter} · {o.feeCents?dollars(o.feeCents)+' fee':'no fee'}</p><p>{o.windows.map((w:Row)=>`${days[w.day-1][1]} ${w.start}–${w.end}`).join(', ')}</p><p>Booking link: <a href={origin+'/book/'+o.id}>{origin+'/book/'+o.id}</a></p><button type="button" className="quiet" onClick={()=>edit(o)}>Edit {o.title}</button></article>)}
  <details open={Boolean(editing)}><summary>{editing?'Edit '+editing.title:'Approve availability'}</summary>
   <Form key={editing?.id??'new'} label="Save availability" submit={d=>run(async()=>{await api('/consult/offers',{id:editing?.id,revision:editing?.revision,title:d.title,lawyerEmail:d.lawyerEmail||undefined,timezone:d.timezone,durationMinutes:Number(d.durationMinutes),bufferBefore:Number(d.bufferBefore),bufferAfter:Number(d.bufferAfter),windows:picked.map(day=>({day,start:d.start,end:d.end})),noticeHours:Number(d.noticeHours),horizonDays:Number(d.horizonDays),feeCents:Number(d.feeCents),formId:d.formId||null,consentText:d.consentText,published:d.published==='on'});setEditing(null);},'Availability saved')}>
    <Field label="Offer title" name="title" value={editing?.title??'Initial consultation'}/>
    {state.actor.role==='owner'&&<Field label="Responsible lawyer email" name="lawyerEmail" type="email" value={editing?.lawyerEmail??state.actor.email}/>}
    <Field label="Availability timezone (IANA)" name="timezone" value={editing?.timezone??state.firm?.timezone??'America/New_York'}/>
    <fieldset><legend>Available weekdays</legend>{days.map(([n,name])=><label key={n}><input type="checkbox" checked={picked.includes(n)} onChange={()=>toggle(n)}/>{name}</label>)}</fieldset>
    <Field label="Window start" name="start" type="time" value={editing?.windows[0].start??'09:00'}/><Field label="Window end" name="end" type="time" value={editing?.windows[0].end??'17:00'}/>
    <Field label="Consultation length (minutes)" name="durationMinutes" type="number" value={editing?.durationMinutes??30}/><Field label="Buffer before (minutes)" name="bufferBefore" type="number" value={editing?.bufferBefore??0}/><Field label="Buffer after (minutes)" name="bufferAfter" type="number" value={editing?.bufferAfter??15}/>
    <Field label="Minimum notice (hours)" name="noticeHours" type="number" value={editing?.noticeHours??24}/><Field label="Booking horizon (days)" name="horizonDays" type="number" value={editing?.horizonDays??30}/>
    <Field label="Consultation fee (USD cents, 0 for none)" name="feeCents" type="number" value={editing?.feeCents??0}/><p>A fee is disclosed and acknowledged before booking and recorded as due at the consultation. Satchel collects no payment.</p>
    <Field label="Linked intake form" name="formId"><select name="formId" defaultValue={editing?.formId??''}><option value="">No intake form</option>{forms.filter((f:Row)=>f.published).map((f:Row)=><option key={f.id} value={f.id}>{f.title}</option>)}</select></Field>
    <Field label="Review consent shown to the prospect" name="consentText"><textarea name="consentText" required defaultValue={editing?.consentText??consent}/></Field>
    <label><input type="checkbox" name="published" defaultChecked={editing?.published??true}/>Publish this booking page</label>
   </Form></details></>}
  <h3>Upcoming consultations</h3>{!booked.length&&<p>No upcoming consultations.</p>}
  {booked.map((c:Row)=><article className="record" key={c.id} aria-label={'Consultation '+c.leadName}><strong>{c.leadName} · {c.title} · {c.status}</strong><p>{new Date(c.start).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'})} · prospect timezone {c.prospectTimezone} · {c.lawyerEmail}{c.feeStatus==='due_at_consultation'?' · fee '+dollars(c.feeCents)+' due at the consultation':''}</p>
   {counsel&&c.status==='booked'&&<details><summary>Cancel {c.leadName}’s consultation</summary><Form label="Cancel consultation" danger submit={d=>run(()=>api('/consultations/'+c.id+'/cancel',{reason:d.reason}),'Consultation cancelled')}><Field label="Reason" name="reason"/></Form></details>}</article>)}
 </section>;
}
