import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';
// CLIENT-003: document requests chased to receipt. Staff ask, review and explain; the client reads and uploads.
const when=(iso:string)=>new Date(iso).toLocaleDateString('en-US',{dateStyle:'medium'});
async function attach(input:FormDataEntryValue|undefined){
 if(!(input instanceof File)||!input.size)return undefined;
 const bytes=new Uint8Array(await input.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return {name:input.name,contentBase64:btoa(binary)};
}
export function StaffRequests({matterId,state,run,tick}:{matterId:string;state:Row;run:Run;tick:number}){
 const [data,setData]=useState<Row|null>(null),staff=['owner','lawyer','assistant'].includes(state.actor.role),counsel=['owner','lawyer'].includes(state.actor.role);
 useEffect(()=>{if(!matterId||!staff){setData(null);return;}let live=true;api('/matters/'+matterId+'/requests').then(r=>{if(live)setData(r);}).catch(e=>{if(live)void run(async()=>{throw e;});});return()=>{live=false;};},[matterId,tick]);
 if(!matterId||!data)return null;
 return <section className="panel client-requests" aria-label="Document requests"><h2>Document requests</h2>
  <p>Ask the client for a specific record, review what arrives, and accept exactly one upload to file it and close that request. An upload alone never closes a request.</p>
  {!data.requests.length&&<p>No document requests on this matter.</p>}
  {data.requests.map((q:Row)=><article className="record" key={q.id} aria-label={'Request '+q.title}><strong>{q.title} · {q.status}{q.dueDate?' · due '+q.dueDate:''}</strong><p>{q.instructions}</p><p>Accept when: {q.criteria}</p><p>Owner {q.owner}{q.clientVisible?' · shared with the client':' · not shared'}</p>
   {q.reminders?.sequences.map((s:Row)=><p key={s.id}>Email reminders for {s.email}: {s.status} {s.reason}</p>)}
   {counsel&&q.status==='open'&&q.clientVisible&&<details><summary>Email reminders for {q.title}</summary><Form label={'Approve reminders for '+q.title} submit={d=>run(()=>api('/requests/'+q.id+'/reminders',{email:d.email,approved:d.approved==='on'}),'Reminders approved')}><Field label={'Opted-in reader for '+q.title} name="email" type="email"/><label><input type="checkbox" name="approved" required/>I approve this request’s email chase under the firm’s quiet hours and contact limit.</label></Form><Form label={'Stop reminders for '+q.title} danger submit={()=>run(()=>api('/requests/'+q.id+'/reminders',{stop:true}),'Reminders stopped')}><p>Stop this request’s automatic email chase.</p></Form></details>}
   {q.uploads.map((u:Row)=><div key={u.id}><p>{u.name} · uploaded by {u.by} · {u.review}{u.reviewNote?': '+u.reviewNote:''}</p>
    {counsel&&u.review==='submitted'&&q.status==='open'&&<><Form label={'Accept '+u.name} submit={d=>run(()=>api('/requests/'+q.id+'/review',{uploadId:u.id,decision:'accept',note:d.note}),'Upload accepted and filed')}><Field label={'Note on accepting '+u.name} name="note" required={false}/></Form>
     <Form label={'Mark '+u.name+' deficient'} danger submit={d=>run(()=>api('/requests/'+q.id+'/review',{uploadId:u.id,decision:'deficient',note:d.note}),'Deficiency sent to the client')}><Field label={'What is missing from '+u.name} name="note"/></Form></>}</div>)}
   {q.notes.map((n:Row)=><p key={n.id}>{n.side==='staff'?'Firm':'Client'} ({n.by}): {n.body}</p>)}
   {q.clientVisible&&q.status==='open'&&<Form label={'Send clarification on '+q.title} submit={d=>run(()=>api('/requests/'+q.id+'/notes',{body:d.body}),'Clarification sent')}><Field label={'Clarification on '+q.title} name="body"/></Form>}</article>)}
  <details><summary>Request a record from the client</summary><Form label="Send request" submit={d=>run(()=>api('/matters/'+matterId+'/requests',{title:d.title,instructions:d.instructions,criteria:d.criteria,owner:d.owner||undefined,dueDate:d.dueDate||undefined,clientVisible:d.clientVisible==='on'}),'Request created')}><Field label="Record requested" name="title"/><Field label="Instructions for the client" name="instructions"/><Field label="Acceptance criteria" name="criteria"/><Field label="Owner (email, default you)" name="owner" type="email" required={false}/><Field label="Due date" name="dueDate" type="date" required={false}/><label><input type="checkbox" name="clientVisible" defaultChecked/>Share with the client</label></Form></details>
 </section>;
}
export function PortalRequests({matterId}:{matterId:string}){
 const [list,setList]=useState<Row[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{api('/portal/matters/'+matterId+'/requests').then(r=>setList(r.requests)).catch(e=>setError(e.message));},[matterId]);
 const consent=async(q:Row,allowed:boolean)=>{try{await api('/portal/requests/'+q.id+'/reminder-consent',{consent:allowed});const r=await api('/portal/matters/'+matterId+'/requests');setList(r.requests);}catch(e){setError((e as Error).message);}};
 const send=async(path:string,body:Row)=>{setError('');try{const r=await api(path,body);setList(r.requests);}catch(e){setError((e as Error).message);}};
 return <div aria-label="Requests from your firm"><h3>Requests from your firm</h3>{error&&<p className="error" role="alert">{error}</p>}
  {!list?<p>Opening requests…</p>:!list.length?<p>Your firm has not asked you for any records.</p>:<ul>{list.map(q=><li key={q.id} className="record"><strong>{q.title}</strong> · {q.status==='received'?'received':'open'}{q.dueDate?' · due '+q.dueDate:''}<p>{q.instructions}</p><p>The firm will accept it when: {q.criteria}</p>
   {q.reminders?.sequences.map((s:Row)=><p key={s.id}>Email reminders for {s.email}: {s.status} {s.reason}</p>)}
   {q.uploads.map((u:Row)=><p key={u.id}>{u.name} · {when(u.at)} · {u.review==='deficient'?'needs correction: '+u.reviewNote:u.review}</p>)}
   {q.notes.map((n:Row)=><p key={n.id}>{n.side==='staff'?'Your firm':'You'}: {n.body}</p>)}
   {q.status==='open'&&<><Form label={'Set email reminders for '+q.title} submit={d=>consent(q,d.consent==='on')}><label><input type="checkbox" name="consent"/>Email me reminders for this request until it is accepted, stopped or escalated. I can withdraw permission here at any time.</label></Form><button type="button" className="quiet" onClick={()=>consent(q,false)}>Stop email reminders for {q.title}</button><p>Only plain-text .txt uploads are supported by the safety scan.</p><Form label={'Upload for '+q.title} submit={async d=>{const f=await attach(d.file);if(f)await send('/portal/requests/'+q.id+'/uploads',f);}}><Field label={'File for '+q.title} name="file"><input name="file" type="file" accept=".txt,text/plain" required/></Field></Form>
    <Form label={'Ask a question about '+q.title} submit={d=>send('/portal/requests/'+q.id+'/notes',{body:d.body})}><Field label={'Your question about '+q.title} name="body"/></Form></>}</li>)}</ul>}</div>;
}
