import {useEffect,useState} from 'react';
import {api,dollars,Field,Form,type Row,type Run} from './common';

const permitted=(actor:Row)=>actor.channel!=='agent'&&['owner','lawyer','billing'].includes(actor.role);
export function InvoiceTemplateSettings({actor,run,tick}:{actor:Row;run:Run;tick:number}){
 const [state,setState]=useState<Row>(),[logo,setLogo]=useState<Row>();
 useEffect(()=>{let live=true;if(permitted(actor))void api('/invoice-templates').then(s=>{if(live)setState(s);}).catch(e=>run(async()=>{throw e;}));return()=>{live=false;};},[tick,actor.role]);
 if(!state||!['owner','lawyer'].includes(actor.role))return null;
 const latest=state.templates.at(-1),config=latest?.config;
 return <section className="panel" aria-label="Invoice templates"><h2>Invoice templates</h2>
  <p>{latest?`Approved version ${latest.version}`:'Approve a firm template before delivering branded invoices.'}</p>
  <details><summary>{latest?'Approve a new template version':'Set up invoice branding'}</summary>
   <Form key={latest?.id??'first'} label="Approve template version" submit={d=>run(()=>api('/invoice-templates',{previousId:latest?.id??null,firmName:d.firmName,address:d.address,logoBase64:logo?.base64??config?.logoBase64,logoMime:logo?.mime??config?.logoMime,remittance:d.remittance,terms:d.terms,dueDays:Number(d.dueDays),includeTrustBalance:d.includeTrustBalance==='on',reason:d.reason,confirmed:d.confirmed==='on'}),'Invoice template version approved')}>
    <Field label="Invoice firm name" name="firmName" value={config?.firmName}/>
    <Field label="Invoice firm address" name="address"><textarea name="address" required defaultValue={config?.address}/></Field>
    <label>Firm invoice logo<input type="file" accept="image/png,image/jpeg" onChange={async e=>{const file=e.currentTarget.files?.[0];if(!file)return;await run(async()=>{if(file.size>256000)throw Error('Use a PNG or JPEG of at most 256 kB');const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);setLogo({base64:btoa(binary),mime:file.type});});}}/></label>
    {(logo||config)&&<img alt="Invoice firm logo preview" src={'data:'+(logo?.mime??config.logoMime)+';base64,'+(logo?.base64??config.logoBase64)} style={{maxWidth:160,maxHeight:80,objectFit:'contain'}}/>}
    <Field label="Remittance details" name="remittance"><textarea name="remittance" required defaultValue={config?.remittance}/></Field>
    <Field label="Invoice payment terms" name="terms" value={config?.terms}/><Field label="Days until invoice due" name="dueDays" type="number" value={config?.dueDays??30}/>
    <label><input name="includeTrustBalance" type="checkbox" defaultChecked={config?.includeTrustBalance??true}/>Include the matter trust balance with its recorded date</label>
    <Field label="Template approval reason" name="reason"/>
    <label><input name="confirmed" type="checkbox" required/>I approve this exact template for future invoice artifacts</label>
   </Form>
  </details>
  <details><summary>Approve sign-in notification</summary><p><strong>{state.notification.subject}</strong></p><p>{state.notification.body}</p><p>The notification adds only the portal sign-in address. Invoice details and attachments stay in the portal.</p>
   <Form label="Approve notification wording" submit={d=>run(()=>api('/invoice-notification-templates',{reason:d.reason,confirmed:d.confirmed==='on'}),'Sign-in notification approved')}><Field label="Notification approval reason" name="reason"/><label><input name="confirmed" type="checkbox" required/>Counsel approves this exact plain-text sign-in notification</label></Form>
  </details>
 </section>;
}

