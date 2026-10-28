import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';

export function CollectionSettings({state,run,tick}:{state:Row;run:Run;tick:number}){
 const [matterId,setMatterId]=useState('');
 if(state.actor.channel==='agent'||!['owner','lawyer'].includes(state.actor.role))return null;
 return <section className="panel" aria-label="Client reminder settings" style={{overflowWrap:'anywhere'}}><h2>Client reminder settings</h2>
  <details><summary>Templates and matter collection authority</summary>
   <Field label="Matter for client reminder authority" name="reminderMatter"><select value={matterId} onChange={e=>setMatterId(e.target.value)}><option value="">Choose a matter</option>{state.matters.map((matter:Row)=><option key={matter.id} value={matter.id}>{matter.matter_number} · {matter.title}</option>)}</select></Field>
   {matterId?<MatterReminderSettings key={matterId} matterId={matterId} actor={state.actor} run={run} tick={tick}/>:<p>Choose a matter to review approved templates and its reminder authority.</p>}
  </details>
 </section>;
}

function MatterReminderSettings({matterId,actor,run,tick}:{matterId:string;actor:Row;run:Run;tick:number}){
 const [state,setState]=useState<Row>(),[error,setError]=useState('');
 useEffect(()=>{let live=true;void Promise.all([api('/matters/'+matterId+'/client-reminders'),api('/matters/'+matterId+'/stage')]).then(([reminders,stage])=>{if(live){setState({...reminders,profile:stage.profile});setError('');}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[matterId,tick]);
 if(!state)return error?<p role="alert">{error}</p>:<p role="status">Opening client reminder settings…</p>;
 const authority=state.authorizations.at(-1),responsible=state.profile.lawyerEmail===actor.email;
 const invoice=state.templates.filter((template:Row)=>template.kind==='invoice'),appointment=state.templates.filter((template:Row)=>template.kind==='appointment');
 return <>{error&&<p role="alert">{error}</p>}
  <p>Responsible counsel: {state.profile.lawyerEmail??'Unassigned'}. Set the responsible lawyer in Matters → Stages and milestones.</p>
  <p>{authority?.enabled?'Reminder authority enabled':'Reminder authority disabled'}{authority&&<> · decided by {authority.counsel_email} · {authority.decided_at}<br/>Trailing seven-day contact limit per recipient: {authority.max_contacts}</>}</p>
  <details><summary>Review and approve reminder templates</summary>
   {(['invoice','appointment'] as const).map(kind=>{const content=state.availableTemplates[kind];return <article className="record" key={kind}><h3>{kind==='invoice'?'Invoice':'Appointment'} reminder</h3><p><strong>{content.subject}</strong></p><p style={{whiteSpace:'pre-wrap'}}>{content.body}</p>
    <Form label={'Approve '+kind+' reminder wording'} submit={d=>run(()=>api('/client-reminder-templates',{kind,confirmed:d.confirmed==='on',reason:d.reason}),'Client reminder wording approved')}>
     <Field label={kind+' template approval reason'} name="reason"/><label className="check"><input name="confirmed" type="checkbox" required/>I approve this exact {kind} reminder wording.</label>
    </Form>
   </article>;})}
  </details>
  {!responsible?<p>Only this matter’s current responsible counsel can enable or withdraw reminder authority.</p>:<>
   {!invoice.length||!appointment.length?<p>Approve both invoice and appointment reminder wording above before enabling authority.</p>:<Form key={authority?.id??'new'} label="Authorize client reminders" submit={d=>run(()=>api('/matters/'+matterId+'/client-reminders',{enabled:true,invoiceTemplate:d.invoiceTemplate,appointmentTemplate:d.appointmentTemplate,maxContacts:Number(d.maxContacts),reason:d.reason}),'Matter client reminder authority recorded')}>
    <Field label="Approved invoice reminder template" name="invoiceTemplate"><select name="invoiceTemplate" required defaultValue={authority?.invoice_template??invoice.at(-1)?.id}>{invoice.map((template:Row)=><option key={template.id} value={template.id}>{template.subject} · {template.approved_at} · {template.approved_by}</option>)}</select></Field>
    <Field label="Approved appointment reminder template" name="appointmentTemplate"><select name="appointmentTemplate" required defaultValue={authority?.appointment_template??appointment.at(-1)?.id}>{appointment.map((template:Row)=><option key={template.id} value={template.id}>{template.subject} · {template.approved_at} · {template.approved_by}</option>)}</select></Field>
    <Field label="Maximum contacts per recipient in seven days (1–7)" name="maxContacts"><input name="maxContacts" type="number" min="1" max="7" step="1" required defaultValue={authority?.max_contacts??3}/></Field>
    <Field label="Counsel authority decision reason" name="reason"/>
    <label className="check"><input type="checkbox" required/>As current responsible counsel, I authorize these templates and this contact limit.</label>
   </Form>}
   {Boolean(authority?.enabled)&&<details><summary>Withdraw client reminder authority</summary><Form label="Withdraw reminder authority" submit={d=>run(()=>api('/matters/'+matterId+'/client-reminders',{enabled:false,maxContacts:authority.max_contacts,reason:d.reason}),'Client reminder authority withdrawn')}><Field label="Reason for withdrawing reminder authority" name="reason"/></Form></details>}
  </>}
 </>;
}
