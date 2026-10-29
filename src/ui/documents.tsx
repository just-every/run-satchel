import {DocumentChronologies} from './document-chronologies';
import {useEffect,useRef,useState} from 'react';
import {api,Empty,Field,Form,type Row,type Run} from './common';
import {MatterRetention} from './retention';
import {Assembly} from './assembly';
import {DocumentSets} from './document-sets';
import {DocumentProductions} from './document-productions';
import {DocumentPreview,DocumentVersions} from './document-preview';
export function Documents({matterId,actor,run,tick,citation,closeCitation}:{matterId:string;actor:Row;run:Run;tick:number;citation?:Row;closeCitation:()=>void}){
 const [cited,setCited]=useState<Row>(),[citationError,setCitationError]=useState(''),citationPanel=useRef<HTMLElement>(null);
 useEffect(()=>{let active=true;setCited(undefined);setCitationError('');if(citation)api('/documents/'+citation.documentId+'/text?'+new URLSearchParams({version:String(citation.version),sha256:citation.sha256,page:String(citation.page),format:'json'})).then(r=>{if(active)setCited(r);}).catch(e=>{if(active)setCitationError(e.message);});return()=>{active=false;};},[citation]);
 useEffect(()=>{if(cited)citationPanel.current?.scrollIntoView({block:'start'});},[cited]);
 useEffect(()=>{if(!citation)return;const clear=()=>closeCitation();window.addEventListener('blur',clear);return()=>window.removeEventListener('blur',clear);},[citation,closeCitation]);
 const [conflictNotice,setConflictNotice]=useState('');
 const [items,setItems]=useState<Row[]>([]),[files,setFiles]=useState<File[]>([]),[versionFor,setVersionFor]=useState<Row>();
 useEffect(()=>{setItems([]);setFiles([]);setVersionFor(undefined);},[matterId]);
 useEffect(()=>{let active=true;if(matterId)api('/matters/'+matterId+'/documents').then(s=>{if(active)setItems(s);}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;};},[matterId,tick]);
 if(!matterId)return <Empty>Choose or open a matter first.</Empty>;
 return <>{citation&&<section ref={citationPanel} className="panel" aria-label="Search citation"><h2>Search citation</h2><button className="quiet" onClick={closeCitation}>Close search citation</button>{citationError&&<p role="alert">{citationError}</p>}{!cited&&!citationError&&<p role="status">Opening exact source page…</p>}{cited&&<><p>{cited.title} · version {cited.version} · {cited.unit??'page'} {cited.page}</p>{cited.original.declaredMime==='message/rfc822'||/\.eml$/i.test(cited.title)?<a href={cited.sourceUrl}>Download exact original message</a>:<DocumentPreview documentId={cited.documentId} version={cited.original} sourceUrl={cited.sourceUrl} initialPage={cited.page}/>} <h3>Indexed page text</h3><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{cited.body}</pre></>}</section>}<Assembly matterId={matterId} actor={actor} run={run} tick={tick}/><DocumentChronologies matterId={matterId} actor={actor} run={run} tick={tick}/><DocumentProductions matterId={matterId} actor={actor} documents={items} run={run} tick={tick}/><div className="grid"><DocumentSets matterId={matterId} actor={actor} documents={items} run={run} tick={tick}>{(visible,selected,toggle)=><section className="panel document-originals"><h2>Originals & versions</h2>{conflictNotice&&<p role="alert">{conflictNotice}</p>}{!visible.length&&<Empty>{items.length?'No documents in this view.':'No documents uploaded yet.'}</Empty>}{visible.map(d=><article className="record" key={d.id}>
  {!d.erasedAt&&(actor.role==='owner'||d.createdBy===actor.email)&&<label><input type="checkbox" checked={selected.includes(d.id)} onChange={()=>toggle(d.id)}/>Select {d.title}</label>}
  <strong>{d.title}</strong><small>Matter {d.matterNumber}</small><p><span className="badge">{d.visibility}</span> · {d.erasedAt?'Bytes erased':'Version '+d.currentVersion}</p>
  {(d.documentType||d.tags.length>0)&&<p>{[d.documentType,...d.tags].filter(Boolean).join(' · ')}</p>}
  {d.duplicates.length>0&&<p className="notice">Duplicate content: {d.duplicates.map((v:Row)=>v.title).join(', ')}. Each original and its version history are retained.</p>}
  {d.versions.map((v:Row)=><p key={v.version}>{d.erasedAt?<span>Version {v.version} · {v.size} bytes</span>:<a href={`/api/satchel/documents/${d.id}/file?version=${v.version}`}>Download version {v.version} · {v.size} bytes</a>}<br/><small>{v.createdBy} · {v.createdAt.slice(0,10)}</small></p>)}{!d.erasedAt&&<><button className="quiet" onClick={()=>setVersionFor(d)}>Append version</button><DocumentVersions key={d.revision} document={d} run={run} tick={tick}/></>}
 </article>)}</section>}</DocumentSets>
 <section className="panel"><h2>{versionFor?'Append original':'Add a document'}</h2><p>Original bytes stay in your firm’s database. Maximum 1 MiB per file. Private documents are visible only to their uploader and the principal.</p>{versionFor&&<p>New version of <strong>{versionFor.title}</strong> <button className="quiet" onClick={()=>setVersionFor(undefined)}>Cancel</button></p>}
 <Form label="Save original" submit={d=>run(async()=>{
  if(!files.length)throw new Error('Choose a file first');if(files.length>100)throw new Error('Choose at most 100 files');if(files.some(f=>f.size>1048576))throw new Error('Choose files no larger than 1 MiB');if(versionFor&&files.length!==1)throw new Error('Choose one file to append a version');
  let conflicted=false;for(const file of files){let raw='';for(const byte of new Uint8Array(await file.arrayBuffer()))raw+=String.fromCharCode(byte);const saved=await api('/matters/'+matterId+'/documents',{name:file.name,mime:file.type||'application/octet-stream',contentBase64:btoa(raw),visibility:versionFor?.visibility??d.visibility,documentId:versionFor?.id,revision:versionFor?.revision});if(saved.saveOutcome==='conflict')conflicted=true;}
  setFiles([]);setVersionFor(undefined);if(conflicted)setConflictNotice('Conflicting save retained separately. Open Preview and compare versions to review the retained copy.');else setConflictNotice('');
 },'Original saved; version history retained')}><label>Original file<input type="file" required multiple={!versionFor} onChange={e=>setFiles(Array.from(e.target.files??[]))}/></label>{!versionFor&&<Field label="Who can read it" name="visibility"><select name="visibility"><option value="matter">Everyone assigned to this matter</option><option value="private">Uploader and principal only</option></select></Field>}</Form></section>
 {actor.role!=='assistant'&&<MatterRetention matterId={matterId} documents={items} run={run} tick={tick}/>}</div></>;
}
