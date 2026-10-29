import {useEffect,useState} from 'react';
import {api,dollars,Form,Field,type Row,type Run} from './common';

export function WriteoffCorrections({billId,run,tick}:{billId:string;run:Run;tick:number}){
 const [state,setState]=useState<Row>(),[error,setError]=useState('');
 const path='/invoices/'+billId;
 useEffect(()=>{api(path+'/writeoff-reversals').then(setState).catch(e=>setError(e.message));},[billId,tick]);
 if(!state)return <p role={error?'alert':undefined}>{error||'Opening finance corrections…'}</p>;
 const approve=(verb:string,b:Row)=>run(async()=>{
  await api(path+'/'+verb,{...b,cents:Number(b.cents),revision:state.revision,approve:true,requestKey:crypto.randomUUID()});
  setState(await api(path+'/writeoff-reversals'));
 },'Finance correction recorded');
 return <details><summary>Write-off corrections</summary><section aria-label="Write-off corrections">
  <p>Collectible balance: {dollars(state.funds.due_cents)} · Written off: {dollars(state.funds.written_off_cents)}</p>
  <p>Finance approval changes the receivable. Each receipt and bank deposit keeps its own history.</p>
  {state.funds.reservable_cents>0&&<Form label="Approve exact write-off" submit={b=>approve('writeoff',b)}><Field label="Write-off (USD cents)" name="cents" type="number"/><Field label="Write-off approval reason" name="reason"/></Form>}
  {state.writeoffs.map((w:Row)=><article className="panel" key={w.id}>
   <strong>Write-off {dollars(w.cents)}</strong><p>{w.reason} · approved by {w.actor} · {w.at}</p><p>Remaining write-off: {dollars(w.remainingCents)}</p>
   {w.remainingCents>0&&<Form label="Approve write-off reversal" submit={b=>approve('writeoff-reversals',{...b,writeoffId:w.id})}><Field label="Restore receivable (USD cents)" name="cents" type="number"/><Field label="Write-off correction reason" name="reason"/></Form>}
   {state.reversals.filter((r:Row)=>r.writeoff_id===w.id).map((r:Row)=><p key={r.id}>Restored {dollars(r.cents)} · {r.reason} · approved by {r.approved_by} · {r.at}</p>)}
  </article>)}
 </section></details>;
}
