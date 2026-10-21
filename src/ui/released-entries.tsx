import {useEffect,useState} from 'react';
import {api,dollars,Empty,Field,Form,type Row,type Run} from './common';

const fieldNames:Record<string,string>={
 description:'Description',matterId:'Matter',rateCents:'Hourly rate',amountCents:'Amount',
 utbmsTask:'UTBMS task',utbmsActivity:'UTBMS activity',utbmsExpense:'UTBMS expense',
 minutes:'Worked minutes',billedMinutes:'Billed minutes',discountBps:'Discount',
 billable:'Billable',rateSource:'Rate source',rateRuleId:'Rate rule',
};

function changeValue(field:string,value:unknown,matters:Row[]){
 if(value===null||value===undefined||value==='')return 'Not set';
 if(field==='matterId'){
  const matter=matters.find(m=>m.id===value);
  return matter?`${matter.matter_number?matter.matter_number+' · ':''}${matter.title}`:'Matter unavailable';
 }
 if(field==='rateRuleId')return 'Recorded rate rule';
 if(field==='rateCents'||field==='amountCents')return dollars(Number(value));
 if(field==='discountBps')return `${Number(value)/100}%`;
 if(typeof value==='boolean')return value?'Yes':'No';
 return String(value);
}

function EntryHistory({history,matters}:{history:Row[];matters:Row[]}){
 return <details><summary>Entry edit history ({history.length})</summary>
  {!history.length?<p>No edits recorded since this work was released.</p>:history.map(edit=><article className="record" key={edit.id}>
   <strong>{edit.reason}</strong><p>Edited by {edit.actor} · {edit.at}</p>
   <dl>{Object.entries(edit.changes as Record<string,{before:unknown;after:unknown}>).map(([field,change])=><div key={field}>
    <dt>{fieldNames[field]??field}</dt>
    <dd>Before: {changeValue(field,change.before,matters)}<br/>After: {changeValue(field,change.after,matters)}</dd>
   </div>)}</dl>
  </article>)}
 </details>;
}

function EditEntry({entry,targets,run}:{entry:Row;targets:Row[];run:Run}){
 return <details><summary>Edit released entry</summary>
  <Form label="Save released entry changes" submit={data=>run(()=>api('/entries/'+entry.id+'/edit',{
   revision:entry.revision,reason:data.reason,description:data.description,
   ...(entry.kind==='time'?{
    ...(data.rateCents!==''&&Number(data.rateCents)!==entry.rateCents?{rateCents:Number(data.rateCents)}:{}),
    utbmsTask:data.utbmsTask,utbmsActivity:data.utbmsActivity,
   }:{utbmsExpense:data.utbmsExpense}),
   ...(data.matterId?{matterId:data.matterId}:{}),
  }),'Released entry updated; history retained')}>
   <Field label="Released entry description" name="description" value={entry.description}/>
   {entry.kind==='time'?<>
    <Field label="Released entry hourly rate (USD cents, blank: unchanged)" name="rateCents" type="number" required={false} value={entry.rateCents??''}/>
    <div className="inline">
     <Field label="Released entry UTBMS task" name="utbmsTask" required={false} value={entry.utbmsTask??''}/>
     <Field label="Released entry UTBMS activity" name="utbmsActivity" required={false} value={entry.utbmsActivity??''}/>
    </div>
   </>:<Field label="Released entry UTBMS expense" name="utbmsExpense" required={false} value={entry.utbmsExpense??''}/>}
   <Field label="Move released entry to matter (same client)" name="matterId" required={false}>
    <select name="matterId" aria-label="Move released entry to matter (same client)" defaultValue=""><option value="">Keep in this matter</option>
     {targets.map(m=><option key={m.id} value={m.id}>{m.matter_number?m.matter_number+' · ':''}{m.title}</option>)}
    </select>
   </Field>
   <Field label="Reason for released entry changes" name="reason"/>
  </Form>
 </details>;
}

export function ReleasedEntries({entries,matterId,actor,run,tick}:{entries:Row[];matterId:string;actor:Row;run:Run;tick:number}){
 const [matters,setMatters]=useState<Row[]>([]);
 const released=entries.filter(e=>e.released),hasReleased=released.length>0;
 useEffect(()=>{
  let active=true;setMatters([]);
  if(hasReleased)api('/state').then(state=>{if(active)setMatters(state.matters);}).catch(error=>{if(active)void run(async()=>{throw error;});});
  return()=>{active=false;};
 },[matterId,tick,hasReleased]);
 const current=matters.find(m=>m.id===matterId);
 const targets=current?matters.filter(m=>m.id!==matterId&&m.client===current.client):[];
 const counsel=['owner','lawyer'].includes(actor.role)&&actor.channel!=='agent';
 return <section className="panel"><h2>Released invoice work</h2>
  <p>Work released by an invoice void can be edited or moved to an accessible matter for the same client before rebilling. Each change retains its reason, author and previous values. Original invoice files stay retained.</p>
  {!released.length&&<Empty>No released invoice work in this matter.</Empty>}
  {released.map(entry=><article className="record" key={entry.id}>
   <strong>{entry.description} · {dollars(entry.amountCents)}</strong>
   <p>{entry.date} · {entry.kind==='time'?`${entry.minutes} worked minutes`:'Disbursement'}{entry.kind==='time'&&entry.rateCents!=null?` · ${dollars(entry.rateCents)} per hour`:''}
    {entry.billedMinutes!=null&&entry.billedMinutes!==entry.minutes?` · ${entry.billedMinutes} billed minutes`:''}
    {entry.utbmsTask?` · Task ${entry.utbmsTask}`:''}{entry.utbmsActivity?` · Activity ${entry.utbmsActivity}`:''}{entry.utbmsExpense?` · Expense ${entry.utbmsExpense}`:''}
   </p>
   <p>{entry.reservedBy?'Reserved in a bill; editing and moving are unavailable.':entry.billable?'Released and available for rebilling.':'Released nonbillable work.'}</p>
   <EntryHistory history={entry.editHistory??[]} matters={matters}/>
   {counsel&&!entry.reservedBy&&<EditEntry key={entry.revision} entry={entry} targets={targets} run={run}/>}
  </article>)}
 </section>;
}
