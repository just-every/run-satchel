import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';
const labels:Record<string,string>={rates:'Billing rates',bank:'Operating and trust bank accounts',reports:'Reports',contacts:'Contacts',documents:'Documents',billing:'Billing',settings:'Settings'};
const levelLabels:Record<string,string>={none:'None',own:'Own only',all:'All',balances:'Balances only',full:'Full transactions',firm:'Firm-wide',read:'Read only',write:'Read and change'};
const levelText=(area:string,level:string)=>area==='reports'&&level==='own'?'Own matters':area==='rates'&&level==='own'?'Own rates':levelLabels[level];
function Levels({areas,values}:{areas:Row;values?:Row}){return <>{Object.keys(labels).map(area=><Field key={area} label={labels[area]} name={area}><select name={area} aria-label={labels[area]} required defaultValue={values?.[area]??''}><option value="">Choose a level</option>{areas[area].map((l:string)=><option key={l} value={l}>{levelText(area,l)}</option>)}</select></Field>)}</>;}
// The principal defines per-area ceilings; a role narrows what a member's built-in role allows and never grants legal approval or trust authority.
export function CustomRoles({state,run,tick}:{state:Row;run:Run;tick:number}){
 const [view,setView]=useState<Row|null>(null);
 useEffect(()=>{let live=true;api('/roles').then(r=>{if(live)setView(r);}).catch(e=>run(async()=>{throw e;}));return()=>{live=false;};},[tick]);
 const assignable=state.members.filter((m:Row)=>m.active&&m.role!=='client');
 return <section className="panel" aria-label="Custom roles"><h2>Custom roles</h2><p>A custom role limits what a member may see or change in each area, on top of their firm role. It takes effect on their next request, is recorded in the action audit, and can never grant legal approval or trust authorization.</p>
  {!view?<p>Opening custom roles…</p>:<>
   {view.roles.map((r:Row)=><article className="record" key={r.id}><strong>{r.name}</strong><p>{Object.keys(labels).map(a=>`${labels[a]}: ${levelText(a,r.permissions[a])}`).join(' · ')}</p><p>{r.members.length?'Assigned to '+r.members.join(', '):'Not assigned'}</p>
    <details><summary>Edit {r.name}</summary><Form label="Save role changes" submit={d=>run(()=>api('/roles',{id:r.id,revision:r.revision,name:d.name,reason:d.reason,permissions:Object.fromEntries(Object.keys(labels).map(a=>[a,d[a]]))}),'Custom role saved')}><Field label="Role name" name="name" value={r.name}/><Levels areas={view.areas} values={r.permissions}/><Field label="Reason for this change" name="reason"/></Form></details></article>)}
   <details><summary>Define a custom role</summary><Form label="Create custom role" submit={d=>run(()=>api('/roles',{name:d.name,reason:d.reason,permissions:Object.fromEntries(Object.keys(labels).map(a=>[a,d[a]]))}),'Custom role saved')}><Field label="New role name" name="name"/><Levels areas={view.areas}/><Field label="Reason for this role" name="reason"/></Form></details>
   {Boolean(view.roles.length)&&<Form label="Assign role" submit={d=>{const m=assignable.find((x:Row)=>x.email===d.email)!;return run(()=>api('/team',{email:m.email,name:m.name,role:m.role,active:Boolean(m.active),customRoleId:d.customRoleId||null}),'Custom role assigned');}}><Field label="Member to assign" name="email"><select name="email" aria-label="Member to assign" required defaultValue=""><option value="">Choose a member</option>{assignable.map((m:Row)=><option key={m.email} value={m.email}>{m.name} · {m.role}{m.customRoleId?' · '+view.roles.find((r:Row)=>r.id===m.customRoleId)?.name:''}</option>)}</select></Field><Field label="Custom role" name="customRoleId" required={false}><select name="customRoleId" aria-label="Custom role" defaultValue=""><option value="">No custom role</option>{view.roles.map((r:Row)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></Field></Form>}
  </>}
 </section>;
}
