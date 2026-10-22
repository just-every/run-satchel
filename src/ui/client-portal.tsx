import {useEffect,useState} from 'react';
import {api,Empty,Field,Form,type Row,type Run} from './common';
// A client signs in to this page only: it lists the matters the principal explicitly shared.
export function ClientPortal({me}:{me:Row}){
 const [grants,setGrants]=useState<Row[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{api('/portal').then(r=>setGrants(r.grants)).catch(e=>setError(e.message));},[]);
 return <div className="workspace"><header><a className="brand" href="/app"><img src="/brand/mark.svg" alt=""/><span data-rer-name>Satchel</span></a><span>Client portal</span><a href="/signin">Sign in</a></header><main><div className="page-heading"><div><p className="eyebrow">SHARED WITH YOU</p><h1>Your matters</h1></div><div className="heading-tools"><span className="badge">{me.name} · client</span></div></div>
  {error&&<p className="error" role="alert">{error}</p>}
  {!grants?<p>Opening your matters…</p>:!grants.length?<Empty>Your firm has not shared a matter with you yet.</Empty>:<section className="panel"><h2>Shared matters</h2>{grants.map(g=><article className="record" key={g.id}><strong>{g.matterNumber} · {g.title}</strong><p>{g.status} · shared {g.grantedAt.slice(0,10)}</p></article>)}</section>}
 </main></div>;
}
// The principal shares one matter with one client member at a time, with a recorded reason, and can withdraw it.
export function PortalSharing({state,run,tick}:{state:Row;run:Run;tick:number}){
 const clients=state.members.filter((m:Row)=>m.role==='client'&&m.active),[matterId,setMatterId]=useState(''),[grants,setGrants]=useState<Row[]>([]);
 useEffect(()=>{if(!matterId){setGrants([]);return;}let live=true;api('/matters/'+matterId+'/portal').then(r=>{if(live)setGrants(r.grants);}).catch(e=>run(async()=>{throw e;}));return()=>{live=false;};},[matterId,tick]);
 return <section className="panel" aria-label="Client portal sharing"><h2>Client portal sharing</h2><p>A client sees only the matters you share here, and only the matter number, title and status. Sharing and withdrawing are recorded in the action audit.</p>
  {!clients.length?<p>Save a firm member with the client role to share a matter.</p>:<><label>Matter to share<select aria-label="Matter to share" value={matterId} onChange={e=>setMatterId(e.target.value)}><option value="">Choose a matter</option>{state.matters.map((m:Row)=><option key={m.id} value={m.id}>{m.matter_number} · {m.title}</option>)}</select></label>
   {matterId&&<><Form label="Share with client" submit={d=>run(()=>api('/matters/'+matterId+'/portal',{email:d.email,reason:d.reason}),'Matter shared with the client')}><Field label="Client" name="email"><select name="email" aria-label="Client" required defaultValue=""><option value="">Choose a client</option>{clients.map((c:Row)=><option key={c.email} value={c.email}>{c.name} · {c.email}</option>)}</select></Field><Field label="Reason for sharing" name="reason"/></Form>
   {grants.map(g=><article className="record" key={g.id}><strong>{g.email}</strong><p>{g.revokedAt?'withdrawn '+g.revokedAt.slice(0,10)+' · '+g.revokeReason:'shared '+g.grantedAt.slice(0,10)+' · '+g.reason}</p>{!g.revokedAt&&<Form label="Withdraw" danger submit={d=>run(()=>api('/portal-grants/'+g.id+'/revoke',{reason:d.reason}),'Portal sharing withdrawn')}><Field label={'Reason for withdrawing from '+g.email} name="reason"/></Form>}</article>)}</>}</>}
 </section>;
}
