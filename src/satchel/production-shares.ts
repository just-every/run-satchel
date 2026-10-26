import {operatorAuth,runtimeBindings,type Bindings} from '../auth.server';
import type {Session} from '../modules/operator-auth/index.mjs';
import {decode,documentGuard,matterGuard,visibleDocument} from './documents';
import {matterScope} from './matter-scope';
import {atomic,audit,digest,Fault,human,id,insist,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';

function principal(actor:Actor){human(actor);need(actor,'owner');}
function fence(db:D1Database,sql:string,...args:any[]){const key=id();return [stmt(db,`INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN (${sql}) THEN 1 ELSE 0 END`,key,...args),stmt(db,'DELETE FROM s_guard WHERE id=?',key)];}
// All active labels must already travel inside the immutable packet. A later
// hold requires preparation and approval of a new packet before external use.
const holdsMatch=`NOT EXISTS(SELECT 1 FROM s_production_sources ps JOIN s_holds h ON h.released_at IS NULL AND (h.document_id=ps.document_id OR (h.matter_id=p.matter_id AND h.document_id IS NULL)) WHERE ps.production_id=p.id AND NOT EXISTS(SELECT 1 FROM json_each(p.snapshot,'$.items') item,json_each(item.value,'$.holds') label WHERE json_extract(item.value,'$.documentId')=ps.document_id AND json_extract(label.value,'$.id')=h.id AND json_extract(label.value,'$.reason')=h.reason AND json_extract(label.value,'$.placed_at')=h.placed_at))`;
async function packet(db:D1Database,actor:Actor,productionId:string){
 human(actor);need(actor,'owner','lawyer');
 const p=await stmt(db,'SELECT * FROM s_document_productions WHERE id=?',productionId).first<Data>();
 insist(p,'Production not found',404);await matter(db,actor,p.matter_id);
 const documents:Data[]=[];
 for(const link of await rows(db,'SELECT document_id FROM s_production_sources WHERE production_id=?',p.id)){
  const document=await visibleDocument(db,actor,link.document_id);insist(!document.erased_at,'Production not found',404);documents.push(document);
 }
 return {p,documents};
}
function shareJson(s:Data){return {id:s.id,productionId:s.production_id,sha256:s.packet_sha256,recipientEmail:s.recipient_email,authorizedBy:s.authorized_by,authorizedAt:s.authorized_at,expiresAt:s.expires_at,openedAt:s.opened_at,recalledAt:s.recalled_at,recalledBy:s.recalled_by,recallReason:s.recall_reason,status:s.recalled_at?'recalled':s.expires_at<=now()?'expired':s.opened_at?'opened':'unopened',recipientPath:'/production/'+s.id};}
export async function listProductionShares(db:D1Database,actor:Actor,productionId:string){
 await packet(db,actor,productionId);
 const result=[];
 for(const share of await rows(db,'SELECT * FROM s_production_shares WHERE production_id=? ORDER BY authorized_at DESC,id',productionId)){
  result.push({...shareJson(share),receipts:await rows(db,'SELECT id,sha256,size,served_at AS servedAt FROM s_production_delivery_receipts WHERE share_id=? ORDER BY served_at,id',share.id)});
 }
 return result;
}
export async function releaseProduction(db:D1Database,actor:Actor,productionId:string,body:Data){
 principal(actor);const {p,documents}=await packet(db,actor,productionId);
 insist(p.status==='approved'&&p.artifact_base64&&p.snapshot,'Approve the exact packet before releasing it',409);
 insist(body.sha256===p.sha256,'Authorize the exact approved packet hash',409);
 const recipientEmail=text(body.recipientEmail,'Authenticated recipient email',240).toLowerCase(),snapshot=JSON.parse(p.snapshot);
 insist(recipientEmail===snapshot.recipient.email,'Release only to the recipient named in this packet',409);
 const recipient=await stmt(db,"SELECT id,email,status,version FROM oa_operators WHERE email=? AND status IN ('active','invited')",recipientEmail).first<Data>();
 insist(recipient,'The principal must invite this recipient through account invitations before release',409);
 const owner=await stmt(db,"SELECT version FROM oa_operators WHERE id=? AND email=? AND role='owner' AND status='active'",actor.id,actor.email).first<Data>();
 insist(owner,'Only the active principal can authorize a release',403);
 const expiresAt=text(body.expiresAt,'Release expiry',40),expiry=new Date(expiresAt),at=now();
 insist(Number.isFinite(expiry.getTime())&&expiry.toISOString()===expiresAt&&expiresAt>at,'Choose a future expiry as an ISO timestamp');
 const reason=text(body.reason,'Release authorization note',2000),shareId=id(),bytes=decode(p.artifact_base64);
 insist(bytes.length===p.size&&await digest(bytes)===p.sha256,'Production failed its integrity check',503);
 insist(await stmt(db,`SELECT id FROM s_document_productions p WHERE p.id=? AND ${holdsMatch}`,p.id).first(),'A hold label changed. Prepare and approve a new packet.',409);
 await atomic(db,actor,[...matterGuard(db,actor,p.matter_id),...documents.flatMap(d=>documentGuard(db,actor,d)),
  ...fence(db,`EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND email=? AND role='owner' AND status='active' AND version=?)`,actor.id,actor.email,owner.version),
  ...fence(db,`EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND email=? AND status IN ('active','invited') AND version=?)`,recipient.id,recipientEmail,recipient.version),
  ...fence(db,`EXISTS(SELECT 1 FROM s_document_productions p WHERE p.id=? AND p.status='approved' AND p.sha256=? AND p.artifact_base64=? AND p.snapshot=? AND ? > strftime('%Y-%m-%dT%H:%M:%fZ','now') AND ${holdsMatch})`,p.id,p.sha256,p.artifact_base64,p.snapshot,expiresAt),
  stmt(db,'INSERT INTO s_production_shares(id,production_id,packet_sha256,recipient_id,recipient_email,authorized_by_id,authorized_by,authorizer_version,authorized_at,expires_at,reason) VALUES(?,?,?,?,?,?,?,?,?,?,?)',shareId,p.id,p.sha256,recipient.id,recipientEmail,actor.id,actor.email,owner.version,at,expiresAt,reason),
  audit(db,actor,'production.share_released',p.id,JSON.stringify({matterId:p.matter_id,shareId,sha256:p.sha256,recipientId:recipient.id,recipientEmail,expiresAt,reason}),{matterId:p.matter_id,shareId,sha256:p.sha256})]);
 return shareJson((await stmt(db,'SELECT * FROM s_production_shares WHERE id=?',shareId).first<Data>())!);
}
export async function inviteProductionRecipient(request:Request,original:Bindings,actor:Actor,productionId:string){
 principal(actor);const env=runtimeBindings(original),db=env.DB,{p,documents}=await packet(db,actor,productionId);
 insist(p.status==='approved'&&p.snapshot&&p.artifact_base64,'Approve the packet before inviting its recipient',409);
 const recipient=JSON.parse(p.snapshot).recipient;
 const existing=await stmt(db,'SELECT status FROM oa_operators WHERE email=?',recipient.email).first<Data>();
 if(existing?.status==='active')return {status:'already-active'};
 const writes=[...matterGuard(db,actor,p.matter_id),...documents.flatMap(d=>documentGuard(db,actor,d)),
  ...fence(db,"EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND email=? AND role='owner' AND status='active')",actor.id,actor.email),
  ...fence(db,"EXISTS(SELECT 1 FROM s_document_productions WHERE id=? AND status='approved' AND sha256=? AND snapshot=? AND artifact_base64 IS NOT NULL)",p.id,p.sha256,p.snapshot),
  audit(db,actor,'production.recipient_invitation_requested',p.id,JSON.stringify({matterId:p.matter_id,sha256:p.sha256,recipientEmail:recipient.email,explicitPrincipalRequest:true}),{matterId:p.matter_id})];
 await atomic(db,actor,writes);
 let result:{status:'accepted'};
 try{result=await operatorAuth(env).invite(request,{email:recipient.email,displayName:recipient.name,role:'member',returnTo:'/signin'});}
 catch(error){
  await atomic(db,actor,[audit(db,actor,'production.recipient_invitation_uncertain',p.id,JSON.stringify({matterId:p.matter_id,recipientEmail:recipient.email,delivery:'unconfirmed'}),{matterId:p.matter_id})]);
  throw error;
 }
 await atomic(db,actor,[audit(db,actor,'production.recipient_invitation_result',p.id,JSON.stringify({matterId:p.matter_id,recipientEmail:recipient.email,nativeRequestStatus:result.status,delivery:'unconfirmed'}),{matterId:p.matter_id})]);
 return result;
}
export async function recallProductionShare(db:D1Database,actor:Actor,shareId:string,body:Data){
 principal(actor);const share=await stmt(db,'SELECT * FROM s_production_shares WHERE id=?',shareId).first<Data>();
 insist(share,'Release not found',404);const {p,documents}=await packet(db,actor,share.production_id);
 insist(!share.opened_at&&!share.recalled_at,'Only an unopened release can be recalled; opened packets remain disclosed',409);
 const reason=text(body.reason,'Recall reason',1000),at=now();
 await atomic(db,actor,[...matterGuard(db,actor,p.matter_id),...documents.flatMap(d=>documentGuard(db,actor,d)),
  ...fence(db,"EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND email=? AND role='owner' AND status='active')",actor.id,actor.email),
  ...fence(db,'EXISTS(SELECT 1 FROM s_production_shares WHERE id=? AND opened_at IS NULL AND recalled_at IS NULL)',share.id),
  stmt(db,'UPDATE s_production_shares SET recalled_at=?,recalled_by=?,recall_reason=? WHERE id=?',at,actor.email,reason,share.id),
  audit(db,actor,'production.share_recalled',p.id,JSON.stringify({matterId:p.matter_id,shareId:share.id,sha256:share.packet_sha256,recipientEmail:share.recipient_email,reason}),{matterId:p.matter_id,shareId:share.id})]);
 return shareJson({...share,recalled_at:at,recalled_by:actor.email,recall_reason:reason});
}

// Recipient authority is one release plus an actual native account and session. It
// confers no firm role, source access, matter access or ability to grant access.
async function recipientSession(request:Request,original:Bindings){
 const env=runtimeBindings(original),url=new URL(request.url);
 insist(url.origin===env.AUTH_ORIGIN,'Invalid host',403);
 if(!['GET','HEAD'].includes(request.method))insist(request.headers.get('origin')===env.AUTH_ORIGIN&&request.headers.get('sec-fetch-site')!=='cross-site','Invalid request origin',403);
 const session=await operatorAuth(env).getSession(request);insist(session,'Sign in as the named recipient to continue',401);
 return {env,session};
}
const available=`s.recalled_at IS NULL AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND p.status='approved' AND p.artifact_base64 IS NOT NULL AND p.snapshot IS NOT NULL AND p.sha256=s.packet_sha256
 AND EXISTS(SELECT 1 FROM oa_operators authorizer WHERE authorizer.id=s.authorized_by_id AND authorizer.email=s.authorized_by AND authorizer.role='owner' AND authorizer.status='active' AND authorizer.version=s.authorizer_version)
 AND EXISTS(SELECT 1 FROM s_matters WHERE id=p.matter_id AND ${matterScope('p.matter_id')})
 AND NOT EXISTS(SELECT 1 FROM s_production_sources ps LEFT JOIN s_documents d ON d.id=ps.document_id WHERE ps.production_id=p.id AND (d.id IS NULL OR d.erased_at IS NOT NULL)) AND ${holdsMatch}`;
async function recipientPacket(db:D1Database,session:Session,shareId:string){
 const share=await stmt(db,'SELECT * FROM s_production_shares WHERE id=? AND recipient_id=? AND recipient_email=?',shareId,session.operator.id,session.operator.email).first<Data>();
 insist(share,'Release not found',404);
 const p=await stmt(db,`SELECT p.* FROM s_production_shares s JOIN s_document_productions p ON p.id=s.production_id WHERE s.id=? AND ${available}`,share.id,'owner',share.authorized_by).first<Data>();
 insist(p,'This release is no longer available',410);return {share,p};
}
function recipientFence(db:D1Database,session:Session,share:Data,p:Data){
 return [
  ...fence(db,`EXISTS(SELECT 1 FROM oa_sessions a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.operator_id=? AND o.email=? AND o.status='active' AND o.version=? AND a.operator_version=o.version AND a.revoked_at IS NULL AND a.expires_at>(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)) AND a.kind=? AND (a.kind!='oidc' OR EXISTS(SELECT 1 FROM oa_provider_sessions ps JOIN oa_auth_settings c ON c.singleton=1 AND c.idp_sign_in=1 AND c.generation=ps.generation WHERE ps.session_id=a.id)) AND NOT EXISTS(SELECT 1 FROM oa_provider_session_pins pin WHERE pin.session_id=a.id AND NOT EXISTS(SELECT 1 FROM oa_identity_providers provider WHERE provider.provider_id=pin.provider_id AND provider.status='linked' AND provider.issuer=pin.issuer AND provider.client_id=pin.client_id AND provider.linked_at=pin.linked_at)))`,session.id,session.operator.id,session.operator.email,session.operator.version,session.kind),
  ...fence(db,`EXISTS(SELECT 1 FROM s_production_shares s JOIN s_document_productions p ON p.id=s.production_id WHERE s.id=? AND s.recipient_id=? AND s.recipient_email=? AND p.artifact_base64=? AND p.snapshot=? AND ${available})`,share.id,session.operator.id,session.operator.email,p.artifact_base64,p.snapshot,'owner',share.authorized_by)
 ];
}
async function recipientBatch(db:D1Database,writes:D1PreparedStatement[]){
 try{await db.batch(writes);}catch(error){if(/constraint|s_guard|production release is immutable/i.test(String(error)))throw new Fault('This release changed or is no longer available',409);throw error;}
}
export async function recipientProductionState(request:Request,original:Bindings,shareId:string){
 const {env,session}=await recipientSession(request,original),{share,p}=await recipientPacket(env.DB,session,shareId);
 await recipientBatch(env.DB,[...recipientFence(env.DB,session,share,p),audit(env.DB,{id:session.operator.id,email:session.operator.email,role:'recipient',channel:'person'},'production.recipient_viewed',p.id,JSON.stringify({matterId:p.matter_id,shareId:share.id,sha256:share.packet_sha256,opened:false}),{matterId:p.matter_id,shareId:share.id})]);
 return {...shareJson(share),size:p.size};
}
export async function recipientProductionFile(request:Request,original:Bindings,shareId:string){
 insist(request.method==='POST','Open the production with the authenticated download control',405);
 const {env,session}=await recipientSession(request,original),db=env.DB,{share,p}=await recipientPacket(db,session,shareId),bytes=decode(p.artifact_base64);
 insist(bytes.length===p.size&&await digest(bytes)===share.packet_sha256,'Production failed its integrity check',503);
 const at=now(),receiptId=id(),recipient={id:session.operator.id,email:session.operator.email,role:'recipient',channel:'person'};
 await recipientBatch(db,[...recipientFence(db,session,share,p),
  stmt(db,'UPDATE s_production_shares SET opened_at=COALESCE(opened_at,?) WHERE id=? AND recalled_at IS NULL',at,share.id),
  stmt(db,'INSERT INTO s_production_delivery_receipts(id,share_id,recipient_id,session_id,sha256,size,served_at) VALUES(?,?,?,?,?,?,?)',receiptId,share.id,recipient.id,session.id,share.packet_sha256,bytes.length,at),
  audit(db,recipient,'production.recipient_downloaded',p.id,JSON.stringify({matterId:p.matter_id,shareId:share.id,receiptId,sha256:share.packet_sha256,size:bytes.length,servedAt:at,disclosure:'Opened; server committed these packet bytes for the authenticated recipient'}),{matterId:p.matter_id,shareId:share.id,receiptId,sha256:share.packet_sha256})]);
 return new Response(bytes,{headers:{'content-type':'application/zip','content-length':String(bytes.length),'content-disposition':`attachment; filename="production-${p.id}.zip"`,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"sandbox; default-src 'none'; base-uri 'none'",'x-production-sha256':share.packet_sha256,'x-production-receipt':receiptId,'x-production-served-at':at}});
}
