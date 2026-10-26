import {useEffect,useRef,useState} from 'react';
import {api,dollars,Field,Form,type Row,type Run} from './common';

// RFC-style quoted CSV fields retain commas and newlines in real work narratives.
function csv(content:string){
 const result:string[][]=[],record:string[]=[];let field='',quoted=false;
 for(let i=0;i<content.length;i++){
  const c=content[i];
  if(c==='"'){if(quoted&&content[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&(c===','||c==='\n')){record.push(field.trim());field='';if(c==='\n'){if(record.some(Boolean))result.push([...record]);record.length=0;}}
  else if(c!=='\r'||quoted)field+=c;
 }
 if(quoted)throw new Error('Close the quoted CSV field before importing');
 record.push(field.trim());if(record.some(Boolean))result.push(record);
 const headers=result.shift();if(!headers?.includes('kind')||!headers.includes('sourceId'))throw new Error('Include the documented header with kind and sourceId');
 if(new Set(headers).size!==headers.length)throw new Error('Each CSV column needs a distinct heading');
 return result.map((r,i)=>{if(r.length!==headers.length)throw new Error(`CSV row ${i+2} has ${r.length} fields; expected ${headers.length}`);return Object.fromEntries(headers.map((h,j)=>[h,r[j]]));});
}
const optionalNumber=(v:any)=>v===''||v==null?undefined:Number(v);
function work(d:Row,matterId:string):Row{
 const expense=d.kind==='disbursement'?{category:d.category,vendor:d.vendor,vendorReference:d.vendorReference,accountingCode:d.accountingCode,
  ...(d.expenseSourceSystem?{sourceSystem:d.expenseSourceSystem}:{}),...(d.expenseSourceId?{sourceId:d.expenseSourceId}:{}),
  ...(d.receiptDocumentId?{receipt:{documentId:d.receiptDocumentId,version:optionalNumber(d.receiptVersion)}}:{})}:undefined;
 return {matterId:d.matterId||matterId,kind:d.kind,date:d.date,description:d.description,sourceId:d.sourceId,timekeeperEmail:d.timekeeperEmail||undefined,
  minutes:optionalNumber(d.minutes),rateCents:optionalNumber(d.rateCents),amountCents:optionalNumber(d.amountCents),billable:d.billable==='on'||d.billable==='true'?true:d.billable===undefined||d.billable==='false'?false:d.billable,utbmsTask:d.utbmsTask||undefined,utbmsActivity:d.utbmsActivity||undefined,utbmsExpense:d.utbmsExpense||undefined,expense};
}
function RepairFields({input,actor}:{input:Row;actor:Row}){
 const e=input.expense??{};
 return <><Field label="Matter ID" name="matterId" value={input.matterId}/><Field label="Original source row reference" name="sourceId" value={input.sourceId}/>
  <label>Work kind<select name="kind" defaultValue={input.kind}><option value="time">Time</option><option value="disbursement">Expense</option></select></label>
  <Field label="Original timekeeper email" name="timekeeperEmail" value={input.timekeeperEmail||actor.email}/><Field label="Work date" name="date" type="date" value={input.date}/><Field label="Work description" name="description" value={input.description}/>
  <div className="inline"><Field label="Worked minutes (time only)" name="minutes" type="number" required={false} value={input.minutes??''}/><Field label="Hourly USD cents (blank uses agreement)" name="rateCents" type="number" required={false} value={input.rateCents??''}/><Field label="Expense USD cents" name="amountCents" type="number" required={false} value={input.amountCents??''}/></div>
  <div className="inline"><Field label="UTBMS task" name="utbmsTask" required={false} value={input.utbmsTask??''}/><Field label="UTBMS activity" name="utbmsActivity" required={false} value={input.utbmsActivity??''}/><Field label="UTBMS expense" name="utbmsExpense" required={false} value={input.utbmsExpense??''}/></div>
  <label className="check"><input name="billable" type="checkbox" defaultChecked={input.billable===true}/>Billable work (overhead is always nonbillable)</label>
  <details><summary>Expense provenance (required for expenses)</summary>
   <label>Expense category<select name="category" defaultValue={e.category??'client_disbursement'}><option value="client_disbursement">Client disbursement</option><option value="advanced_cost">Advanced cost</option><option value="overhead">Overhead</option></select></label>
   <Field label="Vendor" name="vendor" required={false} value={e.vendor??''}/><Field label="Vendor reference" name="vendorReference" required={false} value={e.vendorReference??''}/><Field label="Accounting code" name="accountingCode" required={false} value={e.accountingCode??''}/>
   <Field label="Expense source system (blank uses import source)" name="expenseSourceSystem" required={false} value={e.sourceSystem??''}/><Field label="Expense source ID (blank uses row reference)" name="expenseSourceId" required={false} value={e.sourceId??''}/>
   <Field label="Receipt document ID" name="receiptDocumentId" required={false} value={e.receipt?.documentId??''}/><Field label="Receipt version" name="receiptVersion" type="number" required={false} value={e.receipt?.version??''}/>
  </details></>;
}
export function BulkWork({matterId,actor,run,tick}:{matterId:string;actor:Row;run:Run;tick:number}){
 const [batches,setBatches]=useState<Row[]>([]),[content,setContent]=useState(''),[source,setSource]=useState(''),[reviewed,setReviewed]=useState(''),requestId=useRef(crypto.randomUUID());
 useEffect(()=>{let active=true;api('/time/bulk').then(r=>{if(active)setBatches(r.batches);}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;};},[tick]);
 const save=(b:Row)=>{setBatches(list=>[b,...list.filter(x=>x.id!==b.id)]);setReviewed('');};
 const change=()=>{requestId.current=crypto.randomUUID();setReviewed('');};
 return <section className="panel"><h2>Bulk work import</h2><div className="content">
  <p>Import time and expenses, repair each row, then review and post the entire batch once. Original work attribution and source references are retained. {actor.role==='owner'?'The principal may attribute work to active staff who can see each matter.':'Import your own work only.'}</p>
  <details><summary>CSV format and expense columns</summary><p>Include a header. Required columns: kind (time or disbursement), date (YYYY-MM-DD), description, sourceId, billable (true or false). Time needs minutes. Expense needs amountCents, category (client_disbursement, advanced_cost or overhead), vendor, vendorReference and accountingCode. All money is whole USD cents.</p><p>Optional columns: matterId (defaults to this matter), timekeeperEmail (defaults to you), rateCents (blank uses the work-date agreement), utbmsTask, utbmsActivity, utbmsExpense, expenseSourceSystem, expenseSourceId, receiptDocumentId and receiptVersion. Quote descriptions containing commas or newlines. Give each source row a permanent unique reference; imported assertions are not vendor verification.</p></details>
  <Form label="Validate import" submit={()=>run(async()=>{if(!matterId)throw new Error('Choose a matter before importing');save(await api('/time/bulk',{requestId:requestId.current,sourceSystem:source,rows:csv(content).map(r=>work(r,matterId))}));},'Import validated; review every row')}>
   <label>Source system<input required value={source} onChange={e=>{setSource(e.target.value);change();}}/></label><label>Weekly work CSV<textarea required rows={7} value={content} onChange={e=>{setContent(e.target.value);change();}} placeholder="kind,date,description,sourceId,billable,minutes"/></label>
  </Form>
  {batches.length===0&&<p>No imported batches.</p>}
  {batches.map(b=><article className="record" key={b.id} aria-label={'Bulk work '+b.sourceSystem}><h3>{b.sourceSystem} · {b.status==='posted'?'Posted':'Review required'}</h3><p>{b.rows.length} rows · {b.rows.filter((r:Row)=>r.errors.length).length} invalid · {dollars(b.rows.reduce((n:number,r:Row)=>n+(r.value?.billable?r.value.amountCents:0),0))} billable</p>
   {b.rows.map((r:Row)=><article className="record" key={r.id} aria-label={'Import row '+r.ordinal}><strong>Row {r.ordinal} · {r.input.description}</strong><p>{r.input.date} · {r.value?.matterNumber??r.input.matterId} · Original timekeeper {r.value?.timekeeperEmail??r.input.timekeeperEmail??actor.email} · {r.input.sourceId}</p>
    {r.errors.map((error:string)=><p role="alert" key={error}>{error}</p>)}
    {r.value&&<p>{r.value.kind==='time'?`${r.value.minutes} worked minutes · ${r.value.price.billedMinutes} billed minutes · ${dollars(r.value.price.rateCents)}/hour · ${r.value.price.rateSource}`:'Expense'} · {dollars(r.value.amountCents)} · {r.value.billable?'Billable':'Nonbillable'}{r.value.costBasis?` · Staff cost ${dollars(r.value.costBasis.costCents)} (approved rate)` :r.value.kind==='time'&&actor.role==='owner'?' · Staff cost not recorded':''}</p>}
    {r.value?.expenseMeta&&<p>Expense: {r.value.expenseMeta.detail.category} · {r.value.expenseMeta.detail.vendor} · {r.value.expenseMeta.detail.vendorReference} · {r.value.expenseMeta.detail.accountingCode} · {r.value.expenseMeta.detail.sourceSystem}/{r.value.expenseMeta.detail.sourceId}</p>}
    <details><summary>Retained original row</summary><p>{JSON.stringify(r.original)}</p></details>
    {b.status==='review'&&<details><summary>Repair row {r.ordinal}</summary><Form key={b.revision} label="Save repaired row" submit={d=>run(async()=>save(await api('/time/bulk/'+b.id+'/rows',{revision:b.revision,rowId:r.id,row:work(d,matterId)})),'Row saved; review refreshed')}><RepairFields input={r.input} actor={actor}/></Form></details>}
    {r.entryId&&<p>Recorded entry {r.entryId}</p>}
   </article>)}
   {b.status==='review'&&<><button type="button" className="quiet" onClick={()=>run(async()=>save(await api('/time/bulk/'+b.id+'/rows',{revision:b.revision,rowId:b.rows[0].id,row:b.rows[0].input})),'Review refreshed')}>Refresh prices and validation</button><label className="check"><input type="checkbox" checked={reviewed===b.id+':'+b.revision} onChange={e=>setReviewed(e.target.checked?b.id+':'+b.revision:'')}/>I reviewed these exact rows, attributions and amounts.</label><button type="button" disabled={reviewed!==b.id+':'+b.revision||b.rows.some((r:Row)=>r.errors.length)} onClick={()=>run(async()=>save(await api('/time/bulk/'+b.id+'/post',{revision:b.revision,reviewDigest:b.reviewDigest,requestId:b.id+':post'})),'Reviewed bulk work posted')}>Post reviewed batch once</button></>}
  </article>)}
 </div></section>;
}
