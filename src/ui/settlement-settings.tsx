import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';

export function SettlementSettings({run,tick}:{run:Run;tick:number}){
 const [policy,setPolicy]=useState<Row>();
 useEffect(()=>{let active=true;api('/settlement-policy').then(value=>{if(active)setPolicy(value);}).catch(error=>{if(active)void run(async()=>{throw error;});});return()=>{active=false;};},[tick]);
 return <section className="panel settlement-settings"><h2>Settlement approval settings</h2>
  <p>Counsel and a different designated trust officer approve each exact settlement revision by default. The principal may explicitly record a sole-practitioner setting for this firm.</p>
  <p>This setting establishes product authority only. It does not establish that any applicable legal requirement can be waived. One person must remain currently authorized in both capacities and record two separate approvals against the same revision.</p>
  {policy&&<>
   <dl><dt>Current setting</dt><dd>{policy.solePractitionerEnabled?'Sole-practitioner approval enabled':'Different people required'}</dd><dt>Effective version</dt><dd>{policy.version}</dd>
    {policy.version>0&&<><dt>Reason</dt><dd>{policy.reason}</dd><dt>Scope</dt><dd>{policy.scope}</dd><dt>Recorded by</dt><dd>{policy.actor}</dd><dt>Effective time</dt><dd>{policy.effectiveAt}</dd></>}
   </dl>
   <Form key={policy.version} label="Record settlement approval setting" submit={data=>run(()=>api('/settlement-policy',{previousVersion:policy.version,solePractitionerEnabled:data.solePractitionerEnabled==='yes',reason:data.reason,scope:data.scope}),'Settlement approval setting recorded')}>
    <Field label="Sole-practitioner approval" name="solePractitionerEnabled"><select name="solePractitionerEnabled" defaultValue={policy.solePractitionerEnabled?'yes':'no'}><option value="no">Require different people</option><option value="yes">Enable separate approvals by one authorized person</option></select></Field>
    <Field label="Settlement setting reason" name="reason"/>
    <Field label="Settlement setting scope" name="scope"/>
   </Form>
  </>}
 </section>;
}
