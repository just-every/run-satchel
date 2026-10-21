import {contactData} from './contact-data';
import {contactGraph} from './contact-graph';
import {wallAllows} from './matter-scope';
import {insist,rows,type Actor,type Data} from './model';
// A profile that participates in an excluded wall stays wholly private. A
// related public profile does not expose the excluded identity or relationship.
export async function contactWallContext(db:D1Database,actor:Actor,contacts?:Data[]){
 const graph=contacts??contactGraph(await contactData(db)).contacts;
 const excluded=await rows(db,`SELECT w.matter_id,w.id,w.custodian_email FROM s_ethical_walls w WHERE NOT ${wallAllows('w.matter_id','?',actor.channel==='agent'?"'agent'":"'person'")}`,actor.email,actor.email);
 const privateContacts=new Map<string,Data[]>();
 for(const c of graph){const routes=excluded.filter(w=>c.matterRoles.some((r:Data)=>r.matter_id===w.matter_id));if(routes.length)for(const identityId of c.identityIds)privateContacts.set(identityId,routes);}
 return {privateContacts,contacts:graph};
}
export async function opaqueMatches(db:D1Database,actor:Actor,matches:Data[]){
 const context=await contactWallContext(db,actor);
 const wallRoutes=await rows(db,'SELECT id,custodian_email FROM s_ethical_walls'),seen=new Set<string>(),result:Data[]=[];
 for(const c of matches){
  const routes=c.restricted?c.custodianRoutes:context.privateContacts.get(c.id)?.map(w=>({route:w.id,custodian:w.custodian_email}));
  if(routes){for(const r of routes){if(seen.has(r.route))continue;seen.add(r.route);const wall=wallRoutes.find(w=>w.id===r.route);insist(wall,'Custodian route no longer exists',409);result.push({restricted:true,custodianRoutes:[{route:r.route,custodian:wall.custodian_email}]});}}
  else result.push({...c,relationships:(c.relationships??[]).filter((r:Data)=>!context.privateContacts.has(r.fromId)&&!context.privateContacts.has(r.toId))});
 }
 return result;
}
