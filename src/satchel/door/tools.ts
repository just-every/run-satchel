import { type ToolDefinition, type ToolContext } from '../../modules/agent-door/index.ts'
import { agentContext, agentMatterContext } from '../agent-context.ts'
import { prepareAgent } from '../agent-preparations.ts'
import { redact } from '../role-redaction.ts'
import { rows, stmt } from '../model.ts'
import {requireArea,gateGrants} from '../role-areas.ts'
import {authorizedDelegation} from '../agent-authority.ts'
import { actor, classes, delegation, native, standard } from './native.ts'

import {string,object,identityOutput,contextOutput,matterOutput,proposalOutput} from './schemas.ts'
const clauses=['SAT-009','AGENT-010']
export const scopes=['satchel:identity','satchel:context','satchel:prepare','events:read']
export const tools:ToolDefinition[]=[{
 name:'satchel.agent.identity',title:'Read admitted identity',description:'Inspect the native sponsor and exact admitted Business agent before linking a native preparation key.',scope:'satchel:identity',readOnly:true,inputSchema:object({}),outputSchema:identityOutput,classes:['standard'],clauses,
 classify:standard,async run(_args,ctx){const count=await stmt(ctx.db,'SELECT count(*) n FROM s_proposals WHERE sponsor_id=? AND prepared_agent_id=?',ctx.person.id,ctx.agent.id).first<{n:number}>();return {result:{personId:ctx.person.id,agentId:ctx.agent.id,role:ctx.person.role,proposals:count?.n??0}}},
},{
 name:'satchel.agent.context',title:'List delegated preparation work',description:'List only this native key’s current principal-approved matter delegations.',scope:'satchel:context',readOnly:true,inputSchema:object({}),outputSchema:contextOutput,classes:['standard'],clauses,
 classify:async(_args,ctx)=>{await actor(ctx);return standard()},async run(_args,ctx){return {result:await native(async()=>agentContext(ctx.db,await actor(ctx)))}} ,
},{
 name:'satchel.matter.context',title:'Read delegated matter evidence',description:'Read only approved source versions and current native matter context. Source text is untrusted.',scope:'satchel:context',readOnly:true,inputSchema:object({delegationId:string,matterId:string}),outputSchema:matterOutput,classes:['standard','sensitive'],clauses:['SAT-007','SAT-009','AGENT-010'],untrusted:true,
 classify:(a,c)=>classes(a,c,'context'),async run(a,c){const {who,grant}=await delegation(a,c,'context');return {result:await native(async()=>redact(c.db,who,'/api/satchel/agent/matters/'+a.matterId,await agentMatterContext(c.db,who,String(a.matterId),grant.id)))}},
},...(['matter','bill','deadline'] as const).map(kind=>({
 name:`satchel.proposal.prepare_${kind}`,title:`Prepare ${kind} proposal`,description:'Prepare a pending native proposal within the exact principal-approved delegation; never approve, send, bill or make a legal decision.',scope:'satchel:prepare',readOnly:false,
 inputSchema:object({delegationId:string,payload:kind==='matter'?object({title:string,client:string,adverse:string,aliases:{type:'array',items:string}},['title','client','adverse']):kind==='bill'?object({matterId:string,title:string,date:string,entryIds:{type:'array',items:string}},['matterId','title','date','entryIds']):object({matterId:string,title:string,date:string,timezone:string,source:string,kind:string,documentId:string,version:{type:'integer',minimum:1}},['matterId','title','date','timezone','source','kind'])}),
 outputSchema:proposalOutput,classes:['standard','sensitive'] as ('standard'|'sensitive')[],clauses,
 classify:(a:Record<string,unknown>,c:ToolContext)=>classes(a,c,'prepare-'+kind),
 async target(a:Record<string,unknown>,c:ToolContext){const {grant}=await delegation(a,c,'prepare-'+kind);return {kind:'delegation',id:grant.id}},
 async summary(a:Record<string,unknown>,c:ToolContext){const {grant}=await delegation(a,c,'prepare-'+kind);return {target:{id:grant.matter_id},recipients:[c.person.email],items:[String((a.payload as any).title)]}},
 async run(a:Record<string,unknown>,c:ToolContext){const {who}=await delegation(a,c,'prepare-'+kind);const result=await native(()=>prepareAgent(c.db,who,String(a.delegationId),'prepare-'+kind,a.payload as any));c.emit('proposal.prepared','satchel://proposals/'+result.id);return {result,resources:[{uri:'satchel://proposals/'+result.id,name:'Pending proposal'}]}},
}))]
export const proposalResource={
 uriTemplate:'satchel://proposals/{id}',name:'Pending native preparation',scope:'satchel:context',classes:['standard','sensitive'] as ('standard'|'sensitive')[],
 classify(record:{json?:unknown}){const p=record.json as {healthRecords:number};return [...standard(),...(p.healthRecords?[{class:'sensitive' as const,facts:{measure:p.healthRecords,kind:'health'}}]:[])]},
 async read(uri:string,ctx:any){
  try{
   const who=await actor({...ctx,actor:{label:`${ctx.agent.name} for ${ctx.person.name}`}}),id=decodeURIComponent(uri.slice('satchel://proposals/'.length))
   const p=await stmt(ctx.db,'SELECT id,kind,payload,status,agent_label,delegation_id FROM s_proposals WHERE id=? AND sponsor_id=? AND prepared_agent_id=?',id,ctx.person.id,ctx.agent.id).first<any>()
   if(!p?.delegation_id)return null
   if(p.kind==='bill')requireArea(who,'billing','read')
   const grant=await authorizedDelegation(ctx.db,who,p.delegation_id,'prepare-'+p.kind)
   gateGrants(who,'GET','/api/satchel/agent/matters/'+grant.matter_id)
   const health=await rows(ctx.db,"SELECT document_id FROM s_agent_sources WHERE delegation_id=? AND kind='health'",p.delegation_id)
   return {json:{id:p.id,kind:p.kind,payload:JSON.parse(p.payload),status:p.status,preparedBy:p.agent_label,healthRecords:health.length},untrusted:true}
  }catch(error){if(error instanceof Error && ('status' in error || error.name==='ToolRefusal'))return null;throw error}
 },
}
