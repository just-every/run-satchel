import {useMemo,type ReactNode} from 'react';
import {officeKind,packageReader,is,all,children,attribute,fail,wordText,elementChildren} from '../satchel/office-package';
export {officeKind} from '../satchel/office-package';
function wordBlocks(node:Element):ReactNode[] {
 return elementChildren(node).flatMap((child,index):ReactNode[]=>{
  if(is(child,'w','p'))return [<p key={index} style={{whiteSpace:'pre-wrap'}}>{wordText(child)||'\u00a0'}</p>];
  if(is(child,'w','tbl'))return [<table key={index}><tbody>{children(child,'w','tr').map((row,r)=><tr key={r}>{children(row,'w','tc').map((cell,c)=><td key={c}>{wordBlocks(cell)}</td>)}</tr>)}</tbody></table>];
  const nested=wordBlocks(child);return nested.length?[<div key={index}>{nested}</div>]:[];
 });
}
function wordPreview(pkg:ReturnType<typeof packageReader>) {
 const document=pkg.root('word/document.xml','w','document'),body=children(document,'w','body')[0];
 if(!body)fail('The Word document has no body.');
 return <>{!all(body,'w','t').length&&<p>No stored document text. The document may contain drawings or images.</p>}{wordBlocks(body)}{Object.keys(pkg.files).filter(name=>/^word\/(header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(name)).sort().map(name=>{
  const tag=name.split('/').pop()!.replace(/\.xml$/,'').replace(/\d+$/,'');
  const label=tag==='header'?'Header':tag==='footer'?'Footer':tag==='footnotes'?'Footnotes':'Endnotes';
  const root=pkg.root(name,'w',tag==='header'?'hdr':tag==='footer'?'ftr':tag);
  return <section key={name}><h5>{label} ({name.split('/').pop()})</h5>{tag==='footnotes'||tag==='endnotes'?elementChildren(root).filter(n=>is(n,'w',tag==='footnotes'?'footnote':'endnote')&&!['separator','continuationSeparator'].includes(attribute(n,'w','type'))).map((note,i)=><div key={i}><strong>{tag==='footnotes'?'Footnote':'Endnote'} {attribute(note,'w','id')}</strong>{wordBlocks(note)}</div>):wordBlocks(root)}</section>;
 })}</>;
}

function sheetPreview(pkg:ReturnType<typeof packageReader>) {
 const book=pkg.root('xl/workbook.xml','s','workbook'),rels=pkg.relationships('xl/_rels/workbook.xml.rels','xl/');
 const strings=Object.hasOwn(pkg.files,'xl/sharedStrings.xml')?all(pkg.root('xl/sharedStrings.xml','s','sst'),'s','si').map(si=>all(si,'s','t').map(t=>t.textContent??'').join('')):[];
 const sheets=all(book,'s','sheet');if(!sheets.length)fail('No worksheets are available in this workbook.');
 return <>{sheets.map((sheet,index)=>{
  const relationship=rels.get(attribute(sheet,'r','id'));
  if(!relationship?.path||!relationship.type.endsWith('/worksheet'))fail('An external or unsupported sheet cannot be previewed.');
  const data=pkg.root(relationship!.path,'s','worksheet'),rows=all(data,'s','row');
  return <section key={index}><h5>{sheet.getAttribute('name')||`Sheet ${index+1}`}</h5>{!rows.length?<p>No stored cells.</p>:<table><tbody>{rows.map((row,r)=><tr key={r}>{children(row,'s','c').map((cell,c)=>{
   const type=cell.getAttribute('t'),raw=children(cell,'s','v')[0]?.textContent??'',formula=children(cell,'s','f')[0];
   let value=type==='inlineStr'?all(cell,'s','t').map(t=>t.textContent??'').join(''):type==='b'?(raw==='1'?'TRUE':raw==='0'?'FALSE':raw):raw;
   if(type==='s'){const number=Number(raw);if(!/^\d+$/.test(raw)||!Number.isSafeInteger(number)||strings[number]===undefined)fail('A worksheet shared-string reference is invalid.');value=strings[number];}
   return <td key={c}><small>{cell.getAttribute('r')||`Row ${r+1}, cell ${c+1}`}</small><div style={{whiteSpace:'pre-wrap'}}>{formula?<><div>Formula (unevaluated): <code>{formula.textContent||'Shared or array formula; expression is stored elsewhere'}</code></div><div>Cached value: {value||'Not stored'}</div></>:value}</div></td>;
  })}</tr>)}</tbody></table>}</section>;
 })}<p>Values are stored cell data; date and number formatting are not reproduced. Formulas are not evaluated and cached values may be stale.</p></>;
}

function slideBlocks(node:Element):ReactNode[] {
 return elementChildren(node).flatMap((child,index):ReactNode[]=>{
  if(is(child,'a','p'))return [<p key={index} style={{whiteSpace:'pre-wrap'}}>{elementChildren(child).map(run=>is(run,'a','br')?'\n':all(run,'a','t').map(t=>t.textContent??'').join('')).join('')}</p>];
  if(is(child,'a','tbl'))return [<table key={index}><tbody>{children(child,'a','tr').map((row,r)=><tr key={r}>{children(row,'a','tc').map((cell,c)=><td key={c}>{slideBlocks(cell)}</td>)}</tr>)}</tbody></table>];
  const nested=slideBlocks(child);return nested.length?[<div key={index}>{nested}</div>]:[];
 });
}
function presentationPreview(pkg:ReturnType<typeof packageReader>) {
 const presentation=pkg.root('ppt/presentation.xml','p','presentation'),rels=pkg.relationships('ppt/_rels/presentation.xml.rels','ppt/');
 const slides=all(presentation,'p','sldId');if(!slides.length)fail('No slides are available in this presentation.');
 return <>{slides.map((slide,index)=>{
  const relationship=rels.get(attribute(slide,'r','id'));
  if(!relationship?.path||!relationship.type.endsWith('/slide'))fail('An external or unsupported slide cannot be previewed.');
  const root=pkg.root(relationship!.path,'p','sld');
  return <section key={index}><h5>Slide {index+1}</h5>{all(root,'a','t').length?slideBlocks(root):<p>No stored slide text or table text. This slide may contain drawings or images.</p>}</section>;
 })}</>;
}

export function OfficePreview({bytes,kind}:{bytes:Uint8Array;kind:ReturnType<typeof officeKind>}) {
 const result=useMemo(()=>{
  try{
   if(!kind)fail('This Office format is unsupported. Legacy and macro-enabled Office files cannot be previewed.');
   const pkg=packageReader(bytes);
   return {content:kind==='docx'?wordPreview(pkg):kind==='xlsx'?sheetPreview(pkg):presentationPreview(pkg)};
  }catch(reason){return {error:reason instanceof Error?reason.message:'The Office package could not be read.'};}
 },[bytes,kind]);
 return <div className="office-preview"><p>Office content preview; original layout, drawings and macros are not rendered.</p>{result.error?<p role="alert">Preview unavailable: {result.error} Download the original to open it in its application.</p>:result.content}</div>;
}
