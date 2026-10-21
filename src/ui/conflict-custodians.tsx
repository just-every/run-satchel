import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';
import {originalWaiver,WaiverOriginal,WaiverUpload} from './conflict-waivers';

function CustodianReview({referral,run}:{referral:Row;run:Run}){
 const [waiver,setWaiver]=useState<File>();
 return <article className="record" aria-label={'Custodian conflict referral '+referral.id}>
  <h4>Restricted match review</h4>
  <p>Search reference: {referral.searchId}<br/>Wall reference: {referral.wallId}<br/>Matter reference: {referral.matterId}</p>
  <p>Requested by: {referral.requester}</p>
  <p>Names supplied by the requester:<br/>Prospective client: {referral.client}<br/>Adverse party: {referral.adverse}</p>
  <p><span className="badge">{referral.status}</span></p><section aria-label="Custodian permitted matches"><h4>Permitted matching contacts</h4>{referral.matches.map((m:Row)=><article className="record" key={m.id}><strong>{m.name}</strong><p>{m.aliases.join('; ')}</p>{m.matterRoles.map((role:Row,i:number)=><p key={i}>{role.role} · {role.matter_number} · {role.title}</p>)}</article>)}</section>
  {referral.decision&&<section aria-label="Private custodian decision">
   <h4>Private recorded decision</h4>
   {referral.status==='pending'&&<p>This earlier decision does not clear the current wall revision. Review the request again.</p>}
   <p>{referral.decision.decision}</p>
   <p>{referral.decision.note}</p><ul>{referral.restrictions.map((r:string,i:number)=><li key={i}>{r}</li>)}</ul>{referral.restrictions.length>0&&<p>These conditions will attach to the engagement.</p>}
   <WaiverOriginal waiver={referral.waiver}/>
  </section>}
  <section aria-label="Record private custodian decision">
   <p>Record any private conditions. Disclosed conditions attach at opening; decline withholds engagement. Your decision note and waiver remain private to the custodian.</p>
   <Form label="Record custodian decision" submit={data=>run(async()=>{
    await api('/conflict-referrals/'+referral.id+'/decide',{decision:data.decision,note:data.note,restrictions:data.restrictions.split(/\r?\n/).map((v:string)=>v.trim()).filter(Boolean),waiver:await originalWaiver(waiver,data),excludedStaff:data.excludedStaff.split(/\r?\n/).map((v:string)=>v.trim()).filter(Boolean),screenCustodian:data.screenCustodian,screenRequired:data.screenRequired==='on'});
   },'Private custodian decision recorded')}>
    <Field label="Custodian conflict decision" name="decision"><select name="decision" aria-label="Custodian conflict decision" defaultValue="" required><option value="">Choose a decision</option><option value="no_conflict">No conflict</option><option value="waiver_recorded">Waivable, waiver recorded</option><option value="restrictions">Proceed with engagement restrictions</option><option value="decline">Decline</option></select></Field>
    <Field label="Private custodian note" name="note"><textarea name="note" aria-label="Private custodian note" required rows={4}/></Field>
    <Field label="Private engagement restrictions" name="restrictions"><textarea name="restrictions" aria-label="Private engagement restrictions" rows={3}/></Field><Field label="Excluded staff emails (one per line)" name="excludedStaff"><textarea name="excludedStaff" aria-label="Excluded staff emails" rows={3}/></Field><label><input type="checkbox" name="screenRequired"/>Require an ethical screen (defaults to the recording counsel as custodian)</label><Field label="Screen custodian email (if a screen is required)" name="screenCustodian" required={false}/>
   <WaiverUpload label="Private custodian waiver original (optional)" onChange={setWaiver}/>
   </Form>
  </section>
 </article>;
}

export function ConflictCustodians({run,tick}:{run:Run;tick:number}){
 const [view,setView]=useState<Row>(),[loadedTick,setLoadedTick]=useState(-1);
 useEffect(()=>{
  let active=true;setView(undefined);
  api('/conflict-referrals').then(result=>{if(active){setView(result);setLoadedTick(tick);}}).catch(error=>{if(active)void run(async()=>{throw error;});});
  return()=>{active=false;};
 },[tick]);
 return <section className="panel" aria-label="Conflict custodian referrals">
  <h3>Conflict referrals</h3>
  {!view?<p>Opening conflict referrals…</p>:<fieldset className="content" disabled={loadedTick!==tick} aria-busy={loadedTick!==tick}>
   <section aria-label="Your conflict referral routes">
    <h4>Your referral routes</h4>
    <p>Every restricted match needs custodian clearance before the engagement can open. Only routing details are shown here.</p>
    {!view.own.length&&<p>No conflict referrals recorded.</p>}
    {view.own.map((referral:Row)=><article className="record" key={referral.id} aria-label={'Your conflict referral '+referral.id}>
     <p>Search reference: {referral.searchId}<br/>Route: {referral.wallId}<br/>Custodian: {referral.custodian}<br/>Outcome: {referral.status} · {referral.at}</p><ul>{referral.restrictions.map((r:string,i:number)=><li key={i}>{r}</li>)}</ul>
    </article>)}
   </section>
   {view.custodian.length>0&&<section aria-label="Private custodian conflict reviews">
    <h3>Private custodian reviews</h3>
    {view.custodian.map((referral:Row)=><CustodianReview key={referral.id+':'+referral.wallRevision+':'+(referral.decision?.id??'new')} referral={referral} run={run}/>)}
   </section>}
  </fieldset>}
 </section>;
}
