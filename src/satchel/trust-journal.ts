import {historicalFundsGuard} from './trust-funds';
import {atomic,audit,id,insist,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,availabilitySql,guard} from './trust-guards';
import {officerGuard,sourceDocument,sourceGuard,trustOfficer} from './trust';
import {currentDate,ledgerFor} from './trust-transactions';
async function original(db:D1Database,actor:Actor,entryId:string){
 await trustOfficer(db,actor);const e=await stmt(db,'SELECT e.*,COALESCE(e.cleared_date,c.cleared_date) bank_cleared FROM s_trust_entries e LEFT JOIN s_trust_clearings c ON c.entry_id=e.id WHERE e.id=?',entryId).first<Data>();insist(e,'Original entry not found',404);
 if(e.ledger_id)await ledgerFor(db,actor,e.ledger_id);else insist(actor.role==='owner','The principal reviews suspense and operating corrections',403);
 insist(!['earned_fee_transfer','earned_fee_reversal','journal_reversal'].includes(e.kind),'Use the original earned-fee application reversal, or correct the original journal entry',409);return e;
}
export async function journalState(db:D1Database,actor:Actor){
 await trustOfficer(db,actor);return rows(db,`SELECT r.*,e.cents original_cents,e.account_id,e.ledger_id,e.effective_date original_date,d.decision,d.actor decided_by,d.note review_note,d.at decided_at,x.id entry_id FROM s_trust_journal_reversals r JOIN s_trust_entries e ON e.id=r.original_entry_id LEFT JOIN s_trust_journal_decisions d ON d.reversal_id=r.id LEFT JOIN s_trust_entries x ON x.source_id=r.id WHERE (?='owner' OR EXISTS(SELECT 1 FROM s_trust_ledgers l JOIN s_matter_access a ON a.matter_id=l.matter_id WHERE l.id=e.ledger_id AND a.email=?)) ORDER BY r.requested_at,r.id`,actor.role,actor.email);
}
export async function requestJournalReversal(db:D1Database,actor:Actor,entryId:string,b:Data){
 const e=await original(db,actor,entryId),ledger=e.ledger_id?await ledgerFor(db,actor,e.ledger_id):null,source=await sourceDocument(db,actor,b.documentId,ledger?.matter_id),reason=text(b.reason,'Correction reason',1000),day=currentDate(b.effectiveDate,'Correction date');insist(day>=e.effective_date,'Correction cannot precede its original');
 const prior=await stmt(db,'SELECT * FROM s_trust_journal_reversals WHERE original_entry_id=?',e.id).first<Data>();if(prior){insist(prior.reason===reason&&prior.effective_date===day&&prior.source_document_id===source.id&&prior.source_version===source.version,'This entry already has a different correction request',409);return prior;}
 const reversalId=id();await atomic(db,actor,[officerGuard(db,actor),sourceGuard(db,source),...(ledger?[accessGuard(db,actor,ledger.matter_id)]:[]),stmt(db,'INSERT INTO s_trust_journal_reversals VALUES(?,?,?,?,?,?,?,?,?,?)',reversalId,e.id,id(),reason,day,source.id,source.version,source.digest,actor.email,now()),audit(db,actor,'trust.journal_reversal_requested',reversalId,JSON.stringify({matterId:ledger?.matter_id,originalEntryId:e.id,reason,day,source}))]);return stmt(db,'SELECT * FROM s_trust_journal_reversals WHERE id=?',reversalId).first<Data>();
}
export async function decideJournalReversal(db:D1Database,actor:Actor,reversalId:string,b:Data){
 const r=await stmt(db,'SELECT * FROM s_trust_journal_reversals WHERE id=?',reversalId).first<Data>();insist(r,'Correction request not found',404);const e=await original(db,actor,r.original_entry_id),ledger=e.ledger_id?await ledgerFor(db,actor,e.ledger_id):null;
 insist(b.revision===r.revision,'Review the exact correction revision',409);insist(['approved','declined'].includes(b.decision),'Choose approved or declined');const note=text(b.reviewNote,'Correction review note',1000),prior=await stmt(db,'SELECT * FROM s_trust_journal_decisions WHERE reversal_id=?',r.id).first<Data>();if(prior){insist(prior.decision===b.decision,'Correction already decided differently',409);return prior;}
 const source={id:r.source_document_id,version:r.source_version,digest:r.source_digest},writes:D1PreparedStatement[]=[];
 if(b.decision==='approved'){
  if(ledger&&e.cents>0&&e.bank_cleared)writes.push(guard(db,`(${availabilitySql()})>=?`,ledger.id,ledger.id,'',ledger.id,'',e.cents),historicalFundsGuard(db,ledger.id,e.cents,r.effective_date>e.bank_cleared?r.effective_date:e.bank_cleared));
  writes.push(stmt(db,"INSERT INTO s_trust_entries VALUES(?,?,?,'journal_reversal',?,?,?,?,?,?)",id(),e.account_id,e.ledger_id,-e.cents,r.effective_date,e.bank_cleared&&e.bank_cleared>=r.effective_date?e.bank_cleared:null,r.id,actor.email,now()));
 }
 await atomic(db,actor,[officerGuard(db,actor),sourceGuard(db,source),...(ledger?[accessGuard(db,actor,ledger.matter_id)]:[]),...writes,stmt(db,'INSERT INTO s_trust_journal_decisions VALUES(?,?,?,?,?,?)',id(),r.id,b.decision,actor.email,note,now()),audit(db,actor,'trust.journal_reversal_'+b.decision,r.id,JSON.stringify({matterId:ledger?.matter_id,originalEntryId:e.id,reason:r.reason,source,note,day:r.effective_date}))]);return stmt(db,'SELECT * FROM s_trust_journal_decisions WHERE reversal_id=?',r.id).first<Data>();
}
