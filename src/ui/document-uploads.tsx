import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {useEffect,useRef,useState} from 'react';
import {api,type Row,type Run} from './common';
const mib=(bytes:number)=>(bytes/1048576).toLocaleString(undefined,{maximumFractionDigits:1})+' MiB';
const sha=async(bytes:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
// Read bounded slices so a large original never occupies one browser buffer.
const fileSha=async(file:File)=>{const hash=sha256.create();for(let offset=0;offset<file.size;offset+=8*1024*1024)hash.update(new Uint8Array(await file.slice(offset,offset+8*1024*1024).arrayBuffer()));return bytesToHex(hash.digest());};
const pathOf=(file:File)=>file.webkitRelativePath||file.name;
export function DocumentUploads({matterId,run,tick,target,clearTarget}:{matterId:string;run:Run;tick:number;target?:Row;clearTarget:()=>void}){
 const [state,setState]=useState<Row>(),[files,setFiles]=useState<File[]>([]),[visibility,setVisibility]=useState('matter'),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[folder,setFolder]=useState(false),[error,setError]=useState('');
 const stop=useRef(false),picker=useRef<HTMLInputElement>(null),requestId=useRef<string|undefined>(undefined);
 const refresh=async()=>{const result=await api('/matters/'+matterId+'/document-uploads');setState(result);return result;};
 useEffect(()=>{let active=true;setState(undefined);setFiles([]);requestId.current=undefined;api('/matters/'+matterId+'/document-uploads').then(r=>{if(active)setState(r);}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;stop.current=true;};},[matterId,tick]);
 useEffect(()=>{if(folder&&!target)picker.current?.setAttribute('webkitdirectory','');else picker.current?.removeAttribute('webkitdirectory');},[folder,target]);
 useEffect(()=>{setFiles([]);requestId.current=undefined;},[target]);
 const limits=state?.limits;
 const transfer=async(u:Row)=>{
  const file=files.find(f=>pathOf(f)===u.path);if(!file)throw new Error('Choose the original file or folder again to resume '+u.path);
  if(file.size!==u.size||await fileSha(file)!==u.sha256)throw new Error('The selected file differs from the reserved original: '+u.path);
  for(let number=1;number<=Math.ceil(u.size/limits.partBytes);number++){
   if(stop.current){setProgress('Paused. Choose the same originals to resume after returning.');return;}
   if(u.parts.some((p:Row)=>p.number===number))continue;
   const bytes=await file.slice((number-1)*limits.partBytes,Math.min(number*limits.partBytes,file.size)).arrayBuffer();
   setProgress(u.path+' · sending part '+number+' of '+Math.ceil(u.size/limits.partBytes));
   const response=await fetch('/api/satchel/document-uploads/'+u.id+'/parts/'+number,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/octet-stream','x-part-sha256':await sha(bytes)},body:bytes});
   const result=await response.json() as Row;if(!response.ok)throw new Error(result.error);await refresh();
  }
  if(stop.current){setProgress('Paused after the last part. Resume to verify the original.');return;}
  setProgress('Verifying '+u.path+' on the server…');await api('/document-uploads/'+u.id+'/complete',{});await refresh();setProgress(u.path+' retained in quarantine.');
 };
 const perform=(job:()=>Promise<void>)=>{stop.current=false;setBusy(true);setError('');void (async()=>{try{await job();await run(async()=>{},'Upload manifest updated');}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{setBusy(false);try{await refresh();}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}}})();};
 return <section className="panel" aria-label="Resumable uploads"><h2>Resumable uploads</h2>
  <p>Originals transfer to your firm’s object storage in resumable parts. Completed files stay in quarantine until a malware scanner supplies a verdict. Downloads, previews and processing remain unavailable.</p>
  {limits&&<p>Before transfer: maximum {mib(limits.fileBytes)} per file, {limits.files} files per manifest and {mib(limits.matterBytes)} retained or reserved per matter. {state.usedAndReservedBytes===null?'Current usage is available to the principal.':mib(state.usedAndReservedBytes)+' used or reserved.'} Unfinished transfers expire after {limits.expiresHours} hours.</p>}
  {target&&<p>Append a quarantined version to <strong>{target.title}</strong>. Its existing originals and visibility stay in place. <button type="button" className="quiet" disabled={busy} onClick={clearTarget}>Cancel version selection</button></p>}
  <label><input type="checkbox" disabled={busy||Boolean(target)} checked={folder} onChange={e=>{setFolder(e.target.checked);setFiles([]);requestId.current=undefined;}}/>Choose a folder</label>
  <label>Files to transfer<input ref={picker} type="file" multiple={!target} disabled={busy} onChange={e=>{setFiles(Array.from(e.target.files??[]));requestId.current=undefined;}}/></label>
  <label>Upload visibility<select value={target?.visibility??visibility} disabled={busy||Boolean(target)} onChange={e=>setVisibility(e.target.value)}><option value="matter">Everyone assigned to this matter</option><option value="private">Uploader and principal only</option></select></label>
  {files.length>0&&<ul>{files.map(f=><li key={pathOf(f)} style={{overflowWrap:'anywhere'}}>{pathOf(f)} · {mib(f.size)}{limits&&f.size>limits.fileBytes?' · Too large':''}</li>)}</ul>}
  <button type="button" disabled={busy||!limits||!files.length} onClick={()=>perform(async()=>{
   if(target&&files.length!==1)throw new Error('Choose one original for this document version.');
   if(files.length>limits.files||files.some(f=>!f.size||f.size>limits.fileBytes))throw new Error('The selected files exceed the displayed limits.');
   setProgress('Computing original hashes before reserving space…');
   const manifest=[];for(const f of files)manifest.push({name:f.name,path:pathOf(f),mime:f.type||'application/octet-stream',size:f.size,sha256:await fileSha(f),visibility:target?.visibility??visibility,...(target?{documentId:target.id,revision:target.revision}:{})});
   requestId.current??=crypto.randomUUID();const batch=await api('/matters/'+matterId+'/document-uploads',{requestId:requestId.current,files:manifest});await refresh();
   for(const u of batch.uploads){if(stop.current)break;if(u.state==='active'||u.state==='completing')await transfer(u);}
  })}>Reserve and upload files</button>
  {busy&&<button type="button" className="quiet" onClick={()=>{stop.current=true;setProgress('Pausing after the current part…');}}>Pause after part</button>}
  {error&&<p role="alert">{error}</p>}{progress&&<p role="status">{progress}</p>}
  {state?.uploads.map((u:Row)=><article className="record" key={u.id} style={{overflowWrap:'anywhere'}}><strong>{u.path}</strong><p>{mib(u.size)} · {u.state==='complete'?'Quarantined':u.state} · {u.parts.reduce((n:number,p:Row)=>n+p.size,0).toLocaleString()} bytes received</p>
   {['active','completing'].includes(u.state)&&<><p>Resume until <time dateTime={u.expiresAt}>{u.expiresAt}</time>. Select the same original files above; verified parts will be reused.</p><button type="button" disabled={busy} onClick={()=>perform(()=>transfer(u))}>Resume {u.name}</button><button type="button" className="quiet" disabled={busy} onClick={()=>perform(async()=>{await api('/document-uploads/'+u.id+'/cancel',{});setProgress('Transfer cancelled; reserved space released.');})}>Cancel {u.name}</button></>}
  </article>)}
 </section>;
}
