import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// Only Microsoft's network edge is synthetic. The journey exercises built API
// routes, native sessions, persistent jobs, safe audit export and firm archives.
export function microsoftFixture(){
 const bindings={ENTRA_TENANT_ID:randomUUID(),ENTRA_CLIENT_ID:randomUUID(),ENTRA_CLIENT_SECRET:'synthetic-satchel-1'},token='synthetic-satchel-2',directoryId='synthetic-satchel-directory-person',directoryName='Synthetic Satchel Directory Person',privateError='synthetic-satchel-3';
 const edge={bindings,calls:[],mode:'success',beforeDirectory:null,beforeToken:null,privateValues:[token,bindings.ENTRA_CLIENT_SECRET,directoryId,directoryName,privateError]};
 edge.microsoftResponse=async request=>{
  const url=new URL(request.url);
  if(url.hostname==='login.microsoftonline.com'){
   assert.equal(url.pathname,`/${bindings.ENTRA_TENANT_ID}/oauth2/v2.0/token`);assert.equal(request.method,'POST');
   const form=new URLSearchParams(await request.text());assert.equal(form.get('grant_type'),'client_credentials');assert.equal(form.get('scope'),'https://graph.microsoft.com/.default');assert.equal(form.get('client_id'),bindings.ENTRA_CLIENT_ID);assert.equal(form.get('client_secret'),bindings.ENTRA_CLIENT_SECRET);
   edge.calls.push('token');
   if(edge.beforeToken){const hook=edge.beforeToken;edge.beforeToken=null;await hook();}
   if(edge.mode==='token-redirect')return new Response(null,{status:302,headers:{location:'https://untrusted.example.test/no-credentials'}});
   if(edge.mode==='token-expired')return Response.json({access_token:token,token_type:'Bearer',expires_in:0});
   return edge.mode==='token-denied'?Response.json({error_description:privateError},{status:401}):Response.json({access_token:token,token_type:'Bearer',expires_in:3600});
  }
  assert.equal(url.hostname,'graph.microsoft.com');assert.equal(request.method,'GET');assert.equal(url.pathname,'/v1.0/users');assert.equal(url.searchParams.get('$select'),'id,displayName');assert.equal(request.headers.get('authorization'),'Bearer '+token);
  edge.calls.push('directory');
  if(edge.beforeDirectory){const hook=edge.beforeDirectory;edge.beforeDirectory=null;await hook();}
  if(edge.mode==='directory-redirect')return new Response(null,{status:302,headers:{location:'https://untrusted.example.test/no-credentials'}});
  if(edge.mode==='lost')throw new Error(privateError);
  if(edge.mode==='directory-denied')return Response.json({error:{message:privateError}},{status:403});
  return Response.json({value:[{id:directoryId,displayName:directoryName,mail:'synthetic-satchel-unrequested-mail@example.test'}],'@odata.nextLink':'https://untrusted.example.test/do-not-follow'});
 };
 return edge;
}
export async function proveMicrosoftSecurity(harness){
 const edge=microsoftFixture(),h=await harness(edge),base='/security/microsoft',approval={approved:true,capability:'directory:read'};
 let owner=h.owner;
 const state=()=>h.json(base,undefined,owner),connect=()=>h.json(base,approval,owner),queue=()=>h.json(base+'/jobs',{},owner),run=j=>h.json(base+'/jobs/'+j.id+'/run',{},owner),revoke=()=>h.json(base+'/revoke',{},owner);
 const noPrivate=value=>{const wire=typeof value==='string'?value:JSON.stringify(value);for(const secret of edge.privateValues)assert.ok(!wire.includes(secret),'Credential, provider body and directory data stay out of durable state or public state');};
 try{
  await h.json(base,approval,owner,409);assert.deepEqual(edge.calls,[],'Provider review precedes any network request');
  await h.json('/providers/microsoft/review',{termsUrl:'https://www.microsoft.com/licensing/terms/',confirmed:true},owner);
  await h.json('/team',{email:'synthetic-satchel-staff@example.test',name:'Synthetic Satchel Staff',role:'assistant'},owner);await h.json('/team/invite',{email:'synthetic-satchel-staff@example.test'},owner);const assistant=await h.login('synthetic-satchel-staff@example.test');
  for(const [path,body] of [[base,undefined],[base,approval],[base+'/jobs',{}],[base+'/revoke',{}]])await h.json(path,body,assistant,403);
  await h.json(base,{...approval,approved:false},owner,400);await h.json(base,{...approval,capability:'mail:read'},owner,400);await h.json(base,approval,'',401,{authorization:'Bearer synthetic-satchel-6'});
  const initial=await connect();assert.equal(initial.status,'connected',JSON.stringify(initial));assert.equal(edge.calls.filter(c=>c==='token').length,1);
  await h.json(base+'/jobs',{endpoint:'https://untrusted.example.test/'},owner,400);
  const pending=await queue();await h.json(base+'/jobs/'+pending.id+'/run',{},assistant,403);assert.equal(pending.status,'queued');await h.restart();
  const first=await run(pending);assert.equal(first.job.status,'succeeded');assert.equal(first.job.userCount,1);assert.deepEqual(first.users,[{id:'synthetic-satchel-directory-person',displayName:'Synthetic Satchel Directory Person'}]);assert.equal(first.hasMore,true);assert.equal(edge.calls.filter(c=>c==='directory').length,1,'No continuation URL is followed');
  noPrivate(await state());const before=edge.calls.length,replay=await run(pending);assert.equal(replay.job.status,'succeeded');assert.equal(replay.users,undefined);assert.equal(edge.calls.length,before,'Completed jobs never replay a provider read');
  const blocked=await queue();await revoke();assert.equal((await run(blocked)).job.status,'refused');assert.equal(edge.calls.length,before);assert.equal((await state()).tokenExpiresAt,null);await h.restart();assert.equal((await state()).status,'revoked');await h.json(base+'/jobs',{},owner,409);
  assert.equal((await connect()).status,'connected');const oldSessionJob=await queue(),oldSession=await(await h.request('/auth/session',undefined,owner)).json(),second=await h.login('owner@example.test');
  assert.equal((await h.request('/auth/session/revoke',{sessionId:oldSession.id},second)).status,204);assert.equal((await h.request('/api/satchel'+base+'/jobs/'+oldSessionJob.id+'/run',{},owner)).status,401);owner=second;assert.equal((await run(oldSessionJob)).job.status,'refused');
  await connect();const removedMember=await queue();await h.json('/team',{email:'owner@example.test',name:'Principal',role:'lawyer',active:false},owner);assert.equal((await run(removedMember)).job.status,'refused');await h.json('/team',{email:'owner@example.test',name:'Principal',role:'lawyer',active:true},owner);
  const interrupted=await queue();edge.mode='lost';assert.equal((await run(interrupted)).job.status,'uncertain');const lostCalls=edge.calls.length;await h.restart();assert.equal((await run(interrupted)).job.status,'uncertain');assert.equal(edge.calls.length,lostCalls);
  edge.mode='directory-redirect';const redirected=await queue();assert.equal((await run(redirected)).job.providerStatus,302);
  edge.mode='directory-denied';const denied=await queue(),refusedByProvider=await queue();assert.equal((await run(denied)).job.status,'refused');assert.equal((await state()).status,'refused');assert.equal((await run(refusedByProvider)).job.status,'refused');await h.json(base+'/jobs',{},owner,409);noPrivate(await state());
  edge.mode='success';await connect();const inFlight=await queue();edge.beforeDirectory=revoke;const changed=await run(inFlight);assert.equal(changed.job.status,'uncertain');assert.equal(changed.users,undefined);const afterRevoke=edge.calls.length;await run(inFlight);assert.equal(edge.calls.length,afterRevoke);
  for(const mode of ['token-redirect','token-expired','token-denied']){edge.mode=mode;assert.equal((await connect()).status,'refused');}edge.mode='success';edge.beforeToken=revoke;assert.equal((await connect()).status,'uncertain');assert.equal((await state()).status,'revoked');noPrivate(await state());edge.mode='success';await connect();
  const audit=await h.json('/audit?limit=200',undefined,owner);assert.ok(audit.records.some(r=>r.action==='microsoft.read_result'&&r.revision!==null&&r.evidence.record.recordType==='s_microsoft_jobs'));assert.ok(audit.records.some(r=>r.action==='microsoft.revoked'));noPrivate(audit);
  const exportResponse=await h.request('/api/satchel/audit/export',undefined,owner);assert.equal(exportResponse.status,200);noPrivate(await exportResponse.text());
  const archiveResponse=await h.request('/api/satchel/backup',undefined,owner);assert.equal(archiveResponse.status,200);const archive=await archiveResponse.text();noPrivate(archive);
  const items=archive.trim().split('\n').map(JSON.parse).filter(x=>x.kind==='part').flatMap(x=>x.items);assert.ok(!items.some(x=>x.kind==='row'&&['s_microsoft_connector','s_microsoft_jobs'].includes(x.table)));
  const target=await harness(edge);
  try{
   await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);const restored=await target.json(base,undefined,target.owner);assert.equal(restored.status,'disconnected');assert.deepEqual(restored.jobs,[]);const restoredAudit=await target.json('/audit?limit=200',undefined,target.owner);assert.ok(restoredAudit.records.some(r=>r.action==='microsoft.revoked'));const beforeFreshRead=edge.calls.length;await target.json(base+'/jobs',{},target.owner,409);assert.equal(edge.calls.length,beforeFreshRead);
  }finally{await target.close();}
 }finally{await h.close();}
}
