import {rows,stmt,type Actor,type Data} from './model';

// These are associations recorded at search time, not a legal conclusion that
// representation ended. Only an explicit client role receives a client label.
export async function conflictContext(db:D1Database,actor:Actor,contacts:Data[]){
 const result=await db.batch([
  stmt(db,'SELECT timezone FROM s_firm WHERE id=1'),
  stmt(db,`SELECT m.id,m.title,m.matter_number,m.lifecycle_status,e.at closed_at
   FROM s_matters m LEFT JOIN s_matter_lifecycle_events e
    ON e.matter_id=m.id AND e.revision=m.lifecycle_revision AND e.kind='closed'
   WHERE ?='owner' OR EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=m.id AND a.email=?)`,actor.role,actor.email),
 ]);
 const timezone=(result[0].results[0] as Data|undefined)?.timezone??'UTC';
 const matters=new Map((result[1].results as Data[]).map(m=>[m.id,m]));
 const year=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric'});
 const context=(contact:Data)=>contact.matterRoles.flatMap((r:Data)=>{
  const m=matters.get(r.matter_id);if(!m)return [];
  return [{matterId:m.id,role:r.role,title:m.title,number:m.matter_number,status:m.lifecycle_status,
   closedAt:m.closed_at??null,closedYear:m.closed_at?year.format(new Date(m.closed_at)):null,
   classification:r.role==='client'?(m.lifecycle_status==='closed'?'former_client':'current_client'):null}];
 });
 return {summary:{searchedContacts:contacts.length,searchedIdentities:contacts.reduce((n,c)=>n+c.identityIds.length,0),timezone},context};
}

// Preserve the recorded evidence in storage; each read intersects its matter
// associations with current grants, including access removed after the search.
export async function recordedConflict(db:D1Database,actor:Actor,conflict:Data){
 const permitted=new Set((await rows(db,"SELECT id FROM s_matters WHERE ?='owner' OR EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=s_matters.id AND a.email=?)",actor.role,actor.email)).map(m=>m.id));
 const matches=(JSON.parse(conflict.matches) as Data[]).map(c=>{
  const matterRoles=(c.matterRoles??[]).filter((r:Data)=>permitted.has(r.matter_id));
  return {...c,matterRoles,matter_ids:matterRoles.map((r:Data)=>r.matter_id).join(','),
   ...(c.matterContext?{matterContext:c.matterContext.filter((m:Data)=>permitted.has(m.matterId))}:{})};
 });
 return {...conflict,matches:JSON.stringify(matches)};
}
