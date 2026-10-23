import {useEffect,useId,useRef,useState} from 'react';
import {api,type Row} from './common';
// MATTER-009: one box for the whole firm. The server applies matter access, custom roles and ethical walls before any
// title, count or snippet is returned; this screen only shows what it received. "/" focuses the box, the arrow keys move
// through the grouped results, Enter opens the record's screen and Escape closes the list.
export function FirmSearch({open}:{open:(item:Row)=>void}){
 const [query,setQuery]=useState(''),[result,setResult]=useState<Row|null>(null),[error,setError]=useState(''),[active,setActive]=useState(-1),[shown,setShown]=useState(false);
 const input=useRef<HTMLInputElement>(null),generation=useRef(0),list=useId(),flat:Row[]=result?result.groups.flatMap((g:Row)=>g.items.map((item:Row)=>({...item,type:g.type}))):[];
 useEffect(()=>{
  const focus=(e:KeyboardEvent)=>{const t=e.target as HTMLElement;if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)&&!t.isContentEditable){e.preventDefault();input.current?.focus();}};
  window.addEventListener('keydown',focus);return()=>window.removeEventListener('keydown',focus);
 },[]);
 useEffect(()=>{
  const term=query.trim(),mine=++generation.current;
  if(term.length<2){setResult(null);setError('');setActive(-1);return;}
  const timer=setTimeout(()=>{api('/search?q='+encodeURIComponent(term)).then(r=>{if(mine===generation.current){setResult(r);setError('');setActive(r.total?0:-1);setShown(true);}}).catch(e=>{if(mine===generation.current){setResult(null);setError(e.message);setShown(true);}});},200);
  return()=>clearTimeout(timer);
 },[query]);
 const choose=(item:Row)=>{setShown(false);setActive(-1);open(item);};
 const move=(step:number)=>{if(flat.length)setActive(a=>(a+step+flat.length)%flat.length);};
 const onKey=(e:React.KeyboardEvent)=>{
  if(e.key==='ArrowDown'){e.preventDefault();setShown(true);move(1);}
  else if(e.key==='ArrowUp'){e.preventDefault();move(-1);}
  else if(e.key==='Enter'&&shown&&flat[active]){e.preventDefault();choose(flat[active]);}
  else if(e.key==='Escape'){if(shown)setShown(false);else setQuery('');}
 };
 let index=-1;
 useEffect(()=>{document.getElementById(list+'-'+active)?.scrollIntoView({block:'nearest'});},[active,list]);
 return <div className="firm-search" role="search" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setShown(false);}}>
  <label htmlFor={list+'-input'}>Search the firm</label>
  <input id={list+'-input'} ref={input} type="search" value={query} autoComplete="off" placeholder="Name, matter or case number, note, task, invoice" role="combobox" aria-expanded={shown&&Boolean(result||error)} aria-controls={list} aria-activedescendant={active>=0?list+'-'+active:undefined} aria-autocomplete="list" maxLength={200} onChange={e=>setQuery(e.target.value)} onFocus={()=>{if(result)setShown(true);}} onKeyDown={onKey}/>
  <span className="hint" aria-hidden="true">Press / to search</span>
  {shown&&(result||error)&&<div className="results" id={list}>
   {error&&<p role="alert">{error}</p>}
   {result&&<p role="status">{result.total?`${result.total} result${result.total===1?'':'s'} in ${result.groups.length} group${result.groups.length===1?'':'s'}`:'No matching records you may see.'}</p>}
   {result&&<ul role="listbox" aria-label="Search results">{result.groups.map((g:Row)=><li role="presentation" key={g.type}><h2 id={list+'-g-'+g.type}>{g.type} <span>{g.count}</span></h2><ul role="group" aria-labelledby={list+'-g-'+g.type}>{g.items.map((item:Row)=>{index++;const mine=index;return <li role="option" id={list+'-'+mine} key={g.type+item.id} aria-selected={mine===active} className={mine===active?'active':undefined} onMouseDown={e=>e.preventDefault()} onClick={()=>choose({...item,type:g.type})}><strong>{item.title}</strong><small>{item.snippet}</small></li>;})}</ul></li>)}</ul>}
  </div>}
 </div>;
}
