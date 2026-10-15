import { useEffect,useState } from 'react';
import { api, type Row,type Run } from './common';
import { Matters } from './matters';
import { Billing } from './billing';
import { Documents } from './documents';
import { Deadlines } from './deadlines';
import { MoveIn } from './move-in';
import { Team } from './team';
import { Proposals } from './proposals';
const tabs=['Matters','Time & bills','Documents','Deadlines','Preparations','Move in','Team & safety'];
export function Workspace(){
 const [state,setState]=useState<Row>(),[tab,setTab]=useState('Matters'),[selected,setSelected]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[tick,setTick]=useState(0);
 const reload=async()=>{const data=await api('/state');setState(data);setSelected(previous=>data.matters.some((m:Row)=>m.id===previous)?previous:(data.matters[0]?.id??''));setTick(t=>t+1);};
 useEffect(()=>{reload().catch(e=>setError(e.message));},[]);
 const run:Run=async(job,message='Saved')=>{setError('');setNotice('');setBusy(true);try{await job();await reload();setNotice(message);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const actor=state?.actor;
 return <div className="workspace" aria-busy={busy}><header><a className="brand" href="/app">Satchel</a><span>Practice workspace</span><a href="/signin">Sign in</a></header><div className="layout"><nav aria-label="Workspace">{tabs.map(t=><button className={t===tab?'selected':''} key={t} onClick={()=>{setTab(t);setNotice('');setError('');}}>{t}</button>)}<p className="boundary">USD bill preparation.<br/>Trust funds stay in your external ledger.</p></nav><main><div className="page-heading"><div><p className="eyebrow">YOUR FIRM</p><h1>{tab}</h1></div>{actor&&<span className="badge">{actor.name} · {actor.role}</span>}</div>{error&&<p className="error" role="alert">{error}{error.includes('Sign in')&&<> <a href="/signin">Open sign in</a></>}</p>}{notice&&<p className="notice" role="status">{notice}</p>}{!state?<p>Opening your workspace…</p>:<fieldset disabled={busy} className="content">{!['Move in','Team & safety','Preparations'].includes(tab)&&<label className="matter-picker">Current matter<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose a matter</option>{state.matters.map((m:Row)=><option key={m.id} value={m.id}>{m.title}</option>)}</select></label>}{tab==='Matters'&&<Matters state={state} selected={selected} choose={setSelected} run={run} tick={tick}/>} {tab==='Time & bills'&&<Billing matterId={selected} actor={actor} run={run} tick={tick}/>} {tab==='Documents'&&<Documents matterId={selected} run={run} tick={tick}/>} {tab==='Deadlines'&&<Deadlines matterId={selected} actor={actor} run={run} tick={tick}/>} {tab==='Preparations'&&<Proposals proposals={state.proposals} run={run}/>} {tab==='Move in'&&<MoveIn actor={actor} run={run} tick={tick}/>} {tab==='Team & safety'&&<Team state={state} run={run} tick={tick}/>}</fieldset>}</main></div></div>;
}
