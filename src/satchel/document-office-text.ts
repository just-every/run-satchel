import {DOMParser} from '@xmldom/xmldom';
import {all,attribute,children,elementChildren,fail,officeKind,packageReader,wordText} from './office-package';

// Reuse the preview's bounded ZIP and relationship reader. No macro, formula,
// document entity, external relationship or linked resource is evaluated.
export function officeText(bytes:Uint8Array,version:Record<string,any>){
 const kind=officeKind(version);if(!kind)return null;
 const pkg=packageReader(bytes,source=>new DOMParser({onError(){throw new Error('Office XML is malformed');}}).parseFromString(source,'application/xml') as unknown as Document),pages:{page:number;body:string}[]=[];
 const append=(label:string,body:string)=>{if(body.trim())pages.push({page:pages.length+1,body:label+'\n'+body});};
 if(kind==='docx'){
  const document=pkg.root('word/document.xml','w','document'),body=children(document,'w','body')[0];if(!body)fail('Word body is missing');
  append('Document',all(body,'w','p').map(wordText).join('\n'));
  for(const name of Object.keys(pkg.files).filter(name=>/^word\/(header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(name)).sort()){
   const tag=name.split('/').pop()!.replace(/\.xml$/,'').replace(/\d+$/,''),root=pkg.root(name,'w',tag==='header'?'hdr':tag==='footer'?'ftr':tag);
   append(name,all(root,'w','p').map(wordText).join('\n'));
  }
 }else if(kind==='xlsx'){
  const book=pkg.root('xl/workbook.xml','s','workbook'),rels=pkg.relationships('xl/_rels/workbook.xml.rels','xl/');
  const strings=Object.hasOwn(pkg.files,'xl/sharedStrings.xml')?all(pkg.root('xl/sharedStrings.xml','s','sst'),'s','si').map(si=>all(si,'s','t').map(t=>t.textContent??'').join('')):[];
  for(const sheet of all(book,'s','sheet')){
   const rel=rels.get(attribute(sheet,'r','id'));if(!rel?.path||!rel.type.endsWith('/worksheet'))fail('Unsupported worksheet');
   const root=pkg.root(rel!.path,'s','worksheet'),lines=all(root,'s','row').map(row=>children(row,'s','c').map(cell=>{
    const type=cell.getAttribute('t'),raw=children(cell,'s','v')[0]?.textContent??'',formula=children(cell,'s','f')[0]?.textContent;
    if(type==='s'&&(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))))fail('Invalid stored worksheet string');
    const value=type==='s'?strings[Number(raw)]:type==='inlineStr'?all(cell,'s','t').map(t=>t.textContent??'').join(''):type==='b'?(raw==='1'?'TRUE':raw==='0'?'FALSE':raw):raw;
    if(value===undefined)fail('Invalid stored worksheet string');
    return (cell.getAttribute('r')??'')+': '+value+(formula?' (unevaluated formula: '+formula+')':'');
   }).join(' · '));append(sheet.getAttribute('name')??'Worksheet',lines.join('\n'));
  }
 }else{
  const root=pkg.root('ppt/presentation.xml','p','presentation'),rels=pkg.relationships('ppt/_rels/presentation.xml.rels','ppt/');
  for(const [i,slide] of all(root,'p','sldId').entries()){
   const rel=rels.get(attribute(slide,'r','id'));if(!rel?.path||!rel.type.endsWith('/slide'))fail('Unsupported slide');
   const page=pkg.root(rel!.path,'p','sld');append('Slide '+(i+1),all(page,'a','p').map(p=>all(p,'a','t').map(t=>t.textContent??'').join('')).join('\n'));
  }
 }
 return {pages,missing:pages.length?[]:['No stored Office text'],ocrPages:0};
}
