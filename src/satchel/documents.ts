/* Adapted from just-every/run-chest access.ts, documents.ts and blobs.ts,
 * commit 7bf6e3eff153323fedfdd2ef6abb7bfd0222419a.
 * MIT License, Copyright (c) 2026 Run Edit Run. See LICENSE for permission
 * and warranty disclaimer. Matter membership replaces collection grants;
 * private documents retain only creator/owner access. */
import { atomic, audit, digest, id, insist, integer, matter, now, rows, stmt, text, type Actor, type Data } from './model';

// Originals are deliberately limited to 1 MiB: base64 and metadata fit a D1
// row, and the bytes commit atomically without an additional object store.
export const documentByteLimit = 1024 * 1024;
const metadata = 'document_id,version,name,mime,declared_mime,size,sha256,created_by,created_channel,created_at';

export function documentAccess(actor: Actor, alias = 'd') {
 return { sql: `(?='owner' OR EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=${alias}.matter_id AND a.email=?)) AND (${alias}.visibility='matter' OR ${alias}.created_by=? OR ?='owner')`, params: [actor.role, actor.email, actor.email, actor.role] };
}

export async function visibleDocument(db: D1Database, actor: Actor, documentId: string) {
 const access = documentAccess(actor);
 const document = await stmt(db, `SELECT d.*,(SELECT matter_number FROM s_matters WHERE id=d.matter_id) AS matter_number FROM s_documents d WHERE d.id=? AND ${access.sql}`, documentId, ...access.params).first<Data>();
 insist(document, 'Document not found', 404); return document;
}

export function documentGuard(db: D1Database, actor: Actor, document: Data, editing = false, exactRevision = true) {
 const access = documentAccess(actor);
 const guard = id();
 return [stmt(db, `INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM s_documents d WHERE d.id=? AND (?=0 OR d.revision=?) AND d.erased_at IS NULL AND ${access.sql} AND (?=0 OR d.created_by=? OR ?='owner')) THEN 1 ELSE 0 END`, guard, document.id, exactRevision ? 1 : 0, document.revision, ...access.params, editing ? 1 : 0, actor.email, actor.role), stmt(db, 'DELETE FROM s_guard WHERE id=?', guard)];
}

export function matterGuard(db: D1Database, actor: Actor, matterId: string) {
 const guard = id();
 return [stmt(db, `INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM s_matters m WHERE m.id=? AND (?='owner' OR EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=m.id AND a.email=?))) THEN 1 ELSE 0 END`, guard, matterId, actor.role, actor.email), stmt(db, 'DELETE FROM s_guard WHERE id=?', guard)];
}

export function decode(value: unknown) {
 insist(typeof value === 'string' && value.length > 0 && value.length <= Math.ceil(documentByteLimit / 3) * 4 && !/[^A-Za-z0-9+/=]/.test(value), 'Supply a base64 original file of at most 1 MiB');
 let binary = ''; try { binary = atob(value); } catch { insist(false, 'Invalid base64 file'); }
 insist(btoa(binary) === value, 'Use canonical base64 without a data URL prefix');
 insist(binary.length > 0 && binary.length <= documentByteLimit, 'Files must contain between 1 byte and 1 MiB');
 return Uint8Array.from(binary, c => c.charCodeAt(0));
}

