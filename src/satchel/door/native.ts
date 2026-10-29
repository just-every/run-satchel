import { ToolRefusal, type ToolContext } from '../../modules/agent-door/index.ts'
import { agentForKey } from '../session.ts'
import { authorizedDelegation } from '../agent-authority.ts'
import { Fault, stmt, type Actor, type Data } from '../model.ts'
import { gateGrants } from '../role-areas.ts'

export async function native<T>(run:()=>Promise<T>):Promise<T> {
 try{return await run()}catch(error){if(error instanceof Fault)throw new ToolRefusal(error.status===404?'resource_unavailable':error.status===409?'native_conflict':'native_authority_required');throw error}
}
/** Both credentials converge on the same current key, sponsor and delegation. */
type NativePrincipalContext=Pick<ToolContext,'db'|'person'|'agent'|'clientId'> & Partial<Pick<ToolContext,'actor'|'approvers'>>
export async function actor(ctx:NativePrincipalContext):Promise<Actor & {label:string}> {
 return native(async()=>{
  const local=ctx.clientId===undefined&&ctx.agent.id.startsWith('satchel-local:')
  const key=await stmt(ctx.db,'SELECT id FROM s_agent_keys WHERE owner_id=? AND revoked=0 AND '+(local?'id=?':'business_agent_id=?'),ctx.person.id,local?ctx.agent.id.slice(14):ctx.agent.id).first<{id:string}>()
  if(!key)throw new ToolRefusal('native_delegation_required')
  const who=await agentForKey(ctx.db,key.id)
  if(who.id!==ctx.person.id)throw new ToolRefusal('native_delegation_required')
  const attribution=ctx.actor??{agent:{id:ctx.agent.id,name:ctx.agent.name},for:{id:ctx.person.id,name:ctx.person.name},label:`${ctx.agent.name} for ${ctx.person.name}`}
  return {...who,label:attribution.label,agentAttribution:attribution,agentApprovers:(ctx.approvers??[]).map(p=>({...p})),...(!local?{doorAgentId:ctx.agent.id}:{})}
 })
}
export async function delegation(args:Data,ctx:ToolContext,action:string){
 const who=await actor(ctx)
 const path=action==='context'?'/api/satchel/agent/matters/'+args.matterId:'/api/satchel/agent/'+action
 await native(async()=>gateGrants(who,action==='context'?'GET':'POST',path))
 const grant=await native(()=>authorizedDelegation(ctx.db,who,String(args.delegationId),action))
 return {who,grant}
}
export const standard=()=>[{class:'standard' as const,facts:{measure:1}}]
export async function classes(args:Data,ctx:ToolContext,action:string){
 const {grant}=await delegation(args,ctx,action)
 const health=await stmt(ctx.db,"SELECT count(*) n FROM s_agent_sources WHERE delegation_id=? AND kind='health'",grant.id).first<{n:number}>()
 return [...standard(),...(health?.n?[{class:'sensitive' as const,facts:{measure:health.n,kind:'health'}}]:[])]
}
