import {contactChannels,contactData,contactProfile,contactRevisionGuard,contactRoles} from './contact-data';
import {contactGraph} from './contact-graph';
import {contactState} from './contact-read';
import {atomic,audit,date,human,id,insist,matter,need,now,stmt,text,type Actor,type Data} from './model';
export {contactState,contactDetail} from './contact-read';
export function contactAuthority(actor:Actor){human(actor);need(actor,'owner','lawyer');}
export async function saveContact(db:D1Database,actor:Actor,body:Data){
 contactAuthority(actor);const data=await contactData(db),graph=contactGraph(data),profile=contactProfile(body);
 const partyId=body.id?text(body.id,'Contact ID',150):id(),existing=data.parties.find(p=>p.id===partyId);
 insist(!body.id||existing,'Contact not found',404);insist(!existing||graph.canonical(partyId)===partyId,'Use the surviving contact to edit this profile',409);
 if(existing)insist((await contactState(db,actor)).contacts.some(c=>c.identityIds.includes(partyId)),'Contact not found',404);
 const at=now(),revision=id(),writes=contactRevisionGuard(db,body.revision);
 if(!existing)writes.push(stmt(db,'INSERT INTO s_parties(id,name,aliases,email,source,revision) VALUES(?,?,?,?,?,?)',partyId,profile.name,profile.aliases.join('; '),profile.emails[0]??'','native',revision));
 else writes.push(stmt(db,'UPDATE s_parties SET revision=? WHERE id=?',revision,partyId));
 writes.push(stmt(db,`INSERT INTO s_contact_profiles(party_id,kind,display_name,aliases,former_names,emails,phones,addresses,revision,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(party_id) DO UPDATE SET kind=excluded.kind,display_name=excluded.display_name,aliases=excluded.aliases,former_names=excluded.former_names,emails=excluded.emails,phones=excluded.phones,addresses=excluded.addresses,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,partyId,profile.kind,profile.name,JSON.stringify(profile.aliases),JSON.stringify(profile.formerNames),JSON.stringify(profile.emails),JSON.stringify(profile.phones),JSON.stringify(profile.addresses),revision,actor.email,at),audit(db,actor,existing?'contact.profile_updated':'contact.created',partyId,JSON.stringify({sourcePartyId:partyId,profile,previousProfile:data.profiles.find(p=>p.party_id===partyId)??null})));
 await atomic(db,actor,writes);return (await contactState(db,actor)).contacts.find(c=>c.id===partyId)!;
}
export async function contactAction(db:D1Database,actor:Actor,partyId:string,op:string,body:Data){
 contactAuthority(actor);const data=await contactData(db),graph=contactGraph(data),contact=graph.contacts.find(c=>c.identityIds.includes(partyId));
 insist(contact&&(await contactState(db,actor)).contacts.some(c=>c.id===contact.id),'Contact not found',404);const at=now(),objectId=id(),writes=contactRevisionGuard(db,body.revision);
 if(op==='relationship'){
  const otherId=text(body.otherId,'Related contact',150),other=graph.contacts.find(c=>c.id===otherId);
  insist(other&&(await contactState(db,actor)).contacts.some(c=>c.id===other.id),'Related contact not found',404);insist(other.id!==contact.id,'Choose a different contact');
  const relationship=text(body.relationship,'Relationship',120);
  writes.push(stmt(db,'INSERT INTO s_contact_relationships VALUES(?,?,?,?,?,?)',objectId,contact.id,other.id,relationship,actor.email,at),stmt(db,'UPDATE s_parties SET revision=? WHERE id IN (?,?)',id(),contact.id,other.id),audit(db,actor,'contact.relationship_added',objectId,JSON.stringify({fromId:contact.id,toId:other.id,relationship})));
 }else if(op==='matter-role'){
  const matterId=text(body.matterId,'Matter',150),m=await matter(db,actor,matterId);insist(contactRoles.includes(body.role),'Choose a legal matter role');
  const fence=id();writes.push(stmt(db,"INSERT INTO s_guard VALUES(?,CASE WHEN ?='owner' OR EXISTS(SELECT 1 FROM s_matter_access WHERE matter_id=? AND email=?) THEN 1 ELSE 0 END)",fence,actor.role,m.id,actor.email),stmt(db,'DELETE FROM s_guard WHERE id=?',fence),stmt(db,'INSERT INTO s_contact_matter_roles VALUES(?,?,?,?,?,?)',objectId,contact.id,m.id,body.role,actor.email,at),stmt(db,'UPDATE s_parties SET revision=? WHERE id=?',id(),contact.id),audit(db,actor,'contact.matter_role_added',objectId,JSON.stringify({partyId:contact.id,matterId:m.id,role:body.role}),{matterId:m.id}));
 }else if(op==='conflict-classification'){
  insist(['prospective_client','staff_relationship'].includes(body.classification),'Choose prospective client or staff relationship');
  const note=text(body.note,'Classification evidence',2000);
  insist(body.classification==='staff_relationship','Prospective-client labels come from an unconverted lead or consultation');
  const staffEmail=text(body.staffEmail,'Staff member',254).toLowerCase(),kind=text(body.kind,'Relationship kind',200),startDate=date(body.startDate),endDate=body.endDate?date(body.endDate):null;
  insist(!endDate||endDate>=startDate,'Relationship end must follow its start');
  insist(await stmt(db,"SELECT 1 FROM s_members WHERE email=? UNION SELECT 1 FROM oa_operators WHERE email=? AND role='owner'",staffEmail,staffEmail).first(),'Choose a recorded staff member');
  writes.push(stmt(db,'INSERT INTO s_staff_relationships VALUES(?,?,?,?,?,?,?,?,?)',objectId,contact.id,staffEmail,kind,startDate,endDate,note,actor.email,at));
  writes.push(stmt(db,'UPDATE s_parties SET revision=? WHERE id=?',id(),contact.id),audit(db,actor,'contact.conflict_classified',objectId,JSON.stringify({partyId:contact.id,classification:body.classification,note})));
 }else if(op==='consent'){
  insist(contactChannels.includes(body.channel),'Choose a communication channel');insist(['allowed','denied','unknown'].includes(body.decision),'Choose the recorded consent decision');
  const evidenceDate=date(body.evidenceDate),source=text(body.source,'Consent source/reference',2000);
  writes.push(stmt(db,'INSERT INTO s_contact_consents VALUES(?,?,?,?,?,?,?,?,?)',objectId,data.revision,partyId,body.channel,body.decision,evidenceDate,source,actor.email,at),stmt(db,'UPDATE s_parties SET revision=? WHERE id=?',id(),partyId),audit(db,actor,'contact.consent_recorded',objectId,JSON.stringify({partyId,channel:body.channel,decision:body.decision,evidenceDate,source})));
 }else insist(false,'Unknown contact action',404);
 await atomic(db,actor,writes);return contactState(db,actor);
}
