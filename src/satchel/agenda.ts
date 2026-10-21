import {matterScope,wallAllows} from './matter-scope';
// CAL-008: firm and matter agenda with owners, conflicts, unconfirmed dates and
// absence coverage. Coverage grants no matter access; absence reasons stay with
// the principal and the absent person. A proposed date is always unconfirmed.
import { atomic, audit, human, id, insist, matter, need, now, rows, stmt, text, type Actor, type Data } from './model';
import { calendarDate, visibleDeadline } from './deadlines';
import { firmCalendar } from './appointments';

const activeStaff = `SELECT o.email,o.display_name name,o.role FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email WHERE o.email=? AND o.status='active' AND (o.role='owner' OR m.active=1)`;
const sees = `SELECT 1 FROM oa_operators o WHERE o.email=? AND o.status='active' AND EXISTS(SELECT 1 FROM s_matters scope_matter WHERE scope_matter.id=? AND ${wallAllows('scope_matter.id','o.email')} AND (o.role='owner' OR EXISTS(SELECT 1 FROM s_members m JOIN s_matter_access a ON a.email=m.email WHERE m.email=o.email AND m.active=1 AND a.matter_id=scope_matter.id)))`;
async function staff(db: D1Database, email: unknown, label: string) {
 const s = await stmt(db, activeStaff, text(email, label, 254).toLowerCase()).first<Data>();
 insist(s, `${label} must be active staff`, 400); return s;
}
function guard(db: D1Database, sql: string, ...params: unknown[]) { const g = id(); return [stmt(db, `INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN EXISTS(${sql}) THEN 1 ELSE 0 END`, g, ...params), stmt(db, 'DELETE FROM s_guard WHERE id=?', g)]; }

export async function assignDeadlineOwner(db: D1Database, actor: Actor, deadlineId: string, body: Data) {
 human(actor); need(actor, 'owner', 'lawyer');
 const d = await visibleDeadline(db, actor, deadlineId), owner = await staff(db, body.email, 'Responsible person');
 insist(await stmt(db, sees, owner.email, d.matter_id).first(), `${owner.email} cannot see this matter; grant matter access first`);
 insist(body.revision === undefined || body.revision === d.revision, 'The deadline changed. Refresh before deciding.', 409);
 const revision = id(), at = now(), change = id();
 await atomic(db, actor, [...guard(db, sees, owner.email, d.matter_id),
  stmt(db, 'UPDATE s_deadlines SET owner_email=?,revision=? WHERE id=? AND revision=?', owner.email, revision, d.id, d.revision),
  stmt(db, 'INSERT INTO s_deadline_owners VALUES(?,?,?,?,?)', change, d.id, owner.email, actor.email, at),
  audit(db, actor, 'deadline.owner_assigned', d.id, JSON.stringify({ matterId: d.matter_id, owner: owner.email, previous: d.owner_email ?? null }), { matterId: d.matter_id })]);
 return { id: d.id, owner: owner.email, revision };
}

