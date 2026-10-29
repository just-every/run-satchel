import {atomic,audit,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {documentGuard,matterGuard,visibleDocument} from './documents';

export const preparationActions=['context','prepare-matter','prepare-bill','prepare-deadline'];
export function instant(value:unknown,label:string){const raw=text(value,label,40),at=Date.parse(raw);insist(Number.isFinite(at),'Use an ISO instant for '+label);return new Date(at).toISOString();}
export function agentOwner(actor:Actor){human(actor);need(actor,'owner');}
export const guard=(db:D1Database,sql:string,...values:any[])=>{const g=id();return [stmt(db,'INSERT INTO s_guard VALUES(?,CASE WHEN ('+sql+') THEN 1 ELSE 0 END)',g,...values),stmt(db,'DELETE FROM s_guard WHERE id=?',g)];};
export async function agentControls(db:D1Database,actor:Actor){
 human(actor);need(actor,'owner','lawyer');
 const delegations=await rows(db,"SELECT d.* FROM s_agent_delegations d WHERE d.sponsor_id=? OR ?='owner' ORDER BY d.approved_at,d.id",actor.id,actor.role),visible:Data[]=[];
 for(const d of delegations){try{await matter(db,actor,d.matter_id);visible.push({...d,actions:JSON.parse(d.actions),recipients:JSON.parse(d.recipients),sources:await rows(db,'SELECT * FROM s_agent_sources WHERE delegation_id=?',d.id)});}catch(error){if((error as {status?:number}).status!==404)throw error;}}
 return {agreements:await rows(db,"SELECT a.* FROM s_agent_agreements a LEFT JOIN s_agent_keys k ON k.id=a.key_id WHERE k.owner_id=? OR ?='owner' ORDER BY a.approved_at,a.id",actor.id,actor.role),delegations:visible,jobs:await rows(db,`SELECT j.id,j.delegation_id,j.action,j.due_at,j.status,j.outcome,j.proposal_id,j.created_at,j.finished_at FROM s_agent_jobs j WHERE j.delegation_id IN (SELECT value FROM json_each(?)) ORDER BY j.created_at,j.id`,JSON.stringify(visible.map(d=>d.id)))};
}
export async function approveAgentAgreement(db:D1Database,actor:Actor,b:Data){
 agentOwner(actor);const keyId=text(b.keyId,'Agent key',100);
 insist(await stmt(db,'SELECT 1 FROM s_agent_keys WHERE id=? AND revoked=0',keyId).first(),'Active agent key not found',404);
 insist(b.confirmed===true&&b.trainingAllowed===false,'Confirm reviewed agreements and no training on firm data');
 const agreementId=id(),expires=instant(b.expiresAt,'Agreement expiry');insist(expires>now(),'Agreement expiry must be in the future');
 const processor=text(b.processor,'Named processor',200),model=text(b.modelRevision,'Model or native preparation revision',200),reference=text(b.agreementReference,'Reviewed agreement reference',1000),retention=text(b.retentionTerms,'Retention and deletion terms',1000),training=text(b.trainingTerms,'No-training terms',1000),health=b.healthReference?text(b.healthReference,'Health-data agreement reference',1000):null;
 await atomic(db,actor,[...guard(db,'EXISTS(SELECT 1 FROM s_agent_keys WHERE id=? AND revoked=0)',keyId),stmt(db,'INSERT INTO s_agent_agreements VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL)',agreementId,keyId,processor,model,reference,retention,training,health,expires,actor.email,now()),audit(db,actor,'agent.agreement_approved',agreementId,'Explicit firm review; no training; no outbound execution')]);
 return {id:agreementId};
}
export async function createDelegation(db:D1Database,actor:Actor,b:Data){
 agentOwner(actor);const keyId=text(b.keyId,'Agent key',100),agreementId=text(b.agreementId,'Agreement',100),matterId=text(b.matterId,'Matter',100);
 const key=await stmt(db,"SELECT k.*,o.email,o.status FROM s_agent_keys k JOIN oa_operators o ON o.id=k.owner_id WHERE k.id=? AND k.revoked=0 AND o.status='active'",keyId).first<Data>();insist(key,'Active agent key not found',404);
 const a=await stmt(db,'SELECT * FROM s_agent_agreements WHERE id=? AND key_id=? AND withdrawn_at IS NULL AND expires_at>?',agreementId,keyId,now()).first<Data>();insist(a,'Current firm-approved processing agreement required',409);
 await matter(db,actor,matterId);
 // The interim authority floor grants native preparation to its sponsor only.
 const recipients=b.recipients;insist(Array.isArray(recipients)&&recipients.length===1&&recipients[0]===key.email,'Preparation recipient must be the key sponsor',403);
 insist(Array.isArray(b.actions)&&b.actions.length>0&&new Set(b.actions).size===b.actions.length&&b.actions.every((v:unknown)=>typeof v==='string'&&preparationActions.includes(v)),'Only explicit native preparation actions are permitted',403);
 const maxJobs=integer(b.maxJobs,'Execution count',1,1000),spend=integer(b.spendCents,'Spend budget in USD cents',0,0),expires=instant(b.expiresAt,'Delegation expiry');insist(expires>now()&&expires<=a.expires_at,'Delegation must expire within its agreement');
 const stop=text(b.stopRule,'Stop and escalation rule',1000),escalation=text(b.escalationEmail,'Escalation recipient',254);insist(escalation===actor.email,'Escalations go to the approving principal',403);
 insist(b.confirmed===true,'Explicitly approve this scope and its execution limits');
 insist(Array.isArray(b.sources)&&b.sources.length<=50,'Select source versions explicitly');
 const delegationId=id(),writes=[...matterGuard(db,actor,matterId)],seen=new Set();
 for(const source of b.sources){
  const d=await visibleDocument(db,actor,text(source.documentId,'Source document',100));insist(d.matter_id===matterId&&!d.erased_at,'Source not available',404);insist(!seen.has(d.id),'Select a source once');seen.add(d.id);
  const version=integer(source.version,'Source version',1),v=await stmt(db,'SELECT sha256 FROM s_document_versions WHERE document_id=? AND version=? AND content_base64 IS NOT NULL',d.id,version).first<Data>();insist(v,'Source version not available',404);
  insist(['matter','research','health'].includes(source.kind),'Classify each source');
  let license=null,licenseExpiry=null,use=null;
  if(source.kind==='research'){license=text(source.licenseReference,'Research entitlement and provenance',1000);licenseExpiry=instant(source.licenseExpiresAt,'Research entitlement expiry');use=text(source.permittedUse,'Licensed processing use',1000);insist(licenseExpiry>=expires,'Research entitlement must cover the delegation');}
  if(source.kind==='health')insist(a.health_reference,'A reviewed health-data agreement is required',409);
  writes.push(...documentGuard(db,actor,d),stmt(db,'INSERT INTO s_agent_sources VALUES(?,?,?,?,?,?,?,?)',delegationId,d.id,version,v.sha256,source.kind,license,licenseExpiry,use));
 }
 writes.push(...guard(db,'EXISTS(SELECT 1 FROM s_agent_agreements WHERE id=? AND withdrawn_at IS NULL AND expires_at>=?) AND EXISTS(SELECT 1 FROM s_agent_keys WHERE id=? AND revoked=0)',agreementId,expires,keyId),stmt(db,'INSERT INTO s_agent_delegations(id,key_id,agreement_id,sponsor_id,matter_id,actions,recipients,max_jobs,spend_cents,expires_at,stop_rule,escalation_email,approved_by,approved_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',delegationId,keyId,agreementId,key.owner_id,matterId,JSON.stringify(b.actions),JSON.stringify(recipients),maxJobs,spend,expires,stop,escalation,actor.email,now()),audit(db,actor,'agent.delegation_approved',delegationId,'Native preparation; zero spend; explicit sources and limits',{matterId}));
 await atomic(db,actor,writes);return {id:delegationId};
}
export function cancelAgentJobs(db:D1Database,where:string,values:any[],reason:string,actor:Actor){
 return [stmt(db,`UPDATE s_agent_jobs SET status='refused',outcome=?,finished_at=? WHERE status='queued' AND ${where}`,reason,now(),...values),audit(db,actor,'agent.queued_authority_cancelled',values[0],reason)];
}
export async function revokeDelegation(db:D1Database,actor:Actor,delegationId:string,b:Data){
 agentOwner(actor);const d=await stmt(db,'SELECT * FROM s_agent_delegations WHERE id=?',delegationId).first<Data>();insist(d,'Delegation not found',404);await matter(db,actor,d.matter_id);
 const reason=text(b.reason,'Revocation reason',1000);
 await atomic(db,actor,[stmt(db,'UPDATE s_agent_delegations SET revoked_at=COALESCE(revoked_at,?),revoke_reason=COALESCE(revoke_reason,?) WHERE id=?',now(),reason,d.id),...cancelAgentJobs(db,'delegation_id=?',[d.id],'delegation_revoked',actor),audit(db,actor,'agent.delegation_revoked',d.id,reason,{matterId:d.matter_id})]);return {ok:true};
}
export async function withdrawAgreement(db:D1Database,actor:Actor,agreementId:string,b:Data){
 agentOwner(actor);const reason=text(b.reason,'Withdrawal reason',1000);insist(await stmt(db,'SELECT 1 FROM s_agent_agreements WHERE id=?',agreementId).first(),'Agreement not found',404);
 await atomic(db,actor,[stmt(db,'UPDATE s_agent_agreements SET withdrawn_at=COALESCE(withdrawn_at,?) WHERE id=?',now(),agreementId),...cancelAgentJobs(db,'delegation_id IN (SELECT id FROM s_agent_delegations WHERE agreement_id=?)',[agreementId],'agreement_withdrawn',actor),audit(db,actor,'agent.agreement_withdrawn',agreementId,reason)]);return {ok:true};
}

export const liveAgentSql=`EXISTS(SELECT 1 FROM s_agent_delegations d JOIN s_agent_keys k ON k.id=d.key_id JOIN s_agent_agreements a ON a.id=d.agreement_id JOIN oa_operators sponsor ON sponsor.id=d.sponsor_id JOIN oa_operators approver ON approver.email=d.approved_by WHERE d.id=? AND k.id=? AND k.revoked=0 AND sponsor.status='active' AND approver.status='active' AND approver.role='owner' AND d.revoked_at IS NULL AND a.withdrawn_at IS NULL AND a.expires_at>? AND d.expires_at>? AND d.spend_cents=0 AND NOT EXISTS(SELECT 1 FROM s_agent_sources s LEFT JOIN s_documents doc ON doc.id=s.document_id LEFT JOIN s_document_versions v ON v.document_id=s.document_id AND v.version=s.version WHERE s.delegation_id=d.id AND (doc.id IS NULL OR doc.erased_at IS NOT NULL OR v.content_base64 IS NULL OR v.sha256<>s.sha256 OR (s.kind='research' AND s.license_expires_at<=?))))`;
export function liveAgentArgs(d:Data,at=now()){return [d.id,d.key_id,at,at,at];}
export async function authorizedDelegation(db:D1Database,actor:Actor,delegationId:string,action:string,at=now()){
 const d=await stmt(db,'SELECT * FROM s_agent_delegations WHERE id=? AND key_id=? AND sponsor_id=?',delegationId,actor.agentKeyId??'',actor.id).first<Data>();insist(d,'Delegation not found',404);
 await matter(db,actor,d.matter_id);insist(JSON.parse(d.actions).includes(action),'Action outside this delegation',403);
 insist(await stmt(db,`SELECT 1 WHERE ${liveAgentSql}`,...liveAgentArgs(d,at)).first(),'Delegation or processing agreement is no longer authorized',403);
 for(const s of await rows(db,'SELECT * FROM s_agent_sources WHERE delegation_id=?',d.id))await visibleDocument(db,actor,s.document_id);
 return d;
}
export async function activeDelegations(db:D1Database,actor:Actor){
 const result:Data[]=[];for(const d of await rows(db,'SELECT * FROM s_agent_delegations WHERE key_id=? AND sponsor_id=?',actor.agentKeyId??'',actor.id)){try{result.push(await authorizedDelegation(db,actor,d.id,'context'));}catch(error){if(![403,404].includes((error as {status?:number}).status??0))throw error;}}return result;
}

export async function preparationWrites(db:D1Database,actor:Actor,proposalId:string){
 const execution=actor.agentExecution;insist(!actor.agentKeyId||execution,'Explicit delegation required',403);if(!execution)return [];
 const d=execution.delegation,writes=[...(actor.doorAgentId?guard(db,'EXISTS(SELECT 1 FROM s_agent_keys WHERE id=? AND owner_id=? AND business_agent_id=? AND revoked=0)',actor.agentKeyId,actor.id,actor.doorAgentId):[]),...guard(db,liveAgentSql,...liveAgentArgs(d)),...matterGuard(db,actor,d.matter_id)];
 for(const s of await rows(db,'SELECT * FROM s_agent_sources WHERE delegation_id=?',d.id))writes.push(...documentGuard(db,actor,await visibleDocument(db,actor,s.document_id)));
 if(execution.jobId)writes.push(...guard(db,"EXISTS(SELECT 1 FROM s_agent_jobs WHERE id=? AND status='queued' AND delegation_id=?)",execution.jobId,d.id),stmt(db,"UPDATE s_agent_jobs SET status='prepared',outcome='human_review_required',proposal_id=?,finished_at=? WHERE id=? AND status='queued'",proposalId,now(),execution.jobId),audit(db,actor,'agent.job_prepared',execution.jobId,'Proposal only; no external effect',{matterId:d.matter_id}));
 else writes.push(...guard(db,'EXISTS(SELECT 1 FROM s_agent_delegations WHERE id=? AND used_jobs<max_jobs)',d.id),stmt(db,'UPDATE s_agent_delegations SET used_jobs=used_jobs+1 WHERE id=?',d.id));
 return writes;
}
