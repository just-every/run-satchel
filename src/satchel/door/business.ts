import { createBusinessSettings } from '../../modules/business-settings/index.ts'
import type { TeamAdapter, ManagedMember } from '../../modules/business-settings/types.ts'
import type { Bindings } from '../../auth.server.ts'
import { stmt } from '../model.ts'

/** Signed roster binds existing native people; it never creates legal authority. */
function team(db:D1Database):TeamAdapter {
 return {
  async ownerEmail(){return (await stmt(db,"SELECT email FROM oa_operators WHERE role='owner' ORDER BY created_at,id LIMIT 1").first<{email:string}>())?.email??null},
  async prepare({members,managed}){
   const result:ManagedMember[]=[]
   for(const member of members){
    const prior=managed.find(row=>row.businessId===member.id)
    const native=prior?.operatorId
     ?await stmt(db,'SELECT id,status FROM oa_operators WHERE id=?',prior.operatorId).first<{id:string;status:string}>()
     :await stmt(db,'SELECT id,status FROM oa_operators WHERE email=?',member.email).first<{id:string;status:string}>()
    result.push({email:member.email,operatorId:native?.id??null,invite:member.invite,state:native?.status==='active'?'active':native?'inactive':'invited'})
   }
   for(const prior of managed)if(!members.some(member=>member.id===prior.businessId||member.email===prior.email))result.push({...prior,state:'inactive'})
   return {statements:[],rows:result,async afterCommit(){}}
  },
 }
}
export const businessSettings=(env:Bindings)=>createBusinessSettings({db:env.DB,trust:env.RER_BUSINESS_TRUST,business:{settings:1,values:['display_name'],team:{roles:{admin:'admin',member:'member'}}},team:team(env.DB)})
