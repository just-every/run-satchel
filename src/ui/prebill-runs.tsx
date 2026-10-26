import {useEffect,useState} from 'react';
import {api,dollars,type Row,type Run} from './common';
import {BillApproval} from './bill-approval';
import {PrebillPreparation} from './prebill-preparation';
import {PrebillReview} from './prebill-review';
import {PrebillTrust} from './prebill-trust';
import {MatterInvoiceTemplate} from './matter-invoice-template';

function PrebillItem({bill,actor,run,tick,choose}:{bill:Row;actor:Row;run:Run;tick:number;choose:(id:string)=>void}){
 const [rules,setRules]=useState<Row[]>([]);
 useEffect(()=>{let active=true;if(bill.status==='draft')void api('/matters/'+bill.matterId+'/tax-rules').then(s=>{if(active)setRules(s.rules);}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;};},[bill.matterId,bill.status,tick]);
 return <article className="record" aria-label={'Prebill '+bill.snapshot.title}><h3>{bill.snapshot.title}</h3><p>{bill.snapshot.matterNumber} · {bill.prebill.payer}<br/>{bill.prebill.periodStart} to {bill.prebill.periodEnd} · {bill.prebill.arrangement}<br/>{bill.issue?'Issued':bill.prebill.reviewState==='returned'?'Returned for revision':bill.status==='approved'?'Approved for issue':'Awaiting counsel review'} · {dollars(bill.snapshot.totalCents)}</p>
  {bill.reviews.map((r:Row)=><p key={r.id}>{r.action} · {r.actor}<br/>{r.note}</p>)}
  {bill.issue&&<p>Invoice <strong>{bill.issue.number}</strong> · template version {bill.issue.template_version}<br/><a href={'/api/satchel/bills/'+bill.id+'/invoice.pdf'}>Download exact issued PDF</a></p>}
  {bill.issue?.payment_snapshot&&<p>At issue · paid from trust {dollars(bill.issue.payment_snapshot.trust_paid_cents)} · balance due {dollars(bill.issue.payment_snapshot.due_cents)}</p>}
  <button type="button" onClick={()=>choose(bill.matterId)}>Open matter billing</button>
  <PrebillReview bill={bill} actor={actor} run={run}/><BillApproval bill={bill} actor={actor} run={run} rules={rules}/><PrebillTrust bill={bill} run={run} tick={tick}/>
 </article>;
}

export function PrebillRuns({matters,matterId,actor,run,tick,choose}:{matters:Row[];matterId:string;actor:Row;run:Run;tick:number;choose:(id:string)=>void}){
 const [state,setState]=useState<Row>(),[templates,setTemplates]=useState<Row[]>([]);
 const permitted=['owner','lawyer','billing'].includes(actor.role);
 useEffect(()=>{let active=true;if(permitted)void Promise.all([api('/prebill-runs'),api('/invoice-templates')]).then(([s,t])=>{if(active){setState(s);setTemplates(t.templates);}}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;};},[permitted,tick]);
 if(!permitted||!state)return null;
 return <section className="panel" aria-label="Prebill runs"><h2>Prebill runs</h2><p>Prepare selected matters together, retain each source for counsel review, then issue the exact approved invoices.</p>
  {matterId&&<MatterInvoiceTemplate matterId={matterId} templates={templates} run={run} tick={tick}/>}
  <PrebillPreparation matters={matters} run={run} tick={tick}/>
  {state.runs.map((batch:Row)=>{const ready=batch.bills.filter((b:Row)=>b.status==='approved'&&!b.issue);return <details key={batch.id}><summary>{batch.title} · {batch.bills.length} matters</summary>
   {ready.length>0&&<button type="button" onClick={()=>run(()=>api('/invoices/issue',{bills:ready.map((b:Row)=>({id:b.id,revision:b.revision}))}),'Approved invoices issued once with retained templates')}>Issue {ready.length} approved invoices</button>}
   {batch.bills.map((bill:Row)=><PrebillItem key={bill.id} bill={bill} actor={actor} run={run} tick={tick} choose={choose}/>)}
  </details>;})}
 </section>;
}
