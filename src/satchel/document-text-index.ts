import {atomic,digest,insist,integer,now,rows,stmt,type Actor,type Data} from './model';
import {decode,documentAccess,documentGuard,visibleDocument} from './documents';
import {emailText} from './document-email-text';
import {readableText} from './document-readable-text';

const extractor='local-text-ocr-v1';
export const normalizeText=(v:unknown)=>String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const eraseDocumentText=(db:D1Database,documentId:string)=>[
 stmt(db,'DELETE FROM s_document_text_pages WHERE document_id=?',documentId),
 stmt(db,'DELETE FROM s_document_text_indexes WHERE document_id=?',documentId)
];

// Only a current reader may build or read this derivative. No connector,
// resource fetch, scanner clearance or new original is created by extraction.
export async function documentText(db:D1Database,actor:Actor,documentId:string){
 const d=await visibleDocument(db,actor,documentId);insist(!d.erased_at,'Document not found',404);
 const v=await stmt(db,'SELECT * FROM s_document_versions WHERE document_id=? AND version=? AND content_base64 IS NOT NULL',d.id,d.current_version).first<Data>();
 insist(v,'Document version not found',404);
 let index=await stmt(db,'SELECT * FROM s_document_text_indexes WHERE document_id=? AND version=? AND sha256=? AND extractor=?',d.id,v.version,v.sha256,extractor).first<Data>();
 if(!index){
  const bytes=decode(v.content_base64);insist(bytes.length===v.size&&await digest(bytes)===v.sha256,'Stored original failed its integrity check',503);
  let ocrPages=0,partial=false,pages:{page:number;body:string}[]=[],detail='This original format is not indexed. Metadata remains searchable.';
  const email=/\.eml$/i.test(v.name)||v.declared_mime==='message/rfc822';
  if(!email){
   try{const extracted=await readableText(bytes,v.mime);pages=extracted.pages;ocrPages=extracted.ocrPages;partial=extracted.missing.length>0;detail='Local text extraction'+(extracted.ocrPages?' with English OCR on '+extracted.ocrPages+' pages':'')+'.'+(partial?' Unindexed content: '+extracted.missing.join('; '):' All original pages indexed.');}
   catch{detail='Text unavailable. This original could not be read locally; metadata remains searchable.';}
  }else if(email){
   try{const message=await emailText(bytes);pages=message.pages;ocrPages=message.ocrPages;partial=message.missing.length>0;detail='Message headers, plain text and HTML text indexed locally.'+(partial?' Unindexed attachments: '+message.missing.join('; '):' Readable attachments indexed as cited sections.');}
   catch{detail='Email could not be parsed locally. Metadata remains searchable.';}
  }
  index={document_id:d.id,version:v.version,sha256:v.sha256,status:pages.length?'ready':'unavailable',incomplete:partial?1:0,ocr_pages:ocrPages,detail,indexed_at:now()};
  await atomic(db,actor,[...documentGuard(db,actor,d),...eraseDocumentText(db,d.id),
   stmt(db,'INSERT INTO s_document_text_indexes(document_id,version,sha256,status,detail,indexed_at,incomplete,ocr_pages,extractor) VALUES(?,?,?,?,?,?,?,?,?)',d.id,index.version,index.sha256,index.status,index.detail,index.indexed_at,index.incomplete,index.ocr_pages,extractor),
   ...pages.map(p=>stmt(db,'INSERT INTO s_document_text_pages VALUES(?,?,?)',d.id,p.page,p.body))]);
 }
 // Apply current access again before returning pages from an existing index.
 const access=documentAccess(actor);
 const pages=await rows(db,`SELECT p.page,p.body FROM s_document_text_pages p JOIN s_document_text_indexes i ON i.document_id=p.document_id JOIN s_documents d ON d.id=i.document_id JOIN s_document_versions v ON v.document_id=d.id AND v.version=d.current_version WHERE d.id=? AND d.erased_at IS NULL AND v.content_base64 IS NOT NULL AND i.version=d.current_version AND i.sha256=v.sha256 AND i.version=? AND i.sha256=? AND i.extractor=? AND ${access.sql} ORDER BY p.page`,d.id,index.version,index.sha256,extractor,...access.params);
 return {index:{version:index.version,sha256:index.sha256,status:index.status==='ready'&&index.incomplete?'partial':index.status,detail:index.detail,indexedAt:index.indexed_at},pages};
}

export async function documentTextCitation(db:D1Database,actor:Actor,documentId:string,version:number,sha256:string,page:number){
 integer(version,'Version',1);integer(page,'Page',1);
 const d=await visibleDocument(db,actor,documentId);insist(!d.erased_at,'Document not found',404);
 const v=await stmt(db,'SELECT sha256 FROM s_document_versions WHERE document_id=? AND version=? AND content_base64 IS NOT NULL',d.id,d.current_version).first<Data>();
 insist(version===d.current_version&&v?.sha256===sha256,'This search citation is stale. Search again for the current original.',409);
 const result=await documentText(db,actor,d.id),source=result.pages.find(p=>p.page===page);insist(result.index.version===version&&result.index.sha256===sha256,'This search citation is stale. Search again for the current original.',409);insist(source,'Indexed page not found',404);
 const escape=(value:unknown)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(d.title)} · page ${page}</title><style>body{font:16px Georgia,serif;margin:24px auto;padding:0 20px;max-width:900px;overflow-wrap:anywhere}pre{font:16px Georgia,serif;white-space:pre-wrap;line-height:1.6}a{color:#174536}</style><h1>${escape(d.title)}</h1><p>Version ${version} · page ${page} · SHA-256 ${escape(sha256)}</p><p>Indexed ${escape(result.index.indexedAt)}. Extracted text from the current original.</p><a href="/api/satchel/documents/${encodeURIComponent(d.id)}/file?version=${version}&amp;sha256=${escape(sha256)}#page=${page}">Download exact original</a><pre>${escape(source.body)}</pre></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'private, no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",'x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
}
