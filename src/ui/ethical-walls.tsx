import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';

function memberEmails(value:string,custodian:string){
 return [...new Set([...value.split(';').map(email=>email.trim().toLowerCase()).filter(Boolean),custodian.toLowerCase()])];
}

function AccessRequest({request,canDecide,run}:{request:Row;canDecide:boolean;run:Run}){
 const expired=request.status==='approved'&&request.expires_at&&new Date(request.expires_at).getTime()<=Date.now();
 return <article className="record" aria-label={'Wall access request '+request.id}>
  <strong>{request.requester_email}</strong>
  <p><span className="badge">{request.revoked_at?'revoked':expired?'expired':request.status}</span></p>
  <p>{request.reason}</p>
  {request.expires_at&&<p>Access expires: <time dateTime={request.expires_at}>{request.expires_at}</time></p>}
  {request.decision_note&&<p>Decision note: {request.decision_note}</p>}
  {canDecide&&request.status==='pending'&&<Form label="Record access decision" submit={d=>run(()=>api('/wall-requests/'+request.id+'/decide',{approve:d.decision==='approve',note:d.note,minutes:30}),'Exceptional access decision recorded')}>
   <Field label="Access decision" name="decision"><select name="decision" aria-label="Access decision" defaultValue="" required><option value="">Choose a decision</option><option value="approve">Approve for 30 minutes</option><option value="decline">Decline</option></select></Field>
   <Field label="Access decision note" name="note"><textarea name="note" aria-label="Access decision note" required rows={3}/></Field>
   <p>Approval gives this person 30 minutes of access. Exceptional access is limited to 60 minutes per approval.</p>
  </Form>}
  {canDecide&&request.status==='approved'&&!request.revoked_at&&!expired&&<Form danger label="Revoke exceptional access" submit={d=>run(()=>api('/wall-emergencies/'+request.id+'/revoke',{reason:d.reason}),'Exceptional access revoked')}>
   <Field label="Access revocation reason" name="reason"><textarea name="reason" aria-label="Access revocation reason" required rows={3}/></Field>
  </Form>}
 </article>;
}

function Wall({wall,requests,actor,run}:{wall:Row;requests:Row[];actor:Row;run:Run}){
 const ownRequests=requests.filter(request=>request.wall_id===wall.id&&request.requester_email===actor.email);
 const pending=ownRequests.some(request=>request.status==='pending');
 return <article className="record" aria-label={'Ethical wall '+wall.id}>
  <h3>{wall.canRead&&wall.title?wall.title:'Ethical wall'}</h3>
  <p>Wall reference: {wall.id}<br/>Custodian: {wall.custodian_email?<a href={'mailto:'+wall.custodian_email}>{wall.custodian_email}</a>:<strong>custodian unassigned</strong>}</p>
  {wall.canRead&&wall.matter_id&&<p>Matter reference: {wall.matter_id}</p>}
  {wall.custodian&&<>
   <h4>Wall members</h4>
   <ul>{wall.members?.map((member:Row)=><li key={member.email}>{member.email}</li>)}</ul>
   <details><summary>Edit wall membership</summary>
    <p>The custodian stays a member. Changes require a reason and are audited.</p>
    <Form key={wall.revision} label="Save wall membership" submit={d=>run(()=>api('/matters/'+wall.matter_id+'/wall',{custodianEmail:d.custodianEmail,members:memberEmails(d.members,d.custodianEmail),reason:d.reason,revision:wall.revision}),'Ethical wall membership updated')}>
     <Field label="Custodian after change" name="custodianEmail"><select name="custodianEmail" aria-label="Custodian after change" defaultValue={wall.custodian_email}>{wall.members?.map((member:Row)=><option key={member.email} value={member.email}>{member.email}</option>)}</select></Field>
     <small>Hand custodianship only to an active lawyer or principal already inside the wall. Every change revokes temporary grants.</small>
     <Field label="Wall member emails" name="members"><textarea name="members" aria-label="Wall member emails" defaultValue={wall.members?.map((member:Row)=>member.email).join('; ')} rows={4}/></Field>
     <small>Separate email addresses with semicolons.</small>
     <Field label="Wall change reason" name="reason"><textarea name="reason" aria-label="Wall change reason" required rows={3}/></Field>
    </Form>
   </details>
   <details><summary>Dissolve this ethical wall</summary>
    <p>Dissolving ends this screen and revokes temporary access. Ordinary matter permissions and engagement exclusions still apply.</p>
    <Form danger label="Dissolve ethical wall" submit={d=>run(()=>api('/ethical-walls/'+wall.id+'/dissolve',{reason:d.reason,revision:wall.revision}),'Ethical wall dissolved')}>
     <Field label="Wall dissolution reason" name="reason"><textarea name="reason" aria-label="Wall dissolution reason" required rows={3}/></Field>
    </Form>
   </details>
   <h4>Exceptional access requests</h4>
   {!wall.requests?.length&&<p>No exceptional access requests.</p>}
   {wall.requests?.map((request:Row)=><AccessRequest key={request.id} request={request} canDecide run={run}/>)}
  </>}
  {wall.canTakeCustody&&<Form label="Take wall custodianship" submit={d=>run(()=>api('/ethical-walls/'+wall.id+'/take-custody',{reason:d.reason,revision:wall.revision}),'Wall custodianship recorded')}>
   <p>The wall remains in force. Only an active lawyer or principal already inside it can take custodianship.</p>
   <Field label="Custodianship reason" name="reason"><textarea name="reason" aria-label="Custodianship reason" required rows={3}/></Field>
  </Form>}
  {!wall.custodian&&<>
   {wall.canRead?<p>You can access this matter.</p>:<p>Contact the custodian or request exceptional access using this wall reference.</p>}
   {ownRequests.map(request=><AccessRequest key={request.id} request={request} canDecide={false} run={run}/>)}
   {!wall.canRead&&wall.custodian_email&&(pending?<p>Your access request is awaiting the custodian’s decision.</p>:<Form label="Request exceptional access" submit={d=>run(()=>api('/ethical-walls/'+wall.id+'/requests',{reason:d.reason}),'Exceptional access requested from the wall custodian')}>
    <Field label="Exceptional access reason" name="reason"><textarea name="reason" aria-label="Exceptional access reason" required rows={3}/></Field>
   </Form>)}
  </>}
 </article>;
}

