import {unzipSync} from 'fflate';
export const elementChildren=(node:Element):Element[]=>Array.from(node.childNodes).filter(child=>child.nodeType===1) as Element[];
export type OfficeKind='docx'|'xlsx'|'pptx';
const mimeKinds:Record<string,OfficeKind>={
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx',
 'application/vnd.openxmlformats-officedocument.presentationml.presentation':'pptx',
};
export function officeKind(version:Record<string,any>):OfficeKind|undefined {
 const mime=String(version.mime??'').toLowerCase();
 if(mimeKinds[mime])return mimeKinds[mime];
 if(mime!=='application/octet-stream')return;
 return mimeKinds[String(version.declaredMime??'').toLowerCase()]??(/\.(docx|xlsx|pptx)$/i.exec(String(version.name??''))?.[1].toLowerCase() as OfficeKind|undefined);
}

const namespaces={
 w:['http://schemas.openxmlformats.org/wordprocessingml/2006/main','http://purl.oclc.org/ooxml/wordprocessingml/main'],
 s:['http://schemas.openxmlformats.org/spreadsheetml/2006/main','http://purl.oclc.org/ooxml/spreadsheetml/main'],
 p:['http://schemas.openxmlformats.org/presentationml/2006/main','http://purl.oclc.org/ooxml/presentationml/main'],
 a:['http://schemas.openxmlformats.org/drawingml/2006/main','http://purl.oclc.org/ooxml/drawingml/main'],
 r:['http://schemas.openxmlformats.org/officeDocument/2006/relationships','http://purl.oclc.org/ooxml/officeDocument/relationships'],
 rel:['http://schemas.openxmlformats.org/package/2006/relationships','http://purl.oclc.org/ooxml/package/relationships'],
};
type Family=keyof typeof namespaces;
export const is=(node:Element,family:Family,name:string)=>node.localName===name&&namespaces[family].includes(node.namespaceURI??'');
export const all=(node:Element|Document,family:Family,name:string)=>Array.from(node.getElementsByTagNameNS('*',name)).filter(e=>is(e,family,name));
export const children=(node:Element,family:Family,name:string)=>elementChildren(node).filter(e=>is(e,family,name));
export const attribute=(node:Element,family:Family,name:string)=>namespaces[family].map(ns=>node.getAttributeNS(ns,name)).find(v=>v!==null&&v!=='')??'';
export const fail=(message:string):never=>{throw new Error(message);};
const crcTable=Uint32Array.from({length:256},(_,value)=>{
 for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);
 return value;
});

// Check every central-directory size BEFORE fflate allocates output buffers.
// ZIP64, split archives and encrypted entries are deliberately unsupported.
function unpack(bytes:Uint8Array) {
 if(bytes[0]===0xd0&&bytes[1]===0xcf)fail('Encrypted Office packages and legacy Office binary files cannot be previewed.');
 if(bytes.length<22||bytes.length>32*1024*1024)fail('Office preview requires a ZIP package up to 32 MB.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u16=(at:number)=>view.getUint16(at,true),u32=(at:number)=>view.getUint32(at,true);
 let end=bytes.length-22;
 while(end>=Math.max(0,bytes.length-65557)&&(u32(end)!==0x06054b50||end+22+u16(end+20)!==bytes.length))end--;
 if(end<Math.max(0,bytes.length-65557))fail('Malformed or unsupported Office ZIP package.');
 const count=u16(end+10),start=u32(end+16),size=u32(end+12);
 if(u16(end+4)||u16(end+6)||count!==u16(end+8)||count===65535||start===0xffffffff||size===0xffffffff)fail('Split and ZIP64 Office packages are unsupported.');
 if(!count||count>2048||start+size!==end)fail('Malformed Office ZIP directory or too many parts (limit 2,048).');
 const entries=new Map<string,{length:number;crc:number}>();let at=start,total=0;
 for(let i=0;i<count;i++){
  if(at+46>end||u32(at)!==0x02014b50)fail('Malformed Office ZIP directory.');
  const flags=u16(at+8),method=u16(at+10),packed=u32(at+20),length=u32(at+24),nameLength=u16(at+28),local=u32(at+42),next=at+46+nameLength+u16(at+30)+u16(at+32);
  if(flags&0x41)fail('Encrypted Office ZIP entries cannot be previewed.');
  if(next>end||u16(at+34)||local+30>start||u32(local)!==0x04034b50)fail('Malformed Office ZIP entry.');
  if(method!==0&&method!==8)fail('This Office ZIP compression method is unsupported.');
  const data=local+30+u16(local+26)+u16(local+28);
  if(u16(local+8)!==method||u16(local+6)!==flags||data+packed>start||(method===0&&packed!==length))fail('Inconsistent Office ZIP entry.');
  total+=length;
  if(length>8*1024*1024||total>24*1024*1024)fail('Office preview exceeds the 8 MB per part or 24 MB expanded package limit.');
  const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(at+46,at+46+nameLength));
  const localName=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(local+30,local+30+u16(local+26)));
  if(name!==localName||entries.has(name)||name.startsWith('/')||name.includes('\\')||name.split('/').includes('..'))fail('Unsafe or duplicate Office ZIP part.');
  entries.set(name,{length,crc:u32(at+16)});at=next;
 }
 if(at!==end)fail('Malformed Office ZIP directory length.');
 // Exclude the ZIP comment so fflate uses the exact directory validated above.
 const files=unzipSync(bytes.subarray(0,end+22),{filter:file=>file.name==='[Content_Types].xml'||/^(word|xl|ppt)\/.*\.(xml|rels)$/.test(file.name)});
 for(const [name,data] of Object.entries(files)){
  let crc=0xffffffff;
  for(const byte of data)crc=(crc>>>8)^crcTable[(crc^byte)&255];
  const entry=entries.get(name)!;
  if(data.length!==entry.length||((crc^0xffffffff)>>>0)!==entry.crc)fail('Office ZIP content failed its size or checksum check.');
 }
 return files;
}

