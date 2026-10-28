import type {Bindings} from '../auth.server';
import {atomic,audit,id,insist,now,rows,stmt,type Actor,type Data} from './model';
import {eligible,fences,sendCorrespondence} from './correspondence';
import {guard} from './trust-guards';
import {currentUpdateCounsel,responsibleUpdateCounsel,updateAuthorityGuards} from './matter-update-authority';

// All scheduled message kinds share one recipient budget, including unknown attempts.
export function updateContactCapGuard(db:D1Database,recipient:string,maxContacts:number,atMs:number){
 return guard(db,`(SELECT COUNT(*) FROM s_correspondence_attempts a JOIN s_correspondence m ON m.id=a.correspondence_id WHERE m.recipient=? AND a.attempted_at IS NOT NULL AND a.attempted_at>? AND (EXISTS(SELECT 1 FROM s_client_reminder_jobs r WHERE r.correspondence_id=m.id) OR EXISTS(SELECT 1 FROM s_matter_update_jobs u WHERE u.correspondence_id=m.id) OR EXISTS(SELECT 1 FROM s_collection_attempts c WHERE c.correspondence_id=m.id)))<?`,recipient,new Date(atMs-7*86400000).toISOString(),maxContacts);
}
export async function matterUpdateSendGuards(db:D1Database,actor:Actor,attempt:Data,atMs:number){
 const job=await stmt(db,'SELECT * FROM s_matter_update_jobs WHERE correspondence_id=?',attempt.correspondence_id).first<Data>();if(!job)return [];
 const u=await stmt(db,'SELECT * FROM s_matter_updates WHERE id=?',job.update_id).first<Data>();insist(u,'Approved update unavailable',409);
 await responsibleUpdateCounsel(db,actor,u.matter_id);const current=await currentUpdateCounsel(db,u);
 insist(current.id===actor.id&&u.approved_by===actor.email,'Only the approving responsible counsel may make another delivery decision',403);
 insist(Date.parse(job.due_at)<=atMs,'Wait until the exact approved scheduled instant',409);
 insist(job.status!=='paused','Reopen this matter and explicitly resume its schedule first',409);
 return [...updateAuthorityGuards(db,actor,u),guard(db,"EXISTS(SELECT 1 FROM s_matter_update_jobs WHERE id=? AND status<>'paused')",job.id),guard(db,'EXISTS(SELECT 1 FROM s_matter_update_recipients WHERE update_id=? AND email=?)',u.id,job.recipient),updateContactCapGuard(db,job.recipient,u.max_contacts,atMs)];
}
export async function runMatterUpdates(env:Bindings,atMs:number){
 const db=env.DB,due=await rows(db,"SELECT * FROM s_matter_update_jobs WHERE status IN('queued','prepared') AND due_at<=? ORDER BY due_at,id LIMIT 100",new Date(atMs).toISOString());
 for(const j of due){
  try{
   const u=await stmt(db,'SELECT * FROM s_matter_updates WHERE id=?',j.update_id).first<Data>();insist(u?.status==='approved','An exact approved update is required',409);
   const actor=await currentUpdateCounsel(db,u);
   if(j.status==='queued'){
    const m:Data={id:id(),matter_id:u.matter_id,recipient:j.recipient},revision=await eligible(db,actor,m),attempt=id(),at=now();
    await atomic(db,actor,[...updateAuthorityGuards(db,actor,u),...fences(db,actor,m,revision),updateContactCapGuard(db,j.recipient,u.max_contacts,atMs),guard(db,"EXISTS(SELECT 1 FROM s_matter_update_jobs WHERE id=? AND status='queued')",j.id),stmt(db,'INSERT INTO s_correspondence VALUES(?,?,?,?,?,?,?,?,?,?,?)',m.id,u.matter_id,j.recipient,u.title,u.body,null,null,revision,actor.email,u.approved_at,'Approved matter update '+u.id+'; revision '+u.revision+'; '+u.review_note),stmt(db,'INSERT INTO s_correspondence_attempts(id,correspondence_id,decision_by,decision_at,decision_note,contact_revision) VALUES(?,?,?,?,?,?)',attempt,m.id,actor.email,u.approved_at,'Exact approved update '+u.id+'; revision '+u.revision+'; due '+j.due_at,revision),stmt(db,"UPDATE s_matter_update_jobs SET status='prepared',correspondence_id=?,attempt_id=?,portal_published_at=? WHERE id=?",m.id,attempt,new Date(atMs).toISOString(),j.id),audit(db,actor,'matter_update.portal_published',u.id,JSON.stringify({recipient:j.recipient,revision:u.revision,attempt,dueAt:j.due_at,publishedAt:at}),{matterId:u.matter_id})]);
    j.attempt_id=attempt;j.status='prepared';
   }
   // A persisted attempted state is terminal for automation, even after a worker restart.
   const attempt=await stmt(db,'SELECT status FROM s_correspondence_attempts WHERE id=?',j.attempt_id).first<Data>();
   if(attempt?.status==='ready')await sendCorrespondence(env,actor,j.attempt_id,atMs);
   await stmt(db,"UPDATE s_matter_update_jobs SET status='finished',detail='Scheduled processing complete; inspect email outcome separately' WHERE id=? AND status='prepared'",j.id).run();
  }catch(error){
   // A competing worker that lost the claim must not cancel the winner's prepared job.
   await stmt(db,"UPDATE s_matter_update_jobs SET status='stopped',detail=? WHERE id=? AND status=?",String(error instanceof Error?error.message:'Scheduled update stopped').slice(0,1000),j.id,j.status).run();
  }
 }
 return {processed:due.length};
}