export function InvoiceDelivery({bill,matterId,actor,run,tick}:{bill:Row;matterId:string;actor:Row;run:Run;tick:number}){
 const [state,setState]=useState<Row>(),[templates,setTemplates]=useState<Row>();
 useEffect(()=>{let live=true;if(permitted(actor)&&bill.issue)void Promise.all([api('/matters/'+matterId+'/invoice-deliveries'),api('/invoice-templates')]).then(([s,t])=>{if(live){setState(s);setTemplates(t);}}).catch(e=>run(async()=>{throw e;}));return()=>{live=false;};},[bill.id,bill.issue?.bill_id,matterId,actor.role,tick]);
 if(!permitted(actor)||!bill.issue||!state||!templates)return null;
 const deliveries=state.deliveries.filter((d:Row)=>d.bill_id===bill.id),active=bill.status!=='void';
 return <details><summary>Invoice delivery</summary>
  {active&&<Form label="Deliver invoice to portal" submit={d=>run(()=>api('/bills/'+bill.id+'/deliveries',d),'Branded invoice delivered inside the authenticated portal')}>
   <Field label="Payer portal email" name="recipient" type="email"/><Field label="Invoice payer name" name="payerName"/>
   <Field label="Approved invoice template" name="templateId"><select name="templateId" required defaultValue={templates.templates.at(-1)?.id??''}><option value="">Choose a template</option>{templates.templates.map((t:Row)=><option key={t.id} value={t.id}>{t.config.firmName} · version {t.version}</option>)}</select></Field>
  </Form>}
  {deliveries.map((d:Row)=>{const latest=d.attempts.at(-1);return <section key={d.id} aria-label={'Invoice delivery to '+d.recipient}>
   <p><strong>{d.payer_name}</strong> · {d.recipient}<br/>Due {d.due_date} · template version {d.snapshot.branding.templateVersion}<br/><a href={d.pdfUrl}>Download delivered PDF</a></p>
   {d.attempts.map((a:Row)=><p key={a.id}>{a.outcome} · {a.authorized_at}<br/>{a.detail||'Authorized once; no provider submission yet.'}{a.events.map((event:Row)=><span key={event.id}><br/>Provider {event.status} · {event.occurred_at}</span>)}</p>)}
   {active&&latest?.status==='ready'&&<button type="button" onClick={()=>run(()=>api('/invoice-notification-attempts/'+latest.id+'/send',{}),'Notification attempt recorded')}>Send authorized sign-in notification</button>}
   {active&&<details open={latest?.status!=='ready'}><summary>{latest?.status==='ready'?'Replace unused authorization':'Review notification authority'}</summary><Form label={latest?.status==='ready'?'Replace unused authorization':latest?'Authorize one resend':'Authorize one notification'} submit={v=>run(()=>api('/invoice-deliveries/'+d.id+'/authorize',{notificationTemplateId:v.notificationTemplateId,priorAttemptId:latest?.id,reason:v.reason,confirmed:v.confirmed==='on'}),'One notification authorized')}>
    <Field label="Counsel-approved notification" name="notificationTemplateId"><select name="notificationTemplateId" required defaultValue={templates.notifications.at(-1)?.id??''}><option value="">Choose approved wording</option>{templates.notifications.map((n:Row)=><option key={n.id} value={n.id}>{n.subject} · {n.approved_at}</option>)}</select></Field>
    <Field label="Sending authority and provider check" name="reason"/><label><input name="confirmed" type="checkbox" required/>I checked the prior outcome and authorize exactly one notification</label>
   </Form></details>}
  </section>;})}
  {active&&deliveries.length>0&&<Form label="Deliver payer statement" submit={d=>run(()=>api('/matters/'+matterId+'/payer-statements',d),'Payer statement delivered to the portal')}><Field label="Statement payer" name="recipient"><select name="recipient">{[...new Set<string>(deliveries.map((d:Row)=>d.recipient))].map(email=><option key={email}>{email}</option>)}</select></Field></Form>}
  {state.statements.map((s:Row)=><p key={s.id}><a href={'/api/satchel/payer-statements/'+s.id+'/pdf'}>Payer statement · {s.recipient} · {s.created_at}</a></p>)}
  {!active&&!state.replacements.some((r:Row)=>r.bill_id===bill.id)&&['owner','lawyer'].includes(actor.role)&&<Form label="Name replacement invoice" submit={d=>run(()=>api('/invoices/'+bill.id+'/replacement',d),'Replacement invoice recorded')}><Field label="Issued replacement invoice ID" name="replacementBillId"/><Field label="Replacement reason" name="reason"/></Form>}
 </details>;
}

export function PortalPayerStatements({matterId}:{matterId:string}){
 const [state,setState]=useState<Row>(),[error,setError]=useState('');
 useEffect(()=>{let live=true;void api('/portal/matters/'+matterId+'/payer-statements').then(s=>{if(live)setState(s);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[matterId]);
 if(error)return <p role="alert">{error}</p>;if(!state?.statements.length)return null;
 return <section aria-label="Payer statements"><h2>Payer statements</h2>{state.statements.map((s:Row)=><p key={s.id}><a href={s.pdfUrl}>Statement · {s.created_at}</a><br/>Amount due when prepared: {dollars(s.snapshot.totalDueCents)}</p>)}</section>;
}
