// Party identity/association and parameterized search adapted from MIT run-orbit
// src/core/features/records/repository.ts @ 38cef87571a413802dbaa7aa6afbab332d8cd778.
import { firmSettings } from './firm';
import { atomic, audit, human, id, insist, matter, need, now, rows, stmt, text, type Actor, type Data } from './model';
export async function conflictSearch(db: D1Database, actor: Actor, body: Data) {
 need(actor,'owner','lawyer');
 const client=text(body.client,'Client',200), adverse=text(body.adverse,'Adverse party',200);
 const aliases=typeof body.aliases==='string'?body.aliases.trim().slice(0,1000):'';
 const queries=[client,adverse,...aliases.split(';').map(v=>v.trim()).filter(Boolean)];
 // Scan every party, including aliases. There is no hidden first-page result cap.
 // This is a firm-record search, not a guarantee that conflicts do not exist.
 const result=await db.batch([stmt(db,'SELECT party_revision FROM s_meta WHERE id=1'),stmt(db,'SELECT p.*,group_concat(mp.matter_id) matter_ids FROM s_parties p LEFT JOIN s_matter_parties mp ON mp.party_id=p.id GROUP BY p.id ORDER BY p.name')]);
 const normal=(v:string)=>v.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const matches=result[1].results.filter((p:any)=>queries.some(q=>normal(q).split(' ').filter(Boolean).some(t=>normal(`${p.name} ${p.aliases}`).split(' ').some(w=>w.startsWith(t)))));
 const conflict={id:id(),client,adverse,queries,matches,partyRevision:(result[0].results[0] as any).party_revision,actor:actor.email,at:now()};
 await atomic(db,actor,[stmt(db,'INSERT INTO s_conflicts VALUES(?,?,?,?,?,?,?,?)',conflict.id,client,adverse,JSON.stringify(queries),JSON.stringify(matches),conflict.partyRevision,actor.email,conflict.at),audit(db,actor,'conflict.searched',conflict.id)]);
 return conflict;
}
export async function openMatter(db: D1Database, actor: Actor, body: Data, fixedId?: string) {
 human(actor); need(actor,'owner','lawyer');
 const title=text(body.title,'Matter title',200), note=text(body.reviewNote,'Conflict review conclusion',2000);
 insist(body.confirmed===true,'Confirm that you reviewed the search and are authorized to open this matter');
 const conflict=await stmt(db,'SELECT * FROM s_conflicts WHERE id=? AND actor=?',text(body.conflictId,'Conflict search'),actor.email).first<Data>();
 insist(conflict,'Run and review a conflict search first',404);
 const matterId=fixedId??actor.approval?.resultId??id(), time=now();
 const statements=[stmt(db,'INSERT INTO s_matters VALUES(?,?,?,?,?,?,?,?)',matterId,title,conflict.client,conflict.adverse,conflict.id,note,actor.email,time),stmt(db,'INSERT INTO s_matter_access VALUES(?,?)',matterId,actor.email)];
 // Existing exact identities are reused so imported-party undo sees native use.
 for(const [name,relation] of [[conflict.client,'client'],[conflict.adverse,'adverse']]) {
  const old=await stmt(db,'SELECT id FROM s_parties WHERE lower(name)=lower(?) ORDER BY id LIMIT 1',name).first<{id:string}>(), partyId=old?.id??id();
  if(!old) statements.push(stmt(db,"INSERT INTO s_parties VALUES(?,?,?,'','native',?)",partyId,name,'',id()));
  statements.push(stmt(db,'INSERT OR IGNORE INTO s_matter_parties VALUES(?,?,?)',matterId,partyId,relation));
 }
 statements.push(audit(db,actor,'matter.opened',matterId,`Conflict ${conflict.id}; ${note}`));
 await atomic(db,actor,statements); return {id:matterId,title,client:conflict.client,adverse:conflict.adverse};
}
export async function workspace(db: D1Database, actor: Actor) {
 const matters=await rows(db,"SELECT m.* FROM s_matters m WHERE ?='owner' OR EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=m.id AND a.email=?) ORDER BY opened_at DESC",actor.role,actor.email);
 const members=await rows(db,'SELECT email,name,role,active FROM s_members ORDER BY name');
 const proposals=await rows(db,'SELECT * FROM s_proposals WHERE for_email=? ORDER BY created_at DESC',actor.email);
 return {actor,matters,members,proposals:proposals.map(p=>({...p,payload:JSON.parse(p.payload)})),firm:(await firmSettings(db)).settings};
}
export async function matterDetail(db: D1Database, actor: Actor, matterId: string) {
 const m=await matter(db,actor,matterId);
 return {matter:m,conflict:await stmt(db,'SELECT * FROM s_conflicts WHERE id=?',m.conflict_id).first(),access:await rows(db,'SELECT email FROM s_matter_access WHERE matter_id=?',matterId)};
}
export async function grantMatter(db:D1Database,actor:Actor,matterId:string,body:Data) {
 human(actor); need(actor,'owner'); await matter(db,actor,matterId);
 const email=text(body.email,'Team member email',254).toLowerCase();
 insist(await stmt(db,"SELECT 1 FROM s_members WHERE email=? AND active=1",email).first(),'Add this person to the firm first');
 await atomic(db,actor,[body.remove?stmt(db,'DELETE FROM s_matter_access WHERE matter_id=? AND email=?',matterId,email):stmt(db,'INSERT OR IGNORE INTO s_matter_access VALUES(?,?)',matterId,email),audit(db,actor,body.remove?'matter.access_removed':'matter.access_granted',matterId,email)]);
 return {ok:true};
}
