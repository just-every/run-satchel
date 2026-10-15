/* Adapted from just-every/run-locket obligations.ts,
 * commit 82478229f356d017bda62b4944b584138ef9671c.
 * MIT License, Copyright (c) 2026 Run Edit Run. See LICENSE for permission
 * and warranty disclaimer. Exact source versions, proposed/confirmed/done
 * transitions and audit fences are retained; dates are recorded, not calculated. */
import { atomic, audit, human, id, insist, integer, matter, need, now, rows, stmt, text, type Actor, type Data } from './model';
import { documentAccess, documentGuard, matterGuard, visibleDocument } from './documents';

function calendarDate(value: unknown) {
 const day = text(value, 'Date', 10), parsed = new Date(day);
 insist(/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day, 'Use a valid YYYY-MM-DD date');
 return day;
}

function timezone(value: unknown) {
 const zone = text(value, 'Timezone', 100);
 try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(); }
 catch { insist(false, 'Use an IANA timezone such as America/New_York'); }
 return zone;
}

function deadlineJson(d: Data, events: Data[] = []) {
 return { id: d.id, matterId: d.matter_id, title: d.title, date: d.date, timezone: d.timezone, source: d.source, documentId: d.document_id, version: d.document_version, status: d.status, active: d.status === 'confirmed', revision: d.revision, proposedBy: d.proposed_by, proposedChannel: d.proposed_channel, proposedAt: d.proposed_at, confirmedBy: d.confirmed_by, confirmedAt: d.confirmed_at, completedBy: d.completed_by, completedAt: d.completed_at, completionEvidence: d.completion_evidence, events: events.filter(e => e.deadline_id === d.id).map(e => ({ action: e.action, actor: e.actor, channel: e.channel, at: e.at, detail: JSON.parse(e.detail) })) };
}

function visibility(actor: Actor) {
 const access = documentAccess(actor);
 return { sql: `(t.document_id IS NULL OR EXISTS(SELECT 1 FROM s_documents d WHERE d.id=t.document_id AND ${access.sql}))`, params: access.params };
}

async function visibleDeadline(db: D1Database, actor: Actor, deadlineId: string) {
 const access = visibility(actor);
 const deadline = await stmt(db, `SELECT t.* FROM s_deadlines t WHERE t.id=? AND (?='owner' OR EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=t.matter_id AND a.email=?)) AND ${access.sql}`, deadlineId, actor.role, actor.email, ...access.params).first<Data>();
 insist(deadline, 'Deadline not found', 404); return deadline;
}

function event(db: D1Database, actor: Actor, deadline: Data, action: string, at: string, detail: Data = {}) {
 const evidence = { source: deadline.source, documentId: deadline.document_id, version: deadline.document_version, date: deadline.date, timezone: deadline.timezone, ...detail };
 return [stmt(db, 'INSERT INTO s_deadline_events(id,deadline_id,action,actor,channel,at,detail) VALUES(?,?,?,?,?,?,?)', id(), deadline.id, action, actor.email, actor.channel, at, JSON.stringify(evidence)), audit(db, actor, `deadline.${action}`, deadline.id, JSON.stringify({ ...evidence, channel: actor.channel }))];
}

export async function listDeadlines(db: D1Database, actor: Actor, matterId: string) {
 await matter(db, actor, matterId);
 const access = visibility(actor);
 const deadlines = await rows(db, `SELECT t.* FROM s_deadlines t WHERE t.matter_id=? AND (?='owner' OR EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=t.matter_id AND a.email=?)) AND ${access.sql} ORDER BY t.date,t.proposed_at,t.id`, matterId, actor.role, actor.email, ...access.params);
 const events = await rows(db, `SELECT e.* FROM s_deadline_events e JOIN s_deadlines t ON t.id=e.deadline_id WHERE t.matter_id=? AND (?='owner' OR EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=t.matter_id AND a.email=?)) AND ${access.sql} ORDER BY e.at,e.id`, matterId, actor.role, actor.email, ...access.params);
 return deadlines.map(d => deadlineJson(d, events));
}

