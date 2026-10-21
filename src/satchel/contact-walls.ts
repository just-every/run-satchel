import {contactData} from './contact-data';
import {contactGraph} from './contact-graph';
import {wallAllows} from './matter-scope';
import {rows,type Actor,type Data} from './model';
// A profile that participates in an excluded wall stays wholly private. A
// related public profile does not expose the excluded identity or relationship.
export async function contactWallContext(db:D1Database,actor:Actor,contacts?:Data[]){
 const graph=contacts??contactGraph(await contactData(db)).contacts;
 const excluded=await rows(db,`SELECT w.matter_id,w.id,w.custodian_email FROM s_ethical_walls w WHERE NOT ${wallAllows('w.matter_id','?',actor.channel==='agent'?"'agent'":"'person'")}`,actor.email,actor.email);
 const privateContacts=new Map<string,Data[]>();
 for(const c of graph){const routes=excluded.filter(w=>c.matterRoles.some((r:Data)=>r.matter_id===w.matter_id));if(routes.length)privateContacts.set(c.id,routes);}
 return {privateContacts,contacts:graph};
}
export async function opaqueMatches(db:D1Database,actor:Actor,matches:Data[]){
 const context=await contactWallContext(db,actor);
 return matches.map(c=>{
  const routes=context.privateContacts.get(c.id);if(!routes)return {...c,relationships:(c.relationships??[]).filter((r:Data)=>!context.privateContacts.has(r.fromId)&&!context.privateContacts.has(r.toId))};
  return {restricted:true,custodianRoutes:routes.map(w=>({route:w.id,custodian:w.custodian_email}))};
 });
}
