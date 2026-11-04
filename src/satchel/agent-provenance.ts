import {insist,integer,now,rows,stmt,text,type Actor,type Data} from './model';
import {documentGuard,visibleDocument} from './documents';

// This identifies the preparation semantics, separately from the agreed model.
export const preparationPolicyRevision='native-preparation-1';
const parse=(value:string|null|undefined)=>value?JSON.parse(value):null;

export async function preparationProvenance(db:D1Database,actor:Actor,originKind:string,originId:string,action:string,inputs:Data){
 const d=actor.agentExecution?.delegation,matterId=d?.matter_id??inputs.matterId;
 if(!matterId)return [];
 const agreement=d?await stmt(db,'SELECT id,processor,model_revision,agreement_reference,retention_terms,training_terms,health_reference,expires_at,approved_by,approved_at FROM s_agent_agreements WHERE id=?',d.agreement_id).first<Data>():null;
 const writes:D1PreparedStatement[]=[];
 const documents=d?await rows(db,'SELECT s.document_id documentId,s.version,s.sha256,s.kind,s.license_reference licenseReference,s.license_expires_at licenseExpiresAt,s.permitted_use permittedUse,doc.revision documentRevision,v.name,v.mime,v.size FROM s_agent_sources s JOIN s_documents doc ON doc.id=s.document_id LEFT JOIN s_document_versions v ON v.document_id=s.document_id AND v.version=s.version WHERE s.delegation_id=? ORDER BY s.document_id',d.id):[];
 // Integration preparations have no delegation source list. Pin the selected
 // original in both the saved inputs and snapshot before any human decision.
 if(!d&&inputs.documentId){
  const document=await visibleDocument(db,actor,text(inputs.documentId,'Source document',100));
  insist(document.matter_id===matterId,'Source document not found',404);insist(!document.erased_at,'Use an available original as the preparation source',409);
  const version=integer(inputs.version??document.current_version,'Source version',1);
  const original=await stmt(db,'SELECT name,mime,size,sha256 FROM s_document_versions WHERE document_id=? AND version=? AND content_base64 IS NOT NULL UNION ALL SELECT name,mime,size,sha256 FROM s_document_r2_versions WHERE document_id=? AND version=? AND object_key IS NOT NULL',document.id,version,document.id,version).first<Data>();
  insist(original,'Source version not available',404);inputs.version=version;
  documents.push({documentId:document.id,version,documentRevision:document.revision,kind:'matter',...original});
  writes.push(...documentGuard(db,actor,document));
 }
 const entries=Array.isArray(inputs.entryIds)?await rows(db,'SELECT e.id,e.matter_id matterId,e.revision,e.kind,e.minutes,e.amount_cents amountCents,e.billable,COALESCE(e.timekeeper_email,e.created_by) timekeeper,(SELECT bill_id FROM s_billing_sources WHERE entry_id=e.id) reservedBy FROM s_entries e WHERE e.matter_id=? AND e.id IN (SELECT value FROM json_each(?)) ORDER BY e.id',matterId,JSON.stringify(inputs.entryIds)):[];
 const snapshot={action,inputs,documents,entries,agreement,policy:{revision:preparationPolicyRevision,delegationId:d?.id??null,approvedAt:d?.approved_at??null,approvedBy:d?.approved_by??null,actions:parse(d?.actions),recipients:parse(d?.recipients),maxJobs:d?.max_jobs??null,spendCents:d?.spend_cents??null,expiresAt:d?.expires_at??null,stopRule:d?.stop_rule??null},preparer:{id:actor.agentKeyId??actor.id,name:(actor as Actor&{label?:string}).label??actor.name,channel:actor.channel},sponsor:{id:actor.id,name:actor.name},jobId:actor.agentExecution?.jobId??null};
 return [...writes,stmt(db,'INSERT INTO s_agent_provenance VALUES(?,?,?,?,?)',originKind,originId,matterId,JSON.stringify(snapshot),now())];
}
