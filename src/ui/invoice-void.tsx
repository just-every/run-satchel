import {api,Field,Form,type Row,type Run} from './common';

export function InvoiceVoid({bill,actor,run}:{bill:Row;actor:Row;run:Run}){
 if(bill.invoiceVoid)return <section aria-label="Invoice void notice">
  <p><strong>Invoice voided</strong>{bill.issue?.number&&<> · Original number {bill.issue.number}</>}</p>
  <p>{bill.invoiceVoid.reason}<br/>Voided by {bill.invoiceVoid.actor} · {bill.invoiceVoid.at}</p>
  <p>Sources released to unbilled work. Original files and invoice number are retained. No money or provider reversals are performed.</p>
 </section>;
 if(!['owner','lawyer'].includes(actor.role)||actor.channel==='agent'||!['approved','exported'].includes(bill.status)||bill.correctsBillId||bill.feePlan||bill.snapshot.feePlan)return null;
 return <details><summary>Void approved invoice</summary>
  <p>Record the reason to release this invoice’s sources to unbilled work. Original files and any invoice number are retained. No money or provider reversals are performed.</p>
  <Form label="Void exact invoice" danger submit={data=>run(()=>api('/invoices/'+bill.id+'/void',{revision:bill.revision,reason:data.reason}),'Invoice voided; original files and number retained')}>
   <Field label="Invoice void reason" name="reason"/>
  </Form>
 </details>;
}
