import {accountWallScope,entryWallScope} from './trust-wall-scope';
import {matterScope} from './matter-scope';
import {atomic,audit,date,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard,availabilitySql} from './trust-guards';
import {documentAccess,visibleDocument} from './documents';
export async function trustOfficer(db:D1Database,actor:Actor){
 human(actor);insist(await stmt(db,"SELECT 1 FROM s_members WHERE email=? AND role='trust_officer' AND active=1",actor.email).first(),'A designated trust officer must authorize this action',403);
}
// FIRM-002: accountants reconcile and read the records; only designated trust officers authorize.
export async function trustReconciler(db:D1Database,actor:Actor){
 human(actor);insist(await stmt(db,"SELECT 1 FROM s_members WHERE email=? AND role IN('trust_officer','accountant') AND active=1",actor.email).first(),'A designated trust officer or accountant must view or reconcile trust records',403);
}
export const reconcilerGuard=(db:D1Database,actor:Actor)=>guard(db,"EXISTS(SELECT 1 FROM s_members WHERE email=? AND role IN('trust_officer','accountant') AND active=1)",actor.email);
export const officerGuard=(db:D1Database,actor:Actor)=>guard(db,"EXISTS(SELECT 1 FROM s_members WHERE email=? AND role='trust_officer' AND active=1)",actor.email);
export async function trustState(db:D1Database,actor:Actor){
 await trustReconciler(db,actor);
 const accounts=await rows(db,`SELECT a.*,COALESCE((SELECT SUM(e.cents) FROM s_trust_entries e WHERE e.account_id=a.id),0) balance_cents FROM s_trust_accounts a CROSS JOIN (SELECT ? email) scope_viewer WHERE ${accountWallScope('a.id','scope_viewer.email')} ORDER BY a.created_at,a.id`,actor.email);
 const ledgers=await rows(db,`SELECT l.*,m.title,m.matter_number,m.client,COALESCE((SELECT SUM(e.cents) FROM s_trust_entries e WHERE e.ledger_id=l.id),0) balance_cents,(${availabilitySql('l.id',"''")}) available_cents FROM s_trust_ledgers l JOIN s_matters m ON m.id=l.matter_id WHERE (${matterScope('l.matter_id', actor.channel === 'agent' ? "'agent'" : "'person'")}) ORDER BY l.created_at,l.id`,actor.role,actor.email);
 const allowed=JSON.stringify(ledgers.map(l=>l.id));
 const openings=await rows(db,`SELECT o.*,e.approved_by,e.at approved_at FROM s_trust_openings o LEFT JOIN s_trust_entries e ON e.source_id=o.id WHERE (o.ledger_id IN (SELECT value FROM json_each(?)) OR (o.ledger_id IS NULL AND EXISTS(SELECT 1 FROM s_documents d WHERE d.id=o.source_document_id AND (${matterScope('d.matter_id', actor.channel === 'agent' ? "'agent'" : "'person'")})))) ORDER BY o.created_at,o.id`,allowed,actor.role,actor.email);
 const entries=await rows(db,`SELECT e.*,COALESCE(e.cleared_date,(SELECT c.cleared_date FROM s_trust_clearings c WHERE c.entry_id=e.id)) reconciled_cleared_date FROM s_trust_entries e CROSS JOIN (SELECT ? email) scope_viewer WHERE (ledger_id IN (SELECT value FROM json_each(?)) OR (ledger_id IS NULL AND ?='owner')) AND ${entryWallScope('e.id','scope_viewer.email')} ORDER BY effective_date,at,id`,actor.email,allowed,actor.role);
 return {accounts,ledgers,openings,entries,clearings:await rows(db,`SELECT c.* FROM s_trust_clearings c JOIN s_trust_entries e ON e.id=c.entry_id CROSS JOIN (SELECT ? email) scope_viewer WHERE (e.ledger_id IN (SELECT value FROM json_each(?)) OR (e.ledger_id IS NULL AND ?='owner')) AND ${entryWallScope('e.id','scope_viewer.email')}`,actor.email,allowed,actor.role)};
}
export async function createTrustAccount(db:D1Database,actor:Actor,b:Data){
 human(actor);need(actor,'owner');insist(['trust','operating'].includes(b.kind),'Choose trust or operating');const accountId=id();
 await atomic(db,actor,[stmt(db,'INSERT INTO s_trust_accounts VALUES(?,?,?,?,?,?)',accountId,text(b.name,'Account name',150),b.kind,text(b.bankReference,'Bank account reference (no credentials)',100),actor.email,now()),audit(db,actor,'trust.account_created',accountId,b.kind)]);return {id:accountId};
}
export async function createTrustLedger(db:D1Database,actor:Actor,b:Data){
 await trustOfficer(db,actor);const m=await matter(db,actor,text(b.matterId,'Matter')),ledgerId=id();
 await atomic(db,actor,[officerGuard(db,actor),accessGuard(db,actor,m.id),guard(db,"EXISTS(SELECT 1 FROM s_trust_accounts WHERE id=? AND kind='trust')",b.accountId),stmt(db,'INSERT INTO s_trust_ledgers VALUES(?,?,?,?,?)',ledgerId,text(b.accountId,'Account'),m.id,actor.email,now()),audit(db,actor,'trust.ledger_opened',ledgerId,m.id)]);return {id:ledgerId};
}
export async function sourceDocument(db:D1Database,actor:Actor,documentId:string,matterId?:string){
 const d=await visibleDocument(db,actor,text(documentId,'Supporting document'));
 insist(!d.erased_at&&(!matterId||d.matter_id===matterId),'Use an intact supporting document on this matter',409);
 const v=await stmt(db,'SELECT * FROM s_document_versions WHERE document_id=? AND version=?',d.id,d.current_version).first<Data>();
 insist(v?.content_base64,'The supporting original is unavailable',409);return {id:d.id,version:v.version,digest:v.sha256};
}
export function sourceGuard(db:D1Database,source:{id:string;version:number;digest:string},actor:Actor){const access=documentAccess(actor);return guard(db,`EXISTS(SELECT 1 FROM s_documents d JOIN s_document_versions v ON v.document_id=d.id WHERE d.id=? AND d.erased_at IS NULL AND v.version=? AND v.sha256=? AND v.content_base64 IS NOT NULL AND ${access.sql})`,source.id,source.version,source.digest,...access.params);}
export async function prepareOpening(db:D1Database,actor:Actor,b:Data){
 await trustOfficer(db,actor);const account=await stmt(db,'SELECT * FROM s_trust_accounts WHERE id=?',text(b.accountId,'Account')).first<Data>();insist(account,'Account not found',404);
 const ledger=b.ledgerId?await stmt(db,'SELECT * FROM s_trust_ledgers WHERE id=? AND account_id=?',b.ledgerId,account.id).first<Data>():null;
 insist(account.kind==='operating'?!b.ledgerId:ledger,'Choose a subsidiary ledger for trust, or no ledger for operating');if(ledger)await matter(db,actor,ledger.matter_id);
 const source=await sourceDocument(db,actor,b.documentId,ledger?.matter_id),openingId=id(),revision=id(),day=date(b.statementDate);insist(day<=now().slice(0,10),'Opening statement cannot be in the future');
 await atomic(db,actor,[officerGuard(db,actor),sourceGuard(db,source,actor),...(ledger?[accessGuard(db,actor,ledger.matter_id)]:[]),stmt(db,'INSERT INTO s_trust_openings VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',openingId,account.id,ledger?.id??null,revision,integer(b.cents,'Opening USD cents',0,100000000000),day,source.id,source.version,source.digest,text(b.note,'Statement citation',1000),actor.email,now()),audit(db,actor,'trust.opening_prepared',openingId,JSON.stringify({source,day,cents:b.cents}))]);return {id:openingId,revision};
}
export async function approveOpening(db:D1Database,actor:Actor,openingId:string,b:Data){
 await trustOfficer(db,actor);const o=await stmt(db,'SELECT * FROM s_trust_openings WHERE id=?',openingId).first<Data>();insist(o,'Opening not found',404);insist(b.revision===o.revision,'Review the exact opening revision',409);
 const d=await visibleDocument(db,actor,o.source_document_id);insist(!d.erased_at,'Opening statement was erased',409);
 const ledger=o.ledger_id?await stmt(db,'SELECT * FROM s_trust_ledgers WHERE id=?',o.ledger_id).first<Data>():null;if(ledger)await matter(db,actor,ledger.matter_id);
 const prior=await stmt(db,'SELECT * FROM s_trust_entries WHERE source_id=?',o.id).first<Data>();if(prior)return prior;
 const entryId=id();await atomic(db,actor,[officerGuard(db,actor),...(ledger?[accessGuard(db,actor,ledger.matter_id)]:[]),guard(db,'NOT EXISTS(SELECT 1 FROM s_trust_entries WHERE account_id=? AND ledger_id IS ?)',o.account_id,o.ledger_id),sourceGuard(db,{id:d.id,version:o.source_version,digest:o.source_digest},actor),stmt(db,'INSERT INTO s_trust_entries VALUES(?,?,?,?,?,?,?,?,?,?)',entryId,o.account_id,o.ledger_id,'opening',o.cents,o.statement_date,o.statement_date,o.id,actor.email,now()),audit(db,actor,'trust.opening_approved',o.id,text(b.reviewNote,'Approval note',1000))]);return stmt(db,'SELECT * FROM s_trust_entries WHERE id=?',entryId).first<Data>();
}
