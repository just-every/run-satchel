// Explicit held-tenant journey. No credential or directory content is printed.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {harness} from './harness.mjs';
const bindings=Object.fromEntries(['ENTRA_TENANT_ID','ENTRA_CLIENT_ID','ENTRA_CLIENT_SECRET'].map(name=>{assert.ok(process.env[name],name+' is required');return [name,process.env[name]];}));
const receipt={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),checks:[]};
let tokens=0,reads=0;const wire=[];
const h=await harness({bindings,microsoftResponse:async request=>{
 const host=new URL(request.url).hostname;if(host==='login.microsoftonline.com')tokens++;else reads++;
 const headers=new Headers();for(const name of ['authorization','content-type','accept']){const value=request.headers.get(name);if(value!==null)headers.set(name,value);}
 const body=['GET','HEAD'].includes(request.method)?undefined:await request.arrayBuffer();
 const form=body?new URLSearchParams(Buffer.from(body).toString()):null;
 const reply=await fetch(request.url,{method:request.method,headers,...(body?{body}:{}),redirect:'manual',signal:AbortSignal.timeout(15000)});
 wire.push({kind:host==='login.microsoftonline.com'?'token':'directory',status:reply.status,...(form?{clientMatches:form.get('client_id')===bindings.ENTRA_CLIENT_ID,secretMatches:form.get('client_secret')===bindings.ENTRA_CLIENT_SECRET}:{})});
 return reply;
}});
try{
 await h.json('/providers/microsoft/review',{confirmed:true,termsUrl:'https://www.microsoft.com/licensing/terms/'},h.owner);
 const connected=await h.json('/security/microsoft',{approved:true,capability:'directory:read'},h.owner);assert.equal(connected.status,'connected',JSON.stringify({connected,wire}));receipt.checks.push('real token exchange accepted');
 const job=await h.json('/security/microsoft/jobs',{},h.owner);const result=await h.json('/security/microsoft/jobs/'+job.id+'/run',{},h.owner);assert.equal(result.job.status,'succeeded');assert.equal(result.users.length,1);receipt.checks.push('real directory read: one user');
 const queued=await h.json('/security/microsoft/jobs',{},h.owner);await h.restart();await h.json('/security/microsoft/revoke',{},h.owner);const stopped=await h.json('/security/microsoft/jobs/'+queued.id+'/run',{},h.owner);assert.equal(stopped.job.status,'refused');assert.equal(reads,1);assert.equal(tokens,1);receipt.checks.push('restarted queued read refused after local revocation; no second provider read');
 await h.json('/security/microsoft/jobs',{},h.owner,409);
 const audit=await(await h.request('/api/satchel/audit/export',undefined,h.owner)).text(),archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();
 for(const value of Object.values(bindings)){assert.ok(!audit.includes(value));assert.ok(!archive.includes(value));}
 const items=archive.trim().split('\n').map(JSON.parse).filter(x=>x.kind==='part').flatMap(x=>x.items);assert.ok(!items.some(x=>x.kind==='row'&&['s_microsoft_connector','s_microsoft_jobs'].includes(x.table)));receipt.checks.push('audit and archive omit configured credentials and credential-bound queues');
 console.log(JSON.stringify({...receipt,tokenExchanges:tokens,directoryReads:reads,wire,passed:true}));
}finally{await h.close();}
