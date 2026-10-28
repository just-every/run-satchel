import PostalMime from 'postal-mime';
import {convert} from 'html-to-text';
import {readableText} from './document-readable-text';

// Parse retained message bytes locally. Headers are searchable source text,
// never sending consent, credentials or authority. HTML is converted to text;
// remote images, links and attachment resources are never requested.
export async function emailText(bytes:Uint8Array){
 let ocrPages=0;
 const sections:{page:number;body:string}[]=[],missing:string[]=[];
 const append=(label:string,body:string)=>{body=body.replace(/\u00a0/g,' ');if(body.trim())sections.push({page:sections.length+1,body:label+'\n'+body});};
 const parse=async(raw:Uint8Array,depth:number,label:string)=>{
  if(depth>5){missing.push('Nested messages beyond five levels');return;}
  const email=await PostalMime.parse(raw,{maxNestingDepth:30,maxHeadersSize:128*1024,attachmentEncoding:'arraybuffer',rfc822Attachments:true});
  const header=email.headers.map(h=>h.originalKey+': '+h.value).join('\n');
  const body=[email.text,email.html?convert(email.html,{wordwrap:false,selectors:[{selector:'img',format:'skip'},{selector:'script',format:'skip'},{selector:'style',format:'skip'}]}):''].filter(Boolean).join('\n');
  append(label,header+'\n\n'+body);
  for(const a of email.attachments){
   const name=a.filename??'Unnamed attachment',content=typeof a.content==='string'?new TextEncoder().encode(a.content):new Uint8Array(a.content);
   if(a.mimeType==='message/rfc822'){await parse(content,depth+1,label+' · '+name);continue;}
   if(a.mimeType.startsWith('text/')){
    try{const text=new TextDecoder('utf-8',{fatal:true}).decode(content);append(name,a.mimeType==='text/html'?convert(text,{wordwrap:false,selectors:[{selector:'img',format:'skip'},{selector:'script',format:'skip'},{selector:'style',format:'skip'}]}):text);}catch{missing.push(name+' (unreadable text encoding)');}
   }else if(['application/pdf','image/png','image/jpeg'].includes(a.mimeType)){
    try{const extracted=await readableText(content,a.mimeType);ocrPages+=extracted.ocrPages;for(const p of extracted.pages)append(name+' · original page '+p.page,p.body);for(const item of extracted.missing)missing.push(name+' · '+item);}catch{missing.push(name+' (unreadable attachment)');}
   }else missing.push(name+' ('+a.mimeType+')');
  }
 };
 await parse(bytes,0,'Message');
 return {pages:sections,missing,ocrPages};
}
