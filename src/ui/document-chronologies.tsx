import {useEffect,useState} from 'react';
import {api,dollars,Field,Form,type Row,type Run} from './common';
export function DocumentChronologies({matterId,actor,run,tick}:{matterId:string;actor:Row;run:Run;tick:number}){
 const [state,setState]=useState<Row>(),[file,setFile]=useState<File>();
 useEffect(()=>{setState(undefined);setFile(undefined);if(actor.role!=='owner')return;let active=true;api('/matters/'+matterId+'/chronologies').then(result=>{if(active)setState(result);}).catch(error=>{if(active)void run(async()=>{throw error;});});return()=>{active=false;};},[matterId,tick,actor.role]);
 if(actor.role!=='owner')return null;
 return <section className="panel" aria-label="Medical and bill chronologies"><h2>Medical and bill chronologies</h2>
  <p>Principal only. Review authority and the native storage and processing agreements before importing health information. No external processor or recipient receives these records.</p>
  <Form label="Record health-data setup" submit={data=>run(()=>api('/matters/'+matterId+'/chronologies/setup',{authorizationReference:data.authorizationReference,agreementReference:data.agreementReference,confirmed:data.confirmed==='on'}),'Health-data setup recorded')}>
   <Field label="Health-data authorization reference" name="authorizationReference" value={state?.setup?.authorization_reference??''}/>
   <Field label="Reviewed storage and processing agreement reference" name="agreementReference" value={state?.setup?.agreement_reference??''}/>
   <label><input type="checkbox" name="confirmed" required/>I reviewed authority and agreements for native health-data processing</label>
  </Form>
  {state?.setup&&<><p>Native processing reviewed by {state.setup.reviewed_by} at {state.setup.reviewed_at}.</p>
   <Form label="Import chronology records" submit={data=>run(async()=>{
    if(!file||file.size>1048576)throw new Error('Choose a chronology record file no larger than 1 MiB');
    const entries=JSON.parse(await file.text());await api('/matters/'+matterId+'/chronologies',{entries,reportedTotalCents:Number(data.reportedTotalCents),gapDays:Number(data.gapDays)});
   },'Chronology imported for counsel review')}>
    <p>Choose a record file in the documented chronology format. Each entry cites a private PDF original uploaded by the principal, its version and source page. Nothing is published automatically.</p>
    <label>Chronology record file<input type="file" accept=".json" required onChange={event=>setFile(event.target.files?.[0])}/></label>
    <Field label="Packet reported bill total (USD cents)" name="reportedTotalCents" type="number"/>
    <Field label="Flag record intervals longer than (days)" name="gapDays" type="number" value={30}/>
   </Form>
  </>}
  {(state?.chronologies??[]).map((c:Row)=><article className="record" key={c.id}><h3>Chronology · {c.status}</h3><p className="document-hash">Source snapshot SHA-256 {c.sha256}</p>
   <p>{c.snapshot.notice}</p><p>Gross bills: {dollars(c.snapshot.grossTotalCents)} · Packet reported total: {dollars(c.snapshot.reportedTotalCents)} · Unreviewed difference: {dollars(c.snapshot.unreviewedDifferenceCents)}</p>
   {c.snapshot.entries.toSorted((a:Row,b:Row)=>a.date.localeCompare(b.date)||a.provider.localeCompare(b.provider)||a.index-b.index).map((entry:Row)=><div key={entry.index}><strong>Record {entry.index+1}: {entry.provider} · {entry.date}</strong><p>{entry.treatment}{entry.kind==='bill'?' · '+dollars(entry.chargeCents):''}</p><a href={'/api/satchel/documents/'+entry.documentId+'/file?version='+entry.version}>Source {entry.sourceName}, version {entry.version}, page {entry.page}</a></div>)}
   <p>{c.snapshot.duplicates.length} possible duplicate bills; none excluded automatically.</p>
   {c.snapshot.intervals.map((gap:Row,index:number)=><p key={index}>Record interval: {gap.provider}, {gap.days} days between records {gap.fromIndex+1} and {gap.toIndex+1}. This does not establish missing treatment.</p>)}
   {c.status==='draft'&&<Form label="Publish reviewed chronology" submit={data=>run(()=>api('/chronologies/'+c.id+'/publish',{sha256:c.sha256,reviewNote:data.reviewNote,decisions:c.snapshot.duplicates.map((d:Row)=>({index:d.index,decision:data['decision'+d.index],note:data['reason'+d.index]}))}),'Counsel published the reviewed chronology')}>
    {c.snapshot.duplicates.map((d:Row)=><div key={d.index}><p>Record {d.index+1} may duplicate record {d.possibleDuplicateOf+1}.</p>
     <Field label={'Duplicate decision for record '+(d.index+1)} name={'decision'+d.index}><select aria-label={'Duplicate decision for record '+(d.index+1)} name={'decision'+d.index} required defaultValue=""><option value="">Choose explicitly</option><option value="keep">Keep as a separate charge</option><option value="exclude">Exclude from reconciled total</option></select></Field>
     <Field label={'Duplicate review reason for record '+(d.index+1)} name={'reason'+d.index}/>
    </div>)}
    <Field label="Counsel publication review" name="reviewNote"/>
   </Form>}
   {c.review&&<><p>Reconciled bills: {dollars(c.review.reconciledTotalCents)} · Difference from reported total: {dollars(c.review.differenceCents)}</p><p>Published by {c.published_by} at {c.published_at}: {c.review.note}</p>{c.review.decisions.map((d:Row)=><p key={d.index}>Record {d.index+1}: {d.decision} · {d.note}</p>)}</>}
  </article>)}
 </section>;
}
