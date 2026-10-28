import {atomic,audit,digest,id,insist,matter,now,rows,stmt,text,type Actor,type Data} from './model';
import {agentOwner,authorizedDelegation,guard,instant,liveAgentArgs,liveAgentSql} from './agent-authority';
import {preparationPayload} from './agent-preparations';
import {matterGuard} from './documents';
import {agentForKey} from './session';
import {gateGrants,requireArea} from './role-areas';
import {propose} from './proposals';

export async function queueAgentJob(db:D1Database,actor:Actor,delegationId:string,b:Data){
 if(b.action==='prepare-bill')requireArea(actor,'billing','write');
 const d=await authorizedDelegation(db,actor,delegationId,text(b.action,'Preparation action',80)),requestKey=text(b.requestKey,'Request identity',100),due=instant(b.dueAt,'Scheduled instant'),{payload}=preparationPayload(b.action,b.payload,d);
 insist(due<d.expires_at,'Scheduled work must precede delegation expiry');
 const fingerprint=await digest(JSON.stringify({delegationId,action:b.action,dueAt:due,payload})),existing=await stmt(db,'SELECT * FROM s_agent_jobs WHERE key_id=? AND request_key=?',actor.agentKeyId,requestKey).first<Data>();
 if(existing){insist(existing.fingerprint===fingerprint,'Request identity already used for different work',409);return jobView(existing);}
 if(payload.documentId)insist(await stmt(db,'SELECT 1 FROM s_agent_sources WHERE delegation_id=? AND document_id=?',d.id,payload.documentId).first(),'Source outside this delegation',403);
 gateGrants(actor,'POST','/api/satchel/agent/'+b.action);
 const jobId=id();
 await atomic(db,actor,[...guard(db,liveAgentSql,...liveAgentArgs(d)),...matterGuard(db,actor,d.matter_id),...guard(db,'EXISTS(SELECT 1 FROM s_agent_delegations WHERE id=? AND used_jobs<max_jobs)',d.id),stmt(db,'UPDATE s_agent_delegations SET used_jobs=used_jobs+1 WHERE id=?',d.id),stmt(db,'INSERT INTO s_agent_jobs(id,delegation_id,key_id,matter_id,action,request_key,fingerprint,payload,due_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',jobId,d.id,actor.agentKeyId,d.matter_id,b.action,requestKey,fingerprint,JSON.stringify(payload),due,now()),audit(db,actor,'agent.job_queued',jobId,'Finite preparation reserved; no external effect',{matterId:d.matter_id,delegationId:d.id,agreementId:d.agreement_id})]);
 return jobView((await stmt(db,'SELECT * FROM s_agent_jobs WHERE id=?',jobId).first<Data>())!);
}
export function jobView(j:Data){return {id:j.id,delegationId:j.delegation_id,action:j.action,dueAt:j.due_at,status:j.status,outcome:j.outcome,proposalId:j.proposal_id,finishedAt:j.finished_at};}
const scheduler={id:'agent-scheduler',email:'scheduler',role:'system',channel:'automation'};
async function refuse(db:D1Database,j:Data,outcome:string){
 await db.batch([stmt(db,"UPDATE s_agent_jobs SET status='refused',outcome=?,finished_at=? WHERE id=? AND status='queued'",outcome,now(),j.id),audit(db,scheduler,'agent.job_refused',j.id,outcome,{matterId:j.matter_id,delegationId:j.delegation_id})]);
}
export async function executeAgentJob(db:D1Database,jobId:string,at=Date.now()){
 const j=await stmt(db,'SELECT * FROM s_agent_jobs WHERE id=?',jobId).first<Data>();insist(j,'Agent job not found',404);
 if(j.status!=='queued'||j.due_at>new Date(at).toISOString())return jobView(j);
 let actor:Actor,d:Data;
 try{actor=await agentForKey(db,j.key_id);d=await authorizedDelegation(db,actor,j.delegation_id,j.action,new Date(at).toISOString());gateGrants(actor,'POST','/api/satchel/agent/'+j.action);}
 catch{await refuse(db,j,'current_authority_required');return jobView((await stmt(db,'SELECT * FROM s_agent_jobs WHERE id=?',j.id).first<Data>())!);}
 try{const {kind,payload}=preparationPayload(j.action,JSON.parse(j.payload),d);await propose(db,{...actor,agentExecution:{delegation:d,jobId:j.id}},kind,payload);}
 catch(error){if((error as {status?:number}).status===undefined)throw error;await refuse(db,j,'preparation_stopped_for_review');}
 return jobView((await stmt(db,'SELECT * FROM s_agent_jobs WHERE id=?',j.id).first<Data>())!);
}
export async function runAgentJobs(db:D1Database,at:number){for(const j of await rows(db,"SELECT id FROM s_agent_jobs WHERE status='queued' AND due_at<=? ORDER BY due_at,id LIMIT 100",new Date(at).toISOString()))await executeAgentJob(db,j.id,at);}
export async function runAgentJobAsOwner(db:D1Database,actor:Actor,jobId:string){
 agentOwner(actor);const j=await stmt(db,'SELECT * FROM s_agent_jobs WHERE id=?',jobId).first<Data>();insist(j,'Agent job not found',404);await matter(db,actor,j.matter_id);return executeAgentJob(db,jobId);
}
