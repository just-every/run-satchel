// CLIENT-001: staff see exactly what one portal identity sees, by running that identity's own doors, and the preview is audited.
import {atomic,audit,Fault,human,insist,matter,need,stmt,text,type Actor,type Data} from './model';
import {clientTimeline} from './timeline';
import {portalShares,portalInvoices} from './client-shares';
import {portalThreads} from './portal-threads';
import {portalRequests} from './client-requests';
export async function portalPreview(db:D1Database,actor:Actor,matterId:string,emailValue:unknown) {
 human(actor);need(actor,'owner','lawyer');const m=await matter(db,actor,matterId),email=text(emailValue,'Portal identity',254).toLowerCase();
 const grant=await stmt(db,'SELECT kind,delegate_of FROM s_portal_grants WHERE email=? AND matter_id=? AND revoked_at IS NULL',email,m.id).first<Data>();insist(grant,'That person has no active portal grant on this matter',404);
 const as={id:'preview:'+email,email,name:email,role:'client',channel:'person'} as Actor,see=async<T>(read:()=>Promise<T>)=>{try{return await read();}catch(e){if(e instanceof Fault&&e.status===404)return null;throw e;}};
 await atomic(db,actor,[audit(db,actor,'portal.previewed',m.id,JSON.stringify({email,kind:grant.kind}),{matterId:m.id})]);
 return {identity:{email,kind:grant.kind,delegateOf:grant.delegate_of},timeline:await see(()=>clientTimeline(db,as,m.id)),shares:await see(()=>portalShares(db,as,m.id)),invoices:await see(()=>portalInvoices(db,as,m.id)),threads:await see(()=>portalThreads(db,as,m.id)),requests:await see(()=>portalRequests(db,as,m.id))};
}
