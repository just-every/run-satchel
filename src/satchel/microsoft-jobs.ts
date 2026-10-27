import {atomic,audit,id,insist,now,stmt,type Actor,type Data} from './model';
import {unseal} from './integration-secrets';
import {requireProviderReview} from './providers';
import {microsoftConfiguration,microsoftGuard,microsoftJobView,microsoftOwner,microsoftPrincipal,microsoftSealKey,microsoftSessionGuard,microsoftSessionSql,sessionArgs,type MicrosoftBindings} from './microsoft-authority';
import {microsoftRecord,microsoftReviewSql,sweepMicrosoft} from './microsoft-connector';
import {microsoftDirectory} from './microsoft-transport';

const jobRecord=(db:D1Database,jobId:string)=>stmt(db,'SELECT * FROM s_microsoft_jobs WHERE id=?',jobId).first<Data>();
const connectorSql=`EXISTS(SELECT 1 FROM s_microsoft_connector c WHERE c.id='installation' AND c.status='connected' AND c.generation=? AND c.sponsor_id=? AND c.sponsor_version=? AND c.configuration_digest=? AND c.token_sealed IS NOT NULL AND c.token_expires_at>(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER)))`;
const connectorArgs=(generation:number,actor:Actor,version:number,fingerprint:string)=>[generation,actor.id,version,fingerprint];

