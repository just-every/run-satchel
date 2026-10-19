import {atomic,audit,digest,id,insist,integer,now,rows,stmt,text,type Actor,type Data} from './model';
import {documentAccess} from './documents';
import {guard} from './trust-guards';
import {officerGuard,sourceDocument,sourceGuard} from './trust';
import {currentDate} from './trust-transactions';
import {accountTrustAccess,accountTrustGuard,buildTrustReport,clientStatement,packetData,reportInputs,reportStateGuard} from './trust-reports';

async function periodFor(db:D1Database,actor:Actor,periodId:string){
 const p=await stmt(db,'SELECT * FROM s_trust_periods WHERE id=?',text(periodId,'Statement period')).first<Data>();
 insist(p,'Statement period not found',404);await accountTrustAccess(db,actor,p.account_id);return p;
}
function evidenceAccessGuard(db:D1Database,actor:Actor,documentId:string){
 const access=documentAccess(actor);return guard(db,`EXISTS(SELECT 1 FROM s_documents d WHERE d.id=? AND ${access.sql})`,documentId,...access.params);
}
const sourceFor=(p:Data)=>({id:p.source_document_id,version:p.source_version,digest:p.source_digest});
async function latestEvent(db:D1Database,periodId:string){return stmt(db,'SELECT * FROM s_trust_period_events WHERE period_id=? ORDER BY sequence DESC LIMIT 1',periodId).first<Data>();}

export async function createTrustPeriod(db:D1Database,actor:Actor,b:Data){
 const account=await accountTrustAccess(db,actor,text(b.accountId,'Trust account'));
 const start=currentDate(b.startDate,'Statement start date'),end=currentDate(b.endDate,'Statement end date');
 insist(start<=end,'Statement start must precede its end');
 const cents=integer(b.closingBalanceCents,'Statement closing USD cents',-100000000000,100000000000);
 const source=await sourceDocument(db,actor,b.documentId);
 const prior=await stmt(db,'SELECT * FROM s_trust_periods WHERE account_id=? AND start_date=? AND end_date=?',account.id,start,end).first<Data>();
 if(prior){insist(prior.closing_balance_cents===cents&&prior.source_document_id===source.id&&prior.source_version===source.version&&prior.source_digest===source.digest,'This statement period already has a different immutable original',409);return prior;}
 const periodId=id();
 await atomic(db,actor,[officerGuard(db,actor),accountTrustGuard(db,actor,account.id),sourceGuard(db,source),evidenceAccessGuard(db,actor,source.id),
  stmt(db,'INSERT INTO s_trust_periods VALUES(?,?,?,?,?,?,?,?,?,?)',periodId,account.id,start,end,cents,source.id,source.version,source.digest,actor.email,now()),
  audit(db,actor,'trust.statement_imported',periodId,JSON.stringify({accountId:account.id,startDate:start,endDate:end,closingBalanceCents:cents,source}))]);
 return stmt(db,'SELECT * FROM s_trust_periods WHERE id=?',periodId).first<Data>();
}

export async function listTrustPeriods(db:D1Database,actor:Actor,accountId:string){
 await accountTrustAccess(db,actor,accountId);
 return rows(db,`SELECT p.*,COALESCE((SELECT kind FROM s_trust_period_events WHERE period_id=p.id ORDER BY sequence DESC LIMIT 1),'draft') status,
  (SELECT COUNT(*) FROM s_trust_packets WHERE period_id=p.id) packet_count,
  (SELECT id FROM s_trust_packets WHERE period_id=p.id ORDER BY version DESC LIMIT 1) latest_packet_id
  FROM s_trust_periods p WHERE account_id=? ORDER BY end_date,start_date,id`,accountId);
}

export async function getTrustPacket(db:D1Database,actor:Actor,packetId:string){
 const p=await stmt(db,'SELECT * FROM s_trust_packets WHERE id=?',text(packetId,'Signed packet')).first<Data>();
 insist(p,'Signed packet not found',404);await periodFor(db,actor,p.period_id);return packetData(p);
}

export async function trustPeriodReport(db:D1Database,actor:Actor,periodId:string){
 const p=await periodFor(db,actor,periodId),built=await buildTrustReport(db,actor,p);
 const packets=await rows(db,'SELECT * FROM s_trust_packets WHERE period_id=? ORDER BY version',p.id);
 return {...built.report,status:built.report.events.at(-1)?.kind??'draft',reportDigest:built.reportDigest,packets:packets.map(packetData)};
}

