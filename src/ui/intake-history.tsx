import {useEffect,useState} from 'react';
import {api,type Row} from './common';

export function IntakeHistory({leadId,revision}:{leadId:string;revision:string|number}){
 const [open,setOpen]=useState(false),[result,setResult]=useState<{leadId:string;revision:string|number;submissions:Row[]}|null>(null),[error,setError]=useState<{leadId:string;revision:string|number;message:string}|null>(null);
 useEffect(()=>{
  if(!open)return;
  let active=true;setError(null);setResult(null);
  api('/leads/'+encodeURIComponent(leadId)+'/intake').then(data=>{if(active)setResult({leadId,revision,submissions:data.submissions});}).catch(e=>{if(active)setError({leadId,revision,message:e.message});});
  return()=>{active=false;};
 },[open,leadId,revision]);
 const current=result?.leadId===leadId&&result.revision===revision?result:null;
 const failure=error?.leadId===leadId&&error.revision===revision?error:null;
 return <details open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>Intake submissions</summary>
  {open&&<>{failure?<p role="alert" className="notice">{failure.message}</p>:!current?<p aria-busy="true">Opening intake submissions…</p>:!current.submissions.length?<p>No intake submissions.</p>:current.submissions.map(s=><article className="record" key={s.id}>
   <strong>{s.formTitle} · version {s.formVersion}</strong>
   <dl><dt>Practice</dt><dd>{s.practice}</dd><dt>Receipt</dt><dd>{s.receipt}</dd><dt>Submitted</dt><dd>{s.submittedAt}</dd><dt>Review consent</dt><dd>{s.consent.text}</dd><dt>Consent recorded</dt><dd>{s.consent.at}</dd></dl>
   <h4>Answers</h4>{s.answers.length?<dl>{s.answers.map((a:Row)=><div key={a.key}><dt>{a.label}</dt><dd style={{whiteSpace:'pre-wrap'}}>{a.value}</dd></div>)}</dl>:<p>No answers recorded.</p>}
   <h4>Original files</h4>{s.files.length?<><p className="notice">Not malware-scanned. Review files carefully before opening.</p>{s.files.map((f:Row)=><div key={f.id}><a href={f.downloadUrl} download>{f.name}</a><dl><dt>Type and size</dt><dd>{f.mime} · {f.size} bytes</dd><dt>SHA-256</dt><dd style={{overflowWrap:'anywhere'}}>{f.sha256}</dd><dt>Scan status</dt><dd>{f.scanStatus} · Not malware-scanned</dd></dl></div>)}</>:<p>No files submitted.</p>}
  </article>)}</>}
 </details>;
}
