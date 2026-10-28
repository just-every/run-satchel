import {firmToday} from './retention';
import type {Bindings} from '../auth.server';
import {atomic,audit,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {collectionBalance,collectionCounsel,collectionView} from './collection-state';
import {eligible,fences,sendCorrespondence} from './correspondence';
import {invoiceFunds} from './trust-transfers';
import {parseGrants} from './custom-roles';
import {requireArea} from './role-areas';

const instant=(value:unknown)=>{const v=text(value,'Due instant',30);insist(Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v,'Use an ISO UTC instant');return v;};
export async function collectionsState(db:D1Database,actor:Actor,matterId:string){
 human(actor);need(actor,'owner','lawyer');await matter(db,actor,matterId);requireArea(actor,'bank','full');
 const sequences=await rows(db,'SELECT * FROM s_collection_sequences WHERE matter_id=? ORDER BY approved_at,id',matterId),invoices=await rows(db,"SELECT b.id,i.number,MIN(d.due_date) dueDate FROM s_bills b JOIN s_invoice_issues i ON i.bill_id=b.id LEFT JOIN s_invoice_deliveries d ON d.bill_id=b.id WHERE b.matter_id=? AND b.status<>'void' AND b.corrects_bill_id IS NULL GROUP BY b.id",matterId);
 const today=await firmToday(db);for(const i of invoices){i.dueCents=(await invoiceFunds(db,i.id)).due_cents;i.agingDays=i.dueDate?Math.max(0,Math.floor((Date.parse(today)-Date.parse(i.dueDate))/86400000)):null;}invoices.sort((a,b)=>(a.dueDate??'9999').localeCompare(b.dueDate??'9999'));
 const ledgers=await rows(db,'SELECT DISTINCT l.id,a.name FROM s_trust_ledgers l JOIN s_trust_accounts a ON a.id=l.account_id JOIN s_retainer_requests r ON r.ledger_id=l.id WHERE l.matter_id=?',matterId);
 return {sequences:await Promise.all(sequences.map(s=>collectionView(db,s))),invoices,ledgers,authorization:await stmt(db,'SELECT * FROM s_client_reminder_authorizations WHERE matter_id=? ORDER BY sequence DESC LIMIT 1',matterId).first(),templates:await rows(db,'SELECT * FROM s_client_reminder_templates ORDER BY approved_at,id')};
}
export async function startCollection(db:D1Database,actor:Actor,matterId:string,b:Data){
 await collectionCounsel(db,actor,matterId);requireArea(actor,'bank','full');insist(b.confirmed===true,'Approve this exact collection sequence');
 insist(Boolean(b.billId)!==Boolean(b.ledgerId),'Choose one issued invoice or approved replenishment');
 const u=await stmt(db,'SELECT * FROM s_client_reminder_authorizations WHERE matter_id=? ORDER BY sequence DESC LIMIT 1',matterId).first<Data>();insist(u?.enabled&&u.counsel_id===actor.id,'Responsible counsel must opt in to client reminders first',409);
 insist(Array.isArray(b.steps)&&b.steps.length>0&&b.steps.length<=8,'Approve one to eight reminder steps');const steps=b.steps.map((n:unknown)=>integer(n,'Step day',0,365));insist(steps[0]===0&&steps.every((n:number,i:number)=>i===0||n>steps[i-1]),'Steps start at zero and increase');
 const s:Data={id:id(),matter_id:matterId,bill_id:b.billId?text(b.billId,'Invoice',100):null,ledger_id:b.ledgerId?text(b.ledgerId,'Ledger',100):null,recipient:text(b.recipient,'Recipient',254).toLowerCase(),authorization_id:u.id,owner_id:actor.id,owner_email:actor.email,first_due_at:instant(b.firstDueAt),steps:JSON.stringify(steps),approved_at:now(),reason:text(b.reason,'Sequence approval reason',2000)};
 if(s.bill_id){insist(await stmt(db,"SELECT 1 FROM s_bills b JOIN s_invoice_issues i ON i.bill_id=b.id WHERE b.id=? AND b.matter_id=? AND b.corrects_bill_id IS NULL AND b.status<>'void'",s.bill_id,matterId).first(),'Choose an active issued invoice on this matter',409);const t=await stmt(db,'SELECT * FROM s_client_reminder_templates WHERE id=?',u.invoice_template).first<Data>();s.subject=t!.subject;s.body=t!.body;s.replenishment_id=null;}
 else {const r=await stmt(db,"SELECT r.* FROM s_retainer_requests r JOIN s_trust_ledgers l ON l.id=r.ledger_id JOIN oa_operators o ON o.email=r.created_by AND o.status='active' AND o.role='owner' WHERE l.id=? AND l.matter_id=? AND r.recipient=? ORDER BY r.created_at DESC,r.id DESC LIMIT 1",s.ledger_id,matterId,s.recipient).first<Data>();insist(r,'Principal must approve a replenishment request for this client first',409);s.replenishment_id=r.id;s.subject='A secure portal update';s.body='A secure portal update is available. Sign in to review it or contact counsel.';}
 const balance=await collectionBalance(db,s);insist(balance.dueCents>0,'No collectible balance remains',409);insist(!s.bill_id||balance.dueDate,'Deliver the invoice with its reviewed due date before collections',409);
 const issue=s.bill_id?await stmt(db,'SELECT pdf_digest FROM s_invoice_issues WHERE bill_id=?',s.bill_id).first<Data>():null,revision=await eligible(db,actor,{...s,bill_digest:issue?.pdf_digest});
 const prior=await stmt(db,'SELECT * FROM s_collection_sequences WHERE bill_id=? OR replenishment_id=?',s.bill_id,s.replenishment_id).first<Data>();if(prior){insist(prior.recipient===s.recipient&&prior.steps===s.steps&&prior.first_due_at===s.first_due_at&&prior.reason===s.reason,'A sequence already owns this source; use its retained history',409);return collectionView(db,prior);}
 await atomic(db,actor,[...fences(db,actor,{...s,bill_digest:issue?.pdf_digest},revision),guard(db,'(SELECT id FROM s_client_reminder_authorizations WHERE matter_id=? ORDER BY sequence DESC LIMIT 1)=?',matterId,u.id),stmt(db,'INSERT INTO s_collection_sequences VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',s.id,matterId,s.bill_id,s.ledger_id,s.replenishment_id,s.recipient,u.id,actor.id,actor.email,s.first_due_at,s.steps,s.subject,s.body,s.approved_at,s.reason),audit(db,actor,'collection.approved',s.id,JSON.stringify({billId:s.bill_id,ledgerId:s.ledger_id,templateVersion:s.id,steps,firstDueAt:s.first_due_at,reason:s.reason}),{matterId})]);return collectionView(db,s);
}
async function load(db:D1Database,actor:Actor,collectionId:string){const s=await stmt(db,'SELECT * FROM s_collection_sequences WHERE id=?',collectionId).first<Data>();insist(s,'Collection sequence not found',404);await collectionCounsel(db,actor,s.matter_id);requireArea(actor,'bank','full');return s;}
export async function collectionAction(db:D1Database,actor:Actor,collectionId:string,b:Data){
 const s=await load(db,actor,collectionId);insist(['dispute','promise','hardship','representation','clear','stop','decision'].includes(b.kind),'Choose a reply or counsel decision');
 const view=await collectionView(db,s);insist(view.status!=='void'&&view.events.at(-1)?.kind!=='stop','Ended sequences cannot resume',409);
 const note=text(b.note,'Reply or decision note',2000),next=b.nextDueAt?instant(b.nextDueAt):null;
 if(b.kind==='decision')insist(view.status==='review'&&view.attempts.some((a:Data)=>a.attempted_at),'A new decision follows a checked provider attempt',409);
 await atomic(db,actor,[accessGuard(db,actor,s.matter_id),stmt(db,'INSERT INTO s_collection_events(id,collection_id,kind,note,next_due_at,decision_attempt_id,actor,at) VALUES(?,?,?,?,?,?,?,?)',id(),s.id,b.kind,note,next,b.kind==='decision'?view.attempts.filter((a:Data)=>a.attempted_at).at(-1)?.id:null,actor.email,now()),audit(db,actor,'collection.'+b.kind,s.id,note,{matterId:s.matter_id})]);return collectionView(db,s);
}
export async function runCollection(env:Bindings,actor:Actor,collectionId:string,atMs=Date.now()){
 const db=env.DB,s=await load(db,actor,collectionId);insist(s.owner_id===actor.id,'Only the approving collection owner can run this sequence',403);
 const view=await collectionView(db,s);if(view.status!=='active'||Date.parse(view.nextDueAt)>atMs)return view;
 let link=await stmt(db,'SELECT * FROM s_collection_attempts WHERE collection_id=? AND collection_step=?',s.id,view.step).first<Data>();
 if(!link){
  const issue=s.bill_id?await stmt(db,'SELECT pdf_digest FROM s_invoice_issues WHERE bill_id=?',s.bill_id).first<Data>():null,m={...s,id:id(),bill_digest:issue?.pdf_digest??null},revision=await eligible(db,actor,m),attempt=id(),linkId=id();
  await atomic(db,actor,[...fences(db,actor,m,revision),guard(db,'(SELECT COUNT(*) FROM s_collection_attempts WHERE collection_id=?)=?',s.id,view.step),stmt(db,'INSERT INTO s_correspondence VALUES(?,?,?,?,?,?,?,?,?,?,?)',m.id,s.matter_id,s.recipient,s.subject,s.body,s.bill_id,m.bill_digest,revision,actor.email,s.approved_at,'Approved collection template version '+s.id),stmt(db,'INSERT INTO s_correspondence_attempts(id,correspondence_id,decision_by,decision_at,decision_note,contact_revision) VALUES(?,?,?,?,?,?)',attempt,m.id,actor.email,now(),'Approved collection template version '+s.id+'; step '+(view.step+1)+'; collectible cents '+view.dueCents,revision),stmt(db,'INSERT INTO s_collection_attempts VALUES(?,?,?,?,?,?,?)',linkId,s.id,view.step,m.id,attempt,view.nextDueAt,view.dueCents),audit(db,actor,'collection.step_prepared',s.id,JSON.stringify({step:view.step,attempt,dueCents:view.dueCents,templateVersion:s.id}),{matterId:s.matter_id})]);
  link={attempt_id:attempt};
 }
 await sendCorrespondence(env,actor,link.attempt_id,atMs);return collectionView(db,s);
}
export async function runCollections(env:Bindings,atMs:number){
 const list=await rows(env.DB,"SELECT s.* FROM s_collection_sequences s WHERE s.first_due_at<=? AND NOT EXISTS(SELECT 1 FROM s_collection_events e WHERE e.collection_id=s.id AND e.kind='stop') AND NOT EXISTS(SELECT 1 FROM s_bills b WHERE b.id=s.bill_id AND b.status='void') ORDER BY s.approved_at,s.id",new Date(atMs).toISOString());
 for(const s of list){try{const o=await stmt(env.DB,'SELECT o.*,m.role member_role,m.active,r.permissions FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email LEFT JOIN s_custom_roles r ON r.id=m.custom_role_id WHERE o.id=?',s.owner_id).first<Data>();insist(o?.status==='active'&&(o.role==='owner'||o.active===1),'Collection owner no longer active',409);const actor:Actor={id:o.id,email:o.email,name:o.display_name,role:o.role==='owner'?'owner':o.member_role,channel:'person',...(o.role!=='owner'&&o.permissions?{grants:parseGrants(o.permissions)}:{})};await runCollection(env,actor,s.id,atMs);}catch{/* A denied sequence never grants alternate outbound authority. */}}
}
