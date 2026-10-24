import {matterScope,wallAllows} from './matter-scope';
// CAL-001: matter appointments, kept apart from legal deadlines. A series repeats
// at the same local wall-clock time in its own IANA timezone, so the UTC instant
// moves across daylight saving. Cancelling or moving one occurrence appends history.
import { atomic, audit, human, id, insist, integer, matter, need, rows, stmt, text, now, type Actor, type Data } from './model';
import { matterGuard } from './documents';
import {guard} from './trust-guards';
import { calendarDate, timezone, visibility } from './deadlines';
import { clock, localInstant } from './reminder-time';

const gap = 'An occurrence falls on a local time that does not exist because of a timezone transition; choose another start time';
const seeable = (matterSql: string) => matterScope(matterSql);
// Attendees are active staff who can already see the matter; an invitation grants nothing.
export const attendable = (email = '?') => `EXISTS(SELECT 1 FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email WHERE o.email=${email} AND o.status='active' AND EXISTS(SELECT 1 FROM s_matters scope_matter WHERE scope_matter.id=? AND ${wallAllows('scope_matter.id','o.email')} AND (o.role='owner' OR (m.active=1 AND EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=scope_matter.id AND a.email=o.email)))))`;
const iso = (at: number) => new Date(at).toISOString();
function addDays(day: string, days: number) { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
const changeJson = (c: Data) => ({ id: c.id, kind: c.kind, date: c.new_date, time: c.new_time, reason: c.reason, by: c.changed_by, at: c.changed_at });

function occurrences(a: Data, changes: Data[]) {
 const step = a.frequency === 'daily' ? 1 : a.frequency === 'weekly' ? 7 : 0;
 return Array.from({ length: a.occurrences }, (_, index) => {
  const date = addDays(a.start_date, index * step * a.repeat_interval), own = changes.filter(c => c.appointment_id === a.id && c.occurrence === index);
  const moved = own.filter(c => c.kind === 'moved').at(-1), cancelled = own.some(c => c.kind === 'cancelled');
  const local = { date: moved?.new_date ?? date, time: moved?.new_time ?? a.start_time }, start = localInstant(local.date, local.time, a.timezone, gap);
  return { index, ...local, start: iso(start), end: iso(start + a.duration_minutes * 60000), status: cancelled ? 'cancelled' : moved ? 'moved' : 'scheduled', original: { date, time: a.start_time }, history: own.map(changeJson) };
 });
}
function appointmentJson(a: Data, attendees: Data[], changes: Data[]) {
 return { id: a.id, matterId: a.matter_id, matterNumber: a.matter_number, matterTitle: a.matter_title, title: a.title, location: a.location, videoUrl: a.video_url, timezone: a.timezone, durationMinutes: a.duration_minutes, frequency: a.frequency, interval: a.repeat_interval, createdBy: a.created_by, createdAt: a.created_at, attendees: attendees.filter(x => x.appointment_id === a.id).map(x => ({ email: x.email, name: x.name })), occurrences: occurrences(a, changes) };
}
async function load(db: D1Database, where: string, ...params: unknown[]) {
 const list = await rows(db, `SELECT p.*,m.matter_number,m.title matter_title FROM s_appointments p JOIN s_matters m ON m.id=p.matter_id WHERE ${where} ORDER BY p.start_date,p.start_time,p.id`, ...params);
 if (!list.length) return [];
 const ids = list.map(a => a.id), marks = ids.map(() => '?').join(',');
 const attendees = await rows(db, `SELECT x.appointment_id,x.email,COALESCE(o.display_name,x.email) name FROM s_appointment_attendees x LEFT JOIN oa_operators o ON o.email=x.email WHERE x.appointment_id IN (${marks}) ORDER BY name,x.email`, ...ids);
 const changes = await rows(db, `SELECT * FROM s_appointment_changes WHERE appointment_id IN (${marks}) ORDER BY changed_at,id`, ...ids);
 return list.map(a => appointmentJson(a, attendees, changes));
}
async function deadlinesIn(db: D1Database, actor: Actor, where: string, ...params: unknown[]) {
 const access = visibility(actor);
 const list = await rows(db, `SELECT t.*,m.matter_number FROM s_deadlines t JOIN s_matters m ON m.id=t.matter_id WHERE ${seeable('t.matter_id')} AND ${access.sql} AND ${where} ORDER BY t.date,t.id`, actor.role, actor.email, ...access.params, ...params);
 return list.map(d => ({ id: d.id, matterId: d.matter_id, matterNumber: d.matter_number, title: d.title, kind: d.kind, owner: d.owner_email ?? null, date: d.date, timezone: d.timezone, source: d.source, status: d.status, proposedChannel: d.proposed_channel, confirmedBy: d.confirmed_by, completedBy: d.completed_by }));
}

export async function matterCalendar(db: D1Database, actor: Actor, matterId: string) {
 const m = await matter(db, actor, matterId);
 const candidates = await rows(db, `SELECT c.email,c.display_name name FROM oa_operators c WHERE ${attendable('c.email')} ORDER BY c.display_name,c.email`, m.id);
 return { appointments: await load(db, 'p.matter_id=?', m.id), deadlines: await deadlinesIn(db, actor, 't.matter_id=?', m.id), attendeeCandidates: candidates };
}

function range(query: { from?: string; to?: string }) {
 const from = calendarDate(query.from), to = calendarDate(query.to), days = (Date.parse(to) - Date.parse(from)) / 86400000;
 insist(days >= 0 && days <= 400, 'Choose a range of 0 to 400 days with the start on or before the end');
 return { from, to };
}
// Firm view: every visible matter; both bounds are inclusive local dates in each item's own timezone.
export async function firmCalendar(db: D1Database, actor: Actor, query: { from?: string; to?: string }) {
 const r = range(query);
 const appointments = (await load(db, seeable('p.matter_id'), actor.role, actor.email)).map(a => ({ ...a, occurrences: a.occurrences.filter(o => o.date >= r.from && o.date <= r.to) })).filter(a => a.occurrences.length);
 return { ...r, appointments, deadlines: await deadlinesIn(db, actor, 't.date BETWEEN ? AND ?', r.from, r.to) };
}

export async function bookAppointment(db: D1Database, actor: Actor, matterId: string, body: Data) {
 human(actor); need(actor, 'owner', 'lawyer', 'assistant');
 const m = await matter(db, actor, matterId);
 const frequency = body.frequency ?? 'once';
 insist(['once', 'daily', 'weekly'].includes(frequency), 'Choose once, daily or weekly');
 const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : '';
 if (videoUrl) { let ok = false; try { ok = new URL(videoUrl).protocol === 'https:'; } catch { /* refused below */ } insist(ok && videoUrl.length <= 500, 'Use an https video link'); }
 const a: Data = { id: id(), matter_id: m.id, title: text(body.title, 'Appointment title', 200), location: typeof body.location === 'string' ? body.location.trim().slice(0, 300) : '', video_url: videoUrl, timezone: timezone(body.timezone), start_date: calendarDate(body.date), start_time: clock(body.time, 'Start time'), duration_minutes: integer(body.durationMinutes, 'Duration in minutes', 5, 1440), frequency, repeat_interval: frequency === 'once' ? 1 : integer(body.interval ?? 1, 'Repeat interval', 1, 12), occurrences: frequency === 'once' ? 1 : integer(body.occurrences, 'Occurrences', 2, 104), created_by: actor.email, created_at: now() };
 occurrences(a, []);
 insist(Array.isArray(body.attendees) && body.attendees.length <= 50, 'Choose at most 50 attendees');
 const attendees = [...new Set((body.attendees as unknown[]).map(e => text(e, 'Attendee email', 254).toLowerCase()))];
 for (const email of attendees) insist(await stmt(db, `SELECT ${attendable()} ok`, email, m.id).first<Data>().then(r => r?.ok), `${email} cannot see this matter; grant matter access before inviting them`);
 const fences = attendees.flatMap(email => { const f = id(); return [stmt(db, `INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN ${attendable()} THEN 1 ELSE 0 END`, f, email, m.id), stmt(db, 'DELETE FROM s_guard WHERE id=?', f)]; });
 await atomic(db, actor, [...matterGuard(db, actor, m.id), ...fences,...occurrences(a,[]).map(o=>guard(db,"NOT EXISTS(SELECT 1 FROM s_consultations WHERE lawyer_email IN(SELECT value FROM json_each(?)) AND status='booked' AND busy_start<? AND busy_end>?)",JSON.stringify([...new Set([a.created_by,...attendees])]),o.end,o.start)),
  stmt(db, 'INSERT INTO s_appointments(id,matter_id,title,location,video_url,timezone,start_date,start_time,duration_minutes,frequency,repeat_interval,occurrences,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', a.id, a.matter_id, a.title, a.location, a.video_url, a.timezone, a.start_date, a.start_time, a.duration_minutes, a.frequency, a.repeat_interval, a.occurrences, a.created_by, a.created_at),
  ...attendees.map(email => stmt(db, 'INSERT INTO s_appointment_attendees(appointment_id,email) VALUES(?,?)', a.id, email)),
  audit(db, actor, 'appointment.booked', a.id, JSON.stringify({ matterId: m.id, attendees }), { matterId: m.id })]);
 return (await load(db, 'p.id=?', a.id))[0];
}

export async function changeOccurrence(db: D1Database, actor: Actor, appointmentId: string, index: number, kind: string, body: Data) {
 human(actor); need(actor, 'owner', 'lawyer', 'assistant');
 insist(kind === 'cancel' || kind === 'move', 'Unknown occurrence change', 404);
 const a = (await load(db, `p.id=? AND ${seeable('p.matter_id')}`, appointmentId, actor.role, actor.email))[0];
 insist(a, 'Appointment not found', 404);
 const occurrence = a.occurrences.find(o => o.index === index);
 insist(occurrence, 'Occurrence not found', 404); insist(occurrence.status !== 'cancelled', 'This occurrence is already cancelled', 409);
 const reason = text(body.reason, 'Reason', 1000), change: Data = { id: id(), kind: kind === 'cancel' ? 'cancelled' : 'moved', date: null, time: null };
 if (change.kind === 'moved') { change.date = calendarDate(body.date); change.time = clock(body.time, 'Start time'); localInstant(change.date, change.time, a.timezone, gap); }
 await atomic(db, actor, [...matterGuard(db, actor, a.matterId),...(change.kind==='moved'?[guard(db,"NOT EXISTS(SELECT 1 FROM s_consultations WHERE lawyer_email IN(SELECT value FROM json_each(?)) AND status='booked' AND busy_start<? AND busy_end>?)",JSON.stringify([...new Set([a.createdBy,...a.attendees.map(x=>x.email)])]),iso(localInstant(change.date,change.time,a.timezone,gap)+a.durationMinutes*60000),iso(localInstant(change.date,change.time,a.timezone,gap)))]:[]),
  stmt(db, 'INSERT INTO s_appointment_changes(id,appointment_id,occurrence,kind,new_date,new_time,reason,changed_by,changed_at) VALUES(?,?,?,?,?,?,?,?,?)', change.id, a.id, index, change.kind, change.date, change.time, reason, actor.email, now()),
  audit(db, actor, `appointment.${change.kind}`, change.id, JSON.stringify({ matterId: a.matterId, appointmentId: a.id, occurrence: index, from: { date: occurrence.date, time: occurrence.time }, to: change.date ? { date: change.date, time: change.time } : null, reason }), { matterId: a.matterId })]);
 return (await load(db, 'p.id=?', a.id))[0];
}

// Shared availability is free/busy: details only where the viewer may see the matter.
export async function availability(db: D1Database, actor: Actor, query: { from?: string; to?: string; emails?: string }) {
 human(actor); const r = range(query);
 const emails = [...new Set((query.emails ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean))];
 insist(emails.length && emails.length <= 20, 'Choose 1 to 20 staff members');
 const result = [];
 for (const email of emails) {
  insist(await stmt(db, `SELECT 1 FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email WHERE o.email=? AND o.status='active' AND (o.role='owner' OR m.active=1)`, email).first(), `${email} is not active staff`, 404);
  const list = await load(db, `(p.created_by=? OR EXISTS(SELECT 1 FROM s_appointment_attendees x WHERE x.appointment_id=p.id AND x.email=?)) AND EXISTS(SELECT 1 FROM oa_operators viewer WHERE viewer.id=? AND ${wallAllows('p.matter_id','viewer.email')})`, email, email, actor.id);
  const visible = new Set((await rows(db, `SELECT m.id FROM s_matters m WHERE ${seeable('m.id')}`, actor.role, actor.email)).map(m => m.id));
  const busy = list.flatMap(a => a.occurrences.filter(o => o.status !== 'cancelled' && o.date >= r.from && o.date <= r.to).map(o => visible.has(a.matterId) ? { start: o.start, end: o.end, title: a.title, matterId: a.matterId, matterNumber: a.matterNumber } : { start: o.start, end: o.end })).sort((x, y) => x.start.localeCompare(y.start));
  const consults = (await rows(db, "SELECT start_at,end_at FROM s_consultations WHERE lawyer_email=? AND status='booked' AND substr(start_at,1,10)>=? AND substr(start_at,1,10)<=?", email, r.from, r.to)).map(c => ({ start: c.start_at, end: c.end_at }));
  result.push({ email, busy: [...busy, ...consults].sort((x, y) => x.start.localeCompare(y.start)) });
 }
 return { ...r, people: result };
}

// Intervals during which a staff member is already committed to a matter appointment (INTAKE-003 offers none of them).
export async function staffBusy(db: D1Database, email: string, from: number, to: number) {
 const list = await load(db, '(p.created_by=? OR EXISTS(SELECT 1 FROM s_appointment_attendees x WHERE x.appointment_id=p.id AND x.email=?))', email, email);
 return list.flatMap(a => a.occurrences.filter(o => o.status !== 'cancelled' && Date.parse(o.end) > from && Date.parse(o.start) < to).map(o => ({ start: Date.parse(o.start), end: Date.parse(o.end) })));
}