export async function proposeDeadline(db: D1Database, actor: Actor, matterId: string, body: Data) {
 need(actor, 'owner', 'lawyer', 'assistant');
 await matter(db, actor, matterId);
 const title = text(body.title, 'Deadline title', 500), date = calendarDate(body.date), zone = timezone(body.timezone), source = text(body.source, 'Source and citation', 4000);
 const document = body.documentId ? await visibleDocument(db, actor, text(body.documentId, 'Source document ID', 100)) : null;
 if (document) { insist(document.matter_id === matterId, 'Source document not found', 404); insist(!document.erased_at, 'Use an available original as the deadline source', 409); }
 insist(document || body.version === undefined || body.version === null, 'A source version requires a document');
 const version = document ? integer(body.version ?? document.current_version, 'Source version', 1) : null;
 // Proposals against superseded text must be prepared again from the current
 // original. No timezone conversion or court-rule calculation is implied.
 if (document) insist(version === document.current_version, 'Use the current source document version', 409);
 const deadlineId = actor.approval?.resultId ?? id(), revision = id(), at = now();
 const deadline = { id: deadlineId, matter_id: matterId, title, date, timezone: zone, source, document_id: document?.id ?? null, document_version: version, status: 'proposed', revision, proposed_by: actor.email, proposed_channel: actor.channel, proposed_at: at, confirmed_by: null, confirmed_at: null, completed_by: null, completed_at: null, completion_evidence: null };
 const writes = [...matterGuard(db, actor, matterId)];
 if (document) writes.push(...documentGuard(db, actor, document));
 writes.push(stmt(db, `INSERT INTO s_deadlines(id,matter_id,title,date,timezone,source,document_id,document_version,status,revision,proposed_by,proposed_channel,proposed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, deadlineId, matterId, title, date, zone, source, deadline.document_id, version, 'proposed', revision, actor.email, actor.channel, at), ...event(db, actor, deadline, 'propose', at));
 await atomic(db, actor, writes);
 return deadlineJson(deadline);
}

async function transition(db: D1Database, actor: Actor, deadlineId: string, body: Data, action: 'confirm' | 'complete') {
 human(actor); need(actor, 'owner', 'lawyer');
 const deadline = await visibleDeadline(db, actor, deadlineId), expected = action === 'confirm' ? 'proposed' : 'confirmed';
 insist(deadline.status === expected, `Only a ${expected} deadline can be ${action === 'confirm' ? 'confirmed' : 'completed'}`, 409);
 insist(body.revision === undefined || body.revision === deadline.revision, 'The deadline changed. Refresh before deciding.', 409);
 const document = deadline.document_id ? await visibleDocument(db, actor, deadline.document_id) : null;
 if (document) insist(!document.erased_at && document.current_version === deadline.document_version, 'Source changed; prepare and review a new deadline', 409);
 const evidence = action === 'complete' ? text(body.evidence, 'Completion evidence', 4000) : (body.note === undefined ? '' : text(body.note, 'Review note', 4000));
 const at = now(), revision = id(), guardId = id(), status = action === 'confirm' ? 'confirmed' : 'done';
 const writes = [...matterGuard(db, actor, deadline.matter_id)];
 if (document) writes.push(...documentGuard(db, actor, document));
 // The observed state, authority and source version are checked in the same
 // transaction as the decision and its audit. A repeated decision loses CAS.
 writes.push(stmt(db, 'INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM s_deadlines WHERE id=? AND revision=? AND status=?) THEN 1 ELSE 0 END', guardId, deadline.id, deadline.revision, expected));
 if (action === 'confirm') writes.push(stmt(db, "UPDATE s_deadlines SET status='confirmed',revision=?,confirmed_by=?,confirmed_at=? WHERE id=?", revision, actor.email, at, deadline.id));
 else writes.push(stmt(db, "UPDATE s_deadlines SET status='done',revision=?,completed_by=?,completed_at=?,completion_evidence=? WHERE id=?", revision, actor.email, at, evidence, deadline.id));
 writes.push(...event(db, actor, deadline, action, at, { evidence, previousStatus: expected, status }), stmt(db, 'DELETE FROM s_guard WHERE id=?', guardId));
 await atomic(db, actor, writes);
 return deadlineJson(await visibleDeadline(db, actor, deadline.id), await rows(db, 'SELECT * FROM s_deadline_events WHERE deadline_id=? ORDER BY at,id', deadline.id));
}

export const confirmDeadline = (db: D1Database, actor: Actor, deadlineId: string, body: Data) => transition(db, actor, deadlineId, body, 'confirm');
export const completeDeadline = (db: D1Database, actor: Actor, deadlineId: string, body: Data) => transition(db, actor, deadlineId, body, 'complete');
