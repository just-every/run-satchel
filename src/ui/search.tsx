import {useEffect,useId,useRef,useState} from 'react';
import {api,type Row} from './common';
// MATTER-009: one box for the whole firm. The server applies matter access, custom roles and ethical walls before any
// title, count or snippet is returned; this screen only shows what it received. "/" focuses the box, the arrow keys move
// through the grouped results, Enter opens the record's screen and Escape closes the list.
export function FirmSearch({open,matters,tick}:{open:(item:Row)=>void;matters:Row[];tick:number}){
 const [query,setQuery]=useState(''),[result,setResult]=useState<Row|null>(null),[error,setError]=useState(''),[active,setActive]=useState(-1),[shown,setShown]=useState(false);
 const [filters,setFilters]=useState({matterId:'',from:'',to:'',documentType:''}),[refresh,setRefresh]=useState(0);
 const clear=()=>{generation.current++;setResult(null);setActive(-1);setShown(false);};
 const input=useRef<HTMLInputElement>(null),generation=useRef(0),list=useId(),flat:Row[]=result?result.groups.flatMap((g:Row)=>g.items.map((item:Row)=>({...item,type:g.type}))):[];
 useEffect(()=>{
  const focus=(e:KeyboardEvent)=>{const t=e.target as HTMLElement;if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)&&!t.isContentEditable){e.preventDefault();input.current?.focus();}};
  window.addEventListener('keydown',focus);return()=>window.removeEventListener('keydown',focus);
 },[]);
 useEffect(()=>{
  const term=query.trim(),mine=++generation.current;setResult(null);setActive(-1);
  if(term.length<2){setResult(null);setError('');setActive(-1);return;}
  let timer:ReturnType<typeof setTimeout>;
  // Recheck current authority while the person keeps the result list open.
  // Sequential requests avoid an older snapshot overwriting a revocation.
  const search=async()=>{
   if(mine!==generation.current||document.hidden||document.activeElement!==input.current)return;
   try{
    const r=await api('/search?q='+encodeURIComponent(term)+'&'+new URLSearchParams(filters));
    if(mine!==generation.current)return;
    setResult(r);setError('');setActive(a=>r.total?Math.max(0,Math.min(a,r.total-1)):-1);setShown(true);
   }catch(e){
    if(mine!==generation.current)return;
    setResult(null);setActive(-1);setError(e instanceof Error?e.message:String(e));setShown(true);
   }
   if(mine===generation.current)timer=setTimeout(search,1000);
  };
  timer=setTimeout(search,200);
  return()=>{clearTimeout(timer);if(mine===generation.current)generation.current++;};
 },[query,filters,refresh,tick]);
 useEffect(()=>{const hide=()=>{if(document.hidden)clear();},blur=()=>clear();document.addEventListener('visibilitychange',hide);window.addEventListener('blur',blur);return()=>{document.removeEventListener('visibilitychange',hide);window.removeEventListener('blur',blur);};},[]);
 const choose=(item:Row)=>{clear();open(item);};
 const move=(step:number)=>{if(flat.length)setActive(a=>(a+step+flat.length)%flat.length);};
 const onKey=(e:React.KeyboardEvent)=>{
  if(e.key==='ArrowDown'){e.preventDefault();setShown(true);move(1);}
  else if(e.key==='ArrowUp'){e.preventDefault();move(-1);}
  else if(e.key==='Enter'&&shown&&flat[active]){e.preventDefault();choose(flat[active]);}
  else if(e.key==='Escape'){if(shown)clear();else setQuery('');}
 };
 let index=-1;
 useEffect(()=>{document.getElementById(list+'-'+active)?.scrollIntoView({block:'nearest'});},[active,list]);
 return <div className="firm-search" role="search" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))clear();}}>
  <label htmlFor={list+'-input'}>Search the firm</label>
  <input id={list+'-input'} ref={input} type="search" value={query} autoComplete="off" placeholder="Name, matter or case number, note, task, invoice" role="combobox" aria-expanded={shown&&Boolean(result||error)} aria-controls={list} aria-activedescendant={active>=0?list+'-'+active:undefined} aria-autocomplete="list" maxLength={200} onChange={e=>setQuery(e.target.value)} onFocus={()=>{setRefresh(n=>n+1);}} onKeyDown={onKey}/>
  <span className="hint" aria-hidden="true">Press / to search</span>
  <details><summary>Document filters</summary><div className="search-filters">
   <label>Search matter<select aria-label="Search matter" value={filters.matterId} onChange={e=>setFilters({...filters,matterId:e.target.value})}><option value="">All permitted matters</option>{matters.map(m=><option key={m.id} value={m.id}>{m.matter_number} · {m.title}</option>)}</select></label>
   <label>Original date from<input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/></label>
   <label>Original date to<input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/></label>
   <label>Document type<input value={filters.documentType} onChange={e=>setFilters({...filters,documentType:e.target.value})}/></label>
   <p>Filters narrow results to documents. Dates use the current original’s upload date or the email review date.</p>
  </div></details>
  {shown&&(result||error)&&<div className="results" id={list}>
   {error&&<p role="alert">{error}</p>}
   {result&&<p role="status">{result.total?`${result.total} result${result.total===1?'':'s'} in ${result.groups.length} group${result.groups.length===1?'':'s'}`:'No matching records you may see.'}</p>}
   {result&&result.documentIndex?.length>0&&<details><summary>Document text coverage</summary>{result.documentIndex.map((d:Row)=><p key={d.documentId}>{d.title} · version {d.version} · {d.status==='ready'?'Current text index':d.status==='partial'?'Partial text index':'Text unavailable'} · indexed {d.indexedAt}<br/>{d.detail}</p>)}</details>}
   {result&&<ul role="listbox" aria-label="Search results">{result.groups.map((g:Row)=><li role="presentation" key={g.type}><h2 id={list+'-g-'+g.type}>{g.type} <span>{g.count}</span></h2><ul role="group" aria-labelledby={list+'-g-'+g.type}>{g.items.map((item:Row)=>{index++;const mine=index;return <li role="option" id={list+'-'+mine} key={g.type+item.id} aria-selected={mine===active} className={mine===active?'active':undefined} onMouseDown={e=>e.preventDefault()} onClick={()=>choose({...item,type:g.type})}><strong>{item.title}</strong><small>{item.snippet}</small>{item.sourceCitation&&<small>Review {item.sourceCitation.revision} · SHA-256 {item.sourceCitation.sha256}</small>}{item.citation&&<small>Version {item.citation.version} · {item.citation.unit??'page'} {item.citation.page} · SHA-256 {item.citation.sha256}<br/>{item.freshness.status==='partial'?'Partial text index':'Current text index'} · {item.freshness.indexedAt}</small>}</li>;})}</ul></li>)}</ul>}
  </div>}
 </div>;
}