const absenceJson = (a: Data, actor: Actor) => ({ id: a.id, email: a.email, name: a.name, startDate: a.start_date, endDate: a.end_date, coveredBy: a.covering_email ?? null, coveredByName: a.covering_name ?? null, recordedBy: a.recorded_by, ...(actor.role === 'owner' || actor.email === a.email ? { reason: a.reason } : {}) });
async function absences(db: D1Database, where = '1=1', ...params: unknown[]) {
 return rows(db, `SELECT a.*,o.display_name name,c.covering_email,co.display_name covering_name FROM s_absences a LEFT JOIN oa_operators o ON o.email=a.email LEFT JOIN s_absence_coverage c ON c.id=(SELECT id FROM s_absence_coverage WHERE absence_id=a.id ORDER BY assigned_at DESC,id DESC LIMIT 1) LEFT JOIN oa_operators co ON co.email=c.covering_email WHERE ${where} ORDER BY a.start_date,a.email,a.id`, ...params);
}
export async function absenceState(db: D1Database, actor: Actor) {
 human(actor); return { absences: (await absences(db)).map(a => absenceJson(a, actor)) };
}
export async function recordAbsence(db: D1Database, actor: Actor, body: Data) {
 human(actor); const who = await staff(db, body.email ?? actor.email, 'Absent person');
 insist(actor.role === 'owner' || who.email === actor.email, 'Only the principal records absences for others', 403);
 const start = calendarDate(body.startDate), end = calendarDate(body.endDate);
 insist(start <= end, 'The absence must end on or after its first day');
 const a = { id: id(), reason: text(body.reason, 'Absence reason', 500) };
 await atomic(db, actor, [stmt(db, 'INSERT INTO s_absences VALUES(?,?,?,?,?,?,?)', a.id, who.email, start, end, a.reason, actor.email, now()), audit(db, actor, 'absence.recorded', a.id, JSON.stringify({ email: who.email, start, end }))]);
 return absenceJson((await absences(db, 'a.id=?', a.id))[0], actor);
}
export async function assignCoverage(db: D1Database, actor: Actor, absenceId: string, body: Data) {
 human(actor);
 const a = (await absences(db, 'a.id=?', absenceId))[0]; insist(a, 'Absence not found', 404);
 insist(actor.role === 'owner' || actor.email === a.email, 'Only the principal or the absent person assigns coverage', 403);
 const cover = await staff(db, body.email, 'Covering colleague'); insist(cover.email !== a.email, 'Choose someone other than the absent person');
 await atomic(db, actor, [stmt(db, 'INSERT INTO s_absence_coverage VALUES(?,?,?,?,?)', id(), a.id, cover.email, actor.email, now()), audit(db, actor, 'absence.coverage_assigned', a.id, JSON.stringify({ email: a.email, coveredBy: cover.email }))]);
 return absenceJson((await absences(db, 'a.id=?', a.id))[0], actor);
}

