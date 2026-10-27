import {atomic,audit,human,id,insist,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {accountTrustAccess,accountTrustGuard} from './trust-reports';
import {getTrustPacket} from './trust-periods';
import {portalAccess} from './portal';
import {reconcilerGuard} from './trust';
import {trustPublicationAuthority} from './trust-publication-authority';

// A portal grant alone never publishes financial records. The principal releases
// one officer-signed ledger statement to one current client or co-client grant.
const statementReaders=['client','co_client'];
const principalSql="EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND email=? AND role='owner' AND status='active')";
async function principal(db:D1Database,actor:Actor){
 human(actor);need(actor,'owner');
 insist(await stmt(db,'SELECT 1 WHERE '+principalSql,actor.id,actor.email).first(),'Only the active principal can release or withdraw a statement',403);
}
const currentPacketSql="EXISTS(SELECT 1 FROM s_trust_packets p WHERE p.id=? AND (SELECT x.packet_id FROM s_trust_period_events x WHERE x.period_id=p.period_id ORDER BY x.sequence DESC LIMIT 1)=p.id AND (SELECT x.kind FROM s_trust_period_events x WHERE x.period_id=p.period_id ORDER BY x.sequence DESC LIMIT 1)='signed')";
export async function releaseTrustStatement(db:D1Database,actor:Actor,ledgerId:string,b:Data){
 await principal(db,actor);
 const ledger=await stmt(db,'SELECT * FROM s_trust_ledgers WHERE id=?',text(ledgerId,'Client ledger')).first<Data>();
 insist(ledger,'Client ledger not found',404);await matter(db,actor,ledger.matter_id);
 const packet=await getTrustPacket(db,actor,text(b.packetId,'Signed packet'));
 insist(b.confirmed===true&&b.packetDigest===packet.digest,'Explicitly approve the exact signed packet digest',409);
 insist(packet.snapshot.clientStatements.some((s:Data)=>s.ledgerId===ledger.id),'This packet does not contain this ledger',409);
 insist(await stmt(db,'SELECT 1 WHERE '+currentPacketSql,packet.id).first(),'Release only the current signed packet',409);
 const recipient=text(b.recipient,'Client portal email',254).toLowerCase(),reason=text(b.reason,'Release reason',2000);
 const grant=await stmt(db,`SELECT g.id FROM s_portal_grants g WHERE g.email=? AND g.matter_id=? AND g.revoked_at IS NULL AND g.kind IN('client','co_client') AND ${portalAccess('?',statementReaders)}`,recipient,ledger.matter_id,recipient,ledger.matter_id).first<Data>();
 insist(grant,'Choose a current client or co-client grant without an ethical wall',409);
 const releaseId=id(),at=now();
 await atomic(db,actor,[guard(db,principalSql,actor.id,actor.email),reconcilerGuard(db,actor),accessGuard(db,actor,ledger.matter_id),accountTrustGuard(db,actor,ledger.account_id),
  guard(db,currentPacketSql,packet.id),guard(db,`EXISTS(SELECT 1 FROM s_portal_grants g WHERE g.id=? AND g.email=? AND g.matter_id=? AND g.revoked_at IS NULL AND g.kind IN('client','co_client') AND ${portalAccess('?',statementReaders)})`,grant.id,recipient,ledger.matter_id,recipient,ledger.matter_id),
  stmt(db,'INSERT INTO s_trust_statement_releases(id,ledger_id,packet_id,grant_id,recipient,created_by,created_at,reason) VALUES(?,?,?,?,?,?,?,?)',releaseId,ledger.id,packet.id,grant.id,recipient,actor.email,at,reason),
  audit(db,actor,'trust.statement_released',releaseId,JSON.stringify({ledgerId:ledger.id,packetId:packet.id,packetDigest:packet.digest,grantId:grant.id,recipient,reason}),{matterId:ledger.matter_id})]);
 return {id:releaseId,ledgerId:ledger.id,packetId:packet.id,recipient,releasedAt:at};
}
export async function withdrawTrustStatement(db:D1Database,actor:Actor,releaseId:string,b:Data){
 await principal(db,actor);
 const release=await stmt(db,'SELECT r.*,l.matter_id FROM s_trust_statement_releases r JOIN s_trust_ledgers l ON l.id=r.ledger_id WHERE r.id=?',text(releaseId,'Statement release')).first<Data>();
 insist(release,'Statement release not found',404);await matter(db,actor,release.matter_id);
 const reason=text(b.reason,'Withdrawal reason',2000);
 await atomic(db,actor,[guard(db,principalSql,actor.id,actor.email),accessGuard(db,actor,release.matter_id),
  stmt(db,'UPDATE s_trust_statement_releases SET revoked_by=?,revoked_at=?,revoke_reason=? WHERE id=? AND revoked_at IS NULL',actor.email,now(),reason,release.id),
  audit(db,actor,'trust.statement_withdrawn',release.id,reason,{matterId:release.matter_id})]);
 return {id:release.id,withdrawn:true};
}
export async function portalTrustStatements(db:D1Database,actor:Actor,matterId:string){
 human(actor);need(actor,'client');
 // The release is tied to the original grant: withdrawal followed by a fresh
 // grant cannot revive it. Full account packets and source files stay private.
 const released=await rows(db,`SELECT r.id,r.ledger_id,r.packet_id,r.created_at,p.snapshot,p.digest FROM s_trust_statement_releases r JOIN s_trust_ledgers l ON l.id=r.ledger_id JOIN s_trust_packets p ON p.id=r.packet_id JOIN s_portal_grants g ON g.id=r.grant_id WHERE l.matter_id=? AND r.recipient=? AND r.revoked_at IS NULL AND ${trustPublicationAuthority('l.account_id','r.created_by')} AND g.email=? AND g.matter_id=l.matter_id AND g.revoked_at IS NULL AND g.kind IN('client','co_client') AND ${portalAccess('l.matter_id',statementReaders)} ORDER BY r.created_at,r.id`,matterId,actor.email,actor.email,actor.email);
 const statements=released.map(r=>{
  const s=JSON.parse(r.snapshot).clientStatements.find((s:Data)=>s.ledgerId===r.ledger_id);
  insist(s,'Released statement is unavailable',409);
  return {id:r.id,ledgerId:s.ledgerId,packetId:r.packet_id,packetDigest:r.digest,releasedAt:r.created_at,startDate:s.startDate,cutoffDate:s.cutoffDate,openingBalanceCents:s.openingBalanceCents,closingBalanceCents:s.closingBalanceCents,
   entries:s.entries.map((e:Data)=>({id:e.id,date:e.effective_date,kind:e.kind,cents:e.cents,runningBalanceCents:e.runningBalanceCents}))};
 });
 return {statements};
}

export async function listTrustStatementReleases(db:D1Database,actor:Actor,ledgerId:string){
 await principal(db,actor);const ledger=await stmt(db,'SELECT * FROM s_trust_ledgers WHERE id=?',text(ledgerId,'Client ledger')).first<Data>();
 insist(ledger,'Client ledger not found',404);await matter(db,actor,ledger.matter_id);await accountTrustAccess(db,actor,ledger.account_id);
 return {releases:await rows(db,'SELECT id,packet_id,recipient,created_by,created_at,revoked_by,revoked_at,revoke_reason FROM s_trust_statement_releases WHERE ledger_id=? ORDER BY created_at,id',ledger.id)};
}