export async function signTrustPeriod(db:D1Database,actor:Actor,periodId:string,b:Data){
 const p=await periodFor(db,actor,periodId),reviewed=text(b.reportDigest,'Reviewed reconciliation digest',64),last=await latestEvent(db,p.id);
 if(last?.kind==='signed'){
  const prior=await getTrustPacket(db,actor,last.packet_id);
  insist(prior.report_digest===reviewed,'Reopen this signed period before signing a corrected version',409);return prior;
 }
 const built=await buildTrustReport(db,actor,p);
 insist(reviewed===built.reportDigest,'The reconciliation changed. Review the current report before signing',409);
 insist(b.correctionNote===undefined||typeof b.correctionNote==='string'&&b.correctionNote.length<=2000,'Correction note must be text of at most 2000 characters');
 const correctionNote=(b.correctionNote??'').trim();
 insist(built.report.balanced||correctionNote,'Resolve every difference or explicitly record it for correction before signing',409);
 const source=sourceFor(p),packetId=id(),eventId=id(),signedAt=now();
 const count=await stmt(db,'SELECT COALESCE(MAX(version),0)+1 version FROM s_trust_packets WHERE period_id=?',p.id).first<Data>();
 const version=count!.version;
 const snapshot=JSON.stringify({...built.report,reportDigest:reviewed,packetId,version,correctionNote,
  signature:{actor:actor.email,name:actor.name,at:signedAt,source}}),hash=await digest(snapshot);
 await atomic(db,actor,[officerGuard(db,actor),accountTrustGuard(db,actor,p.account_id),sourceGuard(db,source),
  reportStateGuard(db,p.account_id,built.stateToken),
  guard(db,"COALESCE((SELECT kind FROM s_trust_period_events WHERE period_id=? ORDER BY sequence DESC LIMIT 1),'reopened')='reopened'",p.id),
  stmt(db,'INSERT INTO s_trust_packets VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',packetId,p.id,version,snapshot,hash,reviewed,built.report.balanced?1:0,correctionNote,actor.email,signedAt,source.id,source.version,source.digest),
  stmt(db,"INSERT INTO s_trust_period_events(id,period_id,packet_id,kind,actor,at,reason,source_document_id,source_version,source_digest) VALUES(?,?,?,'signed',?,?,?,?,?,?)",eventId,p.id,packetId,actor.email,signedAt,correctionNote,source.id,source.version,source.digest),
  audit(db,actor,'trust.period_signed',packetId,JSON.stringify({periodId:p.id,packetId,version,digest:hash,balanced:built.report.balanced,correctionNote,source}))]);
 return getTrustPacket(db,actor,packetId);
}

export async function reopenTrustPeriod(db:D1Database,actor:Actor,periodId:string,b:Data){
 const p=await periodFor(db,actor,periodId),last=await latestEvent(db,p.id),reason=text(b.reason,'Reason for reopening the signed period',2000);
 insist(last,'Only a signed statement period can be reopened',409);
 const source=await sourceDocument(db,actor,b.documentId);
 if(last.kind==='reopened'){
  insist(last.reason===reason&&last.source_document_id===source.id&&last.source_version===source.version&&(!b.packetId||b.packetId===last.packet_id),'This period has already been reopened with different evidence',409);return last;
 }
 insist(!b.packetId||b.packetId===last.packet_id,'Review the latest signed packet before reopening',409);
 const eventId=id();
 await atomic(db,actor,[officerGuard(db,actor),accountTrustGuard(db,actor,p.account_id),sourceGuard(db,source),evidenceAccessGuard(db,actor,source.id),
  guard(db,'(SELECT sequence FROM s_trust_period_events WHERE period_id=? ORDER BY sequence DESC LIMIT 1)=?',p.id,last.sequence),
  stmt(db,"INSERT INTO s_trust_period_events(id,period_id,packet_id,kind,actor,at,reason,source_document_id,source_version,source_digest) VALUES(?,?,?,'reopened',?,?,?,?,?,?)",eventId,p.id,last.packet_id,actor.email,now(),reason,source.id,source.version,source.digest),
  audit(db,actor,'trust.period_reopened',eventId,JSON.stringify({periodId:p.id,packetId:last.packet_id,reason,source}))]);
 return stmt(db,'SELECT * FROM s_trust_period_events WHERE id=?',eventId).first<Data>();
}

export async function trustClientStatement(db:D1Database,actor:Actor,ledgerId:string,b:Data){
 const ledger=await stmt(db,'SELECT * FROM s_trust_ledgers WHERE id=?',text(ledgerId,'Subsidiary ledger')).first<Data>();
 insist(ledger,'Subsidiary ledger not found',404);await accountTrustAccess(db,actor,ledger.account_id);
 const cutoff=currentDate(b.cutoffDate,'Statement cutoff date');
 if(b.packetId){
  const packet=await getTrustPacket(db,actor,b.packetId);
  const statement=packet.snapshot.clientStatements.find((s:Data)=>s.ledgerId===ledger.id&&s.cutoffDate===cutoff);
  insist(statement,'This packet does not contain the requested ledger and cutoff',404);
  return {...statement,packetId:packet.id,packetDigest:packet.digest};
 }
 if(b.periodId){
  const period=await periodFor(db,actor,b.periodId);
  insist(period.account_id===ledger.account_id&&period.end_date===cutoff,'Use the ledger’s own statement period and cutoff');
  const built=await buildTrustReport(db,actor,period);return built.report.clientStatements.find(s=>s.ledgerId===ledger.id);
 }
 const input=await reportInputs(db,actor,ledger.account_id,cutoff);return clientStatement(ledger,input.entries,cutoff);
}
