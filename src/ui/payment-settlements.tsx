import {dollars,Form,Field,type Row} from './common';

export function PaymentSettlements({state,act}:{state:Row;act:(id:string,verb:string,b:Row)=>Promise<void>}){
 const attempt=(s:Row)=>state.attempts.find((a:Row)=>s.snapshot.transactions.some((t:Row)=>t.paymentIntentId===a.payment_intent_id));
 const latest=[...new Map<string,Row>(state.settlements.map((s:Row)=>[s.payout_id,s] as [string,Row])).values()];
 return <>
  {latest.map((s:Row)=><article className="panel" key={s.id} aria-label={'Settlement '+s.payout_id}>
   <strong>Settlement {s.payout_id}</strong>
   <p>{s.snapshot.status} · gross {dollars(s.snapshot.grossCents)} · fees {dollars(s.snapshot.feeCents)} · net {dollars(s.snapshot.netCents)}</p>
   <p>Bank deposit: {s.bank?s.bank.bank_reference:'Unconfirmed'}</p>
   {state.principal&&!s.bank&&<Form label="Match exact bank deposit" submit={b=>act(attempt(s).id,'bank-match',{...b,observationId:s.id,cents:Number(b.cents),confirmed:true})}>
    <Field label="Operating deposit account" name="operatingAccountId"><select name="operatingAccountId" required><option value="">Choose operating account</option>{state.accounts.map((a:Row)=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
    <Field label="Deposit date" name="depositDate" type="date"/>
    <Field label="Bank statement reference" name="bankReference"/><Field label="Bank deposit (USD cents)" name="cents" type="number"/><Field label="Finance match evidence" name="reason"/>
   </Form>}
   {state.principal&&s.bank&&<details><summary>Correct bank match</summary>
    <Form label="Approve bank match reversal" submit={b=>act(attempt(s).id,'bank-reversal',{...b,matchId:s.bank.id,revision:state.revision,confirmed:true,requestKey:crypto.randomUUID()})}>
     <Field label="Bank correction date" name="depositDate" type="date"/><Field label="Bank correction reason" name="reason"/>
    </Form>
   </details>}
   {state.bankHistory.filter((m:Row)=>m.payout_id===s.payout_id&&m.reversal).map((m:Row)=><p key={m.id}>Reversed bank match: {m.bank_reference} · {dollars(m.cents)} · {m.reversal.reason}</p>)}
  </article>)}
  {!!state.processorPostings.length&&<details><summary>Processor ledger</summary>{state.processorPostings.map((p:Row)=><p key={p.id}>{p.kind} · gross {dollars(p.gross_cents)} · fee {dollars(p.fee_cents)} · net {dollars(p.net_cents)} · {p.id}</p>)}</details>}
 </>;
}
