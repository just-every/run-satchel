// Public inquiry surface adapted from the selected 12ui intake form (sx-satchel-r10).
import {useEffect,useState,type FormEvent} from 'react';
import {api,type Row} from './common';
import type {IntakeQuestion} from '../satchel/intake-forms';
function shownQuestions(questions:IntakeQuestion[],answers:Record<string,string>){
 const active=new Set<string>();return questions.filter(q=>{const shown=!q.when||(active.has(q.when.key)&&answers[q.when.key]===q.when.equals);if(shown)active.add(q.key);return shown;});
}
export function PublicIntake({formId}:{formId:string}){
 const [form,setForm]=useState<Row>(),[error,setError]=useState(''),[answers,setAnswers]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[receipt,setReceipt]=useState<Row>(),[files,setFiles]=useState<File[]>([]);
 useEffect(()=>{let active=true;setForm(undefined);setError('');setAnswers({});setReceipt(undefined);api('/intake/public/'+encodeURIComponent(formId)).then(f=>{if(active)setForm(f);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[formId]);
 const visible=form?shownQuestions(form.questions,answers):[];
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||!form)return;setError('');
  if(files.length>3||files.some(f=>f.size>10*1024*1024)){setError('Attach at most three files, up to 10 MB (10 MiB) each.');return;}
  const values=Object.fromEntries(new FormData(event.currentTarget)),body={token:form.token,revision:form.revision,name:values.name,email:values.email,phone:values.phone,summary:values.summary,answers:Object.fromEntries(visible.filter(q=>answers[q.key]).map(q=>[q.key,answers[q.key]])),consent:values.consent==='on',website:values.website??''};
  const data=new FormData();data.set('data',JSON.stringify(body));for(const file of files)data.append('files',file);
  setBusy(true);try{const response=await fetch('/api/satchel/intake/public/'+encodeURIComponent(formId),{method:'POST',body:data});const result:Row=await response.json();if(!response.ok)throw new Error(result.error??'The inquiry could not be received');setReceipt(result);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <div className="intake-page"><main>
  <header>{form?.logoDataUrl&&<img className="firm-logo" src={form.logoDataUrl} alt={form.firmName+' logo'}/>}<p className="brand">{form?.firmName??'Inquiry'}</p><div className="rule" aria-hidden="true"/><h1>{form?.title??'Intake form'}</h1>{form&&!receipt&&<p className="intro">{form.practice} · Share your inquiry with the firm for review.</p>}</header>
  {error&&<p className="error" role="alert">{error}</p>}
  {!form&&!error&&<p aria-busy="true">Opening the form…</p>}
  {receipt?<section className="receipt" role="status"><h2>Inquiry received</h2><p>Keep this receipt for your records.</p><code>{receipt.receipt}</code><p>{receipt.receivedAt}</p><p>The firm received your inquiry for review. No email acknowledgment was sent.</p></section>:form&&<form onSubmit={submit}>
   <fieldset disabled={busy}>
    <div className="field"><label htmlFor="intake-name">Full name *</label><input id="intake-name" name="name" type="text" autoComplete="name" maxLength={200} required/></div>
    <div className="field"><label htmlFor="intake-email">Email address</label><input id="intake-email" name="email" type="email" autoComplete="email" maxLength={254}/></div>
    <div className="field"><label htmlFor="intake-phone">Phone number</label><input id="intake-phone" name="phone" type="tel" autoComplete="tel" maxLength={40}/></div>
    <div className="field summary"><label htmlFor="intake-summary">Matter summary *</label><textarea id="intake-summary" name="summary" maxLength={2000} required/></div>
    {visible.map(q=>q.type==='yesno'?<fieldset key={q.key}><legend>{q.label}{q.required?' *':''}</legend><div className="options">{['yes','no'].map(value=><label className="option" key={value}><input type="radio" name={q.key} required={q.required} value={value} checked={answers[q.key]===value} onChange={()=>setAnswers(a=>({...a,[q.key]:value}))}/><span>{value==='yes'?'Yes':'No'}</span></label>)}</div></fieldset>:<div className="field" key={q.key}><label htmlFor={'intake-'+q.key}>{q.label}{q.required?' *':''}</label>{q.type==='select'?<select id={'intake-'+q.key} required={q.required} value={answers[q.key]??''} onChange={e=>setAnswers(a=>({...a,[q.key]:e.target.value}))}><option value="">Choose an answer</option>{q.options!.map(option=><option key={option}>{option}</option>)}</select>:<input id={'intake-'+q.key} type={q.type==='date'?'date':'text'} maxLength={4000} required={q.required} value={answers[q.key]??''} onChange={e=>setAnswers(a=>({...a,[q.key]:e.target.value}))}/>}</div>)}
    <label className="upload-label" htmlFor="intake-files">Attach relevant documents</label><div className="upload"><svg viewBox="0 0 30 32" aria-hidden="true"><path d="M21 10 11 21a4 4 0 0 1-6-6L17 3a5 5 0 0 1 7 7L11 24a7 7 0 0 1-10-10L13 2" transform="translate(3 3) scale(.9)" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg><div className="upload-copy"><p><strong>Choose files</strong></p><p className="detail" id="intake-file-guidance">PDF, PNG or JPEG · Up to three files, 10 MB (10 MiB) each</p><p className="detail">Not malware-scanned</p></div><input className="file-input" id="intake-files" type="file" multiple accept="application/pdf,image/png,image/jpeg" aria-describedby="intake-file-guidance" onChange={e=>setFiles(Array.from(e.target.files??[]))}/></div>{files.length>0&&<ul className="file-names">{files.map((f,i)=><li key={i}>{f.name} · {f.size} bytes</li>)}</ul>}
    <div className="website" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
    <label className="consent"><input name="consent" type="checkbox" required/><span>{form.consentText} *</span></label>
    <button type="submit" disabled={busy}>{busy?'Receiving inquiry…':'Send inquiry'}</button>
   </fieldset>
  </form>}
 </main></div>;
}
