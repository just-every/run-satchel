import {useEffect,useRef,useState} from 'react';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {Row,Run} from './common';
import {officeKind,OfficePreview} from './office-preview';
import {DocumentReview} from './document-review';

// DOC-002: render only authenticated, integrity-checked original bytes in memory.
// No preview derivative, object URL or extracted text is saved by the application.
export function DocumentPreview({documentId,version,sourceUrl}:{documentId:string;version:Row;sourceUrl?:string}){
 const [pdf,setPdf]=useState<PDFDocumentProxy>(),[pageNumber,setPageNumber]=useState(1),[url,setUrl]=useState(''),[plain,setPlain]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[pageText,setPageText]=useState<string>();
 const [officeBytes,setOfficeBytes]=useState<Uint8Array>();const office=officeKind(version);
 const fileUrl=sourceUrl??`/api/satchel/documents/${documentId}/file?version=${version.version}`;
 const canvas=useRef<HTMLCanvasElement>(null);
 const supported=Boolean(office)||['application/pdf','image/png','image/jpeg','image/gif','image/webp','text/plain'].includes(version.mime);
 useEffect(()=>{
  const controller=new AbortController();let active=true,objectUrl='',task:{destroy:()=>Promise<void>}|undefined;
  setOfficeBytes(undefined);setPdf(undefined);setUrl('');setPlain('');setError('');setLoading(supported);setPageNumber(1);
  if(supported)void (async()=>{
   const response=await fetch(fileUrl,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
   if(!response.ok){const result=await response.json() as Row;throw new Error(result.error??'The original could not be opened');}
   const bytes=new Uint8Array(await response.arrayBuffer());
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
   if(hash!==version.sha256||bytes.length!==version.size)throw new Error('The original does not match this version’s recorded hash and size');
   if(!active)return;
   if(office)setOfficeBytes(bytes);
   else if(version.mime==='application/pdf'){
    const library=await import('pdfjs-dist');if(!active)return;
    library.GlobalWorkerOptions.workerSrc=workerUrl;
    const job=library.getDocument({data:bytes,useSystemFonts:true});task=job;
    const opened=await job.promise;if(active)setPdf(opened);
   }else if(version.mime==='text/plain')setPlain(new TextDecoder().decode(bytes));
   else{objectUrl=URL.createObjectURL(new Blob([bytes],{type:version.mime}));setUrl(objectUrl);}
   if(active)setLoading(false);
  })().catch(reason=>{if(active){setLoading(false);setError(reason instanceof Error?reason.message:String(reason));}});
  return()=>{active=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);void task?.destroy();};
 },[documentId,version.version,version.sha256,version.size,version.mime,supported,fileUrl,office]);
 useEffect(()=>{
  if(!pdf)return;setPageText(undefined);let active=true,render:{cancel:()=>void}|undefined;
  void (async()=>{
   const page=await pdf.getPage(pageNumber);if(!active||!canvas.current)return;
   const viewport=page.getViewport({scale:1}),surface=canvas.current;surface.width=viewport.width;surface.height=viewport.height;
   const job=page.render({canvas:surface,viewport});render=job;await job.promise;
   const text=await page.getTextContent();if(active)setPageText(text.items.map(item=>'str' in item?item.str:'').join(' '));
  })().catch(reason=>{if(active)setError(reason instanceof Error?reason.message:String(reason));});
  return()=>{active=false;render?.cancel();};
 },[pdf,pageNumber]);
 return <section className="document-preview" aria-label={`Preview version ${version.version}`}>
  <h4>Version {version.version} · {version.name}</h4>
  <p>{version.createdBy} · <time dateTime={version.createdAt}>{version.createdAt}</time><br/><small className="document-hash">SHA-256 {version.sha256}</small></p>
  {loading&&<p role="status">Opening original preview…</p>}{error&&<p role="alert">{error}</p>}
  {!supported&&<p>Preview is unavailable for this file format. Download the original to open it in its application.</p>}
  {pdf&&<><div className="actions"><button type="button" disabled={pageNumber<=1} onClick={()=>setPageNumber(n=>n-1)}>Previous page</button><span>Page {pageNumber} of {pdf.numPages}</span><button type="button" disabled={pageNumber>=pdf.numPages} onClick={()=>setPageNumber(n=>n+1)}>Next page</button></div><canvas ref={canvas} role="img" aria-label={`PDF version ${version.version}, page ${pageNumber}`}/><details><summary>Page text</summary><p>{pageText===undefined?'Reading embedded text…':pageText||'No embedded text on this page.'}</p></details></>}
  {officeBytes&&office&&<OfficePreview bytes={officeBytes} kind={office}/>}
  {url&&<img src={url} alt={`Original image, version ${version.version}`}/>}
  {version.mime==='text/plain'&&!loading&&!error&&<pre>{plain}</pre>}
  <a href={fileUrl}>Download original version {version.version}</a>
 </section>;
}

export function DocumentVersions({document,run,tick}:{document:Row;run:Run;tick:number}){
 const [opened,setOpened]=useState(false),[left,setLeft]=useState(document.currentVersion),[right,setRight]=useState(0);
 const first=document.versions.find((v:Row)=>v.version===left),second=document.versions.find((v:Row)=>v.version===right);
 return <div>
  <button type="button" className="quiet" aria-expanded={opened} onClick={()=>setOpened(v=>!v)}>{opened?'Close preview':'Preview and compare versions'}</button>
  {opened&&<><div className="inline"><label>Preview version<select aria-label="Preview version" value={left} onChange={e=>{const next=Number(e.target.value);setLeft(next);if(right===next)setRight(0);}}>{document.versions.map((v:Row)=><option key={v.version} value={v.version}>Version {v.version}</option>)}</select></label><label>Compare with version<select aria-label="Compare with version" value={right} onChange={e=>setRight(Number(e.target.value))}><option value={0}>No comparison</option>{document.versions.filter((v:Row)=>v.version!==left).map((v:Row)=><option key={v.version} value={v.version}>Version {v.version}</option>)}</select></label></div>
   {first&&second&&<p role="status">{first.sha256===second.sha256?'Identical original bytes':'Different original bytes'} · Version {first.version} compared with version {second.version}. Source citations keep their recorded version.</p>}
   <div className="document-comparison">{first&&<DocumentPreview key={'left-'+left} documentId={document.id} version={first}/>}{second&&<DocumentPreview key={'right-'+right} documentId={document.id} version={second}/>}</div>
   <DocumentReview document={document} version={left} run={run} tick={tick}/>
  </>}
 </div>;
}
