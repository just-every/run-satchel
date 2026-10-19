// Local webhook signing material never travels in a firm archive.
const bytes = (s:string) => new TextEncoder().encode(s);
export const randomSecret = () => [...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
async function key(secret:string) { return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',bytes('satchel-webhooks:'+secret)),'AES-GCM',false,['encrypt','decrypt']); }
export async function seal(value:string,secret:string) {
 const iv=crypto.getRandomValues(new Uint8Array(12)),data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(secret),bytes(value)));
 return JSON.stringify({iv:[...iv],data:[...data]});
}
export async function unseal(value:string,secret:string) {
 const v=JSON.parse(value);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(v.iv)},await key(secret),new Uint8Array(v.data)));
}
export async function sign(secret:string,value:string) {
 const k=await crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return [...new Uint8Array(await crypto.subtle.sign('HMAC',k,bytes(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
