import type {Bindings} from '../auth.server';
// Prospect-facing links are keyed signatures of a record id: they need no stored secret and reveal nothing else.
async function mac(env:Bindings,message:string){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message))),n=>n.toString(16).padStart(2,'0')).join('');
}
export const manageToken=(env:Bindings,consultationId:string)=>mac(env,'consultation-manage\n'+consultationId);
export const optOutSignature=(env:Bindings,followupId:string)=>mac(env,'followup-opt-out\n'+followupId);
export const manageLink=async(env:Bindings,consultationId:string)=>`${env.AUTH_ORIGIN}/consultation/${await manageToken(env,consultationId)}`;
export const optOutLink=async(env:Bindings,followupId:string)=>`${env.AUTH_ORIGIN}/followup/${followupId}/${await optOutSignature(env,followupId)}`;
