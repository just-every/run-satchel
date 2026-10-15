import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
export async function harness(){
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const origin=`http://127.0.0.1:${port}`,directory=await mkdtemp(join(tmpdir(),'satchel-http-'));
 const vars={AUTH_LOCAL:'true',AUTH_ORIGIN:origin,OWNER_EMAIL:'owner@example.test',SESSION_SECRET:randomBytes(32).toString('hex'),SETUP_TOKEN:randomBytes(32).toString('hex'),MAIL_PROVIDER:'development',MAIL_FROM:'auth@localhost.test',RER_DEV_KEY:randomBytes(32).toString('hex')};
 await writeFile(join(directory,'local.env'),Object.entries(vars).map(([k,v])=>`${k}=${v}`).join('\n'),{mode:0o600});
 const wrangler='node_modules/wrangler/bin/wrangler.js',config='dist/server/wrangler.json',env={...process.env,CI:'true',WRANGLER_SEND_METRICS:'false',CLOUDFLARE_INCLUDE_PROCESS_ENV:'false'};
 execFileSync(process.execPath,[wrangler,'d1','migrations','apply','DB','--local','--persist-to',directory,'--config',config],{stdio:'pipe',env});
 const worker=spawn(process.execPath,[wrangler,'dev','--config',config,'--local','--persist-to',directory,'--ip','127.0.0.1','--port',String(port),'--inspector-port','0','--env-file',join(directory,'local.env')],{stdio:['ignore','pipe','pipe'],env});
 let diagnostics='';for(const s of [worker.stdout,worker.stderr])s.on('data',v=>diagnostics+=v);
 const request=(path,body,cookie='',extra={})=>fetch(origin+path,{redirect:'manual',method:body===undefined?'GET':'POST',headers:{origin,...(body===undefined?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const json=async(path,body,cookie,expected=200,extra={})=>{const r=await request('/api/satchel'+path,body,cookie,extra);const b=await r.json();if(r.status>=500){await new Promise(r=>setTimeout(r,150));let safe=diagnostics;for(const v of Object.values(vars))safe=safe.replaceAll(v,'[redacted]');console.error(safe.slice(-6000));}assert.equal(r.status,expected,JSON.stringify(b));return b;};
 async function login(email){
  assert.equal((await request('/auth/magic-link',{email})).status,202);
  const h={'x-rer-dev-key':vars.RER_DEV_KEY},listing=await(await fetch(origin+'/__dev/outbox',{headers:h})).text();
  const links=[...listing.matchAll(/href="(\/__dev\/outbox\?message=[^"]+)"/g)];
  let token;
  for(const l of links){const detail=await(await fetch(origin+l[1].replaceAll('&amp;','&'),{headers:h})).text();if(!detail.includes(email))continue;token=detail.match(/\/auth\/confirm\?token=([^"&<]+)/)?.[1];if(token)break;}
  assert.ok(token,'Mailbox delivered a confirmation link');const result=await request('/auth/confirm',{token});assert.equal(result.status,303);return result.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
 }
 try{
  let ready=false;for(let i=0;i<200;i++){if(worker.exitCode!==null)throw new Error('Worker exited');try{ready=(await request('/health')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,150));}assert.ok(ready,'Worker ready');
  assert.equal((await request('/auth/bootstrap',{token:vars.SETUP_TOKEN,displayName:'Principal'})).status,303);
  const owner=await login(vars.OWNER_EMAIL);
  return {origin,owner,request,json,login,close:async()=>{worker.kill('SIGTERM');await new Promise(r=>worker.exitCode!==null?r():worker.once('exit',r));await rm(directory,{recursive:true,force:true});},diagnostics:()=>diagnostics};
 }catch(e){worker.kill('SIGTERM');for(const v of Object.values(vars))diagnostics=diagnostics.replaceAll(v,'[redacted]');throw new Error(e.message+'\n'+diagnostics.slice(-3000));}
}
export async function open(h,title='Barton lease review',client='Barton Workshop LLC',adverse='Riverbend Holdings LLC'){
 const search=await h.json('/conflicts',{client,adverse},h.owner);
 return h.json('/matters',{title,conflictId:search.id,reviewNote:'Reviewed firm records and obtained conflict clearance.',confirmed:true},h.owner);
}
