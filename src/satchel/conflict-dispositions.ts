import {matterScope} from './matter-scope';
import {routeAuthority} from './conflict-routes';
import {contactState} from './contact-read';
import {contactMatches} from './contact-graph';
import {recordedConflict} from './conflict-context';
import {atomic,audit,date,digest,human,id,insist,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';

async function ownSearch(db:D1Database,actor:Actor,searchId:string){
 human(actor);need(actor,'owner','lawyer');const s=await stmt(db,`SELECT c.* FROM s_conflicts c WHERE c.id=? AND c.actor=? AND NOT EXISTS(SELECT 1 FROM s_matters m WHERE m.conflict_id=c.id AND NOT ${matterScope('m.id')})`,searchId,actor.email,actor.role,actor.email).first<Data>();
 insist(s,'Conflict search not found',404);return s;
}
async function routes(db:D1Database,actor:Actor,s:Data){
 const visible=await recordedConflict(db,actor,s),found=new Map<string,Data>();
 for(const m of JSON.parse(visible.matches))if(m.restricted)for(const r of m.custodianRoutes??[])found.set(r.route,r);
 return {search:visible,routes:[...found.values()]};
}
const latestReview=(db:D1Database,s:string)=>stmt(db,'SELECT * FROM s_conflict_reviews WHERE search_id=? ORDER BY sequence DESC LIMIT 1',s).first<Data>();
const latestDecision=(db:D1Database,r:string)=>stmt(db,'SELECT * FROM s_conflict_route_decisions WHERE referral_id=? ORDER BY sequence DESC LIMIT 1',r).first<Data>();
async function waiverInfo(db:D1Database,waiverId:string|null){return waiverId?await stmt(db,'SELECT f.id,f.name,f.mime,f.size,f.sha256,d.* FROM s_conflict_waivers f LEFT JOIN s_conflict_waiver_details d ON d.waiver_id=f.id WHERE f.id=?',waiverId).first<Data>():null;}
async function publicReview(db:D1Database,r:Data|null,actor:Actor){
 if(r?.waiver_id&&await stmt(db,`SELECT 1 FROM s_conflict_waiver_matters wm WHERE wm.waiver_id=? AND NOT ${matterScope('wm.matter_id')}`,r.waiver_id,actor.role,actor.email).first())return {...r,note:'Restricted counsel evidence: ask its custodian',restrictions:[],excludedStaff:[],waiver:null};
 return r?{...r,decision:r.disposition??(r.decision==='declined'?'decline':'no_conflict'),restrictions:JSON.parse(r.restrictions),excludedStaff:JSON.parse(r.excluded_staff),waiver:await waiverInfo(db,r.waiver_id)}:null;}
async function disposition(db:D1Database,b:Data){
 insist(['no_conflict','waiver_recorded','restrictions','decline'].includes(b.decision),'Choose no conflict, waivable with waiver recorded, proceed with restrictions, or decline');
 const note=text(b.note,'Counsel disposition',10000);insist(Array.isArray(b.restrictions??[])&&(b.restrictions??[]).length<=100,'Record an engagement restrictions list');
 const restrictions=(b.restrictions??[]).map((v:unknown)=>text(v,'Disclosed engagement restriction',2000));
 insist(Array.isArray(b.excludedStaff??[])&&(b.excludedStaff??[]).length<=200,'Choose excluded staff');
 const excludedStaff=[...new Set<string>((b.excludedStaff??[]).map((v:unknown)=>text(v,'Excluded staff email',254).toLowerCase()))];
 for(const e of excludedStaff)insist(await stmt(db,"SELECT 1 FROM s_members WHERE email=? AND active=1 UNION SELECT 1 FROM oa_operators WHERE email=? AND role='owner' AND status='active'",e,e).first(),'Exclude active firm staff only');
 const screenCustodian=b.screenCustodian?text(b.screenCustodian,'Screen custodian',254).toLowerCase():null;
 if(screenCustodian)insist(!excludedStaff.includes(screenCustodian)&&await stmt(db,"SELECT 1 FROM s_members WHERE email=? AND active=1 AND role='lawyer' UNION SELECT 1 FROM oa_operators WHERE email=? AND role='owner' AND status='active'",screenCustodian,screenCustodian).first(),'The screen custodian must be active counsel inside the screen');
 const principalExcluded=!!await stmt(db,"SELECT 1 FROM oa_operators WHERE role='owner' AND email IN (SELECT value FROM json_each(?))",JSON.stringify(excludedStaff)).first();
 insist(!principalExcluded||screenCustodian,'Excluding the principal requires a screen and its inside custodian');
 insist(!excludedStaff.length&&!screenCustodian||restrictions.length,'Write the disclosed restriction that excludes staff or requires a screen');
 insist(b.decision!=='restrictions'||restrictions.length,'Proceed with restrictions needs disclosed condition text');
 return {decision:b.decision as string,note,restrictions,excludedStaff,screenCustodian};
}
async function waiver(db:D1Database,actor:Actor,s:Data,wallId:string[]|null,b:Data|undefined){
 if(b===undefined)return {id:null,writes:[] as D1PreparedStatement[]};
 insist(b&&typeof b==='object','Record the waiver evidence');
 const scope=text(b.scope,'Waiver scope',4000),waiverDate=date(b.date),matchId=text(b.matchId,'Waiver match',150);
 const graph=await contactState(db,actor),match=graph.contacts.find(c=>c.identityIds.includes(matchId));
 insist(match&&JSON.parse(s.queries).some((q:string)=>contactMatches(match,q,graph.contacts)),'Waiver must answer a matching contact',409);
 if(wallId?.length)insist(match.matterRoles.some((r:Data)=>wallId.includes(r.matter_id)),'Waiver must answer this restricted match',409);
 insist(Array.isArray(b.parties)&&b.parties.length>0&&b.parties.length<=100,'Record the waiving client contacts');
 const parties=[...new Set<string>(b.parties.map((v:unknown)=>text(v,'Waiving client contact',150)))];
 const affected=new Set(match.matterRoles.map((r:Data)=>r.matter_id));
 for(const p of parties)insist(graph.contacts.some(c=>c.identityIds.includes(p)&&c.matterRoles.some((r:Data)=>r.role==='client'&&affected.has(r.matter_id))),'Every waiving contact must hold a client role on the affected matter',409);
 const confirmation=b.confirmation?text(b.confirmation,'Written waiver confirmation',10000):'';
 insist(b.contentBase64||confirmation,'Supply an original file or written confirmation');
 const name=b.contentBase64?text(b.name,'Waiver filename',240):'written-confirmation.txt',mime=b.contentBase64?text(b.mime,'Waiver media type',200):'text/plain';
 insist(!/[\x00-\x1f\x7f]/.test(name)&&/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(mime),'Use a valid filename and media type');
 const contentBase64=b.contentBase64??btoa(unescape(encodeURIComponent(confirmation)));
 insist(typeof contentBase64==='string'&&contentBase64.length<=6990508&&contentBase64.length%4===0&&/^[A-Za-z0-9+/]*={0,2}$/.test(contentBase64),'Supply a base64 original file up to 5 MB');
 const bytes=Uint8Array.from(atob(contentBase64),c=>c.charCodeAt(0));insist(bytes.length>0&&bytes.length<=5242880,'Waiver must be between 1 byte and 5 MB');
 const fileId=id(),wall=wallId?.length?await stmt(db,'SELECT id FROM s_ethical_walls WHERE matter_id=?',wallId[0]).first<Data>():null;
 const writes=[stmt(db,'INSERT INTO s_conflict_waivers VALUES(?,?,?,?,?,?,?,?,?)',fileId,s.id,wall?.id??null,name,mime,bytes.length,await digest(bytes),actor.email,now()),stmt(db,'INSERT INTO s_conflict_waiver_details VALUES(?,?,?,?,?,?,?)',fileId,JSON.stringify(parties),waiverDate,scope,matchId,confirmation,'practitioner-recorded, not signed through Satchel')];
 writes.push(...([...affected] as string[]).map(matterId=>stmt(db,'INSERT INTO s_conflict_waiver_matters VALUES(?,?)',fileId,matterId)),audit(db,actor,'conflict.waiver_recorded',fileId,JSON.stringify({searchId:s.id,sha256:await digest(bytes),label:'practitioner-recorded, not signed through Satchel'}),{matterId:wallId?.[0]??null}));
 for(let offset=0;offset<contentBase64.length;offset+=524288)writes.push(stmt(db,'INSERT INTO s_conflict_waiver_chunks VALUES(?,?,?)',fileId,offset/524288,contentBase64.slice(offset,offset+524288)));
 return {id:fileId,writes};
}
export async function conflictReview(db:D1Database,actor:Actor,searchId:string){
 const s=await ownSearch(db,actor,searchId),visible=await routes(db,actor,s);
 return {...visible,review:await publicReview(db,await latestReview(db,s.id),actor),history:await Promise.all((await rows(db,'SELECT * FROM s_conflict_reviews WHERE search_id=? ORDER BY sequence',s.id)).map(r=>publicReview(db,r,actor)))};
}
export async function saveConflictReview(db:D1Database,actor:Actor,searchId:string,b:Data){
 const s=await ownSearch(db,actor,searchId),d=await disposition(db,b),file=await waiver(db,actor,s,null,b.waiver),reviewId=id();
 insist(d.decision!=='waiver_recorded'||file.id,'A waivable match requires its recorded waiver',409);
 await atomic(db,actor,[...file.writes,stmt(db,'INSERT INTO s_conflict_reviews(id,search_id,actor,decision,note,restrictions,waiver_id,created_at,sequence,disposition,excluded_staff,screen_custodian) SELECT ?,?,?,?,?,?,?,?,COALESCE(MAX(sequence),0)+1,?,?,? FROM s_conflict_reviews WHERE search_id=?',reviewId,s.id,actor.email,d.decision==='decline'?'declined':'cleared',d.note,JSON.stringify(d.restrictions),file.id,now(),d.decision,JSON.stringify(d.excludedStaff),d.screenCustodian,s.id),audit(db,actor,'conflict.disposition_recorded',reviewId,JSON.stringify({searchId:s.id,...d,waiverId:file.id}))]);
 return publicReview(db,(await stmt(db,'SELECT * FROM s_conflict_reviews WHERE id=?',reviewId).first<Data>())!,actor);
}
export async function routeConflictMatch(db:D1Database,actor:Actor,searchId:string,b:Data){
 const s=await ownSearch(db,actor,searchId),routeId=text(b.wallId,'Custodian route'),visible=await routes(db,actor,s);
 insist(visible.routes.some(r=>r.route===routeId),'Custodian route not found',404);
 const w=await routeAuthority(db,routeId,s.party_revision);insist(w.custodian_email,"custodian unassigned: ask the wall's counsel",409);
 const existing=await stmt(db,'SELECT id FROM s_conflict_routes WHERE search_id=? AND route_id=?',s.id,routeId).first<Data>();
 if(existing)return {id:existing.id,searchId:s.id,wallId:routeId,custodian:w.custodian_email};
 const referralId=id();await atomic(db,actor,[stmt(db,'INSERT INTO s_conflict_routes VALUES(?,?,?,?,?)',referralId,s.id,routeId,actor.email,now()),audit(db,actor,'conflict.custodian_referred',referralId,JSON.stringify({searchId:s.id,routeId}),{matterId:w.matter_id})]);
 return {id:referralId,searchId:s.id,wallId:routeId,custodian:w.custodian_email};
}
export async function listConflictReferrals(db:D1Database,actor:Actor){
 human(actor);need(actor,'owner','lawyer');const own:Data[]=[],custodian:Data[]=[];
 for(const r of await rows(db,'SELECT r.*,c.client,c.adverse,c.queries,c.party_revision FROM s_conflict_routes r JOIN s_conflicts c ON c.id=r.search_id ORDER BY r.created_at DESC,r.id')){
  const w=await routeAuthority(db,r.route_id,r.party_revision),d=await latestDecision(db,r.id),current=d?.revision===w.revision;
  if(r.requester_email===actor.email)own.push({id:r.id,searchId:r.search_id,wallId:r.route_id,custodian:w.custodian_email,status:current?d!.decision:'pending',at:current?d!.created_at:null,restrictions:current?JSON.parse(d!.restrictions):[]});
  if(w.custodian_email===actor.email){
   const sourceMatters=await rows(db,'SELECT w.matter_id FROM s_conflict_route_sources rs JOIN s_ethical_walls w ON w.id=rs.wall_id WHERE rs.search_id=? AND rs.route_id=?',r.search_id,r.route_id);
   const graph=await contactState(db,actor),queries=JSON.parse(r.queries) as string[],matches=graph.contacts.filter(c=>(!w.matter_id||c.matterRoles.some((role:Data)=>sourceMatters.length?sourceMatters.some(s=>s.matter_id===role.matter_id):role.matter_id===w.matter_id))&&queries.some(q=>contactMatches(c,q,graph.contacts)));
   custodian.push({matches,restrictions:d?JSON.parse(d.restrictions):[],id:r.id,searchId:r.search_id,wallId:r.route_id,matterId:w.matter_id,wallRevision:w.revision,requester:r.requester_email,client:r.client,adverse:r.adverse,status:current?d!.decision:'pending',decision:d,waiver:await waiverInfo(db,d?.waiver_id)});
  }
 }
 return {own,custodian};
}
export async function decideConflictReferral(db:D1Database,actor:Actor,referralId:string,b:Data){
 human(actor);need(actor,'owner','lawyer');const r=await stmt(db,'SELECT r.*,c.party_revision,c.queries FROM s_conflict_routes r JOIN s_conflicts c ON c.id=r.search_id WHERE r.id=?',referralId).first<Data>();insist(r,'Custodian referral not found',404);
 const w=await routeAuthority(db,r.route_id,r.party_revision);insist(w.custodian_email===actor.email,'Custodian referral not found',404);
 const sourceMatters=await rows(db,'SELECT w.matter_id FROM s_conflict_route_sources rs JOIN s_ethical_walls w ON w.id=rs.wall_id WHERE rs.search_id=? AND rs.route_id=?',r.search_id,r.route_id);
 const d=await disposition(db,b),s={id:r.search_id,queries:r.queries},file=await waiver(db,actor,s,w.matter_id?(sourceMatters.length?sourceMatters.map(m=>m.matter_id):[w.matter_id]):null,b.waiver),decisionId=id();
 insist(d.decision!=='waiver_recorded'||file.id,'A waivable restricted match requires its recorded waiver',409);
 const fence=id();await atomic(db,actor,[...(w.matter_id?[stmt(db,'INSERT INTO s_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM s_ethical_walls w JOIN s_wall_members m ON m.matter_id=w.matter_id AND m.email=w.custodian_email WHERE w.id=? AND w.revision=? AND w.custodian_email=?) THEN 1 ELSE 0 END)',fence,w.id,w.revision,actor.email)]:[stmt(db,"INSERT INTO s_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE email=? AND role='owner' AND status='active') THEN 1 ELSE 0 END)",fence,actor.email)]),...file.writes,stmt(db,'INSERT INTO s_conflict_route_decisions SELECT ?,?,?,?,?,?,?,?,?,?,?,COALESCE(MAX(sequence),0)+1 FROM s_conflict_route_decisions WHERE referral_id=?',decisionId,r.id,w.revision,d.decision,d.note,JSON.stringify(d.restrictions),JSON.stringify(d.excludedStaff),d.screenCustodian,file.id,actor.email,now(),r.id),audit(db,actor,'conflict.custodian_decided',decisionId,JSON.stringify({referralId:r.id,searchId:r.search_id,...d,waiverId:file.id}),{matterId:w.matter_id,revision:w.revision}),stmt(db,'DELETE FROM s_guard WHERE id=?',fence)]);
 return {id:decisionId,referralId:r.id,decision:d.decision};
}
export async function waiverFile(db:D1Database,actor:Actor,waiverId:string){
 human(actor);need(actor,'owner','lawyer');const f=await stmt(db,'SELECT * FROM s_conflict_waivers WHERE id=?',waiverId).first<Data>();insist(f&&!await stmt(db,'SELECT 1 FROM s_conflict_disposals WHERE waiver_id=?',waiverId).first(),'Waiver not found',404);
 const route=await stmt(db,'SELECT r.route_id,c.party_revision FROM s_conflict_route_decisions d JOIN s_conflict_routes r ON r.id=d.referral_id JOIN s_conflicts c ON c.id=r.search_id WHERE d.waiver_id=?',f.id).first<Data>();
 if(route)insist((await routeAuthority(db,route.route_id,route.party_revision)).custodian_email===actor.email,'Waiver not found',404);else{insist(f.created_by===actor.email,'Waiver not found',404);await ownSearch(db,actor,f.search_id);}
 insist(!await stmt(db,`SELECT 1 FROM s_conflict_waiver_matters wm WHERE wm.waiver_id=? AND NOT ${matterScope('wm.matter_id')}`,f.id,actor.role,actor.email).first(),'Waiver not found',404);
 if(route)insist(!await stmt(db,'SELECT 1 FROM s_ethical_walls w JOIN s_conflict_waiver_matters wm ON wm.matter_id=w.matter_id WHERE wm.waiver_id=? AND w.custodian_email<>?',f.id,actor.email).first(),'Waiver not found',404);
 const graph=await contactState(db,actor),details=await waiverInfo(db,f.id);insist(!details?.match_id||graph.contacts.some(c=>c.identityIds.includes(details.match_id)),'Waiver not found',404);
 const chunks=await rows(db,'SELECT content_base64 FROM s_conflict_waiver_chunks WHERE waiver_id=? ORDER BY position',f.id),bytes=Uint8Array.from(atob(chunks.map(c=>c.content_base64).join('')),c=>c.charCodeAt(0));insist(bytes.length===f.size&&await digest(bytes)===f.sha256,'Original waiver failed its integrity check',503);
 await atomic(db,actor,[audit(db,actor,'conflict.waiver_downloaded',f.id,JSON.stringify({searchId:f.search_id,sha256:f.sha256}))]);
 return new Response(bytes,{headers:{'content-type':f.mime,'content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'",'x-satchel-original-sha256':f.sha256}});
}
export async function gateEngagement(db:D1Database,actor:Actor,search:Data){
 const s=await ownSearch(db,actor,search.id),r=await latestReview(db,s.id),visible=await routes(db,actor,s),restrictions:string[]=r?JSON.parse(r.restrictions):[],excludedStaff:string[]=r?JSON.parse(r.excluded_staff):[],guards:D1PreparedStatement[]=[],screens:string[]=r?.screen_custodian?[r.screen_custodian]:[];
 insist((await stmt(db,'SELECT party_revision FROM s_meta WHERE id=1').first<Data>())?.party_revision===s.party_revision,'Party changes made every disposition stale; run a new search',409);
 insist(r?.disposition!=='decline'&&r?.decision!=='declined','Counsel declined this engagement',409);
 if(r?.disposition==='waiver_recorded')insist(r.waiver_id&&!await stmt(db,'SELECT 1 FROM s_conflict_disposals WHERE waiver_id=?',r.waiver_id).first(),'The recorded waiver was disposed',409);
 if(visible.routes.length)insist(r,'Record counsel disposition before opening this engagement',409);
 for(const route of visible.routes){
  const w=await routeAuthority(db,route.route,s.party_revision),referral=await stmt(db,'SELECT id FROM s_conflict_routes WHERE search_id=? AND route_id=?',s.id,route.route).first<Data>(),d=referral?await latestDecision(db,referral.id):null;
  insist(w.custodian_email&&d&&d.decision!=='decline'&&d.revision===w.revision,'A current custodian disposition is required before opening this engagement',409);
  insist(d.decision!=='waiver_recorded'||d.waiver_id&&!await stmt(db,'SELECT 1 FROM s_conflict_disposals WHERE waiver_id=?',d.waiver_id).first(),'A waivable restricted match requires its waiver',409);
  restrictions.push(...JSON.parse(d.restrictions));excludedStaff.push(...JSON.parse(d.excluded_staff));if(d.screen_custodian)screens.push(d.screen_custodian);
  const fence=id();guards.push(stmt(db,'INSERT INTO s_guard VALUES(?,CASE WHEN (SELECT id FROM s_conflict_route_decisions WHERE referral_id=? ORDER BY sequence DESC LIMIT 1)=? THEN 1 ELSE 0 END)',fence,referral!.id,d.id),stmt(db,'DELETE FROM s_guard WHERE id=?',fence));
 }
 insist(new Set(screens).size<=1,'Counsel must reconcile conflicting screen custodians',409);
 return {reviewId:r?.id??null,restrictions:[...new Set(restrictions)],excludedStaff:[...new Set(excludedStaff)],screenCustodian:screens[0]??null,guards};
}
export async function removeEngagementExclusion(db:D1Database,actor:Actor,matterId:string,b:Data){
 human(actor);need(actor,'owner','lawyer');await matter(db,actor,matterId);const email=text(b.email,'Excluded staff email',254),reason=text(b.reason,'Removal reason',2000);
 const e=await stmt(db,'SELECT * FROM s_matter_exclusions WHERE matter_id=? AND email=? AND released_at IS NULL',matterId,email).first<Data>();insist(e,'Active restriction not found',404);
 await atomic(db,actor,[stmt(db,'UPDATE s_matter_exclusions SET released_by=?,released_at=?,release_reason=? WHERE matter_id=? AND email=? AND released_at IS NULL',actor.email,now(),reason,matterId,email),audit(db,actor,'conflict.restriction_removed',matterId,JSON.stringify({email,reason}),{matterId})]);return {ok:true};
}
export async function savedConflictSearches(db:D1Database,actor:Actor){human(actor);need(actor,'owner','lawyer');return {searches:await rows(db,`SELECT c.id,c.client,c.adverse,c.at FROM s_conflicts c WHERE c.actor=? AND NOT EXISTS(SELECT 1 FROM s_matters m WHERE m.conflict_id=c.id AND NOT ${matterScope('m.id')}) ORDER BY c.at DESC,c.id`,actor.email,actor.role,actor.email)};}
