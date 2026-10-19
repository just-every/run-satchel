import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,readdir,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
import {randomBytes} from 'node:crypto';
const require=createRequire(await realpath('node_modules/wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const {unstable_splitSqlQuery:splitSql}=require('wrangler');
export async function harness(options={}){
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const directory=await mkdtemp(join(tmpdir(),'satchel-http-')),origin=`https://127.0.0.1:${port}`,mails=[];
 const config=JSON.parse(await readFile('dist/server/wrangler.json','utf8'));
 const vars={AUTH_LOCAL:'false',AUTH_ORIGIN:origin,OWNER_EMAIL:'owner@example.test',SESSION_SECRET:randomBytes(32).toString('hex'),SETUP_TOKEN:randomBytes(32).toString('hex'),MAIL_PROVIDER:'resend',MAIL_FROM:'auth@example.test',MAIL_API_KEY:'test-only-provider-key'};
 const configOptions={...convertV4MiniflareOptions({
  host:'127.0.0.1',port,https:true,modulesRoot:resolve('dist/server'),modules:[config.main,...(await readdir('dist/server/assets')).filter(f=>f.endsWith('.js')).map(f=>'assets/'+f)].map(f=>({type:'ESModule',path:resolve('dist/server',f)})),
  compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,
  assets:{directory:resolve('dist/client'),routerConfig:{has_user_worker:true}},d1Databases:{DB:'satchel-test'},r2Buckets:{ORIGINALS:'satchel-originals-test'},bindings:vars,
  // Only paid/network boundaries are fake; the built application is unchanged.
  outboundService:async request=>{if(options.webhookResponse&&request.url==='https://receiver.example.com/events')return options.webhookResponse(request);assert.equal(request.url,'https://api.resend.com/emails');const message=await request.json();mails.push(message);return options.mailResponse?options.mailResponse(message,request):Response.json({id:'test-mail-'+mails.length});},
 }),resourcePersistencePath:join(directory,'state')};
 let mf=new Miniflare(configOptions);
 const request=(path,body,cookie='',extra={})=>mf.dispatchFetch(origin+path,{redirect:'manual',method:body===undefined?'GET':'POST',headers:{origin,host:new URL(origin).host,'CF-Connecting-IP':'192.0.2.1',...(body===undefined?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const json=async(path,body,cookie,expected=200,extra={})=>{const r=await request('/api/satchel'+path,body,cookie,extra);const b=await r.json();assert.equal(r.status,expected,JSON.stringify(b));return b;};
 async function login(email){
  assert.equal((await request('/auth/magic-link',{email})).status,202);
  const message=mails.toReversed().find(m=>m.to.includes(email));
  assert.ok(message,'Provider accepted a confirmation link');
  const token=(message.text??message.html).match(/\/auth\/confirm\?token=([^\s"&<]+)/)?.[1];
  assert.ok(token,'Mail includes a confirmation token');
  const result=await request('/auth/confirm',{token});assert.equal(result.status,303);
  return result.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
 }
 try{
  await mf.ready;const db=await mf.getD1Database('DB');
  for(const file of (await readdir('migrations/core')).filter(f=>f.endsWith('.sql')).sort())for(const sql of splitSql(await readFile(join('migrations/core',file),'utf8')))await db.prepare(sql).run();
  assert.equal((await request('/health')).status,200);
  const boot=await request('/auth/bootstrap',{token:vars.SETUP_TOKEN,displayName:'Principal'});assert.equal(boot.status,303,await boot.text());
  const owner=await login(vars.OWNER_EMAIL);
  const raw=async(path,init={},cookie='')=>{const request=new Request(origin+path,{...init,headers:{origin,host:new URL(origin).host,'CF-Connecting-IP':'192.0.2.1',...(cookie?{cookie}:{}),...init.headers}});return mf.dispatchFetch(request.url,{redirect:'manual',method:request.method,headers:Object.fromEntries(request.headers),...(request.body?{body:await request.arrayBuffer()}: {})});};
  return {origin,owner,request,raw,json,login,mails,scheduled:async at=>(await mf.getWorker()).scheduled({scheduledTime:typeof at==='number'?at:Date.parse(at),cron:'*/15 * * * *'}),restart:async()=>{await mf.dispose();mf=new Miniflare(configOptions);await mf.ready;},close:async()=>{await mf.dispose();await rm(directory,{recursive:true,force:true});}};
 }catch(e){await mf.dispose();await rm(directory,{recursive:true,force:true});throw e;}
}
export async function open(h,title='Barton lease review',client='Barton Workshop LLC',adverse='Riverbend Holdings LLC'){
 const search=await h.json('/conflicts',{client,adverse},h.owner);
 return h.json('/matters',{title,conflictId:search.id,reviewNote:'Reviewed firm records and obtained conflict clearance.',confirmed:true},h.owner);
}