export function packageReader(bytes:Uint8Array,parseXML:(source:string)=>Document=source=>new DOMParser().parseFromString(source,'application/xml')) {
 const files=unpack(bytes),cache=new Map<string,Document>();let nodes=0;
 const read=(name:string)=>{
  if(cache.has(name))return cache.get(name)!;
  if(!Object.hasOwn(files,name))return fail(`Required Office part is missing: ${name}`);
  const text=new TextDecoder('utf-8',{fatal:true}).decode(files[name]);
  if(/<!DOCTYPE|<!ENTITY/i.test(text))fail('Office XML with document types or entities is unsupported.');
  const xml=parseXML(text);
  if(xml.getElementsByTagNameNS('*','parsererror').length)fail('Office XML is malformed.');
  const elements=Array.from(xml.getElementsByTagName('*'));nodes+=elements.length;
  if(nodes>60000)fail('Office content exceeds the preview limit of 60,000 XML elements.');
  for(const element of elements){let depth=0,parent=element.parentNode;while(parent?.nodeType===1){if(++depth>80)fail('Office XML nesting exceeds preview limits.');parent=parent.parentNode;}}
  cache.set(name,xml);return xml;
 };
 const root=(name:string,family:Family,tag:string)=>{
  const element=read(name).documentElement;
  if(!is(element,family,tag))fail(`Unsupported Office structure in ${name}.`);
  return element;
 };
 // Only internal XML relationships are followed, never URLs or linked resources.
 const relationships=(path:string,base:string)=>new Map<string,{path:string;type:string}>(all(root(path,'rel','Relationships'),'rel','Relationship').map(rel=>{
  const id=rel.getAttribute('Id')??'',target=rel.getAttribute('Target')??'',type=rel.getAttribute('Type')??'';
  if(rel.getAttribute('TargetMode')==='External'||!target||/[\\:#?]/.test(target))return [id,{path:'',type}];
  const pieces:string[]=[];
  for(const piece of (target.startsWith('/')?target.slice(1):base+target).split('/')){if(piece==='..')pieces.pop();else if(piece&&piece!=='.')pieces.push(piece);}
  return [id,{path:pieces.join('/'),type}];
 }));
 read('[Content_Types].xml');return {files,root,relationships};
}

export function wordText(node:Element):string {
 return elementChildren(node).map(child=>is(child,'w','t')?child.textContent??'':is(child,'w','tab')?'\t':is(child,'w','br')||is(child,'w','cr')?'\n':is(child,'w','footnoteReference')?` [Footnote ${attribute(child,'w','id')}]`:wordText(child)).join('');
}
