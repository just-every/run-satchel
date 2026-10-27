import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {harness} from './harness.mjs';
export function authenticatorCode(secret,counter=Math.floor(Date.now()/30000)){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0;const bytes=[];for(const c of secret){value=(value<<5)|alphabet.indexOf(c);bits+=5;if(bits>=8){bytes.push((value>>>(bits-8))&255);bits-=8;}}
 const input=Buffer.alloc(8);input.writeBigUInt64BE(BigInt(counter));const mac=createHmac('sha1',Buffer.from(bytes)).update(input).digest(),offset=mac[19]&15;return String((mac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
export async function secureSessions(){
 const h=await harness();try{
  const passphrase='synthetic-satchel-4';
  const first=h.owner,second=await h.login('owner@example.test');
  await h.json('/team',{email:'staff@example.test',name:'Case assistant',role:'assistant'},first);await h.json('/team/invite',{email:'staff@example.test'},first);const assistant=await h.login('staff@example.test');
  const ownerSession=(await h.json('/security/mfa',undefined,first)).sessionId;await h.json('/security/devices/'+ownerSession+'/revoke',{},assistant,403);
  const enrollment=await h.json('/security/mfa/enroll',{passphrase},first);
  const before=await h.json('/security/mfa',undefined,first);assert.equal(before.enabled,false);
  const counter=Math.floor(Date.now()/30000),code=authenticatorCode(enrollment.secret,counter);
  await h.json('/security/mfa/verify',{code,passphrase},first);
  assert.deepEqual(await h.json('/security/mfa',undefined,first),{enabled:true,required:false,sessionId:before.sessionId});
  await h.json('/state',undefined,first);
  await h.json('/state',undefined,second,403);assert.equal((await h.request('/app',undefined,second)).headers.get('location'),h.origin+'/security-check');
  assert.equal((await h.request('/auth/sessions',undefined,second)).status,403);
  assert.equal((await h.request('/security-check',undefined,second)).status,200);
  assert.equal((await h.raw('/security-check',{method:'POST',headers:{origin:'https://outside.example.test','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({passphrase,code}).toString()},second)).status,403);
  await h.json('/security/mfa/verify',{code,passphrase},second,403);
  await h.json('/security/mfa/verify',{code:authenticatorCode(enrollment.secret,counter+1),passphrase:'synthetic-satchel-5'},second,403);
  await h.json('/security/mfa/verify',{passphrase,code:authenticatorCode(enrollment.secret,counter+1)},second);
  await h.json('/state',undefined,second);
  await h.restart();await h.json('/state',undefined,second);
  const fresh=await h.login('owner@example.test');await h.json('/state',undefined,fresh,403);await h.json('/keys',{label:'Cannot bypass authenticator'},fresh,403);assert.equal((await h.request('/auth/credential',{},fresh)).status,403);
  const bad=['000000','111111','222222','333333','444444','555555'].find(v=>![counter,counter+1,counter+2].map(c=>authenticatorCode(enrollment.secret,c)).includes(v));
  for(let n=0;n<5;n++)await h.json('/security/mfa/verify',{passphrase,code:bad},fresh,403);
  await h.json('/security/mfa/verify',{passphrase,code:bad},fresh,429);
  await h.json('/security/mfa/enroll',{passphrase},fresh,409);
  await h.json('/security/mfa/verify',{code,passphrase},fresh,403,{origin:'https://outside.example.test'});
  const devices=await h.json('/security/devices',undefined,second);assert.equal(devices.sessions.filter(s=>s.active).length,4);
  const firstId=before.sessionId;assert.ok(devices.sessions.some(s=>s.id===firstId&&s.active));
  await h.json('/security/devices/'+firstId+'/revoke',{},second);
  await h.json('/state',undefined,first,401);await h.json('/state',undefined,second);
  const changed=await h.json('/security/devices',undefined,second);assert.equal(changed.sessions.find(s=>s.id===firstId).active,false);
  const audit=await h.json('/audit',undefined,second);assert.ok(audit.records.some(r=>r.action==='security.mfa_enabled'));assert.ok(audit.records.some(r=>r.action==='security.device_revoked'));
  const exported=await(await h.request('/api/satchel/audit/export',undefined,second)).text(),archive=await(await h.request('/api/satchel/backup',undefined,second)).text();
  for(const value of [enrollment.secret,passphrase,code,first,second]){assert.ok(!exported.includes(value));assert.ok(!archive.includes(value));}
  const items=archive.trim().split('\n').map(JSON.parse).filter(x=>x.kind==='part').flatMap(x=>x.items);assert.ok(!items.some(x=>x.kind==='row'&&['s_mfa','s_mfa_sessions'].includes(x.table)));assert.ok(exported.includes('security.mfa_enabled'));
 }finally{await h.close();}
}