export function EthicalWalls({state,run,tick}:{state:Row;run:Run;tick:number}){
 const [view,setView]=useState<Row>(),[loadedTick,setLoadedTick]=useState(-1);
 useEffect(()=>{
  let active=true;setView(undefined);
  api('/ethical-walls').then(result=>{if(active){setView(result);setLoadedTick(tick);}}).catch(error=>{if(active)void run(async()=>{throw error;});});
  return()=>{active=false;};
 },[tick]);
 const custodians=state.members.filter((member:Row)=>member.active&&member.role==='lawyer');
 const matters=state.matters.filter((matter:Row)=>!view?.walls.some((wall:Row)=>wall.matter_id===matter.id));
 return <section className="panel" aria-label="Ethical walls">
  <h2>Ethical walls</h2>
  <p>A wall limits matter access to its members. The custodian manages membership and reviews requests. Staff outside the wall see only its reference and custodian.</p>
  <p>Exceptional access is for the requesting person only, expires automatically and is audited. It does not delegate access to an agent or integration or permit whole-firm archives. An expired or decided request never renews; a further need requires a new request.</p>
  {!view?<p>Opening ethical walls…</p>:<fieldset className="content" disabled={loadedTick!==tick} aria-busy={loadedTick!==tick}>
   {!view.walls.length&&<p>No ethical walls recorded.</p>}
   {view.walls.map((wall:Row)=><Wall key={wall.id} wall={wall} requests={view.requests} actor={state.actor} run={run}/>)}
   {state.actor.role==='owner'&&<details><summary>Create an ethical wall</summary>
    <p>Choose an active lawyer as custodian. The custodian is included in wall membership and controls later changes.</p>
    {!matters.length?<p>No accessible matters available for a new wall.</p>:!custodians.length?<p>Add an active lawyer before creating a wall.</p>:<Form label="Create ethical wall" submit={d=>run(()=>api('/matters/'+d.matterId+'/wall',{custodianEmail:d.custodianEmail,members:memberEmails(d.members,d.custodianEmail),reason:d.reason,revision:null}),'Ethical wall created')}>
     <Field label="Wall matter" name="matterId"><select name="matterId" aria-label="Wall matter" defaultValue="" required><option value="">Choose a matter</option>{matters.map((matter:Row)=><option key={matter.id} value={matter.id}>{matter.matter_number} · {matter.title}</option>)}</select></Field>
     <Field label="Wall custodian" name="custodianEmail"><select name="custodianEmail" aria-label="Wall custodian" defaultValue="" required><option value="">Choose an active lawyer</option>{custodians.map((member:Row)=><option key={member.email} value={member.email}>{member.name} · {member.email}</option>)}</select></Field>
     <Field label="Initial wall member emails" name="members"><textarea name="members" aria-label="Initial wall member emails" rows={4}/></Field>
     <small>Separate email addresses with semicolons. The custodian is included automatically.</small>
     <Field label="Wall creation reason" name="reason"><textarea name="reason" aria-label="Wall creation reason" required rows={3}/></Field>
    </Form>}
   </details>}
  </fieldset>}
 </section>;
}
