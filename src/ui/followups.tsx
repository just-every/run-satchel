import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';
// INTAKE-008: the principal's bounded sequences, and each lead's consent, sequences and stopping outcomes.
const names:Record<string,string>={consultation_reminder:'Consultation reminders',unanswered_inquiry:'Unanswered-inquiry follow-ups',engagement_chase:'Engagement chases'};
const key=(kind:string)=>kind==='consultation_reminder'?'beforeMinutes':'afterMinutes';
export function FollowupSettings({run,tick}:{run:Run;tick:number}){
 const [data,setData]=useState<Row>({settings:[],authority:null});
 useEffect(()=>{api('/followups/settings').then(setData).catch(e=>run(async()=>{throw e;}));},[tick]);
 return <section className="panel followup-settings"><h2>Consented follow-ups</h2>
  <p>Each sequence sends email only to a lead who agreed to it, never during quiet hours, never beyond the contact limit, and stops at once on a reply, opt-out, conflict stop, decline or conversion. {data.authority?`Mail sending authority recorded by ${data.authority.reviewedBy}.`:'Mail sending authority is not recorded: review the mail provider in Provider charges first.'}</p>
  {data.settings.map((s:Row)=><Form key={s.kind+(s.revision??'')} label={'Save '+names[s.kind]} submit={d=>run(()=>api('/followups/settings',{kind:s.kind,revision:s.revision,enabled:d.enabled==='on',steps:String(d.steps).split(',').map(m=>({[key(s.kind)]:Number(m.trim())})),quietStart:d.quietStart,quietEnd:d.quietEnd,timezone:d.timezone,maxContacts:Number(d.maxContacts)}).then(setData),names[s.kind]+' saved')}>
   <h3>{names[s.kind]}</h3><label><input type="checkbox" name="enabled" defaultChecked={s.enabled}/>Enabled (email)</label>
   <Field label={(s.kind==='consultation_reminder'?'Minutes before the consultation':'Minutes after the start')+' (comma separated) for '+names[s.kind]} name="steps" value={s.steps.map((x:Row)=>x[key(s.kind)]).join(', ')}/>
   <Field label={'Quiet hours start for '+names[s.kind]} name="quietStart" type="time" value={s.quietStart}/><Field label={'Quiet hours end for '+names[s.kind]} name="quietEnd" type="time" value={s.quietEnd}/>
   <Field label={'Quiet-hours timezone for '+names[s.kind]} name="timezone" value={s.timezone}/><Field label={'Contact limit per lead in seven days for '+names[s.kind]} name="maxContacts" type="number" value={s.maxContacts}/>
  </Form>)}</section>;
}
export function LeadFollowups({lead,run,tick}:{lead:Row;run:Run;tick:number}){
 const [data,setData]=useState<Row>({consents:[],followups:[],consultations:[]});
 useEffect(()=>{api('/leads/'+lead.id+'/followups').then(setData).catch(()=>{});},[tick,lead.id,lead.revision]);
 const active=data.consents.find((c:Row)=>!c.revokedAt),open=lead.status==='open'||lead.status===undefined;
 return <details><summary>Consent and follow-ups for {lead.name}</summary>
  <p>{active?`Email consent: ${active.source} (${active.grantedAt.slice(0,10)}).`:'No active email consent. No automated message is sent without it.'}</p>
  {data.consultations.map((c:Row)=><p key={c.id}>Consultation {new Date(c.start).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'})} · {c.status}</p>)}
  {data.followups.map((f:Row)=><article className="record" key={f.id} aria-label={names[f.kind]+' for '+lead.name}><strong>{names[f.kind]} · {f.status}{f.stopReason?' ('+f.stopReason.replaceAll('_',' ')+')':''}</strong>
   <p>{f.sends.map((s:Row)=>`${s.dueAt.slice(0,16).replace('T',' ')} ${s.status}`).join(' · ')}</p>{f.nextAction&&<p>Next: {f.nextAction} · Responsible: {f.humanOwner??'Unassigned'}</p>}</article>)}
  {!active&&<Form label="Record email consent" submit={d=>run(()=>api('/leads/'+lead.id+'/consents',{channel:'email',source:d.source,text:d.text}),'Consent recorded')}><Field label={'How '+lead.name+' agreed'} name="source"/><Field label="What they agreed to" name="text"/></Form>}
  {active&&<Form label="Start follow-up" submit={d=>run(()=>api('/leads/'+lead.id+'/followups',{kind:d.kind}),'Follow-up scheduled')}><Field label="Sequence" name="kind"><select name="kind"><option value="unanswered_inquiry">{names.unanswered_inquiry}</option><option value="engagement_chase">{names.engagement_chase}</option></select></Field></Form>}
  {data.followups.some((f:Row)=>f.status==='active')&&<Form label="Stop sequences" danger submit={d=>run(()=>api('/leads/'+lead.id+'/followup-events',{kind:d.kind,note:d.note}),'Sequences stopped')}><Field label="Why they stop" name="kind"><select name="kind"><option value="reply">The prospect replied</option><option value="conflict">Conflict stop (counsel)</option><option value="declined">The prospect declined</option></select></Field><Field label="What was received or decided" name="note"/></Form>}
 </details>;
}
