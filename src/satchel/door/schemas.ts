import type {JsonSchema} from '../../modules/agent-door/index.ts'
export const string:JsonSchema={type:'string',minLength:1,maxLength:1000}
export const object=(properties:Record<string,JsonSchema>,required=Object.keys(properties))=>({type:'object' as const,properties,required,additionalProperties:false})
const strings:JsonSchema={type:'array',items:string}
export const identityOutput=object({personId:string,agentId:string,role:string,proposals:{type:'integer',minimum:0}})
export const contextOutput=object({
 matters:{type:'array',items:object({id:string,title:string,matter_number:{type:['string','null']}})},
 delegations:{type:'array',items:object({id:string,matterId:string,actions:strings,remainingJobs:{type:'integer'},spendCents:{type:'integer',minimum:0,maximum:0},expiresAt:string})},
 members:{type:'array',items:{type:'object'}},proposals:{type:'array',items:{type:'object'}},redacted:{type:'boolean'},
})
export const matterOutput=object({billing:{type:'object'},documents:{type:'array',items:{type:'object'}},deadlines:{type:'array',items:{type:'object'}},sources:{type:'array',items:{type:'object'}},agreement:{type:['object','null']},authority:{type:'object'},redacted:{type:'boolean'},contentRule:string})
export const proposalOutput=object({id:string,kind:{type:'string',enum:['matter','bill','deadline']},status:{type:'string',enum:['pending']},payload:{type:'object'}})
