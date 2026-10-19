import {contactData} from './contact-data';
import {contactGraph,contactMatches} from './contact-graph';
import {rows,insist,type Actor,type Data} from './model';
export const managesContacts=(actor:Actor)=>['owner','lawyer'].includes(actor.role)&&actor.channel==='person';
export async function contactState(db:D1Database,actor:Actor,query=''){
 const graph=contactGraph(await contactData(db));
 const matters=await rows(db,"SELECT id,title,matter_number FROM s_matters WHERE ?='owner' OR EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=s_matters.id AND a.email=?) ORDER BY matter_number,id",actor.role,actor.email);
 const permitted=new Set(matters.map(m=>m.id));
 const scoped=graph.contacts.map(c=>({...c,matterRoles:c.matterRoles.filter(l=>permitted.has(l.matter_id)),merges:c.merges.map(({snapshot,...history})=>history)}));
 const contacts=managesContacts(actor)?scoped:scoped.filter(c=>c.matterRoles.length);
 const visibleIds=new Set(contacts.map(c=>c.id));
 const safe=contacts.map(c=>({...c,relationships:c.relationships.filter((r:Data)=>visibleIds.has(r.fromId)&&visibleIds.has(r.toId))}));
 return {revision:graph.revision,canManage:managesContacts(actor),matters,contacts:query?safe.filter(c=>contactMatches(c,query,safe)):safe};
}

export async function contactDetail(db:D1Database,actor:Actor,partyId:string){const state=await contactState(db,actor),contact=state.contacts.find(c=>c.identityIds.includes(partyId));insist(contact,'Contact not found',404);return {...contact,resolvedFrom:partyId};}