export async function queueMicrosoftRead(env:MicrosoftBindings,actor:Actor,body:Data,sessionId:string){
 const version=await microsoftOwner(env.DB,actor,sessionId);
 insist(Object.keys(body).length===0,'Directory reads accept no resource or endpoint override');
 await requireProviderReview(env.DB,'microsoft');await sweepMicrosoft(env.DB,actor);
 const configuration=await microsoftConfiguration(env),c=await microsoftRecord(env.DB);
 insist(c?.status==='connected'&&c.sponsor_id===actor.id&&c.sponsor_version===version&&c.configuration_digest===configuration.fingerprint,'Reconnect Microsoft explicitly before queuing a directory read',409);
 const jobId=id();
 await atomic(env.DB,actor,[
  ...microsoftSessionGuard(env.DB,actor,sessionId,version),
  ...microsoftGuard(env.DB,`${connectorSql} AND ${microsoftReviewSql}`,...connectorArgs(c.generation,actor,version,configuration.fingerprint)),
  stmt(env.DB,`INSERT INTO s_microsoft_jobs(id,generation,sponsor_id,sponsor_version,session_id,capability,status,outcome,created_at) VALUES(?,?,?,?,?,'directory:read','queued','awaiting_execution',?)`,jobId,c.generation,actor.id,version,sessionId,now()),
  audit(env.DB,actor,'microsoft.read_queued',jobId,JSON.stringify({generation:c.generation,capability:'directory:read'}))
 ]);
 return microsoftJobView((await jobRecord(env.DB,jobId))!);
}
async function refuseQueued(env:MicrosoftBindings,actor:Actor,j:Data,outcome:string){
 await atomic(env.DB,actor,[
  stmt(env.DB,"UPDATE s_microsoft_jobs SET status='refused',outcome=?,finished_at=? WHERE id=? AND status='queued'",outcome,now(),j.id),
  audit(env.DB,actor,'microsoft.read_refused',j.id,JSON.stringify({outcome,generation:j.generation}))
 ]);
 return {job:microsoftJobView((await jobRecord(env.DB,j.id))!)};
}
export async function executeMicrosoftRead(env:MicrosoftBindings,actor:Actor,jobId:string,sessionId:string){
 microsoftPrincipal(actor);await sweepMicrosoft(env.DB,actor);
 const j=await jobRecord(env.DB,jobId);insist(j,'Microsoft read job not found',404);
 // Re-entering a completed or in-flight job only reports its journal state.
 if(j.status!=='queued')return {job:microsoftJobView(j)};
 let version:number,configuration:Awaited<ReturnType<typeof microsoftConfiguration>>;
 try{version=await microsoftOwner(env.DB,actor,sessionId);configuration=await microsoftConfiguration(env);await requireProviderReview(env.DB,'microsoft');}
 catch{return refuseQueued(env,actor,j,'current_authority_required');}
 if(j.sponsor_id!==actor.id||j.sponsor_version!==version||j.session_id!==sessionId)return refuseQueued(env,actor,j,'originating_session_required');
 const args=connectorArgs(j.generation,actor,version,configuration.fingerprint),active=`${connectorSql} AND ${microsoftSessionSql} AND ${microsoftReviewSql}`,activeArgs=[...args,...sessionArgs(actor,sessionId,version)];
 const c=await microsoftRecord(env.DB);
 if(!c||!await stmt(env.DB,`SELECT 1 WHERE ${active}`,...activeArgs).first())return refuseQueued(env,actor,j,'connector_authority_changed');
 let token:string;
 try{token=await unseal(c.token_sealed,microsoftSealKey(env));}
 catch{return refuseQueued(env,actor,j,'explicit_reconnect_required');}
 try{
  await atomic(env.DB,actor,[
   ...microsoftGuard(env.DB,`${active} AND EXISTS(SELECT 1 FROM s_microsoft_jobs WHERE id=? AND status='queued' AND generation=?)`,...activeArgs,j.id,j.generation),
   stmt(env.DB,"UPDATE s_microsoft_jobs SET status='sending',outcome='provider_pending',started_at=? WHERE id=? AND status='queued'",now(),j.id),
   audit(env.DB,actor,'microsoft.read_started',j.id,JSON.stringify({generation:j.generation,capability:'directory:read'}))
  ]);
 }catch{
  // A competing execution or revoke owns the journal now. There is no network retry.
  return {job:microsoftJobView((await jobRecord(env.DB,j.id))!)};
 }
 const result=await microsoftDirectory(token);
 const status=result.ok?'succeeded':result.uncertain?'uncertain':'refused',outcome=result.ok?'directory_read':result.outcome;
 try{
  await atomic(env.DB,actor,[
   ...microsoftGuard(env.DB,"EXISTS(SELECT 1 FROM s_microsoft_jobs WHERE id=? AND status='sending' AND generation=?)",j.id,j.generation),
   stmt(env.DB,`UPDATE s_microsoft_jobs SET status=CASE WHEN ${active} THEN ? ELSE 'uncertain' END,outcome=CASE WHEN ${active} THEN ? ELSE 'authority_changed_during_read' END,finished_at=?,user_count=CASE WHEN ${active} THEN ? ELSE NULL END,has_more=CASE WHEN ${active} THEN ? ELSE NULL END,provider_status=? WHERE id=? AND status='sending' AND generation=?`,
    ...activeArgs,status,...activeArgs,outcome,now(),...activeArgs,result.ok?result.users.length:null,...activeArgs,result.ok?Number(result.hasMore):null,result.status,j.id,j.generation),
   audit(env.DB,actor,'microsoft.read_result',j.id,JSON.stringify({generation:j.generation,providerStatus:result.status,outcome})),
   ...(!result.ok&&[401,403].includes(result.status??0)?[
    stmt(env.DB,"UPDATE s_microsoft_connector SET status='refused',token_sealed=NULL,token_expires_at=NULL,outcome='provider_authorization_refused',updated_at=? WHERE generation=? AND status='connected'",now(),j.generation),
    stmt(env.DB,"UPDATE s_microsoft_jobs SET status='refused',outcome='provider_authorization_refused',finished_at=? WHERE generation=? AND status='queued'",now(),j.generation),
    audit(env.DB,actor,'microsoft.authorization_refused','installation',JSON.stringify({generation:j.generation,providerStatus:result.status}))
   ]:[])
  ]);
 }catch{
  const current=(await jobRecord(env.DB,j.id))!;
  return {job:microsoftJobView(current.status==='sending'?{...current,status:'uncertain',outcome:'authority_changed_during_read'}:current)};
 }
 const current=(await jobRecord(env.DB,j.id))!;
 // Directory data exists only in this authorized response. A lost response is
 // represented by the durable counts and requires an explicitly new read job.
 return {job:microsoftJobView(current),...(result.ok&&current.status==='succeeded'?{users:result.users,hasMore:result.hasMore}:{})};
}
