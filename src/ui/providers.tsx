import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';
// OSS-001: free Satchel software, providers billed directly, and the principal's recorded review of each provider's own terms.
export function ProviderCharges({run,tick}:{run:Run;tick:number}) {
 const [data,setData]=useState<Row>({providers:[]});
 useEffect(()=>{api('/providers').then(setData).catch(e=>run(async()=>{throw e;}));},[tick]);
 return <section className="panel providers"><h2>Provider charges</h2><p>{data.statement}</p>
  <ul>{data.providers.map((p:Row)=><li key={p.id}><strong>{p.name}</strong> · {p.kind}<br/>{p.billing}. Satchel charge: {p.satchelCharge}.<br/>{p.review?<>Reviewed by {p.review.reviewedBy} on {p.review.reviewedAt.slice(0,10)} · <a href={p.review.termsUrl} rel="noreferrer noopener" target="_blank">its terms</a></>:'Terms and direct billing not yet reviewed. Satchel connects it only after you review them.'}</li>)}</ul>
  <Form label="Record provider review" submit={d=>run(()=>api('/providers/'+encodeURIComponent(String(d.providerId))+'/review',{termsUrl:d.termsUrl,confirmed:d.confirmed==='on'}),'Provider review recorded')}>
   <label>Provider<select name="providerId" required>{data.providers.map((p:Row)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <Field label="Provider’s own terms page (https)" name="termsUrl" type="url"/>
   <label><input type="checkbox" name="confirmed"/>I inspected this provider’s own terms and understand it bills the firm directly; Satchel adds no charge</label>
  </Form></section>;
}
