// MATTER-005: notes, calls and client commitments on a matter. Reads go through matter(), so assignment, custom roles
// and ethical walls apply first; a private note is then returned to its author alone, whatever the reader's role.
import {atomic,audit,human,id,insist,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {matterGuard} from './documents';
import {attendable} from './appointments';
export const noteKinds=['note','call','commitment'] as const;
export const noteJson=(n:Data)=>({id:n.id,matterId:n.matter_id,kind:n.kind,title:n.title,body:n.body,visibility:n.visibility,clientVisible:Boolean(n.client_visible),occurredAt:n.occurred_at,mentions:JSON.parse(n.mentions) as string[],corrects:n.corrects,author:n.author_email,createdAt:n.created_at});
// Rows a reader may see on a matter they already see: team entries, plus their own private ones.
export const readableNotes=(alias='n')=>`(${alias}.visibility='team' OR ${alias}.author_email=?)`;
export async function addNote(db:D1Database,actor:Actor,matterId:string,body:Data) {
 human(actor);need(actor,'owner','lawyer','assistant');const m=await matter(db,actor,matterId);
 const kind=String(body.kind??'note');insist((noteKinds as readonly string[]).includes(kind),'Choose a note, call or client commitment');
 const visibility=body.visibility==='private'?'private':body.visibility==='team'?'team':null;insist(visibility,'Choose private or team visibility');
 const clientVisible=body.clientVisible===true;
 insist(!clientVisible||(visibility==='team'&&actor.role!=='assistant'),'Only the principal or a lawyer shares a team entry with the client');
 insist(kind!=='commitment'||visibility==='team','A client commitment is a team entry');
 const mentions=[...new Set((Array.isArray(body.mentions)?body.mentions:[]).map((e:unknown)=>text(e,'Mention',254).toLowerCase()))];
 insist(mentions.length<=20,'Mention at most 20 people');insist(visibility==='team'||mentions.length===0,'A private note mentions no one');
 for(const email of mentions)insist(await stmt(db,`SELECT ${attendable()} ok`,email,m.id).first<Data>().then(r=>r?.ok),`${email} cannot see this matter; grant matter access before mentioning them`);
 const corrects=body.corrects?text(body.corrects,'Corrected entry',100):null;
 if(corrects)insist(await stmt(db,`SELECT 1 FROM s_matter_notes n WHERE n.id=? AND n.matter_id=? AND ${readableNotes()}`,corrects,m.id,actor.email).first(),'Entry not found',404);
 const noteId=id(),at=now(),occurred=body.occurredAt===undefined?at:text(body.occurredAt,'When it happened',40);
 insist(Number.isFinite(Date.parse(occurred))&&new Date(occurred).toISOString()===occurred,'Use a UTC time such as 2026-10-23T14:00:00.000Z');
 const fences=mentions.flatMap(email=>{const f=id();return [stmt(db,`INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN ${attendable()} THEN 1 ELSE 0 END`,f,email,m.id),stmt(db,'DELETE FROM s_guard WHERE id=?',f)];});
 await atomic(db,actor,[...matterGuard(db,actor,m.id),...fences,
  stmt(db,'INSERT INTO s_matter_notes(id,matter_id,kind,title,body,visibility,client_visible,occurred_at,mentions,corrects,author_email,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',noteId,m.id,kind,text(body.title,'Title',200),text(body.body,'Text',20000),visibility,clientVisible?1:0,occurred,JSON.stringify(mentions),corrects,actor.email,at),
  // Private entries leave no readable detail in the shared audit trail.
  audit(db,actor,'matter.note_added',noteId,JSON.stringify({kind,visibility,clientVisible,mentions,corrects}),{matterId:m.id})]);
 return noteJson((await stmt(db,'SELECT * FROM s_matter_notes WHERE id=?',noteId).first<Data>())!);
}
export async function notesOf(db:D1Database,actor:Actor,matterId:string) {
 const m=await matter(db,actor,matterId);
 return (await rows(db,`SELECT n.* FROM s_matter_notes n WHERE n.matter_id=? AND ${readableNotes()} ORDER BY n.occurred_at DESC,n.id`,m.id,actor.email)).map(noteJson);
}
