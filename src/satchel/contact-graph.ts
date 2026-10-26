import type {ContactData} from './contact-data';
import type {Data} from './model';
const unique=(values:string[])=>[...new Set(values.filter(Boolean))];
export function contactGraph(data:ContactData){
 const merged=new Map(data.merges.map(m=>[m.losing_id,m.survivor_id]));
 const canonical=(partyId:string):string=>{let current=partyId;const seen=new Set<string>();while(merged.has(current)){if(seen.has(current))throw Error('Invalid contact merge cycle');seen.add(current);current=merged.get(current)!;}return current;};
 const groups=new Map<string,Data[]>();for(const party of data.parties){const root=canonical(party.id);groups.set(root,[...(groups.get(root)??[]),party]);}
 const contacts=[...groups].map(([contactId,parties])=>{
  const survivor=parties.find(p=>p.id===contactId)!,profiles=parties.map(p=>data.profiles.find(f=>f.party_id===p.id));
  const profile=data.profiles.find(p=>p.party_id===contactId);
  const field=(name:string)=>unique(profiles.flatMap(p=>p?JSON.parse(p[name]):[]));
  const identities=parties.map(p=>({id:p.id,name:p.name,aliases:p.aliases,email:p.email,source:p.source,revision:p.revision,profile:data.profiles.find(f=>f.party_id===p.id)??null,sources:data.sources.filter(s=>s.target_id===p.id).map(s=>({sourceIdentity:s.source_identity,sourceId:JSON.parse(s.record_json).sourceId,jobId:s.job_id,provenance:JSON.parse(s.record_json)}))}));
  const identityIds=parties.map(p=>p.id),consents=data.consents.filter(c=>identityIds.includes(c.party_id));
  const effectiveConsent=Object.fromEntries(['email','phone','sms','post'].map(channel=>{
   const decisions=identityIds.map(partyId=>consents.filter(c=>c.party_id===partyId&&c.channel===channel).at(-1)?.decision??'unknown');
   return [channel,decisions.includes('denied')?'denied':decisions.every(d=>d==='allowed')?'allowed':'unknown'];
  }));
  const matterRoles=[...data.matterLinks.map(l=>({id:'native:'+l.matter_id+':'+l.party_id,party_id:l.party_id,matter_id:l.matter_id,role:l.relation,title:l.title,matter_number:l.matter_number})),...data.roles].filter(l=>identityIds.includes(l.party_id));
  const relationships=data.relationships.filter(r=>identityIds.includes(r.from_id)||identityIds.includes(r.to_id)).map(r=>({...r,fromId:canonical(r.from_id),toId:canonical(r.to_id)}));
  return {id:contactId,name:profile?.display_name??survivor.name,kind:profile?.kind??'unclassified',aliases:unique([...parties.flatMap(p=>[p.name,...p.aliases.split(';').map((v:string)=>v.trim())]),...field('aliases')]),formerNames:field('former_names'),emails:unique([...parties.map(p=>p.email),...field('emails')]),phones:field('phones'),addresses:field('addresses'),identities,identityIds,matterRoles,relationships,classifications:[...data.classifications.filter(c=>identityIds.includes(c.party_id)),...data.staffRelationships.filter(c=>identityIds.includes(c.party_id)).map(c=>({...c,classification:'staff_relationship',note:c.kind+' · '+c.staff_email+' · '+c.start_date+(c.end_date?' – '+c.end_date:'')+' · '+c.source})),...data.leads.filter(l=>identityIds.includes(l.party_id)).map(l=>({classification:'prospective_client',leadId:l.id,stage:l.stage_name??'No stage',year:new Intl.DateTimeFormat('en-US',{timeZone:data.timezone,year:'numeric'}).format(new Date(l.created_at)),note:(l.stage_name??'No stage')+' · '+new Intl.DateTimeFormat('en-US',{timeZone:data.timezone,year:'numeric'}).format(new Date(l.created_at)),actor:l.created_by,at:l.created_at}))],consents,effectiveConsent,preferences:data.preferences.filter(p=>identityIds.includes(p.party_id)),merges:data.merges.filter(m=>canonical(m.survivor_id)===contactId)};
 });
 return {contacts,canonical,revision:data.revision};
}
export function contactMatches(contact:Data,query:string,all:Data[]){
 const normal=(v:string)=>v.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 const related=contact.relationships.flatMap((r:Data)=>[r.relationship,...all.filter(c=>c.id===r.fromId||c.id===r.toId).flatMap(c=>[c.name,...c.aliases,...c.formerNames])]);
 const words=normal([contact.name,...contact.aliases,...contact.formerNames,...contact.emails,...contact.phones,...contact.addresses,...contact.matterRoles.flatMap((r:Data)=>[r.role,r.title??'',r.matter_number??'']),...related,...contact.identities.flatMap((i:Data)=>[i.id,...i.sources.flatMap((s:Data)=>[s.sourceId,s.sourceIdentity])])].join(' '));
 return normal(query).split(' ').filter(Boolean).every(token=>words.split(' ').some(w=>w.startsWith(token)));
}
