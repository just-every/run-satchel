import type {Bindings} from '../auth.server';
import type {Session} from '../modules/operator-auth/index.mjs';
import {atomic,audit,human,insist,stmt,type Actor,type Data} from './model';
import {seal,unseal} from './integration-secrets';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function encode(bytes:Uint8Array){let bits=0,value=0,out='';for(const b of bytes){value=(value<<8)|b;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out;}
function decode(secret:string){let bits=0,value=0;const out=[];for(const c of secret){value=(value<<5)|alphabet.indexOf(c);bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}}return new Uint8Array(out);}
async function passphraseHash(passphrase:string,salt:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(passphrase),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256);return [...new Uint8Array(bits)].map(value=>value.toString(16).padStart(2,'0')).join('');}
function same(a:string,b:string){let different=a.length^b.length;for(let n=0;n<Math.max(a.length,b.length);n++)different|=(a.charCodeAt(n)||0)^(b.charCodeAt(n)||0);return different===0;}
async function codeAt(secret:string,counter:number){
 const bytes=new Uint8Array(8);new DataView(bytes.buffer).setBigUint64(0,BigInt(counter));
 const key=await crypto.subtle.importKey('raw',decode(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);
 const mac=new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes)),offset=mac[19]&15;
 return String((((mac[offset]&127)<<24)|(mac[offset+1]<<16)|(mac[offset+2]<<8)|mac[offset+3])%1000000).padStart(6,'0');
}
export async function mfaRequired(env:Bindings,session:Session){
 const record=await stmt(env.DB,'SELECT enabled FROM s_mfa WHERE operator_id=?',session.operator.id).first<Data>();
 return !!record?.enabled&&!await stmt(env.DB,'SELECT 1 ok FROM s_mfa_sessions WHERE session_id=? AND operator_id=?',session.id,session.operator.id).first();
}
export async function mfaState(env:Bindings,session:Session){
 const row=await stmt(env.DB,'SELECT enabled FROM s_mfa WHERE operator_id=?',session.operator.id).first<Data>();
 return {enabled:!!row?.enabled,required:await mfaRequired(env,session),sessionId:session.id};
}
export async function enrollMfa(env:Bindings,actor:Actor,session:Session,body:Data){
 human(actor);insist(typeof body.passphrase==='string'&&body.passphrase.length>=12&&body.passphrase.length<=1024,'Use a passphrase of at least 12 characters');const existing=await stmt(env.DB,'SELECT enabled FROM s_mfa WHERE operator_id=?',actor.id).first<Data>();
 insist(!existing?.enabled,'Authenticator is already enabled',409);
 const secret=encode(crypto.getRandomValues(new Uint8Array(20))),salt=crypto.randomUUID(),hashed=await passphraseHash(body.passphrase,salt);
 const guard=crypto.randomUUID();
 await atomic(env.DB,actor,[stmt(env.DB,`INSERT INTO s_guard(id,ok) VALUES(?,CASE WHEN NOT EXISTS(SELECT 1 FROM s_mfa WHERE operator_id=? AND enabled=1) AND EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.id=? AND s.operator_id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.operator_version=o.version AND o.status='active') THEN 1 ELSE 0 END)`,guard,actor.id,session.id,actor.id,Date.now()),stmt(env.DB,`INSERT INTO s_mfa(operator_id,secret_sealed,passphrase_salt,passphrase_hash,created_at) VALUES(?,?,?,?,?) ON CONFLICT(operator_id) DO UPDATE SET secret_sealed=excluded.secret_sealed,passphrase_salt=excluded.passphrase_salt,passphrase_hash=excluded.passphrase_hash,created_at=excluded.created_at`,actor.id,await seal(secret,'satchel-mfa:'+env.SESSION_SECRET),salt,hashed,Date.now()),audit(env.DB,actor,'security.mfa_enrollment_started',actor.id),stmt(env.DB,'DELETE FROM s_guard WHERE id=?',guard)]);
 return {secret,uri:'otpauth://totp/'+encodeURIComponent('Satchel:'+actor.email)+'?secret='+secret+'&issuer=Satchel&algorithm=SHA1&digits=6&period=30',sessionId:session.id};
}
export async function verifyMfa(env:Bindings,actor:Actor,session:Session,body:Data){
 human(actor);insist(typeof body.passphrase==='string'&&body.passphrase.length<=1024,'Enter your security passphrase');insist(typeof body.code==='string'&&/^\d{6}$/.test(body.code),'Enter the six-digit authenticator code');
 const row=await stmt(env.DB,'SELECT * FROM s_mfa WHERE operator_id=?',actor.id).first<Data>();
 insist(row,'Set up an authenticator first',409);const at=Date.now();
 insist(row.blocked_until<=at,'Too many attempts. Wait five minutes before trying again.',429);
 const secret=await unseal(row.secret_sealed,'satchel-mfa:'+env.SESSION_SECRET),counter=Math.floor(at/30000);
 const passwordMatches=same(await passphraseHash(body.passphrase,row.passphrase_salt),row.passphrase_hash);
 let matched=-1;for(const candidate of [counter-1,counter,counter+1])if(candidate>row.last_counter&&body.code===await codeAt(secret,candidate))matched=candidate;
 if(matched<0||!passwordMatches){
  await atomic(env.DB,actor,[stmt(env.DB,`UPDATE s_mfa SET failed_attempts=CASE WHEN blocked_until>0 AND blocked_until<=? THEN 1 ELSE failed_attempts+1 END,blocked_until=CASE WHEN (CASE WHEN blocked_until>0 AND blocked_until<=? THEN 1 ELSE failed_attempts+1 END)>=5 THEN ? ELSE 0 END WHERE operator_id=?`,at,at,at+300000,actor.id),audit(env.DB,actor,'security.mfa_refused',actor.id)]);
  insist(false,'Invalid passphrase or expired or already used authenticator code',403);
 }
 const guard=crypto.randomUUID();
 await atomic(env.DB,actor,[
  stmt(env.DB,`INSERT INTO s_guard(id,ok) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM s_mfa WHERE operator_id=? AND last_counter=? AND secret_sealed=? AND blocked_until<=?) AND EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id WHERE s.id=? AND s.operator_id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.operator_version=o.version AND o.status='active') THEN 1 ELSE 0 END)`,guard,actor.id,row.last_counter,row.secret_sealed,at,session.id,actor.id,at),
  stmt(env.DB,'UPDATE s_mfa SET enabled=1,last_counter=?,failed_attempts=0,blocked_until=0 WHERE operator_id=?',matched,actor.id),
  stmt(env.DB,'INSERT OR REPLACE INTO s_mfa_sessions(session_id,operator_id,verified_at) VALUES(?,?,?)',session.id,actor.id,at),
  audit(env.DB,actor,row.enabled?'security.mfa_verified':'security.mfa_enabled',actor.id),stmt(env.DB,'DELETE FROM s_guard WHERE id=?',guard)
 ]);
 return {enabled:true,required:false};
}
