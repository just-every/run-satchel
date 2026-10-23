import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';
// CLIENT-004: what the firm shares with a client (staff) and what the client sees and may do (portal).
const when=(iso:string)=>new Date(iso).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'});
export function ClientShares({matterId,state,run,tick}:{matterId:string;state:Row;run:Run;tick:number}){
 const [data,setData]=useState<Row|null>(null),[options,setOptions]=useState<Row[]>([]),[kind,setKind]=useState('task'),counsel=['owner','lawyer'].includes(state.actor.role);
 useEffect(()=>{if(!matterId||!['owner','lawyer','assistant'].includes(state.actor.role)){setData(null);return;}let live=true;Promise.all([api('/matters/'+matterId+'/client-shares'),counsel?api('/matters/'+matterId+'/tasks'):[],counsel?api('/matters/'+matterId+'/calendar'):{appointments:[],deadlines:[]},counsel?api('/matters/'+matterId+'/documents'):[]]).then(([s,t,c,docs])=>{if(!live)return;setData(s);setOptions([...t.filter((x:Row)=>x.status==='open'&&!x.legalDate).map((x:Row)=>({id:x.id,kind:'task',label:x.title})),...c.appointments.map((x:Row)=>({id:x.id,kind:'event',label:x.title})),...c.deadlines.filter((x:Row)=>x.status==='confirmed').map((x:Row)=>({id:x.id,kind:'deadline',label:x.title})),...docs.filter((x:Row)=>x.visibility==='matter'&&!x.erasedAt).map((x:Row)=>({id:x.id,kind:'document',label:x.title}))]);}).catch(e=>{if(live)void run(async()=>{throw e;});});return()=>{live=false;};},[matterId,tick]);
 if(!matterId||!data)return null;
 return <section className="panel client-shares" aria-label="Shared with the client"><h2>Shared with the client</h2>
  <p>A client with portal access sees only the tasks, events, confirmed deadlines and documents shared here, with your instructions. They can acknowledge each and mark a shared task done; they cannot change a date or a deadline, and their completion never closes your own task.</p>
  {!data.shares.length&&<p>Nothing is shared with the client.</p>}
  {data.shares.map((s:Row)=><article className="record" key={s.id} aria-label={'Shared '+s.title}><strong>{s.title} · {s.kind}{s.revokedAt?' · withdrawn':''}</strong><p>{s.instructions}</p>{s.acks.map((a:Row,i:number)=><p key={i}>{a.kind==='completed'?'Marked done':'Acknowledged'} by {a.by} · {when(a.at)}{a.note?' · '+a.note:''}</p>)}{counsel&&!s.revokedAt&&<Form label={'Withdraw '+s.title} danger submit={()=>run(()=>api('/client-shares/'+s.id+'/revoke',{}),'Share withdrawn')}><span/></Form>}</article>)}
  {counsel&&<Form label="Share with client" submit={d=>run(()=>api('/matters/'+matterId+'/client-shares',{kind,recordId:d.recordId,instructions:d.instructions}),'Shared with the client')}>
   <Field label="Share a" name="kind"><select name="kind" value={kind} onChange={e=>setKind(e.target.value)}><option value="task">Client task</option><option value="event">Event</option><option value="deadline">Confirmed deadline (read-only)</option><option value="document">Document (for example a release)</option></select></Field>
   <Field label="Record to share" name="recordId"><select name="recordId" required defaultValue=""><option value="">Choose one</option>{options.filter(o=>o.kind===kind).map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></Field>
   <Field label="Instructions for the client" name="instructions"/>
  </Form>}
 </section>;
}
export function PortalShares({matterId}:{matterId:string}){
 const [items,setItems]=useState<Row[]|null>(null),[error,setError]=useState('');
 const load=()=>api('/portal/matters/'+matterId+'/shares').then(r=>setItems(r.items)).catch(e=>setError(e.message));
 useEffect(()=>{void load();},[matterId]);
 const act=async(id:string,op:'acknowledge'|'complete')=>{setError('');try{const r=await api('/portal/shares/'+id+'/'+op,{});setItems(r.items);}catch(e){setError((e as Error).message);}};
 return <div aria-label="Tasks and events"><h3>Tasks and events</h3>{error&&<p className="error" role="alert">{error}</p>}
  {!items?<p>Opening your tasks…</p>:!items.length?<p>Your firm has not shared a task or event on this matter yet.</p>:<ul className="shared-items">{items.map(i=><li key={i.id} className="record"><strong>{i.title}</strong>
   <p>{i.kind==='task'?'Task'+(i.dueDate?' · due '+i.dueDate:''):i.kind==='document'?'Document':i.kind==='event'?'Event · '+i.occurrences.map((o:Row)=>o.date+' '+o.time).join(', ')+' ('+i.timezone+')'+(i.location?' · '+i.location:''):'Court date · '+i.date+' ('+i.timezone+')'}</p><p>{i.instructions}</p>
   {i.acknowledgedAt?<p>You acknowledged this {when(i.acknowledgedAt)}.</p>:<button type="button" onClick={()=>act(i.id,'acknowledge')}>Acknowledge {i.title}</button>}
   {i.kind==='task'&&(i.completedAt?<p>You marked this done {when(i.completedAt)}.</p>:<button type="button" onClick={()=>act(i.id,'complete')}>Mark {i.title} done</button>)}
   {i.kind==='document'&&<p><a href={i.fileUrl}>Download {i.title}</a></p>}
   {(i.kind==='event'||i.kind==='deadline')&&<p className="note">Dates are set by your firm. Contact your lawyer to change one.</p>}</li>)}</ul>}</div>;
}

export function PortalInvoices({matterId}:{matterId:string}){
 const [list,setList]=useState<Row[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{api('/portal/matters/'+matterId+'/invoices').then(r=>setList(r.invoices)).catch(e=>setError(e.message));},[matterId]);
 const usd=(c:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
 return <div aria-label="Invoices"><h3>Invoices</h3>{error&&<p className="error" role="alert">{error}</p>}{!list?<p>Opening invoices…</p>:!list.length?<p>No invoice has been issued on this matter.</p>:<ul>{list.map(i=><li key={i.id} className="record"><strong>{i.number}</strong> · {when(i.issuedAt)} · {usd(i.totalCents)}<p><a href={i.pdfUrl}>Download invoice {i.number}</a></p></li>)}</ul>}</div>;
}
