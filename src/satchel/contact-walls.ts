import {contactData} from './contact-data';
import {contactGraph} from './contact-graph';
import {routeAuthority} from './conflict-routes';
import {matterScope,wallAllows} from './matter-scope';
import {insist,rows,type Actor,type Data} from './model';
// A profile that participates in an excluded wall stays wholly private. A
// related public profile does not expose the excluded identity or relationship.
export async function contactWallContext(db:D1Database,actor:Actor,contacts?:Data[]){
 const graph=contacts??contactGraph(await contactData(db)).contacts;
 const excluded=await rows(db,`SELECT w.matter_id,w.id,w.custodian_email FROM s_ethical_walls w WHERE NOT ${wallAllows('w.matter_id','?',actor.channel==='agent'?"'agent'":"'person'")}`,actor.email,actor.email);
 const privateContacts=new Map<string,Data[]>();
 for(const c of graph){const routes=excluded.filter(w=>c.matterRoles.some((r:Data)=>r.matter_id===w.matter_id));if(routes.length&&c.matterRoles.every((r:Data)=>routes.some(w=>w.matter_id===r.matter_id)))for(const identityId of c.identityIds)privateContacts.set(identityId,routes);}
 return {privateContacts,contacts:graph};
}
export async function opaqueMatches(db:D1Database,actor:Actor,matches:Data[]){
 const context=await contactWallContext(db,actor),permitted=new Set((await rows(db,`SELECT id FROM s_matters WHERE ${matterScope('s_matters.id')}`,actor.role,actor.email)).map(m=>m.id));
 const excluded=await rows(db,`SELECT w.* FROM s_ethical_walls w WHERE NOT ${wallAllows('w.matter_id','?')}`,actor.email,actor.email),seen=new Set<string>(),result:Data[]=[];
 const revision=(await rows(db,'SELECT party_revision FROM s_meta WHERE id=1'))[0].party_revision;
 for(const c of matches){
  const original=context.contacts.find(p=>p.identityIds.includes(c.id)),wallRoutes=original?excluded.filter(w=>original.matterRoles.some((r:Data)=>r.matter_id===w.matter_id)):[];
  const privateOnly=original&&context.privateContacts.has(original.id);
  const nativeHidden=original?.matterRoles.some((r:Data)=>!permitted.has(r.matter_id)&&!excluded.some(w=>w.matter_id===r.matter_id));
  const routeIds=[...(c.restricted?(c.custodianRoutes??[]).map((r:Data)=>r.route):[]),...wallRoutes.map(w=>w.id),...(nativeHidden?['principal']:[])];
  if(!c.restricted&&!privateOnly){
   // Strip hidden roles and source records before returning the permitted contact.
   result.push({...c,matterRoles:(c.matterRoles??[]).filter((r:Data)=>permitted.has(r.matter_id)),matter_ids:(c.matterRoles??[]).filter((r:Data)=>permitted.has(r.matter_id)).map((r:Data)=>r.matter_id).join(','),identities:(c.identities??[]).map((i:Data)=>({...i,sources:[]})),relationships:(c.relationships??[]).filter((r:Data)=>!context.privateContacts.has(r.fromId)&&!context.privateContacts.has(r.toId))});
  }
  for(const routeId of routeIds){const r=await routeAuthority(db,routeId,revision),key=r.custodian_email??'unassigned';if(seen.has(key))continue;seen.add(key);result.push({restricted:true,custodianRoutes:[{route:routeId,custodian:r.custodian_email??"custodian unassigned: ask the wall's counsel"}]});}
 }
 return result;
}
