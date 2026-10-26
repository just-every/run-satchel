import {atomic,audit,human,id,insist,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {visibleDeadline} from './deadlines';
import {visibleDocument} from './documents';
import {guard} from './trust-guards';
import {updateSourceGuards} from './matter-update-authority';

async function draftPacket(db:D1Database,actor:Actor,d:Data,b:Data={}){
 insist(d.status==='confirmed'&&d.document_id,'A current confirmed date with a cited original is required',409);
 const doc=await visibleDocument(db,actor,d.document_id),v=await stmt(db,'SELECT sha256 FROM s_document_versions WHERE document_id=? AND version=? AND content_base64 IS NOT NULL',d.document_id,d.document_version).first<Data>();
 insist(!doc.erased_at&&doc.current_version===d.document_version&&v,'The confirmed source must remain available and current',409);
 let previous:Data|null=null;
 if(b.previousDeadlineId){
  previous=await visibleDeadline(db,actor,text(b.previousDeadlineId,'Previous confirmed date',100));
  insist(previous.id!==d.id&&previous.matter_id===d.matter_id&&previous.confirmed_at&&previous.date!==d.date,'Choose a distinct previously confirmed date on this matter',409);
 }else{
  // Exact version supersession is retained by the document trigger. Titles never establish replacement.
  const candidates=await rows(db,`SELECT DISTINCT t.id FROM s_deadlines t JOIN s_deadline_events e ON e.deadline_id=t.id WHERE t.matter_id=? AND t.document_id=? AND t.id<>? AND t.confirmed_at IS NOT NULL AND t.date<>? AND e.action='supersede' AND json_extract(e.detail,'$.previousStatus')='confirmed' AND json_extract(e.detail,'$.replacementVersion')=? AND json_extract(e.detail,'$.erasedAt') IS NULL`,d.matter_id,d.document_id,d.id,d.date,d.document_version);
  if(candidates.length===1)previous=await visibleDeadline(db,actor,candidates[0].id);
 }
 const actions=await rows(db,`SELECT DISTINCT t.id,t.title,s.instructions FROM s_client_shares s JOIN s_tasks t ON t.id=s.record_id WHERE s.matter_id=? AND s.kind='task' AND s.revoked_at IS NULL AND t.status='open' AND t.deadline_id IS NULL AND EXISTS(SELECT 1 FROM s_portal_grants g WHERE g.matter_id=s.matter_id AND g.revoked_at IS NULL AND g.kind IN('client','co_client','delegate') AND NOT EXISTS(SELECT 1 FROM s_client_acks a WHERE a.share_id=s.id AND a.client_email=g.email AND a.kind='completed')) ORDER BY t.id`,d.matter_id);
 const profile=await stmt(db,'SELECT lawyer_email FROM s_matter_stage_profiles WHERE matter_id=?',d.matter_id).first<Data>();
 return {id:id(),matter_id:d.matter_id,deadline_id:d.id,previous_deadline_id:previous?.id??null,source_document_id:d.document_id,source_version:d.document_version,source_digest:v.sha256,source_revision:d.revision,source_citation:d.source,previous_date:previous?.date??null,new_date:d.date,title:previous?'A confirmed date has changed':'A date has been confirmed',body:(previous?`The previously confirmed date was ${previous.date}. The new confirmed date is ${d.date}.`:`The confirmed date is ${d.date}.`)+` Timezone: ${d.timezone}. Source: ${d.source}.`+(actions.length?'\n\nOutstanding client actions:\n'+actions.map(a=>a.title+': '+a.instructions).join('\n'):''),actions_json:JSON.stringify(actions),responsible_email:profile?.lawyer_email??actor.email,revision:id(),created_by:actor.email,created_at:now()} as Data;
}
function insertDraft(db:D1Database,actor:Actor,u:Data){
 const columns=Object.keys(u);
 return [...updateSourceGuards(db,actor,u),guard(db,'NOT EXISTS(SELECT 1 FROM s_matter_updates WHERE deadline_id=? AND source_revision=?)',u.deadline_id,u.source_revision),stmt(db,`INSERT INTO s_matter_updates(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`,...columns.map(k=>u[k])),audit(db,actor,'matter_update.drafted',u.id,JSON.stringify({deadlineId:u.deadline_id,previousDeadlineId:u.previous_deadline_id,sourceVersion:u.source_version}),{matterId:u.matter_id})];
}
// Called while preparing the deadline confirmation transaction. Guards execute after its confirmed-row update.
export async function confirmedMatterUpdateWrites(db:D1Database,actor:Actor,deadline:Data):Promise<D1PreparedStatement[]>{
 human(actor);need(actor,'owner','lawyer');const m=await matter(db,actor,deadline.matter_id);
 if(!deadline.document_id||m.lifecycle_status==='closed')return [];
 const packet=await draftPacket(db,actor,deadline);
 return insertDraft(db,actor,packet);
}
export async function generateMatterUpdate(db:D1Database,actor:Actor,matterId:string,b:Data){
 const deadline=await visibleDeadline(db,actor,text(b.deadlineId,'Confirmed deadline',100));
 insist(deadline.matter_id===matterId,'Deadline not found',404);
 return draftMatterUpdateForDeadline(db,actor,deadline.id,b);
}
export async function draftMatterUpdateForDeadline(db:D1Database,actor:Actor,deadlineId:string,b:Data={}){
 human(actor);need(actor,'owner','lawyer');const d=await visibleDeadline(db,actor,deadlineId);await matter(db,actor,d.matter_id);
 const packet=await draftPacket(db,actor,d,b),existing=await stmt(db,'SELECT * FROM s_matter_updates WHERE deadline_id=? AND source_revision=?',d.id,d.revision).first<Data>();
 if(existing){
  if(b.previousDeadlineId&&existing.previous_deadline_id!==packet.previous_deadline_id){
   insist(existing.status==='draft'&&!existing.previous_deadline_id,'The retained previous date cannot change after review or association',409);
   const revision=id(),body=`The previously confirmed date was ${packet.previous_date}. The new confirmed date is ${d.date}.\n\n`+existing.body;
   await atomic(db,actor,[...updateSourceGuards(db,actor,{...existing,previous_deadline_id:packet.previous_deadline_id}),guard(db,"EXISTS(SELECT 1 FROM s_matter_updates WHERE id=? AND status='draft' AND revision=? AND previous_deadline_id IS NULL)",existing.id,existing.revision),stmt(db,'UPDATE s_matter_updates SET previous_deadline_id=?,previous_date=?,title=?,body=?,revision=? WHERE id=?',packet.previous_deadline_id,packet.previous_date,'A confirmed date has changed',body,revision,existing.id),audit(db,actor,'matter_update.previous_date_linked',existing.id,JSON.stringify({previousDeadlineId:packet.previous_deadline_id,revision}),{matterId:d.matter_id})]);
   return {id:existing.id,revision};
  }
  return {id:existing.id,revision:existing.revision};
 }
 await atomic(db,actor,insertDraft(db,actor,packet));
 return {id:packet.id,revision:packet.revision};
}
