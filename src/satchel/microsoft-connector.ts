import {atomic,audit,insist,now,rows,stmt,type Actor,type Data} from './model';
import {seal} from './integration-secrets';
import {disclosureVersion,requireProviderReview} from './providers';
import {microsoftConfiguration,microsoftGuard,microsoftJobView,microsoftOwner,microsoftPrincipal,microsoftSealKey,microsoftSessionGuard,microsoftSessionSql,microsoftStoredSessionSql,sessionArgs,type MicrosoftBindings} from './microsoft-authority';
import {microsoftToken} from './microsoft-transport';

export const microsoftReviewSql=`EXISTS(SELECT 1 FROM s_provider_reviews WHERE provider_id='microsoft' AND disclosure_version=${disclosureVersion})`;
export const microsoftRecord=(db:D1Database)=>stmt(db,"SELECT * FROM s_microsoft_connector WHERE id='installation'").first<Data>();
export function stopMicrosoftJobs(db:D1Database,outcome:string){return stmt(db,`UPDATE s_microsoft_jobs SET status=CASE WHEN status='sending' THEN 'uncertain' ELSE 'refused' END,outcome=?,finished_at=? WHERE status IN('queued','sending')`,outcome,now());}

// A stopped worker cannot be distinguished from a lost response. Mark its work
// uncertain after the transport timeout; it is never reset to the queue.
export async function sweepMicrosoft(db:D1Database,actor:Actor){
 const staleBefore=new Date(Date.now()-60000).toISOString(),at=now(),jobAuthority=`${microsoftStoredSessionSql('j')} AND EXISTS(SELECT 1 FROM s_microsoft_connector c WHERE c.status='connected' AND c.generation=j.generation AND c.sponsor_id=j.sponsor_id AND c.sponsor_version=j.sponsor_version)`;
 const stale=await stmt(db,`SELECT 1 WHERE EXISTS(SELECT 1 FROM s_microsoft_connector WHERE (status='connected' AND token_expires_at<=?) OR (status='connecting' AND updated_at<?)) OR EXISTS(SELECT 1 FROM s_microsoft_jobs j WHERE (status='sending' AND started_at<?) OR (status IN('queued','sending') AND NOT (${jobAuthority})))`,Date.now(),staleBefore,staleBefore).first();
 if(stale)await atomic(db,actor,[
  stmt(db,`UPDATE s_microsoft_connector SET status=CASE WHEN status='connected' THEN 'expired' ELSE 'uncertain' END,token_sealed=NULL,token_expires_at=NULL,outcome=CASE WHEN status='connected' THEN 'explicit_reconnect_required' ELSE 'token_outcome_unknown' END,updated_at=? WHERE (status='connected' AND token_expires_at<=?) OR (status='connecting' AND updated_at<?)`,at,Date.now(),staleBefore),
  stmt(db,`UPDATE s_microsoft_jobs AS j SET status='uncertain',outcome=CASE WHEN started_at<? THEN 'worker_outcome_unknown' ELSE 'current_authority_required' END,finished_at=? WHERE status='sending' AND (started_at<? OR NOT (${jobAuthority}))`,staleBefore,at,staleBefore),
  stmt(db,`UPDATE s_microsoft_jobs AS j SET status='refused',outcome='current_authority_required',finished_at=? WHERE status='queued' AND NOT (${jobAuthority})`,at),
  audit(db,actor,'microsoft.lifecycle_expired','installation')
 ]);
}
export async function microsoftState(env:MicrosoftBindings,actor:Actor){
 microsoftPrincipal(actor);await sweepMicrosoft(env.DB,actor);
 const c=await microsoftRecord(env.DB);
 return {configured:!!(env.ENTRA_TENANT_ID&&env.ENTRA_CLIENT_ID&&env.ENTRA_CLIENT_SECRET),capability:'directory:read',status:c?.status??'disconnected',generation:c?.generation??0,outcome:c?.outcome??'explicit_connection_required',tokenExpiresAt:c?.token_expires_at?new Date(c.token_expires_at).toISOString():null,updatedAt:c?.updated_at??null,jobs:(await rows(env.DB,'SELECT id,generation,capability,status,outcome,created_at,started_at,finished_at,user_count,has_more,provider_status FROM s_microsoft_jobs ORDER BY created_at DESC,id DESC LIMIT 100')).map(microsoftJobView)};
}
export async function connectMicrosoft(env:MicrosoftBindings,actor:Actor,body:Data,sessionId:string){
 const version=await microsoftOwner(env.DB,actor,sessionId);
 insist(body.approved===true&&body.capability==='directory:read','Approve directory read access for this installation');
 await requireProviderReview(env.DB,'microsoft');
 const configuration=await microsoftConfiguration(env),old=await microsoftRecord(env.DB),generation=(old?.generation??0)+1,at=now();
 await atomic(env.DB,actor,[
  ...microsoftSessionGuard(env.DB,actor,sessionId,version),
  ...microsoftGuard(env.DB,microsoftReviewSql),
  ...microsoftGuard(env.DB,old?"EXISTS(SELECT 1 FROM s_microsoft_connector WHERE id='installation' AND generation=?)":"NOT EXISTS(SELECT 1 FROM s_microsoft_connector)",...(old?[old.generation]:[])),
  stmt(env.DB,`INSERT INTO s_microsoft_connector(id,generation,status,sponsor_id,sponsor_version,session_id,configuration_digest,capability,token_sealed,token_expires_at,updated_at,outcome) VALUES('installation',?,'connecting',?,?,?,?,'directory:read',NULL,NULL,?,'token_pending') ON CONFLICT(id) DO UPDATE SET generation=excluded.generation,status='connecting',sponsor_id=excluded.sponsor_id,sponsor_version=excluded.sponsor_version,session_id=excluded.session_id,configuration_digest=excluded.configuration_digest,token_sealed=NULL,token_expires_at=NULL,updated_at=excluded.updated_at,outcome=excluded.outcome`,generation,actor.id,version,sessionId,configuration.fingerprint,at),
  stopMicrosoftJobs(env.DB,'connector_reconnected'),
  audit(env.DB,actor,'microsoft.connection_approved','installation',JSON.stringify({generation,capability:'directory:read'}))
 ]);
 // The approval is committed before the only token exchange; reconnecting never
 // retries an old job or reuses a token from a previous generation.
 const result=await microsoftToken(configuration),sealed=result.ok?await seal(result.token,microsoftSealKey(env)):null;
 try{
  await atomic(env.DB,actor,[
   ...microsoftGuard(env.DB,"EXISTS(SELECT 1 FROM s_microsoft_connector WHERE id='installation' AND generation=? AND status='connecting')",generation),
   stmt(env.DB,`UPDATE s_microsoft_connector SET status=CASE WHEN NOT (${microsoftSessionSql} AND ${microsoftReviewSql}) THEN 'uncertain' ELSE ? END,token_sealed=CASE WHEN ${microsoftSessionSql} AND ${microsoftReviewSql} THEN ? ELSE NULL END,token_expires_at=CASE WHEN ${microsoftSessionSql} AND ${microsoftReviewSql} THEN ? ELSE NULL END,outcome=CASE WHEN NOT (${microsoftSessionSql} AND ${microsoftReviewSql}) THEN 'authority_changed' ELSE ? END,updated_at=? WHERE id='installation' AND generation=? AND status='connecting'`,
    ...sessionArgs(actor,sessionId,version),result.ok?'connected':result.uncertain?'uncertain':'refused',
    ...sessionArgs(actor,sessionId,version),sealed,
    ...sessionArgs(actor,sessionId,version),result.ok?result.expiresAt:null,
    ...sessionArgs(actor,sessionId,version),result.ok?'connected':result.outcome,now(),generation),
   audit(env.DB,actor,'microsoft.connection_result','installation',JSON.stringify({generation,outcome:result.ok?'token_received':result.outcome}))
  ]);
 }catch{
  // A newer revoke or reconnect or owner change wins. Never disclose a token or a
  // provider exception, even if the returning request lost its authority.
  return {status:'uncertain',generation,outcome:'connection_superseded'};
 }
 const current=await microsoftRecord(env.DB);
 return {status:current!.status,generation:current!.generation,outcome:current!.outcome};
}
export async function revokeMicrosoft(env:MicrosoftBindings,actor:Actor,sessionId:string){
 const version=await microsoftOwner(env.DB,actor,sessionId),c=await microsoftRecord(env.DB);
 if(!c)return {status:'disconnected',generation:0,outcome:'explicit_connection_required'};
 await atomic(env.DB,actor,[
  ...microsoftSessionGuard(env.DB,actor,sessionId,version),
  stmt(env.DB,"UPDATE s_microsoft_connector SET generation=generation+1,status='revoked',token_sealed=NULL,token_expires_at=NULL,outcome='owner_revoked',updated_at=? WHERE id='installation'",now()),
  stopMicrosoftJobs(env.DB,'owner_revoked'),
  audit(env.DB,actor,'microsoft.revoked','installation',JSON.stringify({capability:'directory:read'}))
 ]);
 return {status:'revoked',generation:(await microsoftRecord(env.DB))!.generation,outcome:'owner_revoked'};
}
