import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';

export function MatterInvoiceTemplate({matterId,templates,run,tick}:{matterId:string;templates:Row[];run:Run;tick:number}){
 const [state,setState]=useState<Row>();
 useEffect(()=>{let active=true;setState(undefined);if(matterId)void api('/matters/'+matterId+'/invoice-template').then(value=>{if(active)setState(value);}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;};},[matterId,tick]);
 if(!state)return null;
 const current=state.assignment;
 return <details><summary>Assigned invoice template for the current matter</summary><p>{current?'Approved template version '+current.template_version:'No invoice template assigned.'}</p>
  {templates.length?<Form key={current?.id??'first'} label="Assign approved invoice template" submit={d=>run(()=>api('/matters/'+matterId+'/invoice-template',{templateId:d.templateId,previousId:current?.id??null,reason:d.reason}),'Matter invoice template assigned; issued files retained')}>
   <Field label="Matter invoice template" name="templateId"><select aria-label="Matter invoice template" name="templateId" defaultValue={current?.template_id??templates.at(-1)?.id}>{templates.map(t=><option key={t.id} value={t.id}>{t.config.firmName} · version {t.version}</option>)}</select></Field><Field label="Template assignment reason" name="reason"/>
  </Form>:<p>Approve invoice branding in Firm before assigning a template.</p>}
 </details>;
}
