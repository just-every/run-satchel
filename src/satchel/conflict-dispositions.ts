import {contactState} from './contact-read';
import {contactMatches} from './contact-graph';
import {recordedConflict} from './conflict-context';
import {atomic,audit,digest,human,id,insist,need,now,rows,stmt,text,type Actor,type Data} from './model';

async function ownSearch(db:D1Database,actor:Actor,searchId:string){
 need(actor,'owner','lawyer');const s=await stmt(db,'SELECT * FROM s_conflicts WHERE id=? AND actor=?',searchId,actor.email).first<Data>();
 insist(s,'Conflict search not found',404);return s;
}
async function routes(db:D1Database,actor:Actor,s:Data){
 const visible=await recordedConflict(db,actor,s),found=new Map<string,Data>();
 for(const m of JSON.parse(visible.matches))if(m.restricted)for(const r of m.custodianRoutes??[])found.set(r.route,{route:r.route,custodian:r.custodian});
 return {search:visible,routes:[...found.values()]};
}
const latestReview=(db:D1Database,s:string)=>stmt(db,'SELECT * FROM s_conflict_reviews WHERE search_id=? ORDER BY sequence DESC LIMIT 1',s).first<Data>();
const latestDecision=(db:D1Database,r:string)=>stmt(db,'SELECT * FROM s_conflict_referral_decisions WHERE referral_id=? ORDER BY sequence DESC LIMIT 1',r).first<Data>();
async function publicReview(db:D1Database,r:Data|null){
 return r?{...r,restrictions:JSON.parse(r.restrictions),waiver:r.waiver_id?await stmt(db,'SELECT id,name,mime,size,sha256 FROM s_conflict_waivers WHERE id=?',r.waiver_id).first<Data>():null}:null;
}
function disposition(b:Data){
 insist(b.decision==='cleared'||b.decision==='declined','Choose cleared or declined');
 text(b.note,'Counsel disposition',10000);return {decision:b.decision as 'cleared'|'declined',note:b.note as string};
}
async function waiver(db:D1Database,actor:Actor,searchId:string,wallId:string|null,b:Data|undefined){
 if(b===undefined)return {id:null,writes:[] as D1PreparedStatement[]};
 insist(b&&typeof b==='object','Supply an original waiver file');text(b.name,'Waiver filename',240);text(b.mime,'Waiver media type',200);
 insist(!/[\x00-\x1f\x7f]/.test(b.name)&&/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(b.mime),'Use a valid filename and media type');
 insist(typeof b.contentBase64==='string'&&b.contentBase64.length<=6990508&&b.contentBase64.length%4===0&&/^[A-Za-z0-9+/]*={0,2}$/.test(b.contentBase64),'Supply a base64 original file up to 5 MB');
 const bytes=Uint8Array.from(atob(b.contentBase64),c=>c.charCodeAt(0));insist(bytes.length>0&&bytes.length<=5242880,'Waiver must be between 1 byte and 5 MB');
 const fileId=id(),writes=[stmt(db,'INSERT INTO s_conflict_waivers VALUES(?,?,?,?,?,?,?,?,?)',fileId,searchId,wallId,b.name,b.mime,bytes.length,await digest(bytes),actor.email,now())];
 for(let offset=0;offset<b.contentBase64.length;offset+=524288)writes.push(stmt(db,'INSERT INTO s_conflict_waiver_chunks VALUES(?,?,?)',fileId,offset/524288,b.contentBase64.slice(offset,offset+524288)));
 return {id:fileId,writes};
}
export async function conflictReview(db:D1Database,actor:Actor,searchId:string){
 const s=await ownSearch(db,actor,searchId),visible=await routes(db,actor,s);
 return {...visible,review:await publicReview(db,await latestReview(db,s.id)),history:await Promise.all((await rows(db,'SELECT * FROM s_conflict_reviews WHERE search_id=? ORDER BY sequence',s.id)).map(r=>publicReview(db,r)))};
}
export async function saveConflictReview(db:D1Database,actor:Actor,searchId:string,b:Data){
 human(actor);const s=await ownSearch(db,actor,searchId),d=disposition(b);
 insist(Array.isArray(b.restrictions)&&b.restrictions.length<=100,'Record an engagement restrictions list');
 const restrictions=b.restrictions.map((v:unknown)=>text(v,'Engagement restriction',2000)),file=await waiver(db,actor,s.id,null,b.waiver),reviewId=id();
 await atomic(db,actor,[...file.writes,stmt(db,'INSERT INTO s_conflict_reviews SELECT ?,?,?,?,?,?,?,?,COALESCE(MAX(sequence),0)+1 FROM s_conflict_reviews WHERE search_id=?',reviewId,s.id,actor.email,d.decision,d.note,JSON.stringify(restrictions),file.id,now(),s.id),audit(db,actor,'conflict.disposition_recorded',reviewId,JSON.stringify({searchId:s.id,decision:d.decision,note:d.note,restrictions,waiverId:file.id}))]);
 return publicReview(db,(await stmt(db,'SELECT * FROM s_conflict_reviews WHERE id=?',reviewId).first<Data>())!);
}
export async function routeConflictMatch(db:D1Database,actor:Actor,searchId:string,b:Data){
 human(actor);const s=await ownSearch(db,actor,searchId),wallId=text(b.wallId,'Custodian route'),visible=await routes(db,actor,s);
 insist(visible.routes.some(r=>r.route===wallId),'Custodian route not found',404);
 const w=await stmt(db,'SELECT * FROM s_ethical_walls WHERE id=?',wallId).first<Data>();insist(w,'Custodian route not found',404);
 const existing=await stmt(db,'SELECT id FROM s_conflict_referrals WHERE search_id=? AND wall_id=?',s.id,w.id).first<Data>();
 if(existing)return {id:existing.id,searchId:s.id,wallId:w.id,custodian:w.custodian_email};
 const referralId=id(),fence=id();await atomic(db,actor,[stmt(db,'INSERT INTO s_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM s_ethical_walls WHERE id=? AND revision=?) THEN 1 ELSE 0 END)',fence,w.id,w.revision),stmt(db,'INSERT INTO s_conflict_referrals VALUES(?,?,?,?,?)',referralId,s.id,w.id,actor.email,now()),audit(db,actor,'conflict.custodian_referred',referralId,JSON.stringify({searchId:s.id,wallId:w.id,matterId:w.matter_id})),stmt(db,'DELETE FROM s_guard WHERE id=?',fence)]);
 return {id:referralId,searchId:s.id,wallId:w.id,custodian:w.custodian_email};
}
export async function listConflictReferrals(db:D1Database,actor:Actor){
 human(actor);need(actor,'owner','lawyer');
 const referrals=await rows(db,'SELECT r.*,w.custodian_email,w.matter_id,w.revision,c.client,c.adverse,c.queries FROM s_conflict_referrals r JOIN s_ethical_walls w ON w.id=r.wall_id JOIN s_conflicts c ON c.id=r.search_id WHERE r.requester_email=? OR w.custodian_email=? ORDER BY r.created_at DESC,r.id',actor.email,actor.email);
 return {own:referrals.filter(r=>r.requester_email===actor.email).map(r=>({id:r.id,searchId:r.search_id,wallId:r.wall_id,custodian:r.custodian_email})),custodian:await Promise.all(referrals.filter(r=>r.custodian_email===actor.email).map(async r=>{
  const d=await latestDecision(db,r.id),graph=await contactState(db,actor),queries=JSON.parse(r.queries) as string[];const matches=graph.contacts.filter(c=>c.matterRoles.some((role:Data)=>role.matter_id===r.matter_id)&&queries.some(q=>contactMatches(c,q,graph.contacts))).map(c=>({id:c.id,name:c.name,aliases:c.aliases,matterRoles:c.matterRoles,classifications:c.classifications}));return {matches,id:r.id,searchId:r.search_id,wallId:r.wall_id,matterId:r.matter_id,wallRevision:r.revision,requester:r.requester_email,client:r.client,adverse:r.adverse,status:d&&d.wall_revision===r.revision?d.decision:'pending',decision:d,waiver:d?.waiver_id?await stmt(db,'SELECT id,name,mime,size,sha256 FROM s_conflict_waivers WHERE id=?',d.waiver_id).first<Data>():null};
 }))};
}
export async function decideConflictReferral(db:D1Database,actor:Actor,referralId:string,b:Data){
 human(actor);need(actor,'owner','lawyer');
 const r=await stmt(db,'SELECT r.*,w.revision,w.matter_id FROM s_conflict_referrals r JOIN s_ethical_walls w ON w.id=r.wall_id AND w.custodian_email=? WHERE r.id=?',actor.email,referralId).first<Data>();insist(r,'Custodian referral not found',404);
 const d=disposition(b);insist(b.restrictions===undefined||(Array.isArray(b.restrictions)&&b.restrictions.length===0),'Restricted clearance must be unconditional; otherwise decline');
 const file=await waiver(db,actor,r.search_id,r.wall_id,b.waiver),decisionId=id(),fence=id();
 await atomic(db,actor,[stmt(db,'INSERT INTO s_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM s_ethical_walls WHERE id=? AND revision=? AND custodian_email=?) THEN 1 ELSE 0 END)',fence,r.wall_id,r.revision,actor.email),...file.writes,stmt(db,'INSERT INTO s_conflict_referral_decisions SELECT ?,?,?,?,?,?,?,?,COALESCE(MAX(sequence),0)+1 FROM s_conflict_referral_decisions WHERE referral_id=?',decisionId,r.id,r.revision,d.decision,d.note,file.id,actor.email,now(),r.id),audit(db,actor,'conflict.custodian_decided',decisionId,JSON.stringify({referralId:r.id,searchId:r.search_id,wallId:r.wall_id,matterId:r.matter_id,wallRevision:r.revision,decision:d.decision,note:d.note,waiverId:file.id})),stmt(db,'DELETE FROM s_guard WHERE id=?',fence)]);
 return {id:decisionId,referralId:r.id,decision:d.decision};
}
export async function waiverFile(db:D1Database,actor:Actor,waiverId:string){
 human(actor);need(actor,'owner','lawyer');
 const access=`((f.wall_id IS NULL AND EXISTS(SELECT 1 FROM s_conflict_reviews r JOIN s_conflicts c ON c.id=r.search_id WHERE r.waiver_id=f.id AND r.actor=? AND c.actor=?)) OR (f.wall_id IS NOT NULL AND EXISTS(SELECT 1 FROM s_ethical_walls w WHERE w.id=f.wall_id AND w.custodian_email=?)))`;
 const f=await stmt(db,`SELECT f.* FROM s_conflict_waivers f WHERE f.id=? AND ${access}`,waiverId,actor.email,actor.email,actor.email).first<Data>();insist(f,'Waiver not found',404);
 const chunks=await rows(db,'SELECT content_base64 FROM s_conflict_waiver_chunks WHERE waiver_id=? ORDER BY position',f.id),bytes=Uint8Array.from(atob(chunks.map(c=>c.content_base64).join('')),c=>c.charCodeAt(0));insist(bytes.length===f.size&&await digest(bytes)===f.sha256,'Original waiver failed its integrity check',503);
 const w=f.wall_id?await stmt(db,'SELECT matter_id FROM s_ethical_walls WHERE id=?',f.wall_id).first<Data>():null,fence=id();
 await atomic(db,actor,[stmt(db,`INSERT INTO s_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM s_conflict_waivers f WHERE f.id=? AND ${access}) THEN 1 ELSE 0 END)`,fence,f.id,actor.email,actor.email,actor.email),audit(db,actor,'conflict.waiver_downloaded',f.id,JSON.stringify({searchId:f.search_id,matterId:w?.matter_id??null,sha256:f.sha256})),stmt(db,'DELETE FROM s_guard WHERE id=?',fence)]);
 return new Response(bytes,{headers:{'content-type':f.mime,'content-disposition':`attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"sandbox; default-src 'none'",'x-satchel-original-sha256':f.sha256}});
}
export async function gateEngagement(db:D1Database,actor:Actor,search:Data){
 const s=await ownSearch(db,actor,search.id),r=await latestReview(db,s.id),visible=await routes(db,actor,s);
 insist(r?.decision!=='declined','Counsel declined this engagement',409);
 if(visible.routes.length)insist(r?.decision==='cleared','Record counsel disposition before opening this engagement',409);
 for(const route of visible.routes){
  const d=await stmt(db,'SELECT d.decision,d.wall_revision,w.revision FROM s_ethical_walls w LEFT JOIN s_conflict_referrals r ON r.wall_id=w.id AND r.search_id=? LEFT JOIN s_conflict_referral_decisions d ON d.id=(SELECT id FROM s_conflict_referral_decisions WHERE referral_id=r.id ORDER BY sequence DESC LIMIT 1) WHERE w.id=?',s.id,route.route).first<Data>();
  insist(d?.decision==='cleared'&&d.wall_revision===d.revision,'Custodian clearance is required before opening this engagement',409);
 }
 return {reviewId:r?.id??null,restrictions:r?JSON.parse(r.restrictions) as string[]:[] as string[]};
}

export async function savedConflictSearches(db:D1Database,actor:Actor){human(actor);need(actor,'owner','lawyer');return {searches:await rows(db,'SELECT id,client,adverse,at FROM s_conflicts WHERE actor=? ORDER BY at DESC,id',actor.email)};}