// One agenda row per deadline and per uncancelled appointment occurrence. Next action precedence:
// unconfirmed, no owner, uncovered absence, coverer without access, time conflict, then prepare.
export async function agenda(db: D1Database, actor: Actor, query: { from?: string; to?: string; matterId?: string }) {
 if (query.matterId) await matter(db, actor, query.matterId);
 const calendar = await firmCalendar(db, actor, query), out = await absences(db, 'a.end_date>=? AND a.start_date<=?', calendar.from, calendar.to);
 const names = new Map((await rows(db, 'SELECT email,display_name name FROM oa_operators')).map(o => [o.email, o.name]));
 const items: Data[] = [];
 for (const d of calendar.deadlines) if (d.status !== 'superseded') items.push({ id: d.id, type: 'deadline', kind: d.kind, matterId: d.matterId, matterNumber: d.matterNumber, title: d.title, date: d.date, time: '', timezone: d.timezone, source: d.source, owner: d.owner, people: d.owner ? [d.owner] : [], confirmation: d.status === 'proposed' ? `unconfirmed (${d.proposedChannel === 'agent' ? 'extracted by agent' : 'proposed'}; needs lawyer confirmation)` : d.status === 'confirmed' ? `confirmed by ${d.confirmedBy}` : `done by ${d.completedBy}`, status: d.status });
 for (const a of calendar.appointments) for (const o of a.occurrences) if (o.status !== 'cancelled') items.push({ id: `${a.id}:${o.index}`, type: 'appointment', kind: 'appointment', matterId: a.matterId, matterNumber: a.matterNumber, title: a.title, date: o.date, time: o.time, timezone: a.timezone, start: o.start, end: o.end, source: `Appointment booked by ${a.createdBy}`, owner: a.createdBy, people: [a.createdBy, ...a.attendees.map((x: Data) => x.email)], confirmation: 'scheduled', status: o.status });
 for (const item of items) item.conflicts = item.type === 'appointment' ? items.filter(x => x !== item && x.type === 'appointment' && x.start < item.end && item.start < x.end && x.people.some((p: string) => item.people.includes(p))).map(x => ({ id: x.id, title: x.title, matterNumber: x.matterNumber, people: x.people.filter((p: string) => item.people.includes(p)) })) : [];
 for (const item of items) {
  item.ownerName = item.owner ? names.get(item.owner) ?? item.owner : null;
  const away = item.owner ? out.find(a => a.email === item.owner && a.start_date <= item.date && item.date <= a.end_date) : undefined;
  item.coverage = away ? { absent: item.owner, coveredBy: away.covering_email ?? null, coveredByName: away.covering_name ?? null, absenceId: away.id, coverCanSee: away.covering_email ? Boolean(await stmt(db, sees, away.covering_email, item.matterId).first()) : false } : null;
  item.nextAction = item.status === 'proposed' ? 'Confirm the date against its source' : item.status === 'done' ? 'None' : !item.owner ? 'Assign a responsible owner' : item.coverage && !item.coverage.coveredBy ? `Assign coverage for ${item.ownerName}` : item.coverage && !item.coverage.coverCanSee ? `Grant ${item.coverage.coveredBy} matter access or reassign the owner` : item.conflicts.length ? `Resolve conflict with ${item.conflicts.map((c: Data) => c.title).join(', ')}` : item.type === 'deadline' ? 'Prepare and complete' : 'Attend';
 }
 for (const item of items) delete item.people;
 const scoped = query.matterId ? items.filter(i => i.matterId === query.matterId) : items;
 scoped.sort((x, y) => (x.date + (x.time || '00:00')).localeCompare(y.date + (y.time || '00:00')) || x.title.localeCompare(y.title));
 const limitations = await rows(db, `SELECT t.id,t.title,t.date,t.timezone,t.status,t.owner_email owner,m.matter_number matterNumber,m.id matterId FROM s_deadlines t JOIN s_matters m ON m.id=t.matter_id WHERE t.kind='limitation' AND t.status IN ('proposed','confirmed') AND t.date>=? AND (${matterScope('t.matter_id', actor.channel === 'agent' ? "'agent'" : "'person'")}) ${query.matterId ? 'AND t.matter_id=?' : ''} ORDER BY t.date,t.id`, calendar.from, actor.role, actor.email, ...(query.matterId ? [query.matterId] : []));
 return { from: calendar.from, to: calendar.to, items: scoped, limitations: limitations.map(l => ({ ...l, confirmation: l.status === 'proposed' ? 'unconfirmed' : 'confirmed' })), absences: out.map(a => absenceJson(a, actor)) };
}

const cell = (v: unknown) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s; };
export async function exportAgenda(db: D1Database, actor: Actor, query: { from?: string; to?: string; matterId?: string }) {
 human(actor); const a = await agenda(db, actor, query);
 const header = ['Date', 'Time', 'Timezone', 'Kind', 'Matter', 'Title', 'Source', 'Owner', 'Confirmation', 'Coverage', 'Conflicts', 'Next action'];
 const lines = a.items.map(i => [i.date, i.time, i.timezone, i.kind, i.matterNumber, i.title, i.source, i.owner ?? 'unassigned', i.confirmation, i.coverage ? `${i.coverage.absent} absent; ${i.coverage.coveredBy ? 'covered by ' + i.coverage.coveredBy : 'uncovered'}` : '', i.conflicts.map((c: Data) => c.title).join('; '), i.nextAction].map(cell).join(','));
 await atomic(db, actor, [audit(db, actor, 'agenda.exported', 'agenda', JSON.stringify({ from: a.from, to: a.to, matterId: query.matterId ?? null, rows: lines.length }))]);
 return new Response([header.join(','), ...lines].join('\r\n') + '\r\n', { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="satchel-agenda-${a.from}-to-${a.to}.csv"`, 'cache-control': 'no-store' } });
}
