import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';
// CLIENT-002: retained two-way messages. Staff work them from the matter; a client opens them only inside the portal.
const when=(iso:string)=>new Date(iso).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'});
async function attach(input:FormDataEntryValue|undefined){
 if(!(input instanceof File)||!input.size)return undefined;
 const bytes=new Uint8Array(await input.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return [{name:input.name,contentBase64:btoa(binary)}];
}
function Message({m,link}:{m:Row;link:string}){
 return <li className="record"><strong>{m.from} · {m.side==='staff'?'firm':'client'}</strong><p>{when(m.at)}</p><p>{m.body}</p>{m.attachments.map((a:Row)=><p key={a.id}><a href={link+a.id}>Download {a.name}</a> ({a.size} bytes)</p>)}</li>;
}
export function StaffThreads({matterId,state,run,tick}:{matterId:string;state:Row;run:Run;tick:number}){
 const [data,setData]=useState<Row|null>(null),staff=['owner','lawyer','assistant'].includes(state.actor.role),counsel=['owner','lawyer'].includes(state.actor.role);
 useEffect(()=>{if(!matterId||!staff){setData(null);return;}let live=true;api('/matters/'+matterId+'/threads').then(r=>{if(live)setData(r);}).catch(e=>{if(live)void run(async()=>{throw e;});});return()=>{live=false;};},[matterId,tick]);
 if(!matterId||!data)return null;
 return <section className="panel portal-threads" aria-label="Client messages"><h2>Client messages</h2>
  <p>Messages stay in the portal: a client is emailed only that a message is waiting, never its content. Every message, attachment, notification and read is kept.</p>
  {!data.threads.length&&<p>No messages with the client yet.</p>}
  {data.threads.map((t:Row)=><article className="record" key={t.id} aria-label={'Thread '+t.subject}><strong>{t.subject}{t.unread?` · ${t.unread} unread`:''}</strong><p>Assigned to {t.assignedTo}</p>
   <ol>{t.messages.map((m:Row)=><li key={m.id}><Message m={m} link="/api/satchel/attachments/"/><p>{m.readBy.length?'Read by '+m.readBy.map((r:Row)=>r.by).join(', '):m.side==='staff'?'Not yet read by the client':'Not yet read by staff'}</p>{m.notifications.map((n:Row,i:number)=><p key={i}>Notification to {n.to}: {n.status.replace('_',' ')}</p>)}</li>)}</ol>
   {t.unread>0&&<Form label={'Mark '+t.subject+' read'} submit={()=>run(()=>api('/threads/'+t.id+'/read',{}),'Marked read')}><span/></Form>}
   <Form label={'Reply in '+t.subject} submit={d=>run(async()=>api('/threads/'+t.id+'/messages',{body:d.body,attachments:await attach(d.file)}),'Reply sent')}><Field label={'Your reply in '+t.subject} name="body"><textarea name="body" required maxLength={20000}/></Field><Field label={'Attachment for '+t.subject} name="file" required={false}><input name="file" type="file"/></Field></Form>
   {counsel&&<Form label={'Assign '+t.subject} submit={d=>run(()=>api('/threads/'+t.id+'/assign',{assignedTo:d.assignedTo}),'Thread assigned')}><Field label={'Assign '+t.subject+' to'} name="assignedTo" type="email"/></Form>}</article>)}
  <details><summary>Start a message to the client</summary><Form label="Send message" submit={d=>run(async()=>api('/matters/'+matterId+'/threads',{subject:d.subject,body:d.body,assignedTo:d.assignedTo||undefined,attachments:await attach(d.file)}),'Message sent')}><Field label="Subject" name="subject"/><Field label="Message" name="body"><textarea name="body" required maxLength={20000}/></Field><Field label="Attachment" name="file" required={false}><input name="file" type="file"/></Field><Field label="Assign replies to (email, default you)" name="assignedTo" type="email" required={false}/></Form></details>
 </section>;
}
export function PortalThreads({matterId}:{matterId:string}){
 const [threads,setThreads]=useState<Row[]|null>(null),[open,setOpen]=useState(''),[error,setError]=useState('');
 const load=()=>api('/portal/matters/'+matterId+'/threads').then(r=>setThreads(r.threads)).catch(e=>setError(e.message));
 useEffect(()=>{void load();},[matterId]);
 const show=async(id:string)=>{setError('');try{const r=await api('/portal/threads/'+id+'/open',{});setThreads(r.threads);setOpen(id);}catch(e){setError((e as Error).message);}};
 return <div aria-label="Messages"><h3>Messages</h3>{error&&<p className="error" role="alert">{error}</p>}
  {!threads?<p>Opening messages…</p>:!threads.length?<p>You have no messages on this matter.</p>:<ul>{threads.map(t=><li key={t.id} className="record"><strong>{t.subject}</strong>{t.unread>0&&<span> · {t.unread} unread</span>}{open===t.id?
   <><ol>{t.messages.map((m:Row)=><Message key={m.id} m={m} link="/api/satchel/portal/attachments/"/>)}</ol>
    <Form label={'Reply to '+t.subject} submit={async d=>{setError('');try{const r=await api('/portal/threads/'+t.id+'/messages',{body:d.body,attachments:await attach(d.file)});setThreads(r.threads);}catch(e){setError((e as Error).message);}}}><Field label={'Your reply to '+t.subject} name="body"><textarea name="body" required maxLength={20000}/></Field><Field label={'Attachment for '+t.subject} name="file" required={false}><input name="file" type="file"/></Field></Form></>
   :<p><button type="button" onClick={()=>show(t.id)}>Open {t.subject}</button></p>}</li>)}</ul>}</div>;
}
