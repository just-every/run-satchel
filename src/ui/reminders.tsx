import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';

type ReminderData={rules:Row[];deliveries:Row[];candidates:Row[]};
type ReminderProps={deadline:Row;actor:Row;members:Row[];run:Run;tick:number};
const legalRole=(actor:Row)=>actor.role==='owner'||actor.role==='lawyer';
const route=(id:string)=>'/deadlines/'+encodeURIComponent(id)+'/reminders';

export function DeadlineReminders({deadline,actor,run,tick}:ReminderProps){
 const [data,setData]=useState<ReminderData>(),[error,setError]=useState('');
 const [reload,setReload]=useState(0);
 useEffect(()=>{
  let current=true;
  setData(undefined);setError('');
  api(route(deadline.id)).then(result=>{if(current)setData(result);})
   .catch(e=>{if(current)setError((e as Error).message);});
  return ()=>{current=false;};
 },[deadline.id,tick,reload]);
 const save:Run=(job,message)=>run(async()=>{await job();setReload(value=>value+1);},message);
 const active=data?.rules.find(rule=>rule.status==='active');
 return <details style={{overflowWrap:'anywhere'}}>
  <summary>Reminders for {deadline.title}</summary>
  <p>Reminder times and quiet hours use {deadline.timezone}. The scheduler checks every 15 minutes. Acknowledging a reminder does not complete this deadline.</p>
  {error&&<p className="error" role="alert">{error} <button type="button" className="quiet" onClick={()=>setReload(value=>value+1)}>Retry loading reminders</button></p>}
  {!data&&!error&&<p role="status">Loading reminders…</p>}
  {data&&<>
   {active?<RuleSummary rule={active}/>:<p>No active reminder rule.</p>}
   {legalRole(actor)&&deadline.status==='confirmed'&&<details>
    <summary>{active?'Edit reminder rule':'Set up reminders'}</summary>
    <ReminderForm key={active?.id??'new'} deadline={deadline} rule={active} candidates={data.candidates} run={save}/>
   </details>}
   {active&&legalRole(actor)&&<details><summary>Cancel reminders</summary>
    <Form label="Cancel reminder rule" submit={body=>save(()=>api('/reminders/rules/'+encodeURIComponent(active.id)+'/cancel',body),'Reminder rule cancelled; history retained')}>
     <Field name="reason" label={'Reason for cancelling reminders for '+deadline.title}/>
    </Form>
   </details>}
   <p>Workspace reminders are stored here for their recipient. Email uses your firm’s configured mail provider. Provider acceptance does not confirm mailbox delivery.</p>
   <strong>Delivery results</strong>
   {!data.deliveries.length&&<p>No delivery attempts recorded.</p>}
   {data.deliveries.map(delivery=><Delivery key={delivery.id} delivery={delivery} deadline={deadline} actor={actor} run={save}/>)}
   {data.rules.length>0&&<details><summary>Rule history</summary>{data.rules.map(rule=><div key={rule.id}>
    <p><span className="badge">{rule.status}</span> · Rule {rule.id} · revision {rule.revision}</p><RuleSummary rule={rule}/>
   </div>)}</details>}
  </>}
 </details>;
}

function RuleSummary({rule}:{rule:Row}){
 return <p>Primary: {rule.recipient}<br/>Backup: {rule.backup||'None'}<br/>
  {rule.advanceDays} days before at {rule.sendTime} · {(rule.channels as string[]).join(', ')}<br/>
  Quiet hours: {rule.quietStart&&rule.quietEnd?rule.quietStart+'–'+rule.quietEnd:'Off'}<br/>
  Escalate to backup after {rule.escalateHours} hours if the primary fails, is uncertain, or remains unacknowledged. Each selected channel escalates once.
 </p>;
}

