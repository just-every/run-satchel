import {canonicalJson,sha256} from '../../modules/import-kit/src/d1/index';
import {atomic,audit,id,insist,now,rows,stmt,text,type Actor,type Data} from '../model';
import {trustOfficer,officerGuard,sourceDocument,sourceGuard} from '../trust';
import {contactProfile} from '../contact-data';
import {openMatter} from '../matters';
import {importedMatterProfile} from '../matter-fields';
import {guard} from '../trust-guards';
import {migrationFeePlan} from '../fee-plans';
import {migrationWork} from '../bulk-work';
import {type MoveRow,type MovePackage,type MoveFile,money} from './package';
export const targetId=(account:string,kind:string,sourceId:string)=>'move:'+sha256(canonicalJson([account,kind,sourceId]));
export const targetTables:Record<string,string>={contacts:'s_parties',matters:'s_matters',relationships:'s_matter_parties',documents:'s_documents',notes:'s_matter_notes',calls:'s_matter_notes',emails:'s_matter_notes',calendar:'s_appointments',tasks:'s_tasks',time:'s_entries',expenses:'s_entries',invoices:'s_bills',trust:'s_move_trust',grow:'s_leads',fees:'s_move_fee_lines',financial:'s_move_financial_activity',portal:'s_matter_notes',sms:'s_matter_notes'};
const pk=(table:string)=>table==='s_matter_parties'?'matter_id':table==='s_move_invoice_balances'?'bill_id':'id';
export async function nativeSnapshotSql(db:D1Database,table:string){
 insist([...Object.values(targetTables),'s_contact_relationships','s_contact_matter_roles'].includes(table),'Unknown migration target');
 const columns=await rows(db,`PRAGMA table_info(${table})`);
 return `SELECT json_object(${columns.flatMap(c=>[`'${c.name}'`,c.name]).join(',')}) FROM ${table} WHERE ${pk(table)}=?`;
}
export async function nativeRow(db:D1Database,table:string,target:string){return (await stmt(db,await nativeSnapshotSql(db,table),target).first<Data>())??null;}
export async function applyNative(db:D1Database,actor:Actor,job:Data,p:MovePackage,r:MoveRow,files:Map<string,MoveFile>,review:Data={}){
 const v=r.value,at=now(),target=targetId(p.account,r.kind,r.id);let table=targetTables[r.kind];
 const mid=v.matter_id?targetId(p.account,'matters',v.matter_id):'',staff=v.staff_id?p.staff[v.staff_id]:actor.email;
 const writes:D1PreparedStatement[]=[];
 if(v.staff_id)writes.push(guard(db,"EXISTS(SELECT 1 FROM s_members WHERE email=? AND active=1 AND role<>'client') OR EXISTS(SELECT 1 FROM oa_operators WHERE email=? AND role='owner' AND status='active')",staff,staff));
 if(r.kind==='contacts')writes.push(stmt(db,'INSERT INTO s_parties(id,name,aliases,email,source,revision) VALUES(?,?,?,?,?,?)',target,v.name,v.aliases??'',v.email??'',p.mycase?'mycase':p.schema==='satchel-smokeball-v1'?'smokeball':'clio',id()));
 if(r.kind==='contacts'&&v.profile){const profile=contactProfile(JSON.parse(v.profile));writes.push(stmt(db,'INSERT INTO s_contact_profiles VALUES(?,?,?,?,?,?,?,?,?,?,?)',target,profile.kind,profile.name,JSON.stringify(profile.aliases),JSON.stringify(profile.formerNames),JSON.stringify(profile.emails),JSON.stringify(profile.phones),JSON.stringify(profile.addresses),id(),actor.email,at));}
 if(r.kind==='relationships'){
  if(v.other_contact_id){table='s_contact_relationships';writes.push(stmt(db,'INSERT INTO s_contact_relationships VALUES(?,?,?,?,?,?)',target,targetId(p.account,'contacts',v.contact_id),targetId(p.account,'contacts',v.other_contact_id),v.relation,actor.email,at));}
  else if(['client','adverse'].includes(v.relation))writes.push(stmt(db,'INSERT OR IGNORE INTO s_matter_parties(matter_id,party_id,relation) VALUES(?,?,?)',mid,targetId(p.account,'contacts',v.contact_id),v.relation));
  else {table='s_contact_matter_roles';writes.push(stmt(db,'INSERT INTO s_contact_matter_roles VALUES(?,?,?,?,?,?)',target,targetId(p.account,'contacts',v.contact_id),mid,v.relation,actor.email,at));}
 }
 if(r.kind==='matters'){
  const clientId=p.clientRepairs[v.client_id]??v.client_id,client=await stmt(db,"SELECT p.name FROM s_parties p JOIN s_move_sources s ON s.target_id=p.id WHERE s.account=? AND s.kind='contacts' AND s.source_id=? AND s.disposition='imported'",p.account,clientId).first<Data>();
  insist(client,'Repair the unmatched client before importing this matter',409);
  const conflict=await stmt(db,'SELECT client,adverse FROM s_conflicts WHERE id=? AND actor=?',review.conflictId??'',actor.email).first<Data>();
  insist(conflict&&conflict.client===client.name&&conflict.adverse===v.adverse_party,'Run and review a fresh conflict search for this matter',409);
  const fields=v.fields?JSON.parse(v.fields):{caseNumber:v.case_number??undefined};
  writes.push(...await importedMatterProfile(db,actor,target,v.practice_code??'',fields,{account:p.account,sourceId:r.id,job:job.id,sourceHash:r.hash}));
  writes.push(stmt(db,'UPDATE s_matters SET lifecycle_status=?,practice_code=? WHERE id=?',v.status,v.practice_code??'',target));
 }
 if(r.kind==='documents'){
  const f=files.get(v.file_id);insist(f,'Supply the original before applying this source document',409);
  writes.push(stmt(db,"INSERT INTO s_documents(id,matter_id,title,visibility,created_by,created_at,current_version,revision,updated_by,updated_channel,updated_at,document_type) VALUES(?,?,?,?,?,?,1,?,?,'person',?,?)",target,mid,f.name,v.visibility==='matter'?'matter':'private',staff,v.date+'T00:00:00.000Z',id(),actor.email,at,v.document_type??''),
   stmt(db,"INSERT INTO s_document_versions(document_id,version,name,mime,declared_mime,size,sha256,content_base64,created_by,created_channel,created_at) VALUES(?,1,?,?,?,?,?,?,?,'person',?)",target,f.name,f.mime,f.mime,f.size,f.sha256,f.contentBase64,staff,f.modifiedAt));
 }
 if(['notes','calls','emails','portal','sms'].includes(r.kind))writes.push(stmt(db,"INSERT INTO s_matter_notes VALUES(?,?,?,?,?,?,0,?,'[]',NULL,?,?)",target,mid,r.kind==='calls'?'call':'note',text(v.title,'History title',200),v.body,v.visibility==='team'?'team':'private',v.occurred_at,staff,at));
 if(r.kind==='calendar')writes.push(stmt(db,"INSERT INTO s_appointments(id,matter_id,title,location,video_url,timezone,start_date,start_time,duration_minutes,frequency,repeat_interval,occurrences,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",target,mid,v.title,v.location??'',v.video_url??'',v.timezone,v.date,v.time,Number(v.duration_minutes),v.frequency??'once',Number(v.repeat_interval??1),Number(v.occurrences??1),staff,at));
 if(r.kind==='tasks')writes.push(stmt(db,"INSERT INTO s_tasks(id,matter_id,title,priority,due_date,owner_email,series_id,status,completed_by,completed_at,completion_evidence,revision,created_by,created_at) VALUES(?,?,?,'normal',?,?,?,?,?,?,?,?,?,?)",target,mid,v.title,v.due_date||null,staff,target,v.status,v.status==='done'?actor.email:null,v.status==='done'?at:null,v.status==='done'?'Completed in '+(p.mycase?'MyCase':p.schema==='satchel-smokeball-v1'?'Smokeball':'Clio')+' source export':null,id(),staff,at));
 if(['time','expenses'].includes(r.kind)&&(p.schema==='satchel-smokeball-v1'||Boolean(p.mycase)))writes.push(...await migrationWork(db,actor,{matterId:mid,sourceId:r.id,timekeeperEmail:staff,kind:r.kind==='time'?'time':'disbursement',date:v.date,description:v.description,minutes:Number(v.minutes),rateCents:v.rate_cents===''?undefined:Number(v.rate_cents),amountCents:money(v.amount_cents,'Source work amount'),billable:v.billable==='true',utbmsTask:v.utbms_task,utbmsActivity:v.utbms_activity,utbmsExpense:v.utbms_expense,...(r.kind==='expenses'?{expense:{category:v.category,vendor:v.vendor,vendorReference:v.vendor_reference,accountingCode:v.accounting_code}}:{})},p.account,target));
 if(['time','expenses'].includes(r.kind)&&p.schema!=='satchel-smokeball-v1'&&!p.mycase)writes.push(stmt(db,'INSERT INTO s_entries(id,matter_id,revision,kind,date,description,minutes,rate_cents,amount_cents,created_by,created_at,timekeeper_email) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',target,mid,id(),r.kind==='time'?'time':'disbursement',v.date,v.description,r.kind==='time'?Number(v.minutes):null,r.kind==='time'?Number(v.rate_cents):null,money(v.amount_cents,'Work amount'),staff,at,staff));
 if(['time','expenses'].includes(r.kind)&&v.invoice_id){
  const prior=await stmt(db,"SELECT b.id,b.matter_id FROM s_bills b JOIN s_move_sources s ON s.target_id=b.id WHERE s.account=? AND s.kind='invoices' AND s.source_id=? AND s.disposition='imported'",p.account,v.invoice_id).first<Data>();
  if(prior){insist(prior.matter_id===mid,'Billed work must belong to its invoice matter',409);writes.push(stmt(db,'INSERT INTO s_billing_sources(entry_id,bill_id,source_revision) SELECT id,?,revision FROM s_entries WHERE id=?',prior.id,target));}
 }
 if(r.kind==='fees'){
  let planId=null;
  if(!v.invoice_id){
   insist(review.confirmed===true,'Review the exact unbilled source fee terms before adopting them',409);
   text(review.reviewNote,'Source fee terms review',2000);
   planId=target+':plan';
   writes.push(...await migrationFeePlan(db,actor,mid,{...JSON.parse(v.terms),title:v.description,amountCents:Number(v.amount_cents),startDate:v.date,reviewed:true},planId));
   writes.push(audit(db,actor,'move.fee_terms_adopted',target,review.reviewNote,{matterId:mid}));
  }
  writes.push(stmt(db,'INSERT INTO s_move_fee_lines VALUES(?,?,?,?,?,?,?)',target,mid,v.invoice_id?targetId(p.account,'invoices',v.invoice_id):null,v.date,v.description,Number(v.amount_cents),planId));
 }
 if(r.kind==='financial'){
  const source=await sourceDocument(db,actor,targetId(p.account,'documents',v.document_id),mid);
  writes.push(sourceGuard(db,source,actor),stmt(db,'INSERT INTO s_move_financial_activity VALUES(?,?,?,?,?,?,?,?,?,?)',target,mid,targetId(p.account,'contacts',p.clientRepairs[v.client_id]??v.client_id),v.ledger,v.kind,v.date,Number(v.amount_cents),v.invoice_id?targetId(p.account,'invoices',v.invoice_id):null,source.id,v.source_reference));
 }
 if(r.kind==='invoices'){
  const f=files.get(v.pdf_file_id);insist(f,'Supply the historic invoice original before applying',409);const total=money(v.total_cents,'Invoice total'),ar=money(v.ar_cents,'AR'),ordinal=Number(v.ordinal);
  const sources=await rows(db,"SELECT s.target_id,e.revision,e.kind,e.date,e.description,e.minutes,e.rate_cents,e.amount_cents FROM s_move_sources s JOIN s_entries e ON e.id=s.target_id WHERE s.account=? AND s.kind IN('time','expenses') AND json_extract(s.source_json,'$.invoice_id')=? AND e.matter_id=?",p.account,r.id,mid);
  const m=await stmt(db,'SELECT * FROM s_matters WHERE id=?',mid).first<Data>();insist(m,'Matter missing',409);
  const feeLines=p.mycase?await rows(db,'SELECT id,date,description,amount_cents FROM s_move_fee_lines WHERE invoice_id=? AND matter_id=?',target,mid):[];
  if(p.mycase)insist(sources.reduce((n,s)=>n+Number(s.amount_cents),0)+feeLines.reduce((n,s)=>n+Number(s.amount_cents),0)+Number(v.tax_cents??0)===total,'Source invoice lines and tax must reconcile to its original total',409);
  const snapshot={title:(p.mycase?'MyCase':'Clio')+' invoice '+v.number,date:v.date,currency:'USD',matterId:mid,matterNumber:m.matter_number,matterTitle:m.title,client:m.client,totalCents:total,subtotalCents:total-Number(v.tax_cents??0),taxCents:Number(v.tax_cents??0),imported:true,originalPdfDigest:f.sha256,sourceAccount:p.account,sourceId:r.id,lines:[...feeLines.map(s=>({sourceId:s.id,kind:'fee',date:s.date,description:s.description,amountCents:s.amount_cents})),...sources.map(s=>({sourceId:s.target_id,sourceRevision:s.revision,kind:s.kind,date:s.date,description:s.description,minutes:s.minutes,rateCents:s.rate_cents,amountCents:s.amount_cents}))]};
  // A bill belongs to one matter; the full source dataset stays in the migration package.
  const artifact=[Object.keys(v),Object.values(v)].map(cells=>cells.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
  const artifactDigest=sha256(artifact),revision=id();
  writes.push(stmt(db,"INSERT INTO s_bills(id,matter_id,revision,status,snapshot,artifact,artifact_digest,approved_by,approved_at,review_note,exported_at,created_by,created_at) VALUES(?,?,?,'exported',?,?,?,?,?,?,?,?,?)",target,mid,revision,JSON.stringify(snapshot),artifact,artifactDigest,actor.email,at,'Principal reviewed source invoice; original PDF preserved',at,actor.email,at),
   stmt(db,"INSERT INTO s_invoice_numbers(number,bill_id,kind,ordinal,source,created_at) VALUES(?,?,'imported',?,?,?)",v.number,target,ordinal,JSON.stringify({account:p.account,sourceId:r.id,job:job.id}),at),
   stmt(db,'INSERT INTO s_invoice_issues(bill_id,number,approved_revision,approved_digest,snapshot_digest,pdf_base64,pdf_digest,issued_by,issued_at) VALUES(?,?,?,?,?,?,?,?,?)',target,v.number,revision,artifactDigest,sha256(JSON.stringify(snapshot)),f.contentBase64,f.sha256,actor.email,v.date+'T00:00:00.000Z'),
   stmt(db,'INSERT INTO s_move_invoice_balances VALUES(?,?,?)',target,total-ar,JSON.stringify({account:p.account,sourceId:r.id})),
   stmt(db,'UPDATE s_invoice_counter SET next_number=MAX(next_number,?),revision=? WHERE id=1',ordinal+1,id()));
  for(const s of sources)writes.push(stmt(db,'INSERT INTO s_billing_sources VALUES(?,?,?)',s.target_id,target,s.revision));
 }
 if(r.kind==='trust'){
  await trustOfficer(db,actor);insist(review.confirmed===true,'Explicitly approve the exact source trust opening');text(review.reviewNote,'Trust source reconciliation approval',2000);
  const source=await sourceDocument(db,actor,targetId(p.account,'documents',v.document_id),mid),ledger=target,opening=target+':opening';
  insist(v.statement_date<=at.slice(0,10),'Trust opening statement cannot be in the future');
  writes.push(officerGuard(db,actor),sourceGuard(db,source,actor),guard(db,"EXISTS(SELECT 1 FROM s_matter_parties WHERE matter_id=? AND party_id=? AND relation='client')",mid,targetId(p.account,'contacts',p.clientRepairs[v.client_id]??v.client_id)),guard(db,"EXISTS(SELECT 1 FROM s_trust_accounts WHERE id=? AND kind='trust') AND NOT EXISTS(SELECT 1 FROM s_trust_ledgers WHERE account_id=? AND matter_id=?)",p.trustAccountId,p.trustAccountId,mid),
   stmt(db,'INSERT INTO s_trust_ledgers VALUES(?,?,?,?,?)',ledger,p.trustAccountId,mid,actor.email,at),
   stmt(db,'INSERT INTO s_trust_openings VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',opening,p.trustAccountId,ledger,id(),Number(v.balance_cents),v.statement_date,source.id,source.version,source.digest,v.source_reference,actor.email,at),
   stmt(db,"INSERT INTO s_trust_entries VALUES(?,?,?,'opening',?,?,?,?,?,?)",target+':entry',p.trustAccountId,ledger,Number(v.balance_cents),v.statement_date,v.statement_date,opening,actor.email,at),
   stmt(db,'INSERT INTO s_move_trust VALUES(?,?,?,?,?,?,?)',target,mid,v.client_id,Number(v.balance_cents),v.statement_date,v.source_reference,ledger),audit(db,actor,'trust.opening_approved',opening,'Explicit migration approval by designated trust officer'));
 }
 if(r.kind==='grow')writes.push(stmt(db,"INSERT INTO s_leads(id,name,email,phone,summary,referral_source,assigned_email,status,revision,created_by,created_at,last_activity_at) VALUES(?,?,?,?,?,?,?,'open',?,?,?,?)",target,v.name,v.email??'',v.phone??'',v.summary,v.referral_source??'Clio Grow',staff,id(),staff,v.created_at,v.created_at),stmt(db,"INSERT INTO s_lead_events VALUES(?,?,'imported',?,?,?)",id(),target,JSON.stringify({account:p.account,sourceId:r.id,fields:v}),actor.email,at));
 const snapshotSql=await nativeSnapshotSql(db,table),nativeId=table==='s_matter_parties'?mid:target;
 writes.push(stmt(db,'INSERT INTO s_move_sources(identity,account,kind,source_id,source_hash,source_json,job_id,target_table,target_id,native_json) VALUES(?,?,?,?,?,?,?,?,?,COALESCE(('+snapshotSql+"),'{}'))",r.identity,p.account,r.kind,r.id,r.hash,JSON.stringify(v),job.id,table,nativeId,nativeId),
  guard(db,"EXISTS(SELECT 1 FROM s_move_jobs WHERE id=? AND state='applying' AND checkpoint=?)",job.id,job.checkpoint),
  stmt(db,'UPDATE s_move_jobs SET checkpoint=checkpoint+1 WHERE id=?',job.id),audit(db,actor,'move.row_applied',r.identity,JSON.stringify({kind:r.kind,sourceId:r.id,target}),{matterId:r.kind==='matters'?target:v.matter_id?mid:undefined}));
 if(r.kind==='matters')return openMatter(db,actor,{title:v.description,conflictId:review.conflictId,confirmed:review.confirmed,reviewNote:review.reviewNote,practiceCode:v.practice_code,restrictionsAcknowledged:review.restrictionsAcknowledged},target,{number:v.display_number,statements:writes,openedAt:v.opened_at,clientPartyId:targetId(p.account,'contacts',p.clientRepairs[v.client_id]??v.client_id)});
 await atomic(db,actor,writes);
 return {id:target};
}
