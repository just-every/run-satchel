import {human,matter,need,rows,stmt,type Actor,type Data} from './model';
import {documentAccess,visibleDocument} from './documents';

export async function matterUpdateState(db:D1Database,actor:Actor,matterId:string){
 human(actor);need(actor,'owner','lawyer','assistant');await matter(db,actor,matterId);const access=documentAccess(actor);
 const candidates=await rows(db,`SELECT u.* FROM s_matter_updates u JOIN s_documents d ON d.id=u.source_document_id WHERE u.matter_id=? AND ${access.sql} AND (u.previous_deadline_id IS NULL OR EXISTS(SELECT 1 FROM s_deadlines p LEFT JOIN s_documents d ON d.id=p.document_id WHERE p.id=u.previous_deadline_id AND (p.document_id IS NULL OR (${access.sql})))) ORDER BY u.created_at DESC,u.id`,matterId,...access.params,...access.params);
 const updates:Data[]=[];
 for(const u of candidates){
  const [recipients,promises,jobs,replies]=await Promise.all([rows(db,'SELECT email FROM s_matter_update_recipients WHERE update_id=? ORDER BY email',u.id),rows(db,'SELECT * FROM s_matter_update_promises WHERE update_id=? ORDER BY id',u.id),rows(db,'SELECT * FROM s_matter_update_jobs WHERE update_id=? ORDER BY recipient',u.id),rows(db,'SELECT * FROM s_matter_update_replies WHERE update_id=? ORDER BY created_at,id',u.id)]);
  let permitted=true;for(const promise of promises)if(promise.fulfilled_document_id){try{await visibleDocument(db,actor,promise.fulfilled_document_id);}catch(error){if((error as {status?:number}).status!==404)throw error;permitted=false;break;}}if(!permitted)continue;
  for(const j of jobs){
   const a=j.correspondence_id?await stmt(db,'SELECT * FROM s_correspondence_attempts WHERE correspondence_id=? ORDER BY decision_at DESC,rowid DESC LIMIT 1',j.correspondence_id).first<Data>():null;
   if(a){const events=await rows(db,'SELECT * FROM s_correspondence_events WHERE attempt_id=? ORDER BY observed_at,id',a.id),outcomes=events.map(e=>e.status);j.attempt_id=a.id;j.mail_status=a.status;j.mail_outcome=outcomes.includes('complained')?'complained':outcomes.includes('bounced')?'bounced':outcomes.includes('delivered')?'delivered':events.at(-1)?.status??(a.status==='sending'?'uncertain':a.status);j.mail_detail=a.detail;}
   else{j.mail_status='not_prepared';j.mail_outcome='not_prepared';}
  }
  updates.push(u);u.recipients=recipients.map(r=>r.email);u.promises=promises;u.jobs=jobs;u.replies=replies;u.outstandingActions=JSON.parse(u.actions_json);
 }
 return {updates,followups:updates.flatMap(u=>u.replies.filter((r:Data)=>!r.completed_at).map((r:Data)=>({...r,title:u.title})))};
}
