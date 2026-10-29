import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';
export function Correspondence({matterId,actor,run,tick,focusId}:{focusId?:string;matterId:string;actor:Row;run:Run;tick:number}){
 const [data,setData]=useState<Row|null>(null);
 useEffect(()=>{let live=true;setData(null);if(matterId&&['owner','lawyer'].includes(actor.role))api('/matters/'+matterId+'/correspondence').then(r=>{if(live)setData(r);}).catch(e=>{if(live)void run(async()=>{throw e;});});return()=>{live=false;};},[matterId,tick]);
 useEffect(()=>{if(focusId&&data)document.getElementById('correspondence-'+focusId)?.scrollIntoView({block:'start'});},[focusId,data]);
 if(!data)return null;
 return <section className="panel correspondence" aria-label="Reviewed email"><h2>Reviewed email</h2>
  <p>Review the exact recipient and letter before sending. Email requires recorded consent for every merged identity and current portal access. Invoice notifications carry only a secure sign-in prompt.</p>
  <details><summary>Review a letter or invoice notification</summary><Form label="Record email review" submit={d=>run(()=>api('/matters/'+matterId+'/correspondence',d),'Email review recorded')}>
   <Field label="Email recipient" name="recipient" type="email"/>
   <label>Issued invoice (optional)<select name="billId"><option value="">Client letter</option>{data.invoices.map((i:Row)=><option value={i.id} key={i.id}>{i.number}</option>)}</select></label>
   <Field label="Letter subject" name="subject" required={false}/><Field label="Reviewed letter" name="body" required={false}><textarea name="body" maxLength={20000}/></Field>
   <Field label="Review and sending authority" name="reviewNote"/>
  </Form></details>
  {!data.messages.length&&<p>No reviewed email yet.</p>}
  {data.messages.map((m:Row)=><article className="record" id={'correspondence-'+m.id} key={m.id} aria-label={'Email '+m.subject}><h3>{m.subject}</h3><p>To {m.recipient} · reviewed by {m.reviewed_by}</p><p style={{whiteSpace:'pre-wrap'}}>{m.body}</p><p>{m.review_note}</p><details><summary>Message source</summary><p className="document-hash">Review {m.id} · {m.reviewed_at}<br/>SHA-256 {m.searchDigest}</p></details>
   {m.attempts.map((a:Row,i:number)=><div className="record" key={a.id} aria-label={'Attempt '+(i+1)}><strong>Attempt {i+1} · {a.outcome}</strong><p>{a.nextAction}</p><p>Submission result: {a.detail}</p>{a.provider_id&&<p>Provider reference: {a.provider_id}</p>}<p>Decision by {a.decision_by}: {a.decision_note}</p>
    {a.status==='ready'?<button onClick={()=>run(()=>api('/mail-attempts/'+a.id+'/send',{}),'Email attempt recorded')}>Send reviewed email</button>:<>
     {a.provider==='resend'&&a.provider_id&&<button onClick={()=>run(()=>api('/mail-attempts/'+a.id+'/reconcile',{}),'Provider outcome checked')}>Check provider outcome</button>}
     {i===m.attempts.length-1&&<details><summary>Review another attempt</summary><p>Check the provider first. A new attempt may duplicate a message whose acknowledgment was lost.</p><Form label="Authorize another attempt" submit={d=>run(()=>api('/mail-attempts/'+a.id+'/resend-review',d),'New email decision recorded')}><Field label="New decision after checking the provider" name="reason"/></Form></details>}
    </>}{a.events.length>0&&<ul>{a.events.map((e:Row)=><li key={e.id}>{e.status} · {e.observed_at} · checked by {e.observed_by}</li>)}</ul>}
   </div>)}
  </article>)}
 </section>;
}
