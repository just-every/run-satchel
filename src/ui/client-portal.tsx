import {useEffect,useState} from 'react';
import {api,Empty,Field,Form,type Row,type Run} from './common';
import {PortalInvoices,PortalShares} from './client-shares';
import {PortalThreads} from './portal-threads';
import {PortalRequests} from './client-requests';
const labels:Record<string,string>={client:'You are the client on this matter.',co_client:'You are a co-client on this matter.',payer:'You can see this matter’s invoices.',delegate:'You are acting for a client on this matter.'};
const kindNames:Record<string,string>={client:'Client',co_client:'Co-client',payer:'Payer',delegate:'Delegate'};
function PortalPreview({matterId,email,kind}:{matterId:string;email:string;kind:string}){
 const [view,setView]=useState<Row|null>(null),[error,setError]=useState('');
 return <div><button type="button" className="quiet" onClick={()=>{setError('');api('/matters/'+matterId+'/portal-preview?email='+encodeURIComponent(email)).then(setView).catch(e=>setError(e.message));}}>Preview what {email} sees</button>{error&&<p className="error" role="alert">{error}</p>}
  {view&&<section aria-label={'Preview for '+email}><p>{kindNames[kind]} view: {view.timeline?view.timeline.entries.length+' shared updates':'no timeline'} · {view.shares?view.shares.items.map((i:Row)=>i.title).join(', ')||'nothing shared':'no tasks, events or files'} · {view.invoices?view.invoices.invoices.length+' invoices':'no invoices'} · {view.threads?view.threads.threads.length+' message threads':'no messages'} · {view.requests?view.requests.requests.length+' document requests':'no document requests'}</p></section>}</div>;
}
// A client signs in to this page only: it lists the matters the principal explicitly shared.
export function ClientPortal({me}:{me:Row}){
 const [grants,setGrants]=useState<Row[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{api('/portal').then(r=>setGrants(r.grants)).catch(e=>setError(e.message));},[]);
 return <div className="workspace"><header><a className="brand" href="/app"><img src="/brand/mark.svg" alt=""/><span data-rer-name>Satchel</span></a><span>Client portal</span><a href="/signin">Sign in</a></header><main><div className="page-heading"><div><p className="eyebrow">SHARED WITH YOU</p><h1>Your matters</h1></div><div className="heading-tools"><span className="badge">{me.name} · client</span></div></div>
  {error&&<p className="error" role="alert">{error}</p>}
  {!grants?<p>Opening your matters…</p>:!grants.length?<Empty>Your firm has not shared a matter with you yet.</Empty>:<section className="panel"><h2>Shared matters</h2>{grants.map(g=><article className="record" key={g.id}><strong>{g.matterNumber} · {g.title}</strong><p>{g.status} · shared {g.grantedAt.slice(0,10)}</p><p>{labels[g.kind]}</p>{g.kind!=='payer'&&<><ClientTimeline matterId={g.matterId}/><PortalShares matterId={g.matterId}/><PortalRequests matterId={g.matterId}/><PortalThreads matterId={g.matterId}/></>}{['payer','client'].includes(g.kind)&&<PortalInvoices matterId={g.matterId}/>}</article>)}</section>}
 </main></div>;
}
function ClientTimeline({matterId}:{matterId:string}){
 const [entries,setEntries]=useState<Row[]|null>(null);
 useEffect(()=>{api('/portal/matters/'+matterId+'/timeline').then(r=>setEntries(r.entries)).catch(()=>setEntries([]));},[matterId]);
 return <div aria-label="Shared updates"><h3>Shared updates</h3>{!entries?<p>Opening updates…</p>:!entries.length?<p>Your firm has not shared an update on this matter yet.</p>:<ol>{entries.map(e=><li key={e.id}><strong>{e.title}</strong> · {new Date(e.at).toLocaleDateString('en-US',{dateStyle:'medium'})}<p>{e.body}</p>{e.correction&&<p>Corrects: {e.correction.title}. Original entry retained.</p>}</li>)}</ol>}</div>;
}
// The principal shares one matter with one client member at a time, with a recorded reason, and can withdraw it.
export function PortalSharing({state,run,tick}:{state:Row;run:Run;tick:number}){
 const clients=state.members.filter((m:Row)=>m.role==='client'&&m.active),[matterId,setMatterId]=useState(''),[grants,setGrants]=useState<Row[]>([]);
 useEffect(()=>{if(!matterId){setGrants([]);return;}let live=true;api('/matters/'+matterId+'/portal').then(r=>{if(live)setGrants(r.grants);}).catch(e=>run(async()=>{throw e;}));return()=>{live=false;};},[matterId,tick]);
 return <section className="panel" aria-label="Client portal sharing"><h2>Client portal sharing</h2><p>A client sees only the matters you share here, and what a lawyer shares with them. Sharing and withdrawing are recorded in the action audit.</p>
  {!clients.length?<p>Save a firm member with the client role to share a matter.</p>:<><label>Matter to share<select aria-label="Matter to share" value={matterId} onChange={e=>setMatterId(e.target.value)}><option value="">Choose a matter</option>{state.matters.map((m:Row)=><option key={m.id} value={m.id}>{m.matter_number} · {m.title}</option>)}</select></label>
   {matterId&&<><Form label="Share with client" submit={d=>run(()=>api('/matters/'+matterId+'/portal',{email:d.email,reason:d.reason,kind:d.kind,delegateOf:d.kind==='delegate'?d.delegateOf:undefined}),'Matter shared with the client')}><Field label="Client" name="email"><select name="email" aria-label="Client" required defaultValue=""><option value="">Choose a client</option>{clients.map((c:Row)=><option key={c.email} value={c.email}>{c.name} · {c.email}</option>)}</select></Field><Field label="Kind of access" name="kind"><select name="kind" aria-label="Kind of access" defaultValue="client"><option value="client">Client</option><option value="co_client">Co-client</option><option value="payer">Payer (invoices only)</option><option value="delegate">Delegate for a client</option></select></Field><Field label="Delegate acts for (client email)" name="delegateOf" type="email" required={false}/><Field label="Reason for sharing" name="reason"/></Form>
   {grants.map(g=><article className="record" key={g.id}><strong>{g.email}</strong><span> · {kindNames[g.kind]??g.kind}</span><p>{g.revokedAt?'withdrawn '+g.revokedAt.slice(0,10)+' · '+g.revokeReason:'shared '+g.grantedAt.slice(0,10)+' · '+g.reason}</p>{!g.revokedAt&&<PortalPreview matterId={matterId} email={g.email} kind={g.kind}/>}{!g.revokedAt&&<Form label="Withdraw" danger submit={d=>run(()=>api('/portal-grants/'+g.id+'/revoke',{reason:d.reason}),'Portal sharing withdrawn')}><Field label={'Reason for withdrawing from '+g.email} name="reason"/></Form>}</article>)}</>}</>}
 </section>;
}
