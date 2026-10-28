import {id,insist,stmt,text,type Data} from './model';
export const contactRoles=['client','adverse','insurer','witness','expert','counsel'];
export const contactChannels=['email','phone','sms','post'];
export function contactList(value:unknown,label:string,max=30){
 insist(Array.isArray(value)&&value.length<=max,`${label} must be a list of at most ${max} values`);
 return [...new Set(value.map(v=>text(v,label,500)))];
}
export function contactProfile(body:Data){
 insist(['person','organization'].includes(body.kind),'Choose person or organization');
 const emails=contactList(body.emails??[],'Email addresses');
 insist(emails.every(v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)),'Use valid email addresses');
 return {kind:body.kind,name:text(body.name,'Contact name',300),aliases:contactList(body.aliases??[],'Aliases'),formerNames:contactList(body.formerNames??[],'Former names'),emails,phones:contactList(body.phones??[],'Phone numbers'),addresses:contactList(body.addresses??[],'Postal addresses')};
}
export async function contactData(db:D1Database){
 // One D1 batch freezes the revision and every graph component together.
 const result=await db.batch([
 stmt(db,'SELECT party_revision FROM s_meta WHERE id=1'),stmt(db,'SELECT * FROM s_parties ORDER BY id'),
 stmt(db,'SELECT * FROM s_contact_profiles ORDER BY party_id'),stmt(db,'SELECT * FROM s_contact_relationships ORDER BY id'),
 stmt(db,'SELECT r.*,m.title,m.matter_number FROM s_contact_matter_roles r JOIN s_matters m ON m.id=r.matter_id ORDER BY r.id'),stmt(db,'SELECT * FROM s_contact_consents ORDER BY sequence'),
 stmt(db,'SELECT * FROM s_contact_merges ORDER BY merged_at,losing_id'),
 stmt(db,'SELECT p.*,m.title,m.matter_number FROM s_matter_parties p JOIN s_matters m ON m.id=p.matter_id ORDER BY p.matter_id,p.party_id'),
 stmt(db,"SELECT target_id,source_identity,job_id,record_json FROM ik_provenance WHERE target_kind='party' UNION ALL SELECT target_id,identity source_identity,job_id,json_object('sourceId',source_id,'namespace',CASE WHEN account LIKE 'practicepanther:%' THEN 'practicepanther-package' ELSE 'clio-package' END,'payload',json(source_json)) record_json FROM s_move_sources WHERE kind='contacts' AND disposition IN('imported','preserved')"),
 stmt(db,'SELECT * FROM s_contact_classifications ORDER BY at,id'),stmt(db,'SELECT * FROM s_staff_relationships ORDER BY at,id'),stmt(db,"SELECT l.*,s.name stage_name,lc.party_id FROM s_leads l JOIN s_lead_contacts lc ON lc.lead_id=l.id LEFT JOIN s_lead_stages s ON s.id=l.stage_id WHERE l.status IN ('open','lost')"),stmt(db,'SELECT timezone FROM s_firm WHERE id=1'),stmt(db,'SELECT * FROM s_contact_preferences ORDER BY sequence')
 ]);
 const [revision,parties,profiles,relationships,roles,consents,merges,matterLinks,sources,classifications,staffRelationships,leads,firm,preferences]=result.map(r=>r.results as Data[]);
 return {revision:Number(revision[0].party_revision),parties,profiles,relationships,roles,consents,merges,matterLinks,sources,classifications,staffRelationships,leads,preferences,timezone:firm[0]?.timezone??'UTC'};
}
export type ContactData=Awaited<ReturnType<typeof contactData>>;
export function contactRevisionGuard(db:D1Database,revision:unknown){
 insist(Number.isSafeInteger(revision),'Refresh the contact graph before saving',409);
 const guard=id();return [stmt(db,'INSERT INTO s_guard VALUES(?,CASE WHEN (SELECT party_revision FROM s_meta WHERE id=1)=? THEN 1 ELSE 0 END)',guard,revision),stmt(db,'DELETE FROM s_guard WHERE id=?',guard)];
}
