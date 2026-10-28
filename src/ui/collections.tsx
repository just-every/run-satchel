import {useEffect,useState} from 'react';
import {api,dollars,Empty,Field,Form,type Row,type Run} from './common';

const permitted=(actor:Row)=>actor.channel!=='agent'&&['owner','lawyer'].includes(actor.role);
const dateTime=(value:string|null|undefined)=>value?new Date(value).toLocaleString():'None scheduled';
const iso=(value:string)=>{
 const date=new Date(value);
 if(!value||!Number.isFinite(date.getTime()))throw new Error('Enter a valid collection date and time.');
 return date.toISOString();
};
type Act=(job:()=>Promise<any>,message:string)=>Promise<void>;

export function Collections({matterId,actor,run,tick}:{matterId:string;actor:Row;run:Run;tick:number}){
 if(!matterId||!permitted(actor))return null;
 return <CollectionsPanel key={matterId} matterId={matterId} run={run} tick={tick}/>;
}

function CollectionsPanel({matterId,run,tick}:{matterId:string;run:Run;tick:number}){
 const [state,setState]=useState<Row>(),[error,setError]=useState(''),[pending,setPending]=useState(false);
 useEffect(()=>{
  let live=true;
  void api('/matters/'+matterId+'/collections').then(data=>{if(live){setState(data);setError('');}}).catch(e=>{if(live)setError(e.message);});
  return()=>{live=false;};
 },[matterId,tick]);
 const act:Act=(job,message)=>{
  setPending(true);
  return run(job,message).finally(()=>setPending(false));
 };
 return <section className="panel" aria-label="Collections" style={{overflowWrap:'anywhere'}}><h2>Collections</h2>
  {error&&<p role="alert">{error}</p>}
  {!state?(!error&&<p role="status">Opening collections…</p>):<>
   {state.invoices.some((i:Row)=>i.dueCents>0)&&<details><summary>Receivables aging queue</summary>{state.invoices.filter((i:Row)=>i.dueCents>0).map((i:Row)=><article className="record" key={i.id}><strong>{i.number} · {dollars(i.dueCents)} remaining</strong><p>{i.dueDate?'Due '+i.dueDate+' · '+i.agingDays+' days overdue':'Due date needs reviewed delivery'}</p></article>)}</details>}
   {!state.sequences.length&&<Empty>No collection sequences recorded.</Empty>}
   <fieldset aria-label="Collection sequences" disabled={pending} style={{border:0,padding:0,margin:0,minWidth:0}}>
    {state.sequences.map((sequence:Row)=><CollectionRecord key={sequence.id} sequence={sequence} act={act}/>)}
    <details><summary>Start a collection sequence</summary>
     {!state.authorization?.enabled?<p>Open Firm → Client reminder settings → Templates and matter collection authority. Choose this matter and have its responsible counsel enable reminder authority before starting collections.</p>:<StartCollection matterId={matterId} state={state} act={act}/>}
    </details>
   </fieldset>
  </>}
 </section>;
}

function StartCollection({matterId,state,act}:{matterId:string;state:Row;act:Act}){
 const [kind,setKind]=useState('invoice');
 const templateId=kind==='invoice'?state.authorization.invoice_template:null;
 const template=kind==='invoice'?state.templates.find((t:Row)=>t.id===templateId):{subject:'A secure portal update',body:'A secure portal update is available. Sign in to review it or contact counsel.'};
 const sources=kind==='invoice'?state.invoices:state.ledgers;
 return <>
  <p>Requires responsible-counsel client-reminder authority and the recipient’s recorded consent. Contact limit: {state.authorization.max_contacts}. Retainer replenishment also requires an approved replenishment request.</p>
  {template&&<details><summary>Review authorized reminder wording</summary><p><strong>{template.subject}</strong></p><p style={{whiteSpace:'pre-wrap'}}>{template.body}</p></details>}
  <Field label="Collection type" name="collectionKind"><select value={kind} onChange={e=>setKind(e.target.value)}><option value="invoice">Invoice balance</option><option value="retainer">Retainer replenishment</option></select></Field>
  {!sources.length?<p>{kind==='invoice'?'No eligible invoices are available.':'No ledgers with an approved replenishment request are available.'}</p>:<Form label="Start collection sequence" submit={d=>act(()=>{
   const steps=String(d.steps).split(',').map((value:string)=>Number(value.trim()));
   if(!/^\s*\d+(\s*,\s*\d+)*\s*$/.test(String(d.steps))||steps.length>8||steps[0]!==0||steps.some((day:number,index:number)=>!Number.isSafeInteger(day)||day<0||day>365||(index>0&&day<=steps[index-1])))throw new Error('Enter one to eight increasing whole-day offsets from 0 to 365, starting at 0, such as 0, 7, 14.');
   return api('/matters/'+matterId+'/collections',{[kind==='invoice'?'billId':'ledgerId']:d.sourceId,recipient:d.recipient,firstDueAt:iso(d.firstDueAt),steps,reason:d.reason,confirmed:d.confirmed==='on'});
  },'Collection sequence started')}>
   <Field label={kind==='invoice'?'Invoice to collect':'Retainer ledger to replenish'} name="sourceId"><select name="sourceId" required key={kind}><option value="">Choose {kind==='invoice'?'an invoice':'a ledger'}</option>{sources.map((source:Row)=><option key={source.id} value={source.id}>{kind==='invoice'?`${source.number} · ${dollars(source.dueCents)} remaining · ${source.dueDate?'due '+source.dueDate:'due date not recorded'}`:source.name}</option>)}</select></Field>
   <Field label="Collection recipient email" name="recipient" type="email"/>
   <Field label="First contact date and time (local time)" name="firstDueAt" type="datetime-local"/>
   <Field label="Contact day offsets from first contact" name="steps" value="0, 7, 14"/>
   <Field label="Reason for collection" name="reason"/>
   <label className="check"><input type="checkbox" name="confirmed" required/>I confirm counsel authority, recipient consent and this collection schedule.</label>
  </Form>}
 </>;
}

