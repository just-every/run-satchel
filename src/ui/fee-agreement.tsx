import {useEffect,useState} from 'react';
import {api,dollars,Field,Form,today,type Row,type Run} from './common';
// TIME-003: the matter's fee agreement (matter, client and firm rate rules) and budget.
const scopeName=(r:Row)=>r.scope==='matter'?'This matter':r.scope==='client'?'Client '+r.client:'Firm';
const percent=(bps:number)=>`${bps/100}%`;
export function FeeAgreement({matterId,actor,run,tick}:{matterId:string;actor:Row;run:Run;tick:number}){
 const [state,setState]=useState<Row|null>(null);
 useEffect(()=>{let active=true;setState(null);api('/matters/'+matterId+'/rates').then(s=>{if(active)setState(s);}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;};},[matterId,tick]);
 const counsel=['owner','lawyer'].includes(actor.role),budget=state?.budget;
 return <section className="panel" aria-busy={!state}><h2>Fee agreement and budget</h2>{!state?<p>Opening the fee agreement…</p>:<>
  <p>Firm default {dollars(state.firmDefault.rateCents)} per hour · {state.firmDefault.incrementMinutes}-minute increment. Timesheet time and entries without an explicit rate use the most specific rule: matter, then client, then firm; a named timekeeper, then a named task; then the latest effective date on or before the work date.</p>
  {!state.rules.length?<p>No agreement rules yet.</p>:state.rules.map((r:Row)=><article className="record" key={r.id} aria-label={`Rate ${scopeName(r)} from ${r.effectiveFrom}`}><strong>{scopeName(r)} · {r.timekeeperEmail??'any timekeeper'} · {r.utbmsTask??'any task'}</strong><p>From {r.effectiveFrom} · {dollars(r.rateCents)} per hour · {r.incrementMinutes}-minute increment{r.discountBps?` · ${percent(r.discountBps)} discount`:''}{r.billable?'':' · nonbillable'}</p><small>{r.note} · set by {r.createdBy}</small></article>)}
  {counsel&&<details><summary>Add a rate</summary><Form label="Add rate" submit={d=>run(async()=>setState(await api('/matters/'+matterId+'/rates',{scope:d.scope,timekeeperEmail:d.timekeeperEmail||undefined,utbmsTask:d.utbmsTask||undefined,effectiveFrom:d.effectiveFrom,rateCents:Number(d.rateCents),incrementMinutes:Number(d.incrementMinutes),discountBps:Number(d.discountBps||0),billable:d.billable==='on',note:d.note})),'Rate added')}>
   <Field label="Applies to" name="scope"><select name="scope" defaultValue="matter"><option value="matter">This matter</option>{actor.role==='owner'&&<><option value="client">This client ({state.client})</option><option value="firm">Every matter (firm)</option></>}</select></Field>
   <Field label="Timekeeper email (blank: everyone)" name="timekeeperEmail" type="email" required={false}/><Field label="UTBMS task (blank: every task)" name="utbmsTask" required={false}/>
   <div className="inline"><Field label="Effective from" name="effectiveFrom" type="date" value={today()}/><Field label="Hourly rate (USD cents)" name="rateCents" type="number"/></div>
   <div className="inline"><Field label="Increment (minutes)" name="incrementMinutes" type="number" value={state.firmDefault.incrementMinutes}/><Field label="Discount (basis points)" name="discountBps" type="number" value={0} required={false}/></div>
   <label className="check"><input type="checkbox" name="billable" defaultChecked/>Matching work is billable</label><Field label="Agreement reference" name="note"/></Form></details>}
  <h3>Budget</h3>{!budget?<p>No budget set.</p>:<p>Budget {dollars(budget.cents)} · {dollars(budget.usedCents)} recorded billable · {budget.remainingCents>=0?`${dollars(budget.remainingCents)} remaining`:`${dollars(-budget.remainingCents)} over`} · alert at {budget.alertPercent}% (version {budget.version})</p>}
  {state.alerts.map((a:Row)=><p className="notice" role="alert" key={a.id}>{a.level==='exceeded'?'Budget exceeded':'Budget alert threshold reached'}: {dollars(a.usedCents)} of {dollars(a.budgetCents)} recorded · {a.at.slice(0,10)}. Shown in Satchel only; no email was sent.</p>)}
  {counsel&&<details><summary>Set budget</summary><Form label="Set budget" submit={d=>run(async()=>setState(await api('/matters/'+matterId+'/budget',{cents:Number(d.cents),alertPercent:Number(d.alertPercent),note:d.note})),'Budget set')}><div className="inline"><Field label="Budget (USD cents)" name="cents" type="number"/><Field label="Alert at (% of budget)" name="alertPercent" type="number" value={80}/></div><Field label="Budget note" name="note"/></Form></details>}
 </>}</section>;
}
