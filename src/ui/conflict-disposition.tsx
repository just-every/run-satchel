import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';
import {originalWaiver,WaiverOriginal,WaiverUpload} from './conflict-waivers';

function DispositionForm({searchId,review,run,saved}:{searchId:string;review?:Row;run:Run;saved:()=>Promise<void>}){
 const [waiver,setWaiver]=useState<File>();
 return <section aria-label="Record counsel disposition">
  <h4>{review?'Record a new disposition':'Record counsel disposition'}</h4>
  <Form label="Record counsel disposition" submit={data=>run(async()=>{
   await api('/conflicts/'+searchId+'/disposition',{decision:data.decision,note:data.note,restrictions:data.restrictions.split(/\r?\n/).map((line:string)=>line.trim()).filter(Boolean),waiver:await originalWaiver(waiver,data),excludedStaff:data.excludedStaff.split(/\r?\n/).map((v:string)=>v.trim()).filter(Boolean),screenCustodian:data.screenCustodian,screenRequired:data.screenRequired==='on'});
   await saved();
  },'Counsel disposition recorded')}>
   <Field label="Counsel decision" name="decision"><select name="decision" aria-label="Counsel decision" defaultValue="" required><option value="">Choose a decision</option><option value="no_conflict">No conflict</option><option value="waiver_recorded">Waivable, waiver recorded</option><option value="restrictions">Proceed with engagement restrictions</option><option value="decline">Decline</option></select></Field>
   <Field label="Counsel disposition note" name="note"><textarea name="note" aria-label="Counsel disposition note" required rows={4}/></Field>
   <Field label="Engagement restrictions (one per line)" name="restrictions"><textarea name="restrictions" aria-label="Engagement restrictions" rows={4}/></Field>
   <Field label="Excluded staff emails (one per line)" name="excludedStaff"><textarea name="excludedStaff" aria-label="Excluded staff emails" rows={3}/></Field><label><input type="checkbox" name="screenRequired"/>Require an ethical screen (defaults to the recording counsel as custodian)</label><Field label="Screen custodian email (if a screen is required)" name="screenCustodian" required={false}/>
   <WaiverUpload label="Counsel waiver original (optional)" onChange={setWaiver}/>
  </Form>
 </section>;
}

export function ConflictDisposition({search,run,onSaved}:{search:Row;run:Run;onSaved?:(review:Row|null)=>void}){
 const [view,setView]=useState<Row>(),[loadedSearch,setLoadedSearch]=useState('');
 useEffect(()=>{
  let active=true;
  api('/conflicts/'+search.id+'/review').then(result=>{if(active){setView(result);setLoadedSearch(search.id);onSaved?.(result.review);}}).catch(error=>{if(active)void run(async()=>{throw error;});});
  return()=>{active=false;};
 },[search.id]);
 const saved=async()=>{const result=await api('/conflicts/'+search.id+'/review');setView(result);setLoadedSearch(search.id);onSaved?.(result.review);};
 return <section className="panel" aria-label="Conflict disposition">
  <h3>Counsel disposition</h3>
  <p>Record your review of this conflict search before opening the engagement. Every restricted match needs custodian clearance before the engagement can open.</p>
  {!view||loadedSearch!==search.id?<p>Opening counsel disposition…</p>:<>
   {view.routes.length>0&&<section aria-label="Restricted match custodian routes">
    <h4>Refer restricted matches to their custodians</h4>
    <p>Use these opaque routes to request review. Only the outcome, custodian, time and disclosed conditions appear to the requester.</p>
    {view.routes.map((route:Row)=><article className="record" key={route.route} aria-label={'Conflict custodian route '+route.route}>
     <p>Custodian: {route.custodian}<br/>Route: {route.route}</p>
     <button type="button" className="quiet" onClick={()=>run(()=>api('/conflicts/'+search.id+'/referrals',{wallId:route.route}),'Restricted match referred to its custodian')}>Request custodian clearance</button>
    </article>)}
   </section>}
   {view.review?<section aria-label="Recorded counsel disposition" className="record">
    <h4>Your recorded disposition</h4>
    <p><span className="badge">{view.review.decision}</span></p>
    <p>{view.review.note}</p>
    <h4>Engagement restrictions</h4>
    {view.review.restrictions.length?<ul>{view.review.restrictions.map((restriction:string,index:number)=><li key={index}>{restriction}</li>)}</ul>:<p>No engagement restrictions recorded.</p>}
    <WaiverOriginal waiver={view.review.waiver}/>
   </section>:<p>No counsel disposition recorded for this search.</p>}
   <details><summary>Earlier counsel dispositions</summary>{view.history?.filter((r:Row)=>r.id!==view.review?.id).map((r:Row)=><article className="record" key={r.id}><strong>{r.decision}</strong><p>{r.note}</p><p>{r.created_at} · {r.actor}</p><ul>{r.restrictions.map((v:string,i:number)=><li key={i}>{v}</li>)}</ul><WaiverOriginal waiver={r.waiver}/></article>)}</details><DispositionForm key={search.id+':'+(view.review?.id??'new')} searchId={search.id} review={view.review} run={run} saved={saved}/>
  </>}
 </section>;
}
