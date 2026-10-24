import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';
// MATTER-005: the selected matter's chronology. Entries come from the server already filtered to what this person may read.
const kinds:Record<string,string>={note:'Note',call:'Call',commitment:'Client commitment',email:'Email',document:'Document',task:'Task',deadline:'Deadline',appointment:'Appointment',bill:'Bill',payment:'Payment'};
export function MatterTimeline({matterId,state,run,tick,go}:{matterId:string;state:Row;run:Run;tick:number;go?:(tab:string)=>void}){
 const [data,setData]=useState<Row|null>(null),[kind,setKind]=useState(''),[q,setQ]=useState(''),[mine,setMine]=useState(false),[visibility,setVisibility]=useState('team'),[mentions,setMentions]=useState<string[]>([]),[added,setAdded]=useState(0);
 const staff=['owner','lawyer','assistant'].includes(state.actor.role),counsel=['owner','lawyer'].includes(state.actor.role);
 useEffect(()=>{if(!matterId){setData(null);return;}let live=true;const query=new URLSearchParams({...(kind?{kind}:{}),...(q.trim()?{q:q.trim()}:{}),...(mine?{mentions:'me'}:{})});api('/matters/'+matterId+'/timeline?'+query).then(r=>{if(live)setData(r);}).catch(e=>{if(live)void run(async()=>{throw e;});});return()=>{live=false;};},[matterId,kind,q,mine,tick]);
 if(!matterId)return null;
 const people=state.members.filter((m:Row)=>m.active&&['lawyer','assistant'].includes(m.role));
 return <section className="panel timeline" aria-label="Matter timeline"><h2>Matter timeline</h2>
  <p>Notes, calls, filed email, documents, tasks, deadlines, bills and payments you may see, newest first. A private note is visible to you alone.</p>
  <div className="filters"><label>Show<select value={kind} onChange={e=>setKind(e.target.value)}><option value="">Everything</option>{Object.entries(kinds).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Find in timeline<input type="search" value={q} onChange={e=>setQ(e.target.value)}/></label><label><input type="checkbox" checked={mine} onChange={e=>setMine(e.target.checked)}/>Mentions of me</label></div>
  {!data?<p aria-busy="true">Opening the timeline…</p>:!data.entries.length?<p>No entries match.</p>:<ol className="entries">{data.entries.map((e:Row)=><li key={e.id} className="record"><strong>{kinds[e.kind]} · {e.title}</strong><p>{new Date(e.at).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'})}{e.by?' · '+e.by:''}{e.visibility!=='team'?' · '+e.visibility:''}</p>{e.summary&&<p>{e.summary}</p>}{e.correction&&<p>Corrects: {e.correction.title}. Original entry retained.</p>}{e.mentions.length>0&&<p>Mentions: {e.mentions.join(', ')}</p>}{go&&<button type="button" className="quiet" onClick={()=>go(e.source.tab)}>Open {e.source.tab} for {e.title}</button>}</li>)}</ol>}
  {staff&&<details><summary>Add a note, call or client commitment</summary><Form key={added} label="Add entry" submit={d=>run(async()=>{await api('/matters/'+matterId+'/notes',{kind:d.kind,title:d.title,body:d.body,visibility:d.visibility,clientVisible:d.clientVisible==='on',mentions:visibility==='team'?mentions:[],corrects:d.corrects||undefined,occurredAt:d.occurredAt?new Date(String(d.occurredAt)).toISOString():undefined});setMentions([]);setVisibility('team');setAdded(n=>n+1);},'Entry added')}>
   <Field label="Entry type" name="kind"><select name="kind"><option value="note">Note</option><option value="call">Call</option><option value="commitment">Client commitment</option></select></Field>
   <Field label="Correct an earlier entry (optional)" name="corrects"><select name="corrects" defaultValue=""><option value="">New entry</option>{data?.entries.filter((e:Row)=>['note','call','commitment'].includes(e.kind)).map((e:Row)=><option key={e.id} value={e.source.id}>{e.title}</option>)}</select></Field>
   <Field label="Title" name="title"/><Field label="Text" name="body"><textarea name="body" required maxLength={20000}/></Field>
   <Field label="When it happened" name="occurredAt" type="datetime-local" required={false}/>
   <Field label="Who can read it" name="visibility"><select name="visibility" value={visibility} onChange={e=>setVisibility(e.target.value)}><option value="team">Everyone who sees this matter</option><option value="private">Only me (private)</option></select></Field>
   {counsel&&visibility==='team'&&<label><input type="checkbox" name="clientVisible"/>Share with the client</label>}
   {visibility==='team'&&<fieldset><legend>Mention people who can see this matter</legend>{people.map((p:Row)=><label key={p.email}><input type="checkbox" checked={mentions.includes(p.email)} onChange={()=>setMentions(m=>m.includes(p.email)?m.filter(x=>x!==p.email):[...m,p.email])}/>{p.name} ({p.email})</label>)}</fieldset>}
  </Form></details>}
 </section>;
}
