import {eraseChronologies} from './document-chronologies';
import {eraseProductions} from './document-productions';
import {matterScope} from './matter-scope';
import {eraseDocumentReview} from './document-review';
// FIRM-006: counsel's legal holds and retention schedules; the principal approves expired disposal.
import { createPortability } from '@runeditrun/rer/modules/portability';
import policy from './archive-policy.mjs';
import { atomic, audit, date, human, id, insist, matter, need, now, rows, stmt, text, type Actor, type Data } from './model';
import { documentGuard, matterGuard, visibleDocument } from './documents';
const active = (alias = 'd') => `EXISTS(SELECT 1 FROM s_holds h WHERE h.released_at IS NULL AND h.matter_id=${alias}.matter_id AND (h.document_id IS NULL OR h.document_id=${alias}.id))`;
// A document follows its own current schedule, otherwise its matter's.
const schedule = (alias = 'd') => `COALESCE((SELECT r.id FROM s_retention r WHERE r.superseded_at IS NULL AND r.document_id=${alias}.id),(SELECT r.id FROM s_retention r WHERE r.superseded_at IS NULL AND r.document_id IS NULL AND r.matter_id=${alias}.matter_id))`;
export async function firmToday(db: D1Database) {
 const zone = (await stmt(db, 'SELECT timezone FROM s_firm WHERE id=1').first<{ timezone: string }>())?.timezone ?? 'UTC';
 return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function noHold(db: D1Database, documentId: string) {
 const guard = id();
 return [stmt(db, `INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN ${active()} THEN 0 ELSE 1 END FROM s_documents d WHERE d.id=?`, guard, documentId), stmt(db, 'DELETE FROM s_guard WHERE id=?', guard)];
}
export async function refuseHeld(db: D1Database, document: Data) {
 insist(!(await stmt(db, `SELECT 1 FROM s_documents d WHERE d.id=? AND ${active()}`, document.id).first()), 'This document is under a legal hold. Counsel must release the hold before its originals can be erased.', 409);
 return noHold(db, document.id);
}
async function scope(db: D1Database, actor: Actor, body: Data) {
 human(actor); need(actor, 'owner', 'lawyer');
 const m = await matter(db, actor, text(body.matterId, 'Matter'));
 const document = body.documentId ? await visibleDocument(db, actor, text(body.documentId, 'Document')) : null;
 insist(!document || document.matter_id === m.id, 'Document not found', 404);
 return { matterId: m.id as string, documentId: (document?.id ?? null) as string | null };
}
export async function placeHold(db: D1Database, actor: Actor, body: Data) {
 const s = await scope(db, actor, body), holdId = id(), reason = text(body.reason, 'Hold reason', 1000);
 await atomic(db, actor, [...matterGuard(db,actor,s.matterId),stmt(db, 'INSERT INTO s_holds(id,matter_id,document_id,reason,placed_by,placed_at) VALUES(?,?,?,?,?,?)', holdId, s.matterId, s.documentId, reason, actor.email, now()), audit(db, actor, 'hold.placed', holdId, reason)]);
 return { id: holdId, ...s, reason };
}
export async function releaseHold(db: D1Database, actor: Actor, holdId: string, body: Data) {
 human(actor); need(actor, 'owner', 'lawyer');
 const hold = await stmt(db, 'SELECT * FROM s_holds WHERE id=?', holdId).first<Data>();
 insist(hold, 'Hold not found', 404); await matter(db, actor, hold.matter_id);
 insist(!hold.released_at, 'This hold was already released', 409);
 const reason = text(body.reason, 'Release reason', 1000);
 await atomic(db, actor, [...matterGuard(db,actor,hold.matter_id),stmt(db, 'UPDATE s_holds SET released_by=?,released_at=?,release_reason=? WHERE id=? AND released_at IS NULL', actor.email, now(), reason, holdId), audit(db, actor, 'hold.released', hold.id, reason)]);
 return { id: holdId, released: true };
}
export async function setSchedule(db: D1Database, actor: Actor, body: Data) {
 const s = await scope(db, actor, body), scheduleId = id(), at = now(), disposeAfter = date(body.disposeAfter), basis = text(body.basis, 'Retention basis', 1000);
 await atomic(db, actor, [...matterGuard(db,actor,s.matterId),
  stmt(db, 'UPDATE s_retention SET superseded_at=? WHERE superseded_at IS NULL AND matter_id=? AND document_id IS ?', at, s.matterId, s.documentId),
  stmt(db, 'INSERT INTO s_retention VALUES(?,?,?,?,?,?,?,NULL)', scheduleId, s.matterId, s.documentId, disposeAfter, basis, actor.email, at),
  audit(db, actor, 'retention.scheduled', scheduleId, `${disposeAfter}: ${basis}`)]);
 return { id: scheduleId, ...s, disposeAfter, basis };
}
export async function retentionState(db: D1Database, actor: Actor, matterId?: string) {
 const visible = `(${matterScope('x.matter_id', actor.channel === 'agent' ? "'agent'" : "'person'")})`, who = [actor.role, actor.email];
 const where = matterId ? ' AND x.matter_id=?' : '', filter = matterId ? [matterId] : [];
 const holds = await rows(db, `SELECT x.* FROM s_holds x WHERE ${visible}${where} ORDER BY x.placed_at DESC`, ...who, ...filter);
 const schedules = await rows(db, `SELECT x.* FROM s_retention x WHERE ${visible}${where} ORDER BY x.set_at DESC`, ...who, ...filter);
 const disposals = await rows(db, `SELECT x.*,d.title FROM s_disposals x JOIN s_documents d ON d.id=x.document_id WHERE ${visible}${where} ORDER BY x.approved_at DESC`, ...who, ...filter);
 // Expired schedules ask the principal, the firm's custodian; held documents wait.
 const expired = actor.role === 'owner' ? await rows(db, `SELECT d.id,d.title,d.matter_id,m.title matter_title,r.id retention_id,r.dispose_after,r.basis,${active()} held FROM s_documents d JOIN s_matters m ON m.id=d.matter_id JOIN s_retention r ON r.id=${schedule()} WHERE ${matterScope('d.matter_id')} AND d.erased_at IS NULL AND r.dispose_after<=?${matterId ? ' AND d.matter_id=?' : ''} ORDER BY r.dispose_after,d.title`, actor.role,actor.email,await firmToday(db), ...filter) : [];
 return { holds: holds.map(h => ({ ...h, active: !h.released_at })), schedules, disposals: disposals.map(d => ({ ...d, journal: JSON.parse(d.journal) })), due: expired.filter(d => !d.held), held: expired.filter(d => d.held) };
}
export async function disposeDocument(db: D1Database, actor: Actor, documentId: string, body: Data, originals:R2Bucket) {
 human(actor); need(actor, 'owner');
 const d = await visibleDocument(db, actor, documentId);
 insist(!d.erased_at, 'This document was already erased', 409);
 insist(body.confirm === d.title, 'Type the document name to confirm its disposal');
 const reason = text(body.reason, 'Disposal reason', 1000);
 const r = await stmt(db, `SELECT r.* FROM s_documents d JOIN s_retention r ON r.id=${schedule()} WHERE d.id=?`, d.id).first<Data>();
 insist(r, 'This document has no retention schedule', 409);
 insist(r.dispose_after <= await firmToday(db), `Its retention runs until ${r.dispose_after}`, 409);
 const guards = await refuseHeld(db, d);
 const versions = await rows(db, 'SELECT version,size,sha256 FROM s_document_versions WHERE document_id=? AND content_base64 IS NOT NULL ORDER BY version', d.id);
 const at = now(), service = await createPortability({ db, buckets:{originals}, policy });
 const reviewCounts=await stmt(db,'SELECT (SELECT COUNT(*) FROM s_document_annotations WHERE document_id=? AND note IS NOT NULL) annotations,(SELECT COUNT(*) FROM s_document_conflicts WHERE document_id=? AND content_base64 IS NOT NULL) conflicts',d.id,d.id).first<Data>();
 const productionCount=await stmt(db,'SELECT COUNT(*) count FROM s_document_productions WHERE artifact_base64 IS NOT NULL AND id IN (SELECT production_id FROM s_production_sources WHERE document_id=?)',d.id).first<Data>();
 const chronologyCount=await stmt(db,'SELECT COUNT(*) count FROM s_document_chronologies WHERE snapshot IS NOT NULL AND id IN (SELECT chronology_id FROM s_chronology_sources WHERE document_id=?)',d.id).first<Data>();
 const journal = { originals: versions, derivatives: { chronologies: chronologyCount!.count, productions: productionCount!.count, previews: 0, ocrText: 0, searchVectors: 0, connectorCaches: 0, annotations:reviewCounts!.annotations, conflictOriginals:reviewCounts!.conflicts }, archives: 'earlier archives need this erasure journal to restore', retention: { id: r.id, disposeAfter: r.dispose_after, basis: r.basis } };
 const scheduleGuard = id();
 await atomic(db, actor, [...documentGuard(db, actor, d, true), ...guards,
  stmt(db, `INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN ${schedule()}=? THEN 1 ELSE 0 END FROM s_documents d WHERE d.id=?`, scheduleGuard, r.id, d.id), stmt(db, 'DELETE FROM s_guard WHERE id=?', scheduleGuard),
  stmt(db, 'UPDATE s_document_versions SET content_base64=NULL WHERE document_id=?', d.id), ...eraseDocumentReview(db,d.id),...eraseProductions(db,d.id),...eraseChronologies(db,d.id),
  stmt(db, 'UPDATE s_documents SET erased_at=?,revision=?,updated_by=?,updated_channel=?,updated_at=? WHERE id=?', at, id(), actor.email, actor.channel, at, d.id),
  ...await service.redactionStatements(), ...await service.invalidateTransfersStatements(),
  stmt(db, 'INSERT INTO s_disposals VALUES(?,?,?,?,?,?,?,?)', id(), d.id, d.matter_id, r.id, reason, JSON.stringify(journal), actor.email, at),
  audit(db, actor, 'document.disposed', d.id, reason)]);
 return { id: d.id, erasedAt: at, journal };
}
