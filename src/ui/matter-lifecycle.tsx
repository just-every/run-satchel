import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';
export function MatterLifecycle({matterId,actor,run,tick}:{matterId:string;actor:Row;run:Run;tick:number}){
 const [state,setState]=useState<Row>(),[documents,setDocuments]=useState<Row[]>([]),[preview,setPreview]=useState<Row>(),[exceptions,setExceptions]=useState<Row>({}),[promises,setPromises]=useState<Row[]>([]),[workflows,setWorkflows]=useState<string[]>([]),[access,setAccess]=useState<string[]>([]);
 const base='/matters/'+matterId;
 useEffect(()=>{setState(undefined);setPreview(undefined);setExceptions({});setPromises([]);setWorkflows([]);setAccess([]);},[matterId]);
 useEffect(()=>{let active=true;if(matterId&&['owner','lawyer'].includes(actor.role))Promise.all([api(base+'/lifecycle'),api(base+'/documents')]).then(([s,docs])=>{if(active){setState(s);setDocuments(docs.filter((d:Row)=>!d.erasedAt));}}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;};},[matterId,tick,actor.role]);
 if(!matterId||!['owner','lawyer'].includes(actor.role))return null;
 const source=(name:string,label:string)=><Field label={label} name={name}><select name={name}><option value="">Choose retained source</option>{documents.map(d=><option key={d.id} value={d.id}>{d.title} · version {d.currentVersion}</option>)}</select></Field>;
 const toggle=(ids:string[],id:string,on:boolean)=>on?[...ids,id]:ids.filter(v=>v!==id);
 return <section className="panel"><h2>Matter closure</h2>{!state?<p>Opening closure checks…</p>:<>
  <p>Lifecycle: {state.status}</p><p>Closing records counsel’s disposition. Work, reminders and access continue. Reopening changes no grants and starts no jobs.</p>
  {state.status==='open'?<>
   <h3>Client promise inventory</h3>{promises.map(p=><article className="record" key={p.id}><strong>{p.title}</strong><p>{p.status} · {p.dueDate||'No due date'}</p><button className="quiet" onClick={()=>{setPromises(ps=>ps.filter(v=>v.id!==p.id));setPreview(undefined);}}>Remove promise {p.title}</button></article>)}
   <Form label="Add promise to review" submit={async d=>{setPromises(ps=>[...ps,{...d,id:crypto.randomUUID(),documentId:d.documentId||undefined,dueDate:d.dueDate||undefined}]);setPreview(undefined);}}><Field label="Promise title" name="title"/><Field label="Promise due date" name="dueDate" type="date" required={false}/><Field label="Promise state" name="status"><select name="status"><option value="open">Open</option><option value="fulfilled">Fulfilled with source evidence</option></select></Field>{source('documentId','Promise source original')}<Field label="Promise review note" name="note" required={false}/></Form>
   <Form label="Review closure checks" submit={d=>run(async()=>{setPreview(await api(base+'/closure-preview',{clientPromisesReviewed:d.reviewed==='on',clientPromises:promises,originalReturn:{status:d.originalStatus,documentId:d.documentId||undefined,note:d.originalNote}}));setExceptions({});},'Closure review prepared')}>
    <label><input type="checkbox" name="reviewed"/>I reviewed every outstanding client promise</label>
    <Field label="Original-file return status" name="originalStatus"><select name="originalStatus"><option value="outstanding">Return outstanding</option><option value="returned">Returned, with source confirmation</option><option value="not_held">No client originals held</option></select></Field>{source('documentId','Original return confirmation source')}<Field label="Original-file review evidence" name="originalNote"/>
   </Form>
   {preview&&<div className="review"><h3>Exact closure review</h3>{preview.hasRestrictedItems?<p>Restricted item: ask authorized counsel. This review cannot authorize closure.</p>:<p>{preview.checks.length} unresolved items. Resolve an item in its own workspace and prepare a new review, or record why counsel carries it.</p>}
    {!preview.hasRestrictedItems&&<Form label="Close reviewed matter" submit={d=>run(async()=>{setState(await api(base+'/close',{previewId:preview.id,digest:preview.digest,revision:preview.revision,reason:d.reason,exceptions:preview.checks.map((c:Row)=>({key:c.key,reason:exceptions[c.key]??''}))}));setPreview(undefined);},'Matter closed with recorded disposition')}>
     {preview.checks.map((c:Row)=><article className="record" key={c.key}><strong>{c.title}</strong><p>{c.kind}{c.state.balanceCents!==undefined?' · USD '+(c.state.balanceCents/100).toFixed(2):''}</p><label>Carry reason for {c.title}<input required value={exceptions[c.key]??''} onChange={e=>setExceptions(x=>({...x,[c.key]:e.target.value}))}/></label></article>)}
     <Field label="Closure reason" name="reason"/>
    </Form>}
   </div>}
  </>:<Form label="Reopen matter" submit={d=>run(async()=>{setState(await api(base+'/reopen',{revision:state.revision,reason:d.reason,workflows,access}));setWorkflows([]);setAccess([]);},'Matter reopened with explicit decisions')}>
   <Field label="Reopening reason" name="reason"/><fieldset><legend>Approve retained workflows on reopening</legend>{state.workflows.map((w:Row)=><label key={w.id}><input type="checkbox" checked={workflows.includes(w.id)} onChange={e=>setWorkflows(toggle(workflows,w.id,e.target.checked))}/>{w.title}</label>)}</fieldset>
   <fieldset><legend>Approve existing access on reopening</legend>{state.access.map((email:string)=><label key={email}><input type="checkbox" checked={access.includes(email)} onChange={e=>setAccess(toggle(access,email,e.target.checked))}/>{email}</label>)}</fieldset>
  </Form>}
  <h3>Lifecycle history</h3>{state.history.map((e:Row)=><article className="record" key={e.id}><strong>{e.kind} · {e.actor}</strong><p>{e.at} · {e.reason}</p>{e.exceptions.map((x:Row)=><p key={x.key}>Carried {e.snapshot.checks.find((c:Row)=>c.key===x.key).title}: {x.reason}</p>)}{e.kind==='reopened'&&<p>Approved retained workflows: {e.restoration.workflows?.length??0}; existing access: {e.restoration.access?.join(', ')||'None'}</p>}</article>)}
 </>}
 </section>;
}