export function mediaType(bytes: Uint8Array) {
 const prefix = new TextDecoder().decode(bytes.slice(0, 1024));
 if (prefix.startsWith('%PDF-')) return 'application/pdf';
 if (bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10') return 'image/png';
 if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
 if (prefix.startsWith('GIF87a') || prefix.startsWith('GIF89a')) return 'image/gif';
 if (prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP') return 'image/webp';
 try {
  const plain = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!/[\x00-\x08\x0e-\x1f\x7f]/.test(plain)) return 'text/plain';
 } catch { /* Unknown binary formats remain original attachments. */ }
 return 'application/octet-stream';
}

function versionJson(v: Data) {
 return { version: v.version, name: v.name, mime: v.mime, declaredMime: v.declared_mime, size: v.size, sha256: v.sha256, createdBy: v.created_by, channel: v.created_channel, createdAt: v.created_at };
}

function documentJson(d: Data, versions: Data[], duplicates: Data[] = []) {
 return { id: d.id, matterId: d.matter_id, matterNumber:d.matter_number, title: d.title, name: d.title, visibility: d.visibility, createdBy: d.created_by, createdAt: d.created_at, currentVersion: d.current_version, revision: d.revision, updatedAt: d.updated_at, erasedAt: d.erased_at, folderId: d.folder_id ?? null, documentType: d.document_type ?? '', tags: JSON.parse(d.tags ?? '[]'), duplicates, versions: versions.filter(v => v.document_id === d.id).map(versionJson) };
}

export async function listDocuments(db: D1Database, actor: Actor, matterId: string) {
 await matter(db, actor, matterId);
 const access = documentAccess(actor);
 const documents = await rows(db, `SELECT d.*,(SELECT matter_number FROM s_matters WHERE id=d.matter_id) AS matter_number FROM s_documents d WHERE d.matter_id=? AND ${access.sql} ORDER BY d.updated_at DESC,d.id`, matterId, ...access.params);
 const versions = await rows(db, `SELECT ${metadata.split(',').map(c => `v.${c}`).join(',')} FROM s_document_versions v JOIN s_documents d ON d.id=v.document_id WHERE d.matter_id=? AND ${access.sql} ORDER BY v.version`, matterId, ...access.params);
 const duplicates=duplicateIndex(documents,versions);
 return documents.map(d => documentJson(d, versions, duplicates.get(d.id)??[]));
}

// Index only permitted originals, including historical versions. A private
// filename or its existence must never enter another reader's hash matches.
function duplicateIndex(documents:Data[],versions:Data[]) {
 const permitted=new Map(documents.filter(d=>!d.erased_at).map(d=>[d.id,d]));
 const hashes=new Map<string,Data[]>(),byDocument=new Map<string,Set<string>>();
 for(const v of versions)if(permitted.has(v.document_id)){
  const group=hashes.get(v.sha256)??[];group.push(v);hashes.set(v.sha256,group);
  const own=byDocument.get(v.document_id)??new Set<string>();own.add(v.sha256);byDocument.set(v.document_id,own);
 }
 const result=new Map<string,Data[]>();
 for(const [documentId,own] of byDocument){
  const matches=new Map<string,Data>();
  for(const hash of own)for(const v of hashes.get(hash)??[])if(v.document_id!==documentId){
   const d=permitted.get(v.document_id)!,match=matches.get(d.id)??{id:d.id,title:d.title,versions:[]};
   match.versions.push({version:v.version,sha256:v.sha256});matches.set(d.id,match);
  }
  result.set(documentId,[...matches.values()].sort((a,b)=>String(a.id).localeCompare(String(b.id))));
 }
 return result;
}

export async function saveDocument(db: D1Database, actor: Actor, matterId: string, body: Data, resolving?: string) {
 await matter(db, actor, matterId);
 const name = text(body.name, 'Filename', 240);
 insist(!/[\x00-\x1f\x7f/\\]/.test(name), 'Filename cannot contain paths or control characters');
 const declaredMime = text(body.mime, 'MIME type', 120);
 insist(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(declaredMime), 'Use a MIME type without parameters');
 insist(body.visibility === 'matter' || body.visibility === 'private', 'Choose matter or private visibility');
 const bytes = decode(body.contentBase64), sha256 = await digest(bytes), mime = mediaType(bytes);
 const existing = body.documentId ? await visibleDocument(db, actor, text(body.documentId, 'Document ID', 100)) : null;
 if (existing) {
  insist(existing.matter_id === matterId, 'Document not found', 404);
  insist(!existing.erased_at, 'An erased document cannot receive new versions', 409);
  insist(actor.role === 'owner' || existing.created_by === actor.email, 'Only the document author or owner can append versions', 403);
  insist(body.visibility === existing.visibility, 'Appending a version cannot change document visibility');

 }
 const documentId = existing?.id ?? id(), revision = id(), at = now(), attemptId=id();
 const baseRevision=existing?text(body.revision,'Base document revision',100):null;
 const writes = [...matterGuard(db, actor, matterId)];
 if (existing) {
  writes.push(...documentGuard(db, actor, existing, true, Boolean(resolving)));
  if(resolving){
   insist(baseRevision===existing.revision,'The document changed. Compare again before resolving.',409);
   const fence=id();writes.push(stmt(db,"INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM s_document_conflicts WHERE id=? AND document_id=? AND resolved_at IS NULL AND content_base64 IS NOT NULL) THEN 1 ELSE 0 END",fence,resolving,documentId),stmt(db,'DELETE FROM s_guard WHERE id=?',fence));
  }
  // Conditions run inside the same transaction, including when two requests
  // read the same revision. A losing save retains its bytes without publishing.
  writes.push(stmt(db,`INSERT INTO s_document_conflicts(id,document_id,base_revision,name,mime,declared_mime,size,sha256,content_base64,created_by,created_channel,created_at)
   SELECT ?,?,?,?,?,?,?,?,?,?,?,? FROM s_documents WHERE id=? AND revision<>?`,attemptId,documentId,baseRevision,name,mime,declaredMime,bytes.length,sha256,body.contentBase64,actor.email,actor.channel,at,documentId,baseRevision));
 } else writes.push(stmt(db, 'INSERT INTO s_documents(id,matter_id,title,visibility,created_by,created_at,current_version,revision,updated_by,updated_channel,updated_at) VALUES(?,?,?,?,?,?,0,?,?,?,?)', documentId, matterId, name, body.visibility, actor.email, at, revision, actor.email, actor.channel, at));
 writes.push(stmt(db, `INSERT INTO s_document_versions(document_id,version,name,mime,declared_mime,size,sha256,content_base64,created_by,created_channel,created_at)
  SELECT id,current_version+1,?,?,?,?,?,?,?,?,? FROM s_documents WHERE id=? AND NOT EXISTS(SELECT 1 FROM s_document_conflicts WHERE id=?)`,name,mime,declaredMime,bytes.length,sha256,body.contentBase64,actor.email,actor.channel,at,documentId,attemptId));
 writes.push(stmt(db, 'UPDATE s_documents SET current_version=current_version+1,revision=?,updated_by=?,updated_channel=?,updated_at=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM s_document_conflicts WHERE id=?)', revision, actor.email, actor.channel, at, documentId,attemptId));
 if(resolving)writes.push(stmt(db,'UPDATE s_document_conflicts SET resolved_version=(SELECT current_version FROM s_documents WHERE id=?),resolved_by=?,resolved_at=? WHERE id=?',documentId,actor.email,at,resolving));
 writes.push(audit(db, actor, existing ? 'document.save_received' : 'document.upload', documentId, JSON.stringify({ matterId, attemptId, baseRevision:baseRevision??null, sha256, size: bytes.length, source: 'original-upload', channel: actor.channel, resolving:resolving??null })));
 const integrityGuard = id();
 writes.push(stmt(db, `INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM s_document_versions WHERE document_id=? AND sha256=? AND size=? AND content_base64=?) OR EXISTS(SELECT 1 FROM s_document_conflicts WHERE id=? AND sha256=? AND size=? AND content_base64=?) THEN 1 ELSE 0 END`, integrityGuard, documentId, sha256, bytes.length, body.contentBase64,attemptId,sha256,bytes.length,body.contentBase64), stmt(db, 'DELETE FROM s_guard WHERE id=?', integrityGuard));
 await atomic(db, actor, writes);
 const document=(await listDocuments(db, actor, matterId)).find(d => d.id === documentId)!;
 const conflict=await stmt(db,'SELECT id FROM s_document_conflicts WHERE id=?',attemptId).first();
 return {...document,saveOutcome:conflict?'conflict':'published',conflictId:conflict?attemptId:null};
}

export async function documentFile(db: D1Database, actor: Actor, documentId: string, version?: number): Promise<Response> {
 if (version !== undefined) integer(version, 'Version', 1);
 const access = documentAccess(actor);
 const stored = await stmt(db, `SELECT v.* FROM s_document_versions v JOIN s_documents d ON d.id=v.document_id WHERE d.id=? AND d.erased_at IS NULL AND v.content_base64 IS NOT NULL AND v.version=COALESCE(?,d.current_version) AND ${access.sql}`, documentId, version ?? null, ...access.params).first<Data>();
 insist(stored, 'Document version not found', 404);
 const bytes = decode(stored.content_base64);
 insist(bytes.length === stored.size && await digest(bytes) === stored.sha256, 'Stored original failed its integrity check', 503);
 const fence=id();await atomic(db,actor,[stmt(db,`INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM s_document_versions v JOIN s_documents d ON d.id=v.document_id WHERE d.id=? AND d.erased_at IS NULL AND v.version=? AND v.sha256=? AND v.content_base64 IS NOT NULL AND ${access.sql}) THEN 1 ELSE 0 END`,fence,documentId,stored.version,stored.sha256,...access.params),audit(db,actor,'document.downloaded',documentId,JSON.stringify({version:stored.version,sha256:stored.sha256,bytes:stored.size})),stmt(db,'DELETE FROM s_guard WHERE id=?',fence)]);
 const filename = encodeURIComponent(stored.name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
 return new Response(bytes, { headers: { 'content-type': stored.mime, 'content-length': String(bytes.length), 'content-disposition': `attachment; filename*=UTF-8''${filename}`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'; base-uri 'none'", 'referrer-policy': 'no-referrer' } });
}
