import {gateEngagement} from './conflict-dispositions';
import {matterScope,wallAllows} from './matter-scope';
import {contactData} from './contact-data';
import {contactGraph} from './contact-graph';
import {opaqueMatches} from './contact-walls';
import {contactState} from './contact-read';
import {contactMatches} from './contact-graph';
import {conflictContext,recordedConflict} from './conflict-context';
import { matterIdentity } from './numbering';
// Party identity/association and parameterized search adapted from MIT run-orbit
// src/core/features/records/repository.ts @ 38cef87571a413802dbaa7aa6afbab332d8cd778.
import { firmSettings } from './firm';
import { proposeRuns } from './workflow-runs';
import { atomic, audit, human, id, insist, matter, need, now, rows, stmt, text, type Actor, type Data } from './model';
export async function conflictSearch(db: D1Database, actor: Actor, body: Data) {
 human(actor);need(actor,'owner','lawyer');
 const client=text(body.client,'Client',200), adverse=text(body.adverse,'Adverse party',200);
 const aliases=typeof body.aliases==='string'?body.aliases.trim().slice(0,1000):'';
 const queries=[client,adverse,...aliases.split(';').map(v=>v.trim()).filter(Boolean)];
 // Scan every party, including aliases. There is no hidden first-page result cap.
 // This is a firm-record search, not a guarantee that conflicts do not exist.
 const graph=contactGraph(await contactData(db));
 const {summary,context}=await conflictContext(db,actor,graph.contacts);
 const scoped=await contactState(db,actor);
 const rawMatches=graph.contacts.filter(p=>{const safe=scoped.contacts.find(c=>c.id===p.id);return queries.some(q=>contactMatches(safe??p,q,safe?scoped.contacts:graph.contacts));}).map(p=>{const safe=scoped.contacts.find(c=>c.id===p.id)??p;return {...safe,aliases:safe.aliases.join('; '),matter_ids:safe.matterRoles.map((r:Data)=>r.matter_id).join(','),matterContext:context(p)};});
 const matches=await opaqueMatches(db,actor,rawMatches);
 const conflict={id:id(),client,adverse,queries,matches,...summary,partyRevision:graph.revision,actor:actor.email,at:now()};
 const routeSources:D1PreparedStatement[]=[];const matchMatters=[...new Set(rawMatches.flatMap(c=>graph.contacts.find(p=>p.id===c.id)?.matterRoles.map((r:Data)=>r.matter_id)??[]))];
 for(const match of matches)if(match.restricted)for(const route of match.custodianRoutes){if(route.route==='principal')continue;for(const w of await rows(db,`SELECT w.id FROM s_ethical_walls w WHERE w.custodian_email=? AND w.matter_id IN (SELECT value FROM json_each(?)) AND NOT ${wallAllows('w.matter_id','?')}`,route.custodian,JSON.stringify(matchMatters),actor.email,actor.email))routeSources.push(stmt(db,'INSERT INTO s_conflict_route_sources VALUES(?,?,?)',conflict.id,route.route,w.id));}
 await atomic(db,actor,[stmt(db,'INSERT INTO s_conflicts(id,client,adverse,queries,matches,party_revision,actor,at,search_summary) VALUES(?,?,?,?,?,?,?,?,?)',conflict.id,client,adverse,JSON.stringify(queries),JSON.stringify(matches),conflict.partyRevision,actor.email,conflict.at,JSON.stringify(summary)),...routeSources,audit(db,actor,'conflict.searched',conflict.id)]);
 return conflict;
}
export async function openMatter(db: D1Database, actor: Actor, body: Data, fixedId?: string, imported?: {number:string;statements:D1PreparedStatement[]}) {
 human(actor); need(actor,'owner','lawyer');
 const title=text(body.title,'Matter title',200), note=text(body.reviewNote,'Conflict review conclusion',2000);
 insist(body.confirmed===true,'Confirm that you reviewed the search and are authorized to open this matter');
 const conflict=await stmt(db,'SELECT * FROM s_conflicts WHERE id=? AND actor=?',text(body.conflictId,'Conflict search'),actor.email).first<Data>();
 insist(conflict,'Run and review a conflict search first',404);
 const clearance=await gateEngagement(db,actor,conflict);insist(!clearance.restrictions.length||body.restrictionsAcknowledged===true,'Acknowledge the recorded engagement restrictions before opening',409);
 const matterId=fixedId??actor.approval?.resultId??id(), time=now();
 const identity=await matterIdentity(db,body,conflict.client,!!imported);const dispositionId=clearance.reviewId??id();
 const statements=[...clearance.guards,stmt(db,'INSERT INTO s_guard VALUES(?,CASE WHEN (SELECT id FROM s_conflict_reviews WHERE search_id=? ORDER BY sequence DESC LIMIT 1) IS ? THEN 1 ELSE 0 END)','conflict-review:'+matterId,conflict.id,clearance.reviewId),stmt(db,'DELETE FROM s_guard WHERE id=?','conflict-review:'+matterId),...(!clearance.reviewId?[stmt(db,'INSERT INTO s_conflict_reviews(id,search_id,actor,decision,note,restrictions,waiver_id,created_at,sequence) VALUES(?,?,?,?,?,?,?,?,1)',dispositionId,conflict.id,actor.email,'cleared',note,'[]',null,time),audit(db,actor,'conflict.disposition_recorded',dispositionId,JSON.stringify({searchId:conflict.id,decision:'cleared',note,restrictions:[]}))]:[]),stmt(db,'INSERT INTO s_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM s_number_settings WHERE id=1 AND revision=?) THEN 1 ELSE 0 END)', 'number:'+matterId,identity.settingsRevision),stmt(db,'DELETE FROM s_guard WHERE id=?','number:'+matterId),stmt(db,'INSERT OR IGNORE INTO s_number_clients(client_key,number) VALUES(?,?)',identity.clientKey,identity.clientNumber),stmt(db,"UPDATE s_number_clients SET number=printf('%04d',id) WHERE client_key=? AND number IS NULL",identity.clientKey),
 stmt(db,'INSERT INTO s_guard VALUES(?,CASE WHEN ? IS NULL OR EXISTS(SELECT 1 FROM s_number_clients WHERE client_key=? AND number=?) THEN 1 ELSE 0 END)',matterId,identity.clientNumber,identity.clientKey,identity.clientNumber),
 stmt(db,'INSERT INTO s_matters(id,title,client,adverse,conflict_id,review_note,opened_by,opened_at,matter_number,client_number,practice_code) VALUES(?,?,?,?,?,?,?,?,?,(SELECT number FROM s_number_clients WHERE client_key=?),?)',matterId,title,conflict.client,conflict.adverse,conflict.id,note,actor.email,time,imported?.number??null,identity.clientKey,identity.practice),stmt(db,'DELETE FROM s_guard WHERE id=?',matterId),stmt(db,'INSERT INTO s_matter_access VALUES(?,?)',matterId,actor.email),...(imported?.statements??[])];
 // Existing exact identities are reused so imported-party undo sees native use.
 for(const [name,relation] of [[conflict.client,'client'],[conflict.adverse,'adverse']]) {
  const old=await stmt(db,'SELECT id FROM s_parties WHERE lower(name)=lower(?) ORDER BY id LIMIT 1',name).first<{id:string}>(), partyId=old?.id??id();
  if(!old) statements.push(stmt(db,"INSERT INTO s_parties VALUES(?,?,?,'','native',?)",partyId,name,'',id()));
  statements.push(stmt(db,'INSERT OR IGNORE INTO s_matter_parties VALUES(?,?,?)',matterId,partyId,relation));
 }
 for(const email of clearance.excludedStaff)statements.push(stmt(db,'DELETE FROM s_matter_access WHERE matter_id=? AND email=?',matterId,email),stmt(db,'INSERT INTO s_matter_exclusions(matter_id,email,restriction,recorded_by,at) VALUES(?,?,?,?,?)',matterId,email,clearance.restrictions.join('; '),actor.email,time));
 if(clearance.screenCustodian){const wallId=id(),revision=id();statements.push(stmt(db,'INSERT INTO s_ethical_walls VALUES(?,?,?,?,?,?,?)',wallId,matterId,clearance.screenCustodian,revision,clearance.restrictions.join('; '),actor.email,time),stmt(db,'INSERT INTO s_wall_members VALUES(?,?)',matterId,clearance.screenCustodian),stmt(db,'INSERT OR IGNORE INTO s_matter_access VALUES(?,?)',matterId,clearance.screenCustodian),...(!clearance.excludedStaff.includes(actor.email)&&actor.email!==clearance.screenCustodian?[stmt(db,'INSERT INTO s_wall_members VALUES(?,?)',matterId,actor.email)]:[]),audit(db,actor,'wall.created',wallId,JSON.stringify({custodian:clearance.screenCustodian,reason:clearance.restrictions.join('; ')}),{matterId,revision}));}
 statements.push(stmt(db,'INSERT INTO s_matter_conflict_terms VALUES(?,?,?,?,?)',matterId,dispositionId,JSON.stringify(clearance.restrictions),actor.email,time));
 statements.push(audit(db,actor,'matter.opened',matterId,`Conflict ${conflict.id}; ${note}`));
 // MATTER-004: opening after conflict review ends intake; imported matters propose nothing.
 if(!imported)statements.push(...await proposeRuns(db,actor,matterId,'opening',null,time));
 await atomic(db,actor,statements); return (await stmt(db,'SELECT *,matter_number AS number FROM s_matters WHERE id=?',matterId).first<Data>())!;
}
export async function workspace(db: D1Database, actor: Actor) {
 const matters=await rows(db,`SELECT m.* FROM s_matters m WHERE ${matterScope('m.id',actor.channel==='agent'?"'agent'":"'person'")} ORDER BY opened_at DESC`,actor.role,actor.email);
 const members=await rows(db,'SELECT email,name,role,active FROM s_members ORDER BY name');
 const proposals=await rows(db,`SELECT p.* FROM s_proposals p WHERE p.for_email=? AND (json_extract(p.payload,'$.matterId') IS NULL OR ${matterScope("json_extract(p.payload,'$.matterId')",actor.channel==='agent'?"'agent'":"'person'")}) ORDER BY created_at DESC`,actor.email,actor.role,actor.email);
 return {actor,matters,members,proposals:proposals.map(p=>({...p,payload:JSON.parse(p.payload)})),firm:(await firmSettings(db)).settings};
}
export async function matterDetail(db: D1Database, actor: Actor, matterId: string) {
 const m=await matter(db,actor,matterId);
 const conflict=(await stmt(db,'SELECT * FROM s_conflicts WHERE id=?',m.conflict_id).first<Data>())!;
 const terms=await stmt(db,'SELECT * FROM s_matter_conflict_terms WHERE matter_id=?',matterId).first<Data>();
 return {matter:m,exclusions:await rows(db,'SELECT * FROM s_matter_exclusions WHERE matter_id=? AND released_at IS NULL',matterId),conflictTerms:terms?{...terms,restrictions:JSON.parse(terms.restrictions)}:null,conflict:await recordedConflict(db,actor,conflict),access:await rows(db,'SELECT email FROM s_matter_access WHERE matter_id=?',matterId)};
}
export async function grantMatter(db:D1Database,actor:Actor,matterId:string,body:Data) {
 human(actor); need(actor,'owner'); await matter(db,actor,matterId);
 const wall=await stmt(db,'SELECT custodian_email FROM s_ethical_walls WHERE matter_id=?',matterId).first<Data>();
 insist(!wall||wall.custodian_email===actor.email,'Only the custodian may change walled matter access',403);
 const email=text(body.email,'Team member email',254).toLowerCase();
 if(!body.remove){const excluded=await stmt(db,'SELECT restriction FROM s_matter_exclusions WHERE matter_id=? AND email=? AND released_at IS NULL',matterId,email).first<Data>();insist(!excluded,'Engagement restriction: '+excluded?.restriction,409);}
 insist(await stmt(db,"SELECT 1 FROM s_members WHERE email=? AND active=1",email).first(),'Add this person to the firm first');
 await atomic(db,actor,[body.remove?stmt(db,'DELETE FROM s_matter_access WHERE matter_id=? AND email=?',matterId,email):stmt(db,'INSERT OR IGNORE INTO s_matter_access VALUES(?,?)',matterId,email),audit(db,actor,body.remove?'matter.access_removed':'matter.access_granted',matterId,email)]);
 return {ok:true};
}
