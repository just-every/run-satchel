import {atomic,audit,human,id,insist,matter,now,rows,stmt,text,type Actor,type Data} from './model';
import {documentGuard,listDocuments,matterGuard,visibleDocument} from './documents';

function tags(value:unknown) {
 insist(Array.isArray(value)&&value.length<=30,'Choose at most 30 tags');
 return [...new Set(value.map(v=>text(v,'Tag',60)))].sort();
}
function filters(value:unknown):Data {
 insist(value&&typeof value==='object'&&!Array.isArray(value),'Supply document filters');
 const v=value as Data,out:Data={};
 if(v.folderId!==undefined)out.folderId=v.folderId===null?null:text(v.folderId,'Folder',100);
 if(v.tag)out.tag=text(v.tag,'Tag',60);
 if(v.documentType)out.documentType=text(v.documentType,'Document type',80);
 if(v.query)out.query=text(v.query,'Search',240);
 if(v.duplicatesOnly===true)out.duplicatesOnly=true;
 return out;
}
async function folder(db:D1Database,matterId:string,folderId:unknown) {
 if(folderId===null)return null;
 const f=await stmt(db,'SELECT * FROM s_document_folders WHERE id=? AND matter_id=?',text(folderId,'Folder',100),matterId).first<Data>();
 insist(f,'Folder not found',404);return f;
}
// A search never finds an erased or disposed document (FIRM-006); its tombstone stays in the list.
function matches(d:Data,f:Data) {
 return (f.folderId===undefined||d.folderId===f.folderId)&&(!f.tag||d.tags.includes(f.tag))&&(!f.documentType||d.documentType===f.documentType)&&(!f.query||!d.erasedAt&&`${d.title} ${d.documentType} ${d.tags.join(' ')}`.toLocaleLowerCase().includes(f.query.toLocaleLowerCase()))&&(!f.duplicatesOnly||d.duplicates.length>0);
}
export async function documentSetState(db:D1Database,actor:Actor,matterId:string) {
 await matter(db,actor,matterId);
 // listDocuments applies matter and private visibility to documents AND versions
 // before folder, facet, view and duplicate counts are computed.
 const documents=await listDocuments(db,actor,matterId);
 const folders=await rows(db,'SELECT id,name FROM s_document_folders WHERE matter_id=? ORDER BY name,id',matterId);
 const views=await rows(db,'SELECT id,name,filters FROM s_document_views WHERE matter_id=? AND for_email=? ORDER BY name,id',matterId,actor.email);
 const counts=(field:'tags'|'documentType')=>{
  const c=new Map<string,number>();for(const d of documents)for(const value of field==='tags'?d.tags:[d.documentType])if(value)c.set(value,(c.get(value)??0)+1);
  return [...c].sort(([a],[b])=>a.localeCompare(b)).map(([name,count])=>({name,count}));
 };
 return {documents,total:documents.length,unfiledCount:documents.filter(d=>d.folderId===null).length,folders:folders.map(f=>({...f,count:documents.filter(d=>d.folderId===f.id).length})),tags:counts('tags'),documentTypes:counts('documentType'),views:views.map(v=>({...v,filters:JSON.parse(v.filters),count:documents.filter(d=>matches(d,JSON.parse(v.filters))).length}))};
}
async function preview(db:D1Database,actor:Actor,matterId:string,body:Data) {
 insist(Array.isArray(body.documents)&&body.documents.length>0&&body.documents.length<=100,'Select between 1 and 100 documents');
 const destination=body.folderId!==undefined?await folder(db,matterId,body.folderId):undefined;
 const changes:Data={};
 if(body.folderId!==undefined)changes.folderId=destination?.id??null;
 if(body.tags!==undefined)changes.tags=tags(body.tags);
 if(body.documentType!==undefined)changes.documentType=body.documentType===''?'':text(body.documentType,'Document type',80);
 insist(Object.keys(changes).length,'Choose a folder, tags or document type');
 const documents=await listDocuments(db,actor,matterId),seen=new Set<string>(),items=[];
 const folders=await rows(db,'SELECT id,name FROM s_document_folders WHERE matter_id=?',matterId);
 for(const selected of body.documents){
  const d=documents.find(d=>d.id===selected?.id);insist(d,'Document not found',404);
  insist(!seen.has(d.id),'Select each document only once');seen.add(d.id);
  insist(actor.role==='owner'||d.createdBy===actor.email,'Only the document author or owner can organize documents',403);
  insist(!d.erasedAt,'Erased documents cannot be filed',409);
  insist(selected.revision===d.revision,'A selected document changed. Refresh before previewing.',409);
  const before={folderId:d.folderId,folderName:folders.find(f=>f.id===d.folderId)?.name??'Unfiled',tags:d.tags,documentType:d.documentType};
  const after={...before,...changes};if(destination!==undefined)after.folderName=destination?.name??'Unfiled';
  items.push({id:d.id,title:d.title,revision:d.revision,currentVersion:d.currentVersion,versions:d.versions,visibility:d.visibility,createdBy:d.createdBy,permissions:d.visibility==='private'?'Uploader and principal only':'Everyone assigned to this matter',before,after});
 }
 const result={id:id(),matterId,createdAt:now(),items};
 await atomic(db,actor,[...matterGuard(db,actor,matterId),...await guards(db,actor,items),stmt(db,'INSERT INTO s_document_bulk_previews(id,matter_id,for_email,role,snapshot,created_at) VALUES(?,?,?,?,?,?)',result.id,matterId,actor.email,actor.role,JSON.stringify(result),result.createdAt),audit(db,actor,'document.bulk-previewed',matterId,JSON.stringify({previewId:result.id,documentIds:items.map(d=>d.id)}),{matterId})]);
 return result;
}
async function guards(db:D1Database,actor:Actor,items:Data[]) {
 const out:D1PreparedStatement[]=[];
 for(const item of items){const d=await visibleDocument(db,actor,item.id);insist(d.revision===item.revision,'A selected document changed. Preview again.',409);out.push(...documentGuard(db,actor,d,true));}
 return out;
}
async function apply(db:D1Database,actor:Actor,matterId:string,body:Data) {
 const p=await stmt(db,'SELECT * FROM s_document_bulk_previews WHERE id=? AND matter_id=? AND for_email=? AND role=?',text(body.previewId,'Preview',100),matterId,actor.email,actor.role).first<Data>();
 insist(p,'Preview not found',404);insist(!p.applied_at,'This preview has already been applied',409);
 const snapshot=JSON.parse(p.snapshot),at=now(),fence=id(),writes=[...matterGuard(db,actor,matterId),...await guards(db,actor,snapshot.items)];
 writes.push(stmt(db,'INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM s_document_bulk_previews WHERE id=? AND applied_at IS NULL) THEN 1 ELSE 0 END',fence,p.id));
 for(const item of snapshot.items){
  if(item.after.folderId!==null)await folder(db,matterId,item.after.folderId);
  writes.push(stmt(db,'UPDATE s_documents SET folder_id=?,document_type=?,tags=?,revision=?,updated_by=?,updated_channel=?,updated_at=? WHERE id=?',item.after.folderId,item.after.documentType,JSON.stringify(item.after.tags),id(),actor.email,actor.channel,at,item.id));
  writes.push(audit(db,actor,'document.bulk-filed',item.id,JSON.stringify({previewId:p.id,before:item.before,after:item.after,visibility:item.visibility,currentVersion:item.currentVersion}),{matterId}));
 }
 writes.push(stmt(db,'UPDATE s_document_bulk_previews SET applied_at=? WHERE id=?',at,p.id),stmt(db,'DELETE FROM s_guard WHERE id=?',fence));
 await atomic(db,actor,writes);return documentSetState(db,actor,matterId);
}
export async function documentSetAction(db:D1Database,actor:Actor,matterId:string,op:string,body:Data) {
 human(actor);await matter(db,actor,matterId);
 if(op==='folder'){
  const f={id:id(),name:text(body.name,'Folder name',120),createdAt:now()};
  await atomic(db,actor,[...matterGuard(db,actor,matterId),stmt(db,'INSERT INTO s_document_folders(id,matter_id,name,created_by,created_at) VALUES(?,?,?,?,?)',f.id,matterId,f.name,actor.email,f.createdAt),audit(db,actor,'document.folder-created',matterId,JSON.stringify(f),{matterId})]);return f;
 }
 if(op==='view'){
  const f=filters(body.filters);if(f.folderId!==undefined)await folder(db,matterId,f.folderId);
  const v={id:id(),name:text(body.name,'View name',120),filters:f};
  await atomic(db,actor,[...matterGuard(db,actor,matterId),stmt(db,'INSERT INTO s_document_views(id,matter_id,for_email,name,filters,created_at) VALUES(?,?,?,?,?,?)',v.id,matterId,actor.email,v.name,JSON.stringify(f),now()),audit(db,actor,'document.view-saved',matterId,JSON.stringify({viewId:v.id}),{matterId})]);return v;
 }
 if(op==='preview')return preview(db,actor,matterId,body);
 if(op==='apply')return apply(db,actor,matterId,body);
 insist(false,'Unknown document set action',404);
}
