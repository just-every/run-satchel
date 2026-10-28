export async function authorizeAgent(h,key,matterId,options={}){
 const sponsor=await h.json('/me',undefined,options.sponsorCookie??h.owner),principal=await h.json('/me',undefined,h.owner);
 const agreement=await h.json('/agent-agreements',{keyId:key.id,processor:'Firm-approved native preparation',modelRevision:'synthetic-satchel-1',agreementReference:'synthetic-satchel-2',retentionTerms:'Source versions remain in firm storage; no additional context copy',trainingTerms:'No training or secondary use',trainingAllowed:false,healthReference:options.healthReference??'',expiresAt:'2099-12-31T00:00:00.000Z',confirmed:true,...options.agreement},h.owner);
 const delegationBody={keyId:key.id,agreementId:agreement.id,matterId,actions:['context','prepare-matter','prepare-bill','prepare-deadline'],recipients:[sponsor.email],maxJobs:20,spendCents:0,expiresAt:'2099-12-30T00:00:00.000Z',stopRule:'Stop on authority change, uncertainty, expiry or limit; principal reviews without outbound contact',escalationEmail:principal.email,sources:[],confirmed:true,...options.delegation};
 const delegation=await h.json('/agent-delegations',delegationBody,h.owner);
 return {agreement,delegation,delegationBody,auth:{authorization:'Bearer '+key.key,'x-satchel-delegation':delegation.id}};
}
