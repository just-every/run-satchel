import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';

export function MatterInvoiceTemplate({matterId,templates,canAssign,run,tick}:{matterId:string;templates:Row[];canAssign:boolean;run:Run;tick:number}){
 const [state,setState]=useState<Row>();
 useEffect(()=>{let active=true;setState(undefined);if(matterId)void api('/matters/'+matterId+'/invoice-template').then(value=>{if(active)setState(value);}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;};},[matterId,tick]);
 if(!state)return null;
 const current=state.assignment;
 return <details><summary>Assigned invoice template for the current matter</summary><p>{current?'Approved template version '+current.template_version+' · '+current.scope+' assignment':'No invoice template assigned.'}</p>
  {!canAssign?<p>Counsel assigns the approved template for this matter.</p>:templates.length?<Form key={current?.id??'first'} label="Assign approved invoice template" submit={d=>run(()=>api('/matters/'+matterId+'/invoice-template',{templateId:d.templateId,previousId:current?.scope==='matter'?current.id:null,reason:d.reason}),'Matter invoice template assigned; issued files retained')}>
   <Field label="Matter invoice template" name="templateId"><select aria-label="Matter invoice template" name="templateId" defaultValue={current?.template_id??templates.at(-1)?.id}>{templates.filter(t=>!t.retired_at).map(t=><option key={t.id} value={t.id}>{t.config.firmName} · version {t.version}</option>)}</select></Field><Field label="Template assignment reason" name="reason"/>
  </Form>:<p>Approve invoice branding in Firm before assigning a template.</p>}
  {canAssign&&templates.some(t=>!t.retired_at)&&<Form key={state.clientDefault?.id??'client'} label="Set client invoice template default" submit={d=>run(()=>api('/invoice-template-defaults',{scope:'client',matterId,previousId:state.clientDefault?.id??null,templateId:d.templateId,reason:d.reason}),'Client invoice template default saved')}>
   <Field label="Client default invoice template" name="templateId"><select aria-label="Client default invoice template" name="templateId" defaultValue={state.clientDefault?.template_id??templates.at(-1)?.id}>{templates.filter(t=>!t.retired_at).map(t=><option key={t.id} value={t.id}>{t.config.firmName} · version {t.version}</option>)}</select></Field><Field label="Client template default reason" name="reason"/>
  </Form>}
 </details>;
}
