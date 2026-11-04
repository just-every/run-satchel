import {useEffect,useState} from 'react';
import {Field,Form,type Row,type Run,api} from './common';
const split=(value:unknown)=>String(value??'').split(';').map(v=>v.trim()).filter(Boolean);
export function ContactProfile({contact,revision,run,saved}:{contact?:Row;revision:number;run:Run;saved:(id:string)=>void}){
 return <Form label={contact?'Save contact profile':'Create contact'} submit={d=>run(async()=>{const c=await api('/contacts',{...d,id:contact?.id,revision,aliases:split(d.aliases),formerNames:split(d.formerNames),emails:split(d.emails),phones:split(d.phones),addresses:split(d.addresses)});saved(c.id);},'Contact profile saved')}>
  <Field name="kind" label="Contact kind"><select name="kind" defaultValue={contact?.kind??''} required><option value="">Choose kind</option><option value="unclassified" disabled>Unclassified source contact</option><option value="person">Person</option><option value="organization">Organization</option></select></Field>
  <Field name="name" label="Contact name" value={contact?.name}/>
  {([['aliases','Aliases'],['formerNames','Former names'],['emails','Email addresses'],['phones','Phone numbers'],['addresses','Postal addresses']] as const).map(([name,label])=><Field key={name} name={name} label={label+' (separate with ;)'} required={false} value={contact?.[name]?.join('; ')}/>) }
 </Form>;
}

// Evidence belongs with the contact record; it never grants access or sending authority.
export function ContactRepresentatives({contact,matters,revision,tick,run}:{contact:Row;matters:Row[];revision:number;tick:number;run:Run}){
 const [state,setState]=useState<Row>();
 useEffect(()=>{let active=true;setState(undefined);api('/contacts/'+contact.id+'/representatives').then(s=>{if(active)setState(s);}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;};},[contact.id,tick]);
 return <details><summary>Representative authority and recipient evidence</summary><p>Practitioner-recorded, matter-specific evidence only. It does not certify legal validity, share records or authorize messages. A principal reviews each exact revision; portal access still needs a fresh explicit delegate grant.</p>
 {!state?<p>Opening representative history…</p>:<>
 {state.evidence.map((r:Row)=><div className="review" style={{border:'1px solid var(--hairline)',borderRadius:8,padding:16}} key={r.id}><h4>{matters.find(m=>m.id===r.matter_id)?.title} · {r.recipient}</h4><dl><dt>Evidence revision</dt><dd style={{overflowWrap:'anywhere'}}>{r.id}</dd><dt>Represented client</dt><dd>{r.represented_email}</dd><dt>Authority evidence</dt><dd>{r.authority_evidence}</dd><dt>Recipient verification</dt><dd>{r.verification_evidence}</dd><dt>Recorded decision</dt><dd>{r.withdrawn?'Withdrawn':r.current?'Current evidence':'Superseded or identity changed'} · {r.recorded_by} · {r.recorded_at}</dd></dl>
 {r.reviews.map((v:Row)=><p key={v.id}>Principal review: {v.reviewed_by} · {v.reviewed_at} · {v.reason}{v.local?'':' · History only; fresh installation review required'}</p>)}
 {state.canReview&&Boolean(r.current)&&<Form label={'Review representative revision '+r.id} submit={d=>run(()=>api('/contacts/'+r.party_id+'/representative-review',{...d,evidenceId:r.id,confirmed:d.confirmed==='on'}),'Exact representative evidence reviewed')}><Field name="reason" label="Principal review reason"/><label><input type="checkbox" name="confirmed"/>I reviewed this exact authority and recipient evidence.</label></Form>}
 </div>)}
 <Form label="Record representative evidence" submit={d=>{const prior=state.evidence.filter((r:Row)=>r.party_id===d.identityId&&r.matter_id===d.matterId).at(-1);return run(()=>api('/contacts/'+d.identityId+'/representative',{...d,revision,previousId:prior?.id??null,withdrawn:d.decision==='withdrawn'}),'Representative evidence recorded; covered access and queued email stopped');}}>
 <Field name="identityId" label="Represented source identity"><select name="identityId">{contact.identities.map((i:Row)=><option key={i.id} value={i.id}>{i.name} · {i.id}</option>)}</select></Field>
 <Field name="matterId" label="Representative matter"><select name="matterId">{matters.filter(m=>contact.matterRoles.some((r:Row)=>r.matter_id===m.id&&r.role==='client')).map(m=><option key={m.id} value={m.id}>{m.matter_number} · {m.title}</option>)}</select></Field>
 <Field name="representedEmail" label="Represented client recipient" type="email"/><Field name="recipient" label="Verified representative recipient" type="email"/>
 <Field name="authorityEvidence" label="Practitioner-recorded authority evidence"/><Field name="verificationEvidence" label="Recipient verification evidence"/>
 <Field name="decision" label="Representative decision"><select name="decision"><option value="active">Record current evidence</option><option value="withdrawn">Withdraw authority</option></select></Field>
 </Form></>}
 </details>;
}
