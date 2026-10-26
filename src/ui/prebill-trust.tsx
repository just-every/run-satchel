import {useEffect,useState} from 'react';
import {api,dollars,Field,Form,type Row,type Run} from './common';

export function PrebillTrust({bill,run,tick}:{bill:Row;run:Run;tick:number}){
 const [open,setOpen]=useState(false),[state,setState]=useState<Row>(),[error,setError]=useState(''),[requestKey]=useState(()=>crypto.randomUUID());
 useEffect(()=>{let active=true;if(open)void api('/bills/'+bill.id+'/trust-options').then(s=>{if(active){setState(s);setError('');}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[open,bill.id,tick]);
 if(bill.status!=='approved'||bill.issue)return null;
 return <details open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>Request a trust application</summary><p>A designated trust officer must approve the request and record bank clearance before this invoice issues as paid.</p>{error&&<p role="alert">{error}</p>}{state&&<>
  <p>Unpaid invoice: {dollars(state.funds.due_cents)}</p>{state.applications.map((a:Row)=><p key={a.id}>Trust request · {dollars(a.cents)} · {a.status}</p>)}
  <Form label="Request reviewed trust application" submit={d=>run(()=>api('/trust/transfers',{billId:bill.id,ledgerId:d.ledgerId,operatingAccountId:d.operatingAccountId,requestKey,allocation:{earnedCents:Number(d.earnedCents),taxCents:Number(d.taxCents),reference:d.reference}}),'Trust application requested for officer review')}>
   <Field label="Available client trust ledger" name="ledgerId"><select aria-label="Available client trust ledger" name="ledgerId" required defaultValue=""><option value="" disabled>Choose cleared client funds</option>{state.ledgers.map((l:Row)=><option key={l.id} value={l.id}>{l.name} · available {dollars(l.availableCents)}</option>)}</select></Field>
   <Field label="Operating destination" name="operatingAccountId"><select aria-label="Operating destination" name="operatingAccountId" required defaultValue=""><option value="" disabled>Choose operating account</option>{state.operatingAccounts.map((a:Row)=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
   <Field label="Earned-base allocation (USD cents)" name="earnedCents" type="number" value={state.components.earnedCents}/><Field label="Tax allocation (USD cents)" name="taxCents" type="number" value={state.components.taxCents}/><Field label="Reviewed allocation authority" name="reference"/>
  </Form>
 </>}</details>;
}
