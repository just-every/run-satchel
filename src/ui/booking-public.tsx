// INTAKE-003 / INTAKE-008: the prospect's pages. Everything here is reached by an unguessable link and acts only on
// the one booking or follow-up it names.
import {useEffect,useState,type FormEvent} from 'react';
import {api,type Row} from './common';
const zone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
const post=async(path:string,body:Row)=>{const r=await fetch('/api/satchel'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j:Row=await r.json();if(!r.ok)throw new Error(j.error??'That did not work');return j;};
const dollars=(c:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
function Slots({slots,pick,chosen}:{slots:Row[];pick:(s:Row)=>void;chosen?:string}){
 const dates=[...new Set(slots.map(s=>s.date))];
 return <div>{!slots.length&&<p>No times are available right now.</p>}{dates.map(d=><fieldset key={d}><legend>{d}</legend><div className="options">{slots.filter(s=>s.date===d).map(s=><label className="option" key={s.start}><input type="radio" name="slot" value={s.start} checked={chosen===s.start} onChange={()=>pick(s)}/><span>{s.local}</span></label>)}</div></fieldset>)}</div>;
}
export function PublicBooking({offerId}:{offerId:string}){
 const [tz,setTz]=useState(zone),[offer,setOffer]=useState<Row>(),[error,setError]=useState(''),[slot,setSlot]=useState<Row>(),[done,setDone]=useState<Row>(),[answers,setAnswers]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;setError('');api('/consult/'+encodeURIComponent(offerId)+'?tz='+encodeURIComponent(tz)).then(o=>{if(live){setOffer(o);setSlot(undefined);}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[offerId,tz]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!slot||!offer||busy)return;setBusy(true);setError('');const v=Object.fromEntries(new FormData(event.currentTarget));
  try{setDone(await post('/consult/'+encodeURIComponent(offerId)+'/book',{slot:slot.start,timezone:tz,name:v.name,email:v.email,phone:v.phone,summary:v.summary,answers:Object.fromEntries(offer.questions.filter((q:Row)=>answers[q.key]).map((q:Row)=>[q.key,answers[q.key]])),consent:v.consent==='on',reminderConsent:v.reminderConsent==='on',feeAcknowledged:v.feeAcknowledged==='on',website:v.website??''}));}
  catch(e){setError((e as Error).message);setSlot(undefined);api('/consult/'+encodeURIComponent(offerId)+'?tz='+encodeURIComponent(tz)).then(setOffer).catch(()=>{});}finally{setBusy(false);}
 }
 return <div className="intake-page"><main><header><p className="brand">{offer?.firmName||'Consultation'}</p><div className="rule" aria-hidden="true"/><h1>{offer?.title??'Book a consultation'}</h1>{offer&&!done&&<p className="intro">{offer.durationMinutes} minutes{offer.feeCents?` · fee ${dollars(offer.feeCents)}`:''}</p>}</header>
  {error&&<p className="error" role="alert">{error}</p>}{!offer&&!error&&<p aria-busy="true">Opening available times…</p>}
  {done?<section className="receipt" role="status"><h2>Consultation booked</h2><p>{done.local} ({tz})</p>{done.feeStatus!=='none'&&<p>The {dollars(done.feeCents)} consultation fee is due at the consultation. Nothing was charged now.</p>}<p>{done.reminders?'You will receive email reminders.':'No reminder emails will be sent.'}</p><p><a href={'/consultation/'+done.manageToken}>Change or cancel your consultation</a></p><p>Save this link: it is the only way to change your booking.</p></section>
  :offer&&<form onSubmit={submit}><div className="field"><label htmlFor="book-tz">Your timezone (IANA)</label><input id="book-tz" type="text" defaultValue={tz} onBlur={e=>{const v=e.target.value.trim();if(v&&v!==tz)setTz(v);}}/></div>
   <Slots slots={offer.slots} pick={setSlot} chosen={slot?.start}/>
   {slot&&<fieldset disabled={busy}><legend>Your details for {slot.local}</legend>
    <div className="field"><label htmlFor="book-name">Full name *</label><input id="book-name" name="name" type="text" required maxLength={200}/></div><div className="field"><label htmlFor="book-email">Email address *</label><input id="book-email" name="email" type="email" required maxLength={254}/></div>
    <div className="field"><label htmlFor="book-phone">Phone number</label><input id="book-phone" name="phone" type="tel" maxLength={40}/></div><div className="field summary"><label htmlFor="book-summary">Matter summary *</label><textarea id="book-summary" name="summary" required maxLength={2000}/></div>
    {offer.questions.map((q:Row)=><div className="field" key={q.key}><label htmlFor={'book-'+q.key}>{q.label}{q.required?' *':''}</label><input id={'book-'+q.key} type="text" required={q.required} value={answers[q.key]??''} onChange={e=>setAnswers({...answers,[q.key]:e.target.value})}/></div>)}
    <div className="website" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div>
    <label className="consent"><input name="consent" type="checkbox" required/><span>{offer.consentText} * Submitting creates no attorney-client relationship.</span></label>
    {offer.feeCents>0&&<label className="consent"><input name="feeAcknowledged" type="checkbox" required/><span>I understand the consultation fee of {dollars(offer.feeCents)} is due at the consultation; nothing is collected here. *</span></label>}
    <label className="consent"><input name="reminderConsent" type="checkbox"/><span>Email me reminders about this consultation. I can stop them at any time.</span></label>
    <button type="submit" disabled={busy}>{busy?'Booking…':'Book this time'}</button></fieldset>}
  </form>}
 </main></div>;
}
export function ManageBooking({token}:{token:string}){
 const [tz,setTz]=useState(zone),[view,setView]=useState<Row>(),[error,setError]=useState(''),[notice,setNotice]=useState(''),[chosen,setChosen]=useState<Row>();
 const load=()=>api('/consult/manage/'+encodeURIComponent(token)+'?tz='+encodeURIComponent(tz)).then(setView).catch(e=>setError(e.message));
 useEffect(()=>{setError('');void load();},[token,tz]);
 const act=async(path:string,body:Row,message:string)=>{setError('');try{setView(await post('/consult/manage/'+encodeURIComponent(token)+path,body));setNotice(message);setChosen(undefined);}catch(e){setError((e as Error).message);void load();}};
 return <div className="intake-page"><main><header><p className="brand">Your consultation</p><div className="rule" aria-hidden="true"/><h1>{view?.title??'Consultation'}</h1></header>
  {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}{!view&&!error&&<p aria-busy="true">Opening your booking…</p>}
  {view&&<><p>{view.status==='cancelled'?'Cancelled':'Booked'}: {view.local} ({view.timezone})</p>{view.feeStatus!=='none'&&<p>Fee due at the consultation: {dollars(view.feeCents)}. Nothing was charged online.</p>}
   <div className="field"><label htmlFor="manage-tz">Show times in timezone (IANA)</label><input id="manage-tz" type="text" defaultValue={tz} onBlur={e=>{const v=e.target.value.trim();if(v&&v!==tz)setTz(v);}}/></div>
   {view.status==='booked'&&<><h2>Choose another time</h2><Slots slots={view.slots.filter((s:Row)=>s.start!==view.start)} pick={setChosen} chosen={chosen?.start}/>
    {chosen&&<button type="button" onClick={()=>act('/reschedule',{slot:chosen.start,timezone:tz},'Your consultation was moved.')}>Move to {chosen.local}</button>}
    <p><button type="button" className="quiet" onClick={()=>act('/cancel',{},'Your consultation was cancelled.')}>Cancel this consultation</button></p></>}</>}
 </main></div>;
}
export function StopFollowups({id,signature}:{id:string;signature:string}){
 const [state,setState]=useState<'idle'|'done'|string>('idle');
 return <div className="intake-page"><main><header><p className="brand">Email messages</p><div className="rule" aria-hidden="true"/><h1>Stop these messages</h1></header>
  {state==='done'?<p role="status">You will not receive further automated messages from this firm. If you have a question, contact the firm directly.</p>:<><p>Choose the button to stop automated follow-up and reminder emails from this firm.</p><button type="button" onClick={()=>post('/followups/'+encodeURIComponent(id)+'/opt-out/'+encodeURIComponent(signature),{}).then(()=>setState('done')).catch(e=>setState(e.message))}>Stop these messages</button>{state!=='idle'&&<p className="error" role="alert">{state}</p>}</>}
 </main></div>;
}
