import {atomic,audit,id,insist,matter,now,rows,stmt,text,type Actor,type Data} from './model';
import {authorizedDelegation} from './agent-authority';
import {propose} from './proposals';
import {requireArea} from './role-areas';

const fields:Record<string,string[]>={matter:['title','client','adverse'],bill:['matterId','title','date','entryIds'],deadline:['matterId','title','date','timezone','source','kind','documentId']};
export function preparationPayload(action:string,b:Data,d:Data){
 const kind=action.replace(/^prepare-/,''),allowed=fields[kind];insist(allowed,'Only native preparation actions are permitted',403);
 insist(b&&typeof b==='object'&&!Array.isArray(b)&&Object.keys(b).every(k=>allowed.includes(k)),'Preparation contains an unsupported action or authority field',403);
 if(kind!=='matter')insist(b.matterId===d.matter_id,'Matter outside this delegation',403);
 text(b.title,'Preparation title',500);if(kind==='matter'){text(b.client,'Client',200);text(b.adverse,'Adverse party',200);}
 return {kind,payload:b};
}
export async function prepareAgent(db:D1Database,actor:Actor,delegationId:string,action:string,b:Data){
 try{
  if(action==='prepare-bill')requireArea(actor,'billing','write');
  const d=await authorizedDelegation(db,actor,delegationId,action),{kind,payload}=preparationPayload(action,b,d);
  if(payload.documentId)insist(await stmt(db,'SELECT 1 FROM s_agent_sources WHERE delegation_id=? AND document_id=?',d.id,payload.documentId).first(),'Source outside this delegation',403);
  return await propose(db,{...actor,agentExecution:{delegation:d}},kind,payload);
 }catch(error){if([400,403,404,409].includes((error as {status?:number}).status??0))await atomic(db,actor,[audit(db,actor,'agent.preparation_refused',actor.agentKeyId!,'Preparation refused; inspect principal-approved scope and limits')]);throw error;}
}
