import {useEffect,useState} from 'react';
import {api,type Row,type Run} from './common';
export function SavedConflicts({run,tick,resume}:{run:Run;tick:number;resume:(search:Row,review:Row|null)=>void}){
 const [searches,setSearches]=useState<Row[]>([]);
 useEffect(()=>{let active=true;api('/conflicts').then(v=>{if(active)setSearches(v.searches);}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;};},[tick]);
 return <details><summary>Continue a recorded conflict review</summary>{searches.map(s=><article className="record" key={s.id}><strong>{s.client} · {s.adverse}</strong><p>{s.at}</p><button type="button" className="quiet" aria-label={'Continue conflict search '+s.id} onClick={()=>run(async()=>{const r=await api('/conflicts/'+s.id+'/review');resume(r.search,r.review);},'Recorded conflict review opened')}>Continue review</button></article>)}</details>;
}
