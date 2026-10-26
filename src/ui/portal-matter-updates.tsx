import {useEffect,useState} from 'react';
import {api,Field,Form,type Row} from './common';

const when=(value:string)=>new Date(value).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'});

export function PortalMatterUpdates({matterId}:{matterId:string}){
 const [updates,setUpdates]=useState<Row[]>(),[error,setError]=useState(''),[notice,setNotice]=useState(''),[sent,setSent]=useState(0);
 const load=async()=>{const result=await api('/portal/matters/'+matterId+'/updates');setUpdates(result.updates);};
 useEffect(()=>{let live=true;setUpdates(undefined);setError('');setNotice('');api('/portal/matters/'+matterId+'/updates').then(result=>{if(live)setUpdates(result.updates);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[matterId]);
 return <section aria-label="Matter updates"><h3>Matter updates</h3>{error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!updates?<p>Opening matter updates…</p>:!updates.length?<p>Your firm has not delivered a matter update yet.</p>:updates.map(update=><article className="record" key={update.id} aria-label={'Matter update '+update.title}>
   <strong>{update.title}</strong><span>Delivered {when(update.publishedAt)}</span><p style={{whiteSpace:'pre-wrap'}}>{update.body}</p>
   <p>Cited order: {update.sourceCitation}</p>{update.previousDate&&<p>Previous confirmed date: {update.previousDate}<br/>New confirmed date: {update.newDate}</p>}
   {!update.previousDate&&update.newDate&&<p>Confirmed date: {update.newDate}</p>}
   {update.promises.length>0&&<><h4>Your firm’s promises</h4><ul>{update.promises.map((promise:Row,index:number)=><li key={index}>{promise.text} · {promise.status==='fulfilled'?'fulfilled':'open'}</li>)}</ul></>}
   <details><summary>Replies and follow-up: {update.title}</summary>{!update.replies.length&&<p>No replies yet.</p>}{update.replies.map((reply:Row)=><div className="record" key={reply.id}><p style={{whiteSpace:'pre-wrap'}}>{reply.body}</p><span>{when(reply.createdAt)} · {reply.completedAt?'Your firm completed this follow-up':'Awaiting your responsible lawyer’s follow-up'}</span></div>)}</details>
   <Form key={update.id+':'+sent} label={'Send reply about '+update.title} submit={async d=>{setError('');setNotice('');try{await api('/portal/matter-updates/'+update.id+'/replies',{body:d.body});await load();setSent(n=>n+1);setNotice('Reply sent. Your responsible lawyer has an open follow-up.');}catch(e){setError((e as Error).message);}}}>
    <Field label={'Your reply about '+update.title} name="body"><textarea name="body" required rows={3} maxLength={10000}/></Field>
   </Form>
  </article>)}
 </section>;
}