function CollectionRecord({sequence:s,act}:{sequence:Row;act:Act}){
 const [kind,setKind]=useState('dispute');
 const open=['active','paused','review'].includes(s.status);
 return <article className="record" aria-label={'Collection for '+(s.number??s.recipient)}>
  <strong>{s.kind==='invoice'?'Invoice '+(s.number??s.bill_id):'Retainer replenishment'} · {s.dueCents===null?'Balance requires review':dollars(s.dueCents)+' remaining'}</strong>
  <p>{s.recipient} · <span className="badge">{s.status}</span><br/>Responsible owner: {s.owner_email}<br/>Next contact: {dateTime(s.nextDueAt)} · {Number(s.step)<s.steps.length?`Step ${Number(s.step)+1} of ${s.steps.length}`:'Schedule complete'}</p>
  <details><summary>Schedule and collection history</summary>
   <p>{s.reason}</p>{s.subject&&<><h3>Approved reminder wording</h3><p><strong>{s.subject}</strong></p><p style={{whiteSpace:'pre-wrap'}}>{s.body}</p></>}<p>Contact day offsets: {s.steps.join(', ')}</p>
   <h3>Replies and decisions</h3>
   {!s.events.length?<p>No replies or decisions recorded.</p>:<ul>{s.events.map((event:Row,index:number)=><li key={index}><strong>{event.kind.replaceAll('_',' ')}</strong> · {dateTime(event.at)}<br/>{event.note}</li>)}</ul>}
   <h3>Contact attempts</h3>
   {!s.attempts.length?<p>No contact attempts recorded.</p>:<ul>{s.attempts.map((attempt:Row)=><li key={attempt.id}>Step {Number(attempt.collection_step)+1} · {attempt.status} · {attempt.outcome}<br/>Due {dateTime(attempt.due_at)}{attempt.attempted_at&&<> · Attempted {dateTime(attempt.attempted_at)}</>}{attempt.detail&&<><br/>{attempt.detail}</>}</li>)}</ul>}
  </details>
  {open&&<details><summary>Record reply or collection decision</summary>
   <p>Disputes, promises, hardship and representation pause contact. Clear a resolved reply to resume; after an uncertain delivery, record a decision before the next distinct step.</p>
   <Form label="Record collection action" submit={d=>act(()=>api('/collections/'+s.id+'/actions',{kind,note:d.note,...(d.nextDueAt?{nextDueAt:iso(d.nextDueAt)}:{})}),'Collection action recorded')}>
    <Field label="Reply or decision" name="kind"><select value={kind} onChange={e=>setKind(e.target.value)}><option value="dispute">Dispute — pause contact</option><option value="promise">Promise to pay — pause contact</option><option value="hardship">Hardship — pause contact</option><option value="representation">Representation — pause contact</option><option value="clear">Clear reply — resume contact</option><option value="decision">Review uncertain delivery — allow next step</option><option value="stop">Stop collection</option></select></Field>
    <Field label="Reply or decision note" name="note"><textarea name="note" required/></Field>
    <Field label="Next contact date and time (optional, local time)" name="nextDueAt" type="datetime-local" required={false}/>
   </Form>
  </details>}
  {s.status==='active'&&<div className="actions"><button type="button" onClick={()=>act(()=>api('/collections/'+s.id+'/run',{}),'Due collection step checked')}>Send due collection step</button></div>}
 </article>;
}
