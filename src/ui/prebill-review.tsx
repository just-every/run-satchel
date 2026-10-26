import {api,dollars,Field,Form,type Row,type Run} from './common';

export function PrebillReview({bill,actor,run}:{bill:Row;actor:Row;run:Run}){
 if(bill.status!=='draft'||!['owner','lawyer'].includes(actor.role))return null;
 return <><details><summary>Review narratives and write-downs</summary><Form key={bill.revision} label="Save reviewed prebill lines" submit={d=>run(()=>api('/bills/'+bill.id+'/review',{revision:bill.revision,action:'revise',note:d.note,lines:bill.snapshot.lines.map((line:Row)=>({sourceId:line.sourceId,description:d['description.'+line.sourceId],amountCents:Number(d['amount.'+line.sourceId]),exclude:d['exclude.'+line.sourceId]==='on'}))}),'Reviewed lines saved; review tax again before approval')}>
  {bill.snapshot.lines.map((line:Row)=><fieldset key={line.sourceId}><legend>{line.date} · {dollars(line.amountCents)}</legend><Field label="Reviewed narrative" name={'description.'+line.sourceId} value={line.description}/><Field label="Reviewed amount (USD cents)" name={'amount.'+line.sourceId} type="number" value={line.amountCents}/><label><input type="checkbox" name={'exclude.'+line.sourceId}/>Exclude this source and release its reservation</label></fieldset>)}
  <Field label="Counsel line review reason" name="note"/>
 </Form></details><details><summary>Return this prebill</summary><Form label="Return prebill for revision" submit={d=>run(()=>api('/bills/'+bill.id+'/review',{revision:bill.revision,action:'return',note:d.note}),'Prebill returned; source reservations retained')}><Field label="Reason for returning prebill" name="note"/></Form></details></>;
}
