import { operatorAuth, runtimeBindings, type Bindings } from '../../auth.server.ts'
import { operatorAuthPeople, type PeopleAdapter, type Person } from '../../modules/agent-door/index.ts'
import { stmt } from '../model.ts'
import { person as nativeSession } from '../session.ts'
import { agentSponsor } from '../role-doors.ts'

/** oa_operators owns identity; active firm membership owns the domain role. */
export async function nativePerson(db:D1Database,id:string):Promise<Person|null> {
 const row=await stmt(db,`SELECT o.id,o.email,o.display_name name,o.role operator_role,o.status,m.role,m.active
 FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email WHERE o.id=?`,id).first<any>()
 if(!row)return null
 const role=row.operator_role==='owner'?'owner':row.active===1?row.role:null
 if(!role)return null
 try{agentSponsor(role)}catch{return null}
 const installationOwner=await stmt(db,"SELECT o.id FROM oa_operators o LEFT JOIN oa_bootstrap b ON b.claim_id=o.id WHERE o.role='owner' ORDER BY b.claim_id IS NULL,o.created_at,o.id LIMIT 1").first<{id:string}>()
 const settings=await stmt(db,'SELECT owner_id FROM bs_settings WHERE singleton=1 AND stopped=0').first<{owner_id:string}>()
 const binding=settings?.owner_id?await stmt(db,"SELECT business_role FROM bs_team WHERE operator_id=? AND state='active' AND business_id IS NOT NULL",row.id).first<{business_role:string}>():null
 return {id:row.id,email:row.email,name:row.name,role,active:row.status==='active',businessPolicyRole:settings?.owner_id&&installationOwner?.id===row.id?'owner':binding?.business_role==='admin'?'editor':null} as Person

}
export function people(env:Bindings):PeopleAdapter {
 const base=operatorAuthPeople({db:env.DB,session:r=>operatorAuth(runtimeBindings(env)).getSession(r)})
 return {
  person:id=>nativePerson(env.DB,id),
  businessRole:p=>env.RER_OWNER_CLAIM_PUBLIC_KEYS?(p as Person & {businessPolicyRole:'owner'|'editor'|null}).businessPolicyRole:p.role==='owner'?'owner':null,
  async sponsor(claims){
   const settings=await stmt(env.DB,'SELECT owner_id FROM bs_settings WHERE singleton=1 AND stopped=0').first<{owner_id:string}>()
   if(!settings?.owner_id)return null
   if(settings.owner_id!==claims.sub&&!await stmt(env.DB,"SELECT 1 FROM bs_team WHERE business_id=? AND state='active'",claims.sub).first())return null
   const linked=await base.sponsor(claims);return linked?.active?nativePerson(env.DB,linked.id):null
  },
  async businessMember(p){
   const state=await stmt(env.DB,'SELECT owner_id FROM bs_settings WHERE singleton=1 AND stopped=0').first<{owner_id:string}>()
   if(!state?.owner_id)return null
   if(p.role==='owner')return base.businessMember!(p)
   const row=await stmt(env.DB,"SELECT business_id,business_role FROM bs_team WHERE operator_id=? AND state='active'",p.id).first<{business_id:string;business_role:string}>()
   return row?.business_id?{id:row.business_id,role:row.business_role==='admin'?'editor':null}:null
  },
  async session(request){try{const actor=await nativeSession(request,env);return nativePerson(env.DB,actor.id)}catch{return null}},
 }
}