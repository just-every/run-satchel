import {useEffect,useState} from 'react';
import {api,Empty,Field,Form,type Row,type Run} from './common';
import {MatterRetention} from './retention';
import {Assembly} from './assembly';
import {DocumentSets} from './document-sets';
export function Documents({matterId,actor,run,tick}:{matterId:string;actor:Row;run:Run;tick:number}){
 const [items,setItems]=useState<Row[]>([]),[files,setFiles]=useState<File[]>([]),[versionFor,setVersionFor]=useState<Row>();
 useEffect(()=>{setItems([]);setFiles([]);setVersionFor(undefined);},[matterId]);
 useEffect(()=>{let active=true;if(matterId)api('/matters/'+matterId+'/documents').then(s=>{if(active)setItems(s);}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;};},[matterId,tick]);
 if(!matterId)return <Empty>Choose or open a matter first.</Empty>;
 return <><Assembly matterId={matterId} actor={actor} run={run} tick={tick}/><div className="grid"><DocumentSets matterId={matterId} actor={actor} documents={items} run={run} tick={tick}>{(visible,selected,toggle)=><section className="panel"><h2>Originals & versions</h2>{!visible.length&&<Empty>{items.length?'No documents in this view.':'No documents uploaded yet.'}</Empty>}{visible.map(d=><article className="record" key={d.id}>
  {!d.erasedAt&&(actor.role==='owner'||d.createdBy===actor.email)&&<label><input type="checkbox" checked={selected.includes(d.id)} onChange={()=>toggle(d.id)}/>Select {d.title}</label>}
  <strong>{d.title}</strong><small>Matter {d.matterNumber}</small><p><span className="badge">{d.visibility}</span> · {d.erasedAt?'Bytes erased':'Version '+d.currentVersion}</p>
  {(d.documentType||d.tags.length>0)&&<p>{[d.documentType,...d.tags].filter(Boolean).join(' · ')}</p>}
  {d.duplicates.length>0&&<p className="notice">Duplicate content: {d.duplicates.map((v:Row)=>v.title).join(', ')}. Each original and its version history are retained.</p>}
  {d.versions.map((v:Row)=><p key={v.version}>{d.erasedAt?<span>Version {v.version} · {v.size} bytes</span>:<a href={`/api/satchel/documents/${d.id}/file?version=${v.version}`}>Download version {v.version} · {v.size} bytes</a>}<br/><small>{v.createdBy} · {v.createdAt.slice(0,10)}</small></p>)}{!d.erasedAt&&<button className="quiet" onClick={()=>setVersionFor(d)}>Append version</button>}
 </article>)}</section>}</DocumentSets>
 <section className="panel"><h2>{versionFor?'Append original':'Add a document'}</h2><p>Original bytes stay in your firm’s database. Maximum 1 MiB per file. Private documents are visible only to their uploader and the principal.</p>{versionFor&&<p>New version of <strong>{versionFor.title}</strong> <button className="quiet" onClick={()=>setVersionFor(undefined)}>Cancel</button></p>}
 <Form label="Save original" submit={d=>run(async()=>{
  if(!files.length)throw new Error('Choose a file first');if(files.length>100)throw new Error('Choose at most 100 files');if(files.some(f=>f.size>1048576))throw new Error('Choose files no larger than 1 MiB');if(versionFor&&files.length!==1)throw new Error('Choose one file to append a version');
  for(const file of files){let raw='';for(const byte of new Uint8Array(await file.arrayBuffer()))raw+=String.fromCharCode(byte);await api('/matters/'+matterId+'/documents',{name:file.name,mime:file.type||'application/octet-stream',contentBase64:btoa(raw),visibility:versionFor?.visibility??d.visibility,documentId:versionFor?.id,revision:versionFor?.revision});}
  setFiles([]);setVersionFor(undefined);
 },'Original saved; version history retained')}><label>Original file<input type="file" required multiple={!versionFor} onChange={e=>setFiles(Array.from(e.target.files??[]))}/></label>{!versionFor&&<Field label="Who can read it" name="visibility"><select name="visibility"><option value="matter">Everyone assigned to this matter</option><option value="private">Uploader and principal only</option></select></Field>}</Form></section>
 {actor.role!=='assistant'&&<MatterRetention matterId={matterId} documents={items} run={run} tick={tick}/>}</div></>;
}
