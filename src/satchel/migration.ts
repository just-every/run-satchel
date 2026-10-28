import {canonicalJson,sha256} from '../modules/import-kit/src/d1/index';
import {atomic,audit,human,id,insist,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {requireWholeFirmWallAccess} from './wall-doors';
import {guard} from './trust-guards';
import {parsePackage,kinds,type MovePackage,type MoveRow} from './imports/package';
import {applyNative,nativeSnapshotSql,targetId} from './imports/native';
import {importedMatterProfile,mappedMatterProfile,readProfile} from './matter-fields';
import {invoiceFunds} from './trust-transfers';

// Every ordinary native use fences safe contact removal, including graph and
// consent history that does not change the party's own revision.
const unusedContactSql=`(SELECT ${[
 ['s_matter_parties','party_id=c.id'],['s_contact_relationships','from_id=c.id OR to_id=c.id'],
 ['s_contact_matter_roles','party_id=c.id'],['s_contact_consents','party_id=c.id'],
 ['s_contact_merges','losing_id=c.id OR survivor_id=c.id'],['s_contact_classifications','party_id=c.id'],
 ['s_staff_relationships','party_id=c.id'],['s_lead_contacts','party_id=c.id'],['s_contact_preferences','party_id=c.id'],['s_trust_matter_transfers','client_id=c.id'],
].map(([table,predicate])=>`NOT EXISTS(SELECT 1 FROM ${table} WHERE ${predicate})`).join(' AND ')} FROM (SELECT ? id) c)`;

async function principal(db:D1Database,actor:Actor){
 human(actor);need(actor,'owner');await requireWholeFirmWallAccess(db,actor);
 insist(await stmt(db,"SELECT 1 FROM oa_operators WHERE id=? AND email=? AND role='owner' AND status='active'",actor.id,actor.email).first(),'Only the active principal can manage a move',403);
}
async function review(db:D1Database,input:unknown){
 const plan=parsePackage(input),p=plan.package;
 const prior=await rows(db,'SELECT * FROM s_move_sources WHERE account=?',p.account),byIdentity=new Map(prior.map(s=>[s.identity,s]));
 const incoming=new Set(plan.records.map(r=>r.identity));
 for(const ref of plan.references){
  const identity=sha256(canonicalJson([p.account,ref.kind,ref.id]));
  if(!incoming.has(identity)&&!prior.some(s=>s.identity===identity&&s.disposition==='imported'))plan.errors.push(`${ref.row.kind} ${ref.row.id}: unmatched ${ref.kind} identity ${ref.id}`);
 }
 if(plan.records.some(r=>r.kind==='trust')&&!await stmt(db,"SELECT 1 FROM s_trust_accounts WHERE id=? AND kind='trust'",p.trustAccountId??'').first())plan.errors.push('Map an existing native trust bank account before importing balances');
 for(const [source,email] of Object.entries(p.staff))if(!await stmt(db,"SELECT 1 FROM s_members WHERE email=? AND active=1 AND role<>'client' UNION SELECT 1 FROM oa_operators WHERE email=? AND role='owner' AND status='active'",email,email).first())plan.errors.push(`Staff ${source}: choose an active firm staff member`);
 for(const r of plan.records){
  const old=byIdentity.get(r.identity);
  if(old&&(old.source_hash!==r.hash||!['imported','preserved'].includes(old.disposition)))plan.errors.push(`${r.kind} ${r.id}: source changed, undone or erased; no overwrite or resurrection is allowed`);
  if(r.kind==='invoices'&&!old&&await stmt(db,'SELECT 1 FROM s_invoice_numbers WHERE number=?',r.value.number).first())plan.errors.push(`Invoice ${r.id}: source number is already registered`);
  if(r.kind==='matters'&&!old&&await stmt(db,'SELECT 1 FROM s_matters WHERE matter_number=?',r.value.display_number).first())plan.errors.push(`Matter ${r.id}: source number is already registered`);
 }
 if(p.phase==='delta'){
  const previous=await stmt(db,"SELECT account,state FROM s_move_jobs WHERE fingerprint=?",p.previousFingerprint).first<Data>();
  if(!previous||previous.account!==p.account||previous.state!=='completed')plan.errors.push('Complete the preceding package before applying its final delta');
 }
 return {...plan,prior};
}
const publicReview=(p:Awaited<ReturnType<typeof review>>)=>({fingerprint:p.fingerprint,mappingVersion:p.mappingVersion,phase:p.package.phase,counts:Object.fromEntries(kinds.map(k=>[k,{package:p.records.filter(r=>r.kind===k).length,source:p.package.counts[k],imported:p.prior.filter(r=>r.kind===k&&['imported','preserved'].includes(r.disposition)).length}])),files:[...p.files.values()].map(({contentBase64,...f})=>f),relationships:p.references.map(ref=>({from:ref.row.id,kind:ref.kind,to:ref.id})),errors:p.errors,coverageGaps:p.warnings,fileRequirements:p.records.filter(r=>['documents','invoices'].includes(r.kind)).map(r=>({id:r.kind==='documents'?r.value.file_id:r.value.pdf_file_id,kind:r.kind,sourceId:r.id,present:p.files.has(r.kind==='documents'?r.value.file_id:r.value.pdf_file_id)})),contacts:p.records.filter(r=>r.kind==='contacts').map(r=>({id:r.id,name:r.value.name})),rows:p.records.map(r=>({kind:r.kind,sourceId:r.id,status:p.prior.some(s=>s.identity===r.identity)?'imported':'pending',...r.kind==='matters'?{clientId:r.value.client_id,client:p.records.find(c=>c.kind==='contacts'&&c.id===(p.package.clientRepairs[r.value.client_id]??r.value.client_id))?.value.name,title:r.value.description,number:r.value.display_number,adverse:r.value.adverse_party}:{}}))});
async function retainedPackage(db:D1Database,job:Data):Promise<MovePackage>{
 const [parts,originals]=await Promise.all([rows(db,'SELECT body FROM s_move_package_chunks WHERE job_id=? ORDER BY ordinal',job.id),rows(db,'SELECT metadata_json,content_base64 FROM s_move_originals WHERE job_id=?',job.id)]);
 const payload=JSON.parse(parts.map(p=>p.body).join(''));
 return {...payload,files:originals.filter(f=>f.content_base64!==null).map(f=>({...JSON.parse(f.metadata_json),contentBase64:f.content_base64}))};
}
async function load(db:D1Database,jobId:unknown){const job=await stmt(db,'SELECT * FROM s_move_jobs WHERE id=?',text(jobId,'Move job',100)).first<Data>();insist(job,'Move job not found',404);return job;}
export async function migrationState(db:D1Database,actor:Actor){await principal(db,actor);return {jobs:await rows(db,'SELECT id,account,fingerprint,phase,checkpoint,total,state,created_at FROM s_move_jobs ORDER BY rowid DESC')};}
export async function migrationAction(db:D1Database,actor:Actor,op:string,b:Data){
 await principal(db,actor);
 if(op==='preview'||op==='commit'){
  const plan=await review(db,b.package),p=plan.package;
  // Type mappings are checked before the first write, using the ordinary
  // matter-field validator rather than accepting untyped custom history.
  for(const r of plan.records.filter(r=>r.kind==='matters'))try{await importedMatterProfile(db,actor,targetId(p.account,'matters',r.id),r.value.practice_code??'',r.value.fields?JSON.parse(r.value.fields):{caseNumber:r.value.case_number},{account:p.account,sourceId:r.id});}catch(e){plan.errors.push(`Matter ${r.id}: ${(e as Error).message}`);}
  if(op==='preview')return publicReview(plan);
  insist(plan.errors.length===0,'Resolve package errors before applying: '+plan.errors.join('; '),409);
  insist(b.fingerprint===plan.fingerprint,'The package changed; preview it again',409);
  const previous=await stmt(db,'SELECT id FROM s_move_jobs WHERE fingerprint=?',plan.fingerprint).first<Data>();
  if(previous)return migrationAction(db,actor,'status',{id:previous.id});
  const jobId=id(),payload=JSON.stringify({...p,files:undefined}),header=JSON.stringify({schema:p.schema,account:p.account,phase:p.phase,extractedAt:p.extractedAt,counts:p.counts,balances:p.balances,coverage:p.coverage});
  const writes=[stmt(db,"INSERT INTO s_move_jobs(id,account,fingerprint,package_json,phase,previous_fingerprint,total,state,created_by,created_at) VALUES(?,?,?,?,?,?,?,'applying',?,?)",jobId,p.account,plan.fingerprint,header,p.phase,p.previousFingerprint??null,plan.records.length,actor.email,now())];
  // Bounded rows keep a package containing several small originals below D1's
  // per-row ceiling; every part is published with the reviewed job atomically.
  for(let offset=0,ordinal=0;offset<payload.length;offset+=200000,ordinal++)writes.push(stmt(db,'INSERT INTO s_move_package_chunks VALUES(?,?,?)',jobId,ordinal,payload.slice(offset,offset+200000)));
  for(const f of p.files){const {contentBase64,...metadata}=f;writes.push(stmt(db,'INSERT INTO s_move_originals VALUES(?,?,?,?,?)',jobId,f.id,f.sha256,JSON.stringify(metadata),contentBase64));}
  writes.push(audit(db,actor,'move.reviewed',jobId,JSON.stringify({fingerprint:plan.fingerprint,counts:p.counts,coverageGaps:plan.warnings})));
  await atomic(db,actor,writes);
  return migrationAction(db,actor,'status',{id:jobId});
 }
 const job=await load(db,b.id);
 if(op==='status'){
  let next:Data|null=null;
  if(job.state==='applying'){const plan=parsePackage(await retainedPackage(db,job)),r=plan.records[job.checkpoint];if(r){next={kind:r.kind,sourceId:r.id,title:r.value.description??r.value.title??r.value.name??r.id,number:r.value.display_number,adverse:r.value.adverse_party};if(r.kind==='matters'){const clientId=plan.package.clientRepairs[r.value.client_id]??r.value.client_id;const client=await stmt(db,"SELECT source_json FROM s_move_sources WHERE account=? AND kind='contacts' AND source_id=?",job.account,clientId).first<Data>();next.client=client?JSON.parse(client.source_json).name:null;}}}
  return {next,job:{...job,package_json:undefined},sources:await rows(db,'SELECT kind,source_id,target_id,disposition,source_json FROM s_move_sources WHERE job_id=? ORDER BY rowid',job.id),cutover:await stmt(db,'SELECT * FROM s_move_cutovers WHERE job_id=?',job.id).first()};}
 if(op==='resume'){
  insist(job.state!=='undone','An undone package cannot be replayed',409);
  if(job.state==='completed')return migrationAction(db,actor,'status',{id:job.id});
  const plan=parsePackage(await retainedPackage(db,job)),r=plan.records[job.checkpoint];
  if(r){
   const old=await stmt(db,'SELECT source_hash,disposition FROM s_move_sources WHERE identity=?',r.identity).first<Data>();
   if(old){insist(old.source_hash===r.hash&&['imported','preserved'].includes(old.disposition),'Source changed or erased; reconcile without overwriting',409);await atomic(db,actor,[guard(db,"EXISTS(SELECT 1 FROM s_move_jobs WHERE id=? AND checkpoint=? AND state='applying')",job.id,job.checkpoint),stmt(db,'UPDATE s_move_jobs SET checkpoint=checkpoint+1 WHERE id=?',job.id)]);}
   else await applyNative(db,actor,job,plan.package,r,plan.files,b.review);
  }
  await atomic(db,actor,[stmt(db,"UPDATE s_move_jobs SET state='completed' WHERE id=? AND checkpoint=total AND state='applying'",job.id)]);
  return migrationAction(db,actor,'status',{id:job.id});
 }
 if(op==='undo'){
  insist(job.state==='completed'||job.state==='undone','Complete the package before undoing safe rows',409);
  insist(!await stmt(db,'SELECT 1 FROM s_move_cutovers WHERE account=?',job.account).first(),'A signed cutover cannot be undone',409);
  const sources=await rows(db,"SELECT * FROM s_move_sources WHERE job_id=? AND disposition='imported'",job.id);
  const writes:D1PreparedStatement[]=[];
  for(const s of sources){
   if(s.kind==='contacts'){
    const expected=JSON.parse(s.native_json),unused=await stmt(db,'SELECT '+unusedContactSql+' ok',s.target_id).first<Data>();
    const current=await stmt(db,'SELECT * FROM s_parties WHERE id=?',s.target_id).first<Data>();
    const safe=current&&canonicalJson(current)===canonicalJson(expected)&&unused?.ok===1;
    if(safe)writes.push(guard(db,unusedContactSql,s.target_id),guard(db,'EXISTS(SELECT 1 FROM s_parties WHERE id=? AND revision=? AND name=? AND aliases=? AND email=?) AND NOT EXISTS(SELECT 1 FROM s_matter_parties WHERE party_id=?)',s.target_id,current.revision,current.name,current.aliases,current.email,s.target_id),stmt(db,'DELETE FROM s_contact_profiles WHERE party_id=?',s.target_id),stmt(db,'DELETE FROM s_parties WHERE id=?',s.target_id));
    writes.push(stmt(db,'UPDATE s_move_sources SET disposition=? WHERE identity=?',safe?'removed':'preserved',s.identity));
   }else writes.push(stmt(db,"UPDATE s_move_sources SET disposition='preserved' WHERE identity=?",s.identity));
  }
  await atomic(db,actor,[...writes,stmt(db,"UPDATE s_move_jobs SET state='undone' WHERE id=?",job.id),audit(db,actor,'move.undone',job.id,'Unused unchanged contacts removed; linked, edited and native history retained')]);
  return migrationAction(db,actor,'status',{id:job.id});
 }
 if(op==='reconcile'||op==='cutover'){
  const report=await reconcile(db,job),fingerprint=sha256(canonicalJson(report));
  if(op==='reconcile')return {report,fingerprint};
  insist(job.phase==='delta'&&job.state==='completed','Apply a final delta before cutover',409);
  insist(!report.gaps.length,'Reconcile every count, balance, file and coverage gap before cutover',409);
  insist(b.fingerprint===fingerprint,'Reconciliation changed; review and sign the current report',409);
  insist(b.confirmed===true,'Explicitly confirm the signed source reconciliation');
  const declaration=text(b.declaration,'Signed cutover declaration',2000);
  const existing=await stmt(db,'SELECT * FROM s_move_cutovers WHERE job_id=?',job.id).first<Data>();if(existing)return existing;
  await atomic(db,actor,[guard(db,"EXISTS(SELECT 1 FROM s_move_jobs WHERE id=? AND state='completed') AND NOT EXISTS(SELECT 1 FROM s_move_jobs WHERE account=? AND state='applying')",job.id,job.account),stmt(db,'INSERT INTO s_move_cutovers VALUES(?,?,?,?,?,?,?,?)',id(),job.account,job.id,JSON.stringify(report),fingerprint,actor.email,now(),declaration),audit(db,actor,'move.cutover_signed',job.id,JSON.stringify({fingerprint,declaration}))]);
  return migrationAction(db,actor,'status',{id:job.id});
 }
 insist(false,'Unknown migration action',404);
}
async function reconcile(db:D1Database,job:Data){
 const p=JSON.parse(job.package_json) as MovePackage,sources=await rows(db,"SELECT * FROM s_move_sources WHERE account=?",job.account),gaps:string[]=[];
 const counts:Data={},balances={billedCents:0,unbilledCents:0,arCents:0,trustCents:0};
 for(const kind of kinds){counts[kind]={source:p.counts[kind],native:sources.filter(s=>s.kind===kind&&['imported','preserved'].includes(s.disposition)).length};if(counts[kind].source!==counts[kind].native)gaps.push(`${kind}: source count does not reconcile`);if(p.coverage[kind]!=='complete')gaps.push(`${kind}: retrieve missing source history through an authorized export`);}
 for(const s of sources){
  if(!['imported','preserved'].includes(s.disposition)){gaps.push(`${s.kind} ${s.source_id}: ${s.disposition}`);continue;}
  if(s.kind!=='relationships'){
   const row=await stmt(db,await nativeSnapshotSql(db,s.target_table),s.target_id).first<Data>();
   const actual=row?Object.values(row)[0]:null;
   if(!actual||canonicalJson(JSON.parse(String(actual)))!==canonicalJson(JSON.parse(s.native_json)))gaps.push(`${s.kind} ${s.source_id}: native record changed or missing`);
  }
  const v=JSON.parse(s.source_json);
  if(s.kind==='matters'){
   const expected=await mappedMatterProfile(db,v.practice_code??'',v.fields?JSON.parse(v.fields):{caseNumber:v.case_number}),actual=await readProfile(db,s.target_id);
   if(canonicalJson({...actual,revision:null})!==canonicalJson(expected))gaps.push(`Matter ${s.source_id}: mapped fields differ from the source`);
  }
  if(s.kind==='relationships'&&!await stmt(db,'SELECT 1 FROM s_matter_parties WHERE matter_id=? AND party_id=? AND relation=?',targetId(job.account,'matters',v.matter_id),targetId(job.account,'contacts',v.contact_id),v.relation).first())gaps.push(`Relationship ${s.source_id}: native link missing`);
  if(s.kind==='invoices'){
   const original=await stmt(db,"SELECT i.pdf_base64,i.pdf_digest,json_extract(b.snapshot,'$.originalPdfDigest') source_digest FROM s_invoice_issues i JOIN s_bills b ON b.id=i.bill_id WHERE b.id=?",s.target_id).first<Data>();
   if(!original||original.pdf_digest!==original.source_digest||sha256(Uint8Array.from(atob(original.pdf_base64),c=>c.charCodeAt(0)))!==original.source_digest)gaps.push(`Invoice ${s.source_id}: original PDF does not reconcile`);
  }
  if(s.kind==='documents'){
   const d=await stmt(db,'SELECT v.content_base64,v.sha256 FROM s_document_versions v JOIN s_documents d ON d.id=v.document_id WHERE d.id=? AND d.erased_at IS NULL AND v.version=1',s.target_id).first<Data>();
   if(!d?.content_base64||sha256(Uint8Array.from(atob(d.content_base64),c=>c.charCodeAt(0)))!==d.sha256)gaps.push(`Document ${s.source_id}: original unavailable`);
  }
  if(s.kind==='invoices'){const b=await stmt(db,"SELECT json_extract(snapshot,'$.totalCents') total FROM s_bills WHERE id=?",s.target_id).first<Data>();balances.billedCents+=Number(b?.total??0);balances.arCents+=Number((await invoiceFunds(db,s.target_id)).due_cents);}
  if(['time','expenses'].includes(s.kind)&&!v.invoice_id){const e=await stmt(db,'SELECT amount_cents FROM s_entries WHERE id=? AND NOT EXISTS(SELECT 1 FROM s_billing_sources WHERE entry_id=?)',s.target_id,s.target_id).first<Data>();balances.unbilledCents+=Number(e?.amount_cents??0);}
  if(s.kind==='trust'){const t=await stmt(db,'SELECT COALESCE(SUM(e.cents),0) balance_cents FROM s_move_trust t JOIN s_trust_entries e ON e.ledger_id=t.ledger_id WHERE t.id=?',s.target_id).first<Data>();balances.trustCents+=Number(t?.balance_cents??0);}
 }
 for(const k of Object.keys(balances) as (keyof typeof balances)[])if(balances[k]!==Number(p.balances[k]))gaps.push(`${k}: source and native totals differ`);
 if(job.state!=='completed')gaps.push('Package apply is not complete');
 return {account:job.account,finalDelta:job.phase==='delta',fingerprint:job.fingerprint,counts,sourceBalances:p.balances,nativeBalances:balances,trustBoundary:'Source-backed native opening approved by the designated trust officer; no bank funds are moved',gaps};
}
export async function matterMigration(db:D1Database,actor:Actor,matterId:string){
 await matter(db,actor,matterId);human(actor);need(actor,'owner','lawyer','assistant');
 return {sources:await rows(db,"SELECT kind,source_id,source_json,disposition,target_id FROM s_move_sources WHERE (kind<>'trust' OR ?='owner') AND (kind<>'documents' OR EXISTS(SELECT 1 FROM s_documents d WHERE d.id=s_move_sources.target_id AND (d.visibility='matter' OR d.created_by=? OR ?='owner'))) AND (kind NOT IN('notes','calls','emails') OR EXISTS(SELECT 1 FROM s_matter_notes n WHERE n.id=s_move_sources.target_id AND (n.visibility='team' OR n.author_email=?))) AND ((target_id=? AND kind='matters') OR (account IN(SELECT account FROM s_move_sources WHERE target_id=? AND kind='matters') AND json_extract(source_json,'$.matter_id') IN(SELECT source_id FROM s_move_sources WHERE target_id=? AND kind='matters')))",actor.role,actor.email,actor.role,actor.email,matterId,matterId,matterId),invoices:await rows(db,"SELECT b.id,i.number,i.pdf_digest,ib.paid_cents,json_extract(b.snapshot,'$.totalCents') total_cents FROM s_bills b JOIN s_invoice_issues i ON i.bill_id=b.id JOIN s_move_invoice_balances ib ON ib.bill_id=b.id WHERE b.matter_id=?",matterId)};
}
