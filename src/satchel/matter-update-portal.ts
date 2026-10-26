import {atomic,audit,human,id,insist,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {portalAccess,readerKinds} from './portal';
import {guard} from './trust-guards';

function client(actor:Actor){human(actor);need(actor,'client');}
const published=`u.status='approved' AND EXISTS(SELECT 1 FROM s_matter_update_jobs j WHERE j.update_id=u.id AND j.recipient=? AND j.portal_published_at IS NOT NULL) AND ${portalAccess('u.matter_id',readerKinds)}`;
export async function listPortalMatterUpdates(db:D1Database,actor:Actor,matterId:string){
 client(actor);insist((await stmt(db,`SELECT ${portalAccess('?',readerKinds)} ok`,actor.email,matterId).first<Data>())?.ok,'Matter not found',404);
 const updates=await rows(db,`SELECT u.id,u.title,u.body,u.source_citation,u.previous_date,u.new_date,(SELECT portal_published_at FROM s_matter_update_jobs j WHERE j.update_id=u.id AND j.recipient=?) published_at FROM s_matter_updates u WHERE u.matter_id=? AND ${published} ORDER BY u.approved_at,u.id`,actor.email,matterId,actor.email,actor.email);
 const items=[];
 for(const u of updates){const [promises,replies]=await Promise.all([rows(db,'SELECT text,status FROM s_matter_update_promises WHERE update_id=? ORDER BY id',u.id),rows(db,'SELECT id,body,created_at,completed_at FROM s_matter_update_replies WHERE update_id=? AND recipient=? ORDER BY created_at,id',u.id,actor.email)]);items.push({id:u.id,title:u.title,body:u.body,sourceCitation:u.source_citation,previousDate:u.previous_date,newDate:u.new_date,publishedAt:u.published_at,promises,replies:replies.map(r=>({id:r.id,body:r.body,createdAt:r.created_at,completedAt:r.completed_at}))});}
 return {updates:items};
}
export async function replyToMatterUpdate(db:D1Database,actor:Actor,updateId:string,b:Data){
 client(actor);const u=await stmt(db,`SELECT u.* FROM s_matter_updates u WHERE u.id=? AND ${published}`,updateId,actor.email,actor.email).first<Data>();insist(u,'Published update not found',404);
 const body=text(b.body,'Reply',10000),replyId=id();
 // Every reply creates fresh responsible work. Reading it, or completing an older reply, cannot close it.
 await atomic(db,actor,[guard(db,`EXISTS(SELECT 1 FROM s_matter_updates u WHERE u.id=? AND ${published})`,u.id,actor.email,actor.email),stmt(db,'INSERT INTO s_matter_update_replies(id,update_id,recipient,body,responsible_email,created_at) VALUES(?,?,?,?,?,?)',replyId,u.id,actor.email,body,u.responsible_email,now()),audit(db,actor,'matter_update.client_replied',replyId,JSON.stringify({updateId:u.id,responsibleEmail:u.responsible_email}),{matterId:u.matter_id})]);
 return {id:replyId};
}
