import {insist,type Data} from './model';

export type PdfTextItem={str:string;transform:number[];width:number;height:number;hasEOL?:boolean};
export type PdfTextPage={page:number;lines:string[]};

// PDF.js' parsing worker has no canvas or DOM dependency. Its message transport
// runs locally: only original bytes enter it; resource requests never use fetch.
// Keep protocol adaptation here, separate from chronology interpretation.
export async function nativePdfText(bytes:Uint8Array):Promise<PdfTextPage[]>{
 const [{WorkerMessageHandler},metadata]=await Promise.all([
  // @ts-expect-error PDF.js publishes the worker entry without a declaration.
  import('pdfjs-dist/build/pdf.worker.mjs'),import('pdfjs-dist/package.json')
 ]);
 const docId='chronology-'+crypto.randomUUID(),listeners=new Set<(event:{data:Data})=>void>();
 let workerName='',sequence=0;
 const pending=new Map<number,{resolve:(data:Data)=>void;reject:(error:Error)=>void}>();
 const streams=new Map<number,{items:PdfTextItem[];resolve:(items:PdfTextItem[])=>void;reject:(error:Error)=>void}>();
 let readyResolve!:(data:Data)=>void,readyReject!:(error:Error)=>void;
 const ready=new Promise<Data>((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
 const timed=async<T>(operation:Promise<T>)=>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Native PDF extraction timed out; no chronology was saved')),30000);})]);}finally{clearTimeout(timer);}};
 const failure=(value:Data)=>new Error(value?.message??'Native PDF extraction failed');
 const send=(message:Data)=>{for(const listener of listeners)listener({data:{sourceName:docId,targetName:workerName,...message}});};
 const port={
  addEventListener(_name:string,listener:(event:{data:Data})=>void,options?:{signal?:AbortSignal}){listeners.add(listener);options?.signal?.addEventListener('abort',()=>listeners.delete(listener),{once:true});},
  postMessage(message:Data){
   if(message.action==='GetDoc')readyResolve(message.data.pdfInfo);
   else if(message.action==='DocException')readyReject(failure(message.data));
   else if(message.callback){const p=pending.get(message.callbackId);pending.delete(message.callbackId);if(message.callback===1)p?.resolve(message.data);else p?.reject(failure(message.reason));}
   else if(message.stream){const s=streams.get(message.streamId);if(!s)return;
    if(message.stream===4)s.items.push(...message.chunk.items.filter((item:Data)=>typeof item.str==='string'));
    else if(message.stream===3){streams.delete(message.streamId);s.resolve(s.items);}
    else if(message.stream===5||(message.stream===8&&!message.success)){streams.delete(message.streamId);s.reject(failure(message.reason));}
   }else if(message.callbackId){
    // Passwords and nonembedded resources require a different original. No
    // external host receives a filename, font request, document, or page text.
    send({callback:2,callbackId:message.callbackId,reason:{name:'UnknownErrorException',message:'Native extraction cannot read an encrypted PDF or a required nonembedded resource'}});
   }
  }
 };
 const call=(action:string,data:Data={})=>new Promise<Data>((resolve,reject)=>{const callbackId=++sequence;pending.set(callbackId,{resolve,reject});send({action,data,callbackId});});
 try{
  workerName=WorkerMessageHandler.createDocumentHandler({docId,apiVersion:metadata.version,data:bytes,disableAutoFetch:true,enableXfa:false,evaluatorOptions:{ignoreErrors:false,isEvalSupported:false,disableFontFace:true,useSystemFonts:true,useWorkerFetch:false,useWasm:false,isOffscreenCanvasSupported:false,isImageDecoderSupported:false}},port);
  send({action:'Ready',data:null});
  const info=await timed(ready);insist(info.numPages>0&&info.numPages<=200,'Native chronology extraction supports 1 to 200 pages per original',422);
  const pages:PdfTextPage[]=[];
  for(let pageIndex=0;pageIndex<info.numPages;pageIndex++){
   await timed(call('GetPage',{pageIndex}));
   const items=await timed(new Promise<PdfTextItem[]>((resolve,reject)=>{const streamId=++sequence;streams.set(streamId,{items:[],resolve,reject});send({action:'GetTextContent',streamId,desiredSize:Infinity,data:{pageId:pageIndex,pageIndex,includeMarkedContent:false,disableNormalization:false}});}));
   const lines=pageLines(items);
   insist(lines.join(' ').replace(/\s/g,'').length>=16,'Page '+(pageIndex+1)+' has insufficient readable embedded text. Scanned or unreadable pages require a readable original; no chronology was saved.',422);
   pages.push({page:pageIndex+1,lines});
  }
  return pages;
 }finally{if(workerName)await timed(call('Terminate'));listeners.clear();}
}

function pageLines(items:PdfTextItem[]):string[]{
 const rows:{y:number;items:PdfTextItem[]}[]=[];
 for(const item of items){if(!item.str.trim())continue;const y=item.transform[5],tolerance=Math.max(2,Math.min(Math.abs(item.height||10)*0.25,4));
  let row=rows.find(row=>Math.abs(row.y-y)<=tolerance);if(!row){row={y,items:[]};rows.push(row);}row.items.push(item);
 }
 return rows.sort((a,b)=>b.y-a.y).map(row=>row.items.sort((a,b)=>a.transform[4]-b.transform[4]).map(item=>item.str).join(' ').replace(/\s+/g,' ').trim()).filter(Boolean);
}
