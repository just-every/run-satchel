import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';

const when=(value:string)=>new Date(value).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'});
const localTime=(value:string)=>{if(!value)return '';const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const readable=(value:string)=>value.replaceAll('_',' ');

function UpdateSource({update}:{update:Row}){
 return <div aria-label="Cited order"><p><strong>Cited order</strong> {update.source_citation} · version {update.source_version}</p>
  <p><a href={'/api/satchel/documents/'+update.source_document_id+'/file?version='+update.source_version}>Open cited original version</a></p>
  {update.previous_date&&<p>Previously confirmed: {update.previous_date} → Now confirmed: {update.new_date}</p>}
  {!update.previous_date&&<p>Confirmed date: {update.new_date}</p>}
 </div>;
}

function DraftUpdate({update,people,recipients,run,refresh,counsel}:{update:Row;people:Row[];recipients:Row[];run:Run;refresh:()=>Promise<void>;counsel:boolean}){
 const [selected,setSelected]=useState<string[]>(update.recipients),[promises,setPromises]=useState<Row[]>(update.promises.map((p:Row)=>({text:p.text,responsibleEmail:p.responsible_email}))),[review,setReview]=useState(false);
 const submit=(job:()=>Promise<any>,message:string)=>run(async()=>{await job();await refresh();},message);
 if(!counsel)return <article className="record"><strong>{update.title}</strong><span>Draft · awaiting responsible counsel review</span><details><summary>Read draft: {update.title}</summary><p style={{whiteSpace:'pre-wrap'}}>{update.body}</p><UpdateSource update={update}/></details></article>;
 return <article className="record" aria-label={'Draft update '+update.title}><strong>{update.title}</strong><span>Draft · no delivery authorized</span>
  <details><summary>Prepare draft: {update.title}</summary><UpdateSource update={update}/>
   {update.outstandingActions.length>0&&<><h4>Outstanding client actions</h4><ul>{update.outstandingActions.map((a:Row)=><li key={a.id}>{a.title} — {a.instructions}</li>)}</ul></>}
   <Form label="Save update draft" submit={d=>submit(()=>api('/matter-updates/'+update.id+'/edit',{revision:update.revision,title:d.title,body:d.body,recipients:selected,promises,dueAt:new Date(String(d.dueAt)).toISOString(),responsibleEmail:d.responsibleEmail,maxContacts:Number(d.maxContacts)}),'Update draft saved for counsel review')}>
    <Field label="Update title" name="title" value={update.title}/>
    <Field label="Client update wording" name="body"><textarea name="body" required rows={8} maxLength={20000} defaultValue={update.body}/></Field>
    <div role="group" aria-label="Update recipients"><h4>Recipients</h4>{!recipients.length&&<p>No active client members are available.</p>}{recipients.map(r=><label className="check" key={r.email}><input type="checkbox" checked={selected.includes(r.email)} onChange={e=>setSelected(s=>e.target.checked?[...s,r.email]:s.filter(v=>v!==r.email))}/>{r.name} · {r.email}</label>)}</div>
    <Field label="Responsible counsel" name="responsibleEmail"><select name="responsibleEmail" required defaultValue={update.responsible_email}><option value="">Choose counsel</option>{people.map(p=><option key={p.email} value={p.email}>{p.name} · {p.email}</option>)}</select></Field>
    <Field label="Scheduled delivery time" name="dueAt" type="datetime-local" value={localTime(update.due_at)}/><p>Delivery time uses your local timezone.</p>
    <Field label="Maximum email contacts in seven days" name="maxContacts"><input name="maxContacts" type="number" min={1} max={7} required defaultValue={update.max_contacts}/></Field>
    <h4>Promises for counsel review</h4>{!promises.length&&<p>No promises selected.</p>}
    {promises.map((p,index)=><div key={index} role="group" aria-label={'Promise '+(index+1)}><label>Promise {index+1}, including its due time<textarea required rows={3} maxLength={2000} value={p.text} onChange={e=>setPromises(ps=>ps.map((v,i)=>i===index?{...v,text:e.target.value}:v))}/></label><label>Responsible counsel for promise {index+1}<select required value={p.responsibleEmail} onChange={e=>setPromises(ps=>ps.map((v,i)=>i===index?{...v,responsibleEmail:e.target.value}:v))}><option value="">Choose counsel</option>{people.map(person=><option key={person.email} value={person.email}>{person.name} · {person.email}</option>)}</select></label><button type="button" className="quiet" onClick={()=>setPromises(ps=>ps.filter((_,i)=>i!==index))}>Remove promise {index+1}</button></div>)}
    <button type="button" className="quiet" onClick={()=>setPromises(ps=>[...ps,{text:'',responsibleEmail:update.responsible_email}])}>Add promise</button>
   </Form>
  </details>
  {counsel&&<details onToggle={e=>{if(!e.currentTarget.open)setReview(false);}}><summary>Review exact delivery packet: {update.title}</summary>
   <h4>{update.title}</h4><p style={{whiteSpace:'pre-wrap'}}>{update.body}</p><UpdateSource update={update}/>
   <p><strong>Selected recipients:</strong> {update.recipients.join(', ')||'None selected'}</p><p><strong>Responsible counsel:</strong> {update.responsible_email}</p>
   <p><strong>Scheduled delivery:</strong> {update.due_at?when(update.due_at):'Not selected'} · authenticated portal and email · at most {update.max_contacts} email contacts in seven days</p>
   <h4>Exact reviewed promises</h4>{update.promises.length?<ul>{update.promises.map((p:Row)=><li key={p.id}>{p.text} · {p.responsible_email}</li>)}</ul>:<p>No promises in this packet.</p>}
   <Form label="Approve scheduled update" submit={d=>submit(()=>api('/matter-updates/'+update.id+'/approve',{revision:update.revision,confirmed:review,reviewNote:d.reviewNote}),'Exact update approved for scheduled delivery')}>
    <label className="check"><input type="checkbox" required/>I reviewed these exact recipients and their access.</label>
    <label className="check"><input type="checkbox" required/>I reviewed every promise and its due time.</label>
    <label className="check"><input type="checkbox" required/>I removed privileged strategy and reviewed the cited order and confirmed dates.</label>
    <label className="check"><input type="checkbox" required checked={review} onChange={e=>setReview(e.target.checked)}/>I authorize this exact saved wording, recipients, promises and delivery time for portal and email.</label>
    <Field label="Counsel approval note" name="reviewNote"/>
   </Form>
  </details>}
 </article>;
}

function DeliveryState({job,run,refresh,counsel}:{job:Row;run:Run;refresh:()=>Promise<void>;counsel:boolean}){
 const [newAttempt,setNewAttempt]=useState('');
 const send=(task:()=>Promise<any>,message:string)=>run(async()=>{await task();await refresh();},message);
 const uncertain=['uncertain','unknown'].includes(job.mail_status)||['uncertain','unknown'].includes(job.mail_outcome);
 return <div className="record" aria-label={'Update delivery to '+job.recipient}><strong>{job.recipient}</strong>
  <p>Portal: {job.portal_published_at?'Published '+when(job.portal_published_at):readable(job.status)}<br/>Email: {job.mail_outcome?readable(job.mail_outcome):job.mail_status?readable(job.mail_status):'Not sent'}</p>{job.detail&&<p>{job.detail}</p>}{job.mail_detail&&job.mail_outcome===job.mail_status&&<p>{job.mail_detail}</p>}
  {job.attempt_id&&counsel&&<details><summary>Review email delivery for {job.recipient}</summary>
   {uncertain&&<p role="status">Email outcome is uncertain. Check the provider result before authorizing another contact.</p>}
   {job.mail_status!=='ready'&&!newAttempt&&<><button type="button" className="quiet" onClick={()=>send(()=>api('/mail-attempts/'+job.attempt_id+'/reconcile',{}),'Email delivery reconciled')}>Reconcile email outcome</button>
   <Form label="Authorize one email resend" submit={d=>send(async()=>{const result=await api('/mail-attempts/'+job.attempt_id+'/resend-review',{reason:d.reason});setNewAttempt(result.attemptId);},'One email resend reviewed')}><Field label="Provider check and resend reason" name="reason"/><label className="check"><input type="checkbox" required/>I checked the prior email outcome and authorize one further contact.</label></Form></>}
   {(newAttempt||job.mail_status==='ready')&&<button type="button" onClick={()=>send(async()=>{await api('/mail-attempts/'+(newAttempt||job.attempt_id)+'/send',{});setNewAttempt('');},'Authorized email attempt sent')}>Send authorized email attempt</button>}
  </details>}
 </div>;
}

function ReviewedPromise({promise,documents,run,refresh,counsel}:{promise:Row;documents:Row[];run:Run;refresh:()=>Promise<void>;counsel:boolean}){
 const versions=documents.flatMap(d=>d.versions.map((v:Row)=>({...v,documentId:d.id,title:d.title})));
 return <div className="record"><strong>{promise.text}</strong><span>{readable(promise.status)} · {promise.responsible_email}</span>
  {promise.status!=='fulfilled'&&counsel&&<details><summary>Record promise fulfillment</summary><Form label="Fulfil reviewed promise" submit={d=>run(async()=>{const source=versions.find(v=>v.documentId+':'+v.version===d.source);if(!source)throw Error('Choose a retained original version');await api('/matter-update-promises/'+promise.id+'/fulfil',{documentId:source.documentId,version:source.version,digest:source.sha256,evidence:d.evidence});await refresh();},'Reviewed promise fulfilled with original evidence')}>
   <Field label="Promise fulfillment original version" name="source"><select name="source" required defaultValue=""><option value="">Choose retained original version</option>{versions.map(v=><option key={v.documentId+':'+v.version} value={v.documentId+':'+v.version}>{v.title} · version {v.version}</option>)}</select></Field><Field label="Promise fulfillment evidence" name="evidence"/>
  </Form></details>}
  {promise.status==='fulfilled'&&<p>Fulfilled with retained original version {promise.fulfilled_version}.{promise.fulfilled_evidence?' '+promise.fulfilled_evidence:''}</p>}
 </div>;
}

export function MatterUpdates({matterId,state,run,tick}:{matterId:string;state:Row;run:Run;tick:number}){
 const [data,setData]=useState<Row>(),[deadlines,setDeadlines]=useState<Row[]>([]),[documents,setDocuments]=useState<Row[]>([]),[error,setError]=useState('');
 const staff=['owner','lawyer','assistant'].includes(state.actor.role),counsel=['owner','lawyer'].includes(state.actor.role),base='/matters/'+matterId;
 const refresh=async()=>{setData(await api(base+'/matter-updates'));};
 useEffect(()=>{setData(undefined);setDeadlines([]);setDocuments([]);setError('');},[matterId]);
 useEffect(()=>{if(!matterId||!staff)return;let live=true;Promise.all([api(base+'/matter-updates'),api(base+'/deadlines'),api(base+'/documents')]).then(([updates,dates,docs])=>{if(live){setData(updates);setDeadlines(dates);setDocuments(docs.filter((d:Row)=>!d.erasedAt));setError('');}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[matterId,tick,staff,counsel]);
 if(!matterId||!staff)return null;
 const recipients=state.members.filter((m:Row)=>m.active&&m.role==='client'),people=[...state.members.filter((m:Row)=>m.active&&['owner','lawyer'].includes(m.role)),...(counsel&&!state.members.some((m:Row)=>m.email===state.actor.email)?[state.actor]:[])],drafts=data?.updates.filter((u:Row)=>u.status==='draft'),approved=data?.updates.filter((u:Row)=>u.status==='approved');
 return <section className="panel" aria-label="Client updates"><h2>Client updates</h2><details><summary>Review client updates{data?' · '+drafts.length+' drafts · '+data.followups.length+' open replies':''}</summary>
  {error&&<p className="error" role="alert">{error}</p>}{!data?<p>Opening client updates…</p>:<>
   <h3>Draft updates</h3>{!drafts.length&&<p>No drafts awaiting review.</p>}{drafts.map((u:Row)=><DraftUpdate key={u.id+':'+u.revision} update={u} people={people} recipients={recipients} run={run} refresh={refresh} counsel={counsel}/>)}
   {counsel&&<details><summary>Prepare an update from a confirmed order</summary><Form label="Generate draft update" submit={d=>run(async()=>{await api(base+'/matter-updates/generate',{deadlineId:d.deadlineId,previousDeadlineId:d.previousDeadlineId||undefined});await refresh();},'Source-cited draft prepared; delivery awaits counsel review')}>
    <Field label="Current confirmed date and order" name="deadlineId"><select name="deadlineId" required defaultValue=""><option value="">Choose confirmed date</option>{deadlines.filter((d:Row)=>d.status==='confirmed'&&d.documentId).map((d:Row)=><option key={d.id} value={d.id}>{d.title} · {d.date} · {d.source}</option>)}</select></Field>
    <Field label="Previously confirmed trial date" name="previousDeadlineId" required={false}><select name="previousDeadlineId" defaultValue=""><option value="">No previous date</option>{deadlines.filter((d:Row)=>d.confirmedAt).map((d:Row)=><option key={d.id} value={d.id}>{d.title} · {d.date}</option>)}</select></Field>
   </Form></details>}
   <h3>Approved updates</h3>{!approved.length&&<p>No updates approved for delivery.</p>}{approved.map((u:Row)=><article className="record" key={u.id} aria-label={'Approved update '+u.title}><strong>{u.title}</strong><span>Approved {when(u.approved_at)} · scheduled {when(u.due_at)}</span><details><summary>Approved packet and delivery: {u.title}</summary><p style={{whiteSpace:'pre-wrap'}}>{u.body}</p><UpdateSource update={u}/><p>Authorized recipients: {u.recipients.join(', ')} · responsible counsel: {u.responsible_email}</p><p>Approved by {u.approved_by}: {u.review_note}</p><h4>Delivery states</h4>{!u.jobs.length&&<p>Awaiting scheduled delivery.</p>}{u.jobs.map((j:Row)=><DeliveryState key={j.id} job={j} run={run} refresh={refresh} counsel={counsel}/>)}<h4>Reviewed promises</h4>{!u.promises.length&&<p>No promises in this packet.</p>}{u.promises.map((p:Row)=><ReviewedPromise key={p.id} promise={p} documents={documents} run={run} refresh={refresh} counsel={counsel}/>)}
    <h4>Client replies</h4>{!u.replies.length&&<p>No replies yet.</p>}{u.replies.map((r:Row)=><div className="record" key={r.id}><strong>{r.recipient} · {when(r.created_at)}</strong><p style={{whiteSpace:'pre-wrap'}}>{r.body}</p><p>{r.completed_at?'Completed '+when(r.completed_at):'Open follow-up · '+r.responsible_email}</p>{r.completed_at&&<p>{r.completion_evidence}</p>}{!r.completed_at&&counsel&&<Form label="Complete update follow-up" submit={d=>run(async()=>{await api('/matter-update-replies/'+r.id+'/complete',{evidence:d.evidence});await refresh();},'Reply follow-up completed with evidence')}><Field label="Reply completion evidence" name="evidence"/></Form>}</div>)}
   </details></article>)}
   <h3>Responsible counsel follow-up queue</h3>{!data.followups.length?<p>No unresolved replies.</p>:data.followups.map((r:Row)=><div className="record" key={r.id}><strong>{r.title}</strong><p>{r.body}</p><span>Open · {r.responsible_email}</span></div>)}
  </>}
 </details></section>;
}