function ReminderForm({deadline,rule,candidates,run}:{deadline:Row;rule?:Row;candidates:Row[];run:Run}){
 return <Form label={rule?'Save replacement rule':'Save reminder rule'} submit={body=>run(async()=>{
  if(!candidates.length)throw new Error('Grant an eligible lawyer or principal access to this matter before scheduling reminders.');
  const channels=['email','workspace'].filter(channel=>body[channel]==='on');
  if(!channels.length)throw new Error('Choose at least one reminder channel.');
  if(Boolean(body.quietStart)!==Boolean(body.quietEnd))throw new Error('Enter both quiet-hour times or clear both.');
  if(body.recipient===body.backup)throw new Error('Choose a different person for backup.');
  await api(route(deadline.id),{
   recipient:body.recipient,backup:body.backup,advanceDays:Number(body.advanceDays),
   sendTime:body.sendTime,quietStart:body.quietStart,quietEnd:body.quietEnd,
   channels,escalateHours:Number(body.escalateHours),revision:deadline.revision,
  });
 },'Reminder rule saved; earlier unsent work superseded')}>
  <p>Choose active lawyers or the principal who can access this matter. Saving replaces the current rule and supersedes its unsent reminders.</p>
  {!candidates.length&&<p>No eligible recipients have access to this matter.</p>}
  <fieldset disabled={!candidates.length} aria-label={'Reminder settings for '+deadline.title}>
   <Field label={'Primary recipient for '+deadline.title} name="recipient"><select name="recipient" required defaultValue={rule?.recipient??''}>
    <option value="">Choose a recipient</option>{candidates.map(person=><option key={person.email} value={person.email}>{person.name} · {person.email}</option>)}
   </select></Field>
   <Field label={'Backup recipient for '+deadline.title} name="backup"><select name="backup" required defaultValue={rule?.backup??''}>
    <option value="">Choose a backup lawyer</option>{candidates.map(person=><option key={person.email} value={person.email}>{person.name} · {person.email}</option>)}
   </select></Field>
   <Field label="Days before deadline" name="advanceDays"><input name="advanceDays" type="number" min="0" step="1" required defaultValue={rule?.advanceDays??7}/></Field>
   <Field label={'Send time in '+deadline.timezone} name="sendTime" type="time" value={rule?.sendTime??'09:00'}/>
   <Field label={'Quiet hours start in '+deadline.timezone+' (optional)'} name="quietStart" type="time" required={false} value={rule?rule.quietStart:'18:00'}/>
   <Field label={'Quiet hours end in '+deadline.timezone+' (optional)'} name="quietEnd" type="time" required={false} value={rule?rule.quietEnd:'08:00'}/>
   <label className="check"><input type="checkbox" name="email" defaultChecked={rule?rule.channels.includes('email'):true}/>Email reminder for {deadline.title}</label>
   <label className="check"><input type="checkbox" name="workspace" defaultChecked={rule?rule.channels.includes('workspace'):true}/>Workspace reminder for {deadline.title}</label>
   <Field label="Hours before backup escalation" name="escalateHours"><input name="escalateHours" type="number" min="1" step="1" required defaultValue={rule?.escalateHours??24}/></Field>
  </fieldset>
 </Form>;
}

function Delivery({delivery,deadline,actor,run}:{delivery:Row;deadline:Row;actor:Row;run:Run}){
 const context=delivery.channel+' '+delivery.stage+' reminder to '+delivery.recipient+' for '+deadline.title;
 const recipient=String(delivery.recipient).toLowerCase()===String(actor.email).toLowerCase();
 const acknowledge=recipient&&!delivery.acknowledgedAt&&Boolean(delivery.attemptedAt)&&!['cancelled','superseded','scheduled','sending','queued'].includes(delivery.status);
 return <div className="record">
  <p><strong>{delivery.recipient}</strong> · {delivery.stage} · {delivery.channel}<br/>
   <span className="badge">{delivery.status}</span> · Delivery {delivery.id}<br/>
   Scheduled: {delivery.scheduledFor}{delivery.attemptedAt&&<><br/>Attempted: {delivery.attemptedAt}</>}
  </p>
  <p>Provider: {delivery.provider||'Not recorded'}<br/>Provider reference: {delivery.providerId||'Not recorded'}</p>
  {delivery.detail&&<p>{delivery.detail}</p>}
  {delivery.status==='uncertain'&&!delivery.resolvedAt&&<p>Delivery remains uncertain until someone checks the provider and records evidence. No blind resend.</p>}
  {delivery.resolvedAt&&<p>Resolved as {delivery.resolution} by {delivery.resolvedBy} · {delivery.resolvedAt}: {delivery.evidence}</p>}
  {delivery.status==='failed'&&!delivery.resolvedAt&&<p>This failed delivery remains in the record. Check the provider result and backup escalation.</p>}
  {delivery.acknowledgedAt?<p>Acknowledged by {delivery.acknowledgedBy} · {delivery.acknowledgedAt}. Deadline completion is recorded separately.</p>:acknowledge&&<button type="button" className="quiet" aria-label={'Acknowledge '+context} onClick={()=>run(()=>api('/reminders/'+encodeURIComponent(delivery.id)+'/acknowledge',{}),'Reminder acknowledged; deadline completion is separate')}>Acknowledge reminder</button>}
  {['uncertain','failed'].includes(delivery.status)&&!delivery.resolvedAt&&legalRole(actor)&&<details><summary>Resolve delivery to {delivery.recipient}</summary>
   <Form label="Record delivery evidence" submit={body=>run(()=>api('/reminders/'+encodeURIComponent(delivery.id)+'/resolve',body),'Provider outcome recorded')}>
    <Field label={'Verified outcome for '+context} name="outcome"><select name="outcome" required defaultValue=""><option value="">Choose verified outcome</option><option value="delivered">Delivered</option><option value="not_delivered">Not delivered</option></select></Field>
    <Field label={'Provider evidence or reference for '+context} name="evidence"/>
   </Form>
  </details>}
 </div>;
}
