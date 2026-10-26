import {atomic,audit,id,insist,integer,now,rows,stmt,text,type Actor,type Data} from './model';
import {eligible,fences} from './correspondence';
import {guard} from './trust-guards';
import {responsibleUpdateCounsel,updateSourceGuards,visibleMatterUpdate} from './matter-update-authority';

async function responsiblePerson(db:D1Database,email:string){
 insist(await stmt(db,"SELECT 1 FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email WHERE o.email=? AND o.status='active' AND (o.role='owner' OR (m.active=1 AND m.role IN('lawyer','assistant')))",email).first(),'Choose an active responsible staff member',409);
}
export async function editMatterUpdate(db:D1Database,actor:Actor,updateId:string,b:Data){
 const u=await visibleMatterUpdate(db,actor,updateId);await responsibleUpdateCounsel(db,actor,u.matter_id);
 insist(u.status==='draft'&&b.revision===u.revision,'Refresh the draft before editing',409);
 const title=text(b.title,'Reviewed title',200),body=text(b.body,'Reviewed client wording',20000),responsible=text(b.responsibleEmail,'Responsible person',254).toLowerCase(),dueAt=text(b.dueAt,'Scheduled instant',30),max=integer(b.maxContacts,'Trailing seven-day recipient contact limit',1,7);
 insist(!/[\r\n]/.test(title),'Use a single-line title');insist(Number.isFinite(Date.parse(dueAt))&&new Date(dueAt).toISOString()===dueAt,'Use an ISO UTC instant');await responsiblePerson(db,responsible);
 insist(Array.isArray(b.recipients)&&b.recipients.length>0&&b.recipients.length<=50,'Choose between one and fifty recipients');
 const recipients=[...new Set<string>(b.recipients.map((e:unknown)=>text(e,'Recipient',254).toLowerCase()))];
 insist(recipients.every(e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),'Use valid recipient emails');
 insist(Array.isArray(b.promises)&&b.promises.length<=50,'Supply at most fifty reviewed promises');
 const promises=b.promises.map((p:Data)=>({id:id(),text:text(p.text,'Promise',2000),responsible:text(p.responsibleEmail,'Promise responsible person',254).toLowerCase()}));
 for(const p of promises)await responsiblePerson(db,p.responsible);
 const revision=id();
 await atomic(db,actor,[...updateSourceGuards(db,actor,u),guard(db,"EXISTS(SELECT 1 FROM s_matter_updates WHERE id=? AND status='draft' AND revision=?)",u.id,u.revision),stmt(db,'UPDATE s_matter_updates SET title=?,body=?,responsible_email=?,due_at=?,max_contacts=?,revision=? WHERE id=?',title,body,responsible,dueAt,max,revision,u.id),stmt(db,'DELETE FROM s_matter_update_recipients WHERE update_id=?',u.id),stmt(db,'DELETE FROM s_matter_update_promises WHERE update_id=?',u.id),...recipients.map(email=>stmt(db,'INSERT INTO s_matter_update_recipients VALUES(?,?)',u.id,email)),...promises.map(p=>stmt(db,'INSERT INTO s_matter_update_promises(id,update_id,text,responsible_email) VALUES(?,?,?,?)',p.id,u.id,p.text,p.responsible)),audit(db,actor,'matter_update.draft_reviewed',u.id,JSON.stringify({revision,recipients,promises,dueAt}),{matterId:u.matter_id})]);
 return {id:u.id,revision};
}
export async function approveMatterUpdate(db:D1Database,actor:Actor,updateId:string,b:Data){
 const u=await visibleMatterUpdate(db,actor,updateId);await responsibleUpdateCounsel(db,actor,u.matter_id);
 insist(u.status==='draft'&&b.revision===u.revision&&b.confirmed===true,'Confirm the exact current wording, recipients, promises and scheduled instant',409);
 const note=text(b.reviewNote,'Review and sending authority',2000);insist(u.due_at,'Review the scheduled instant first',409);
 const recipients=await rows(db,'SELECT email FROM s_matter_update_recipients WHERE update_id=? ORDER BY email',u.id),promises=await rows(db,'SELECT * FROM s_matter_update_promises WHERE update_id=? ORDER BY id',u.id);
 insist(recipients.length,'Review at least one recipient',409);await responsiblePerson(db,u.responsible_email);for(const p of promises)await responsiblePerson(db,p.responsible_email);
 const checks:D1PreparedStatement[]=[];
 for(const r of recipients){const m={matter_id:u.matter_id,recipient:r.email};checks.push(...fences(db,actor,m,await eligible(db,actor,m)));}
 const at=now(),revision=id();
 // Recipients and promises were saved under the draft revision, so approval freezes the entire packet.
 await atomic(db,actor,[...updateSourceGuards(db,actor,u),...checks,guard(db,'EXISTS(SELECT 1 FROM s_matter_stage_profiles WHERE matter_id=? AND lawyer_email=?)',u.matter_id,actor.email),guard(db,"EXISTS(SELECT 1 FROM s_matter_updates WHERE id=? AND status='draft' AND revision=?)",u.id,u.revision),stmt(db,"UPDATE s_matter_updates SET status='approved',revision=?,approved_by=?,approved_counsel_id=?,approved_at=?,review_note=? WHERE id=?",revision,actor.email,actor.id,at,note,u.id),...recipients.map(r=>stmt(db,'INSERT INTO s_matter_update_jobs(id,update_id,matter_id,recipient,due_at,created_at) VALUES(?,?,?,?,?,?)',id(),u.id,u.matter_id,r.email,u.due_at,at)),audit(db,actor,'matter_update.approved',u.id,JSON.stringify({revision,title:u.title,body:u.body,sourceCitation:u.source_citation,recipients:recipients.map(r=>r.email),promises,dueAt:u.due_at,maxContacts:u.max_contacts,reviewNote:note}),{matterId:u.matter_id})]);
 return {id:u.id,revision};
}
