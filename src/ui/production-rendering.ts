import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {Row} from './common';

// Only page pixels leave this in-memory renderer; source resources never enter the derivative.
export async function renderProductionPages(document:Row,redactedPages:number[]){
 const version=document.versions.find((v:Row)=>v.version===document.currentVersion);
 const response=await fetch(`/api/satchel/documents/${document.id}/file?version=${version.version}`,{credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw new Error('The selected original could not be rendered');
 const bytes=new Uint8Array(await response.arrayBuffer());
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(hash!==version.sha256||bytes.length!==version.size)throw new Error('The selected original failed its integrity check');
 const library=await import('pdfjs-dist');library.GlobalWorkerOptions.workerSrc=workerUrl;
 const task=library.getDocument({data:bytes,useSystemFonts:true});
 try{
  const pdf=await task.promise;
  if(redactedPages.some(n=>!Number.isInteger(n)||n<1||n>pdf.numPages))throw new Error('A redacted page is outside the source');
  if(redactedPages.length===pdf.numPages)return undefined;
  const pages=[];let total=0;
  for(let n=1;n<=pdf.numPages;n++){
   if(redactedPages.includes(n))continue;
   const page=await pdf.getPage(n),viewport=page.getViewport({scale:1.5});
   if(viewport.width*viewport.height>16000000)throw new Error('This page is too large to render safely');
   const canvas=documentCanvas();canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   await page.render({canvas,viewport,background:'white'}).promise;
   const pngBase64=canvas.toDataURL('image/png').split(',')[1];total+=pngBase64.length;
   if(total>1500000)throw new Error('Rendered pages exceed the current packet limit; prepare a smaller production');
   pages.push({page:n,pngBase64});canvas.width=0;canvas.height=0;page.cleanup();
  }
  return {sourceSha256:hash,pages};
 }finally{await task.destroy();}
}
const documentCanvas=()=>window.document.createElement('canvas');
