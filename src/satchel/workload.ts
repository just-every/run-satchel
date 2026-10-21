import {matterScope,wallAllows} from './matter-scope';
// MATTER-006: the principal (the supervisor until FIRM-002/008 add one) sees workload,
// due work, absences and unowned work, and hands off selected ownership. A handoff
// never grants matter access and never touches time entries or completed work.
import { atomic, audit, human, id, insist, matter, need, now, rows, stmt, text, type Actor, type Data } from './model';
import { firmToday } from './retention';

const SOON_DAYS = 14;
const sees = `EXISTS(SELECT 1 FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email WHERE o.email=? AND o.status='active' AND EXISTS(SELECT 1 FROM s_matters scope_matter WHERE scope_matter.id=? AND ${wallAllows('scope_matter.id','o.email')} AND (o.role='owner' OR (m.active=1 AND EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=scope_matter.id AND a.email=o.email)))))`;
const activeOwner = (column: string) => `EXISTS(SELECT 1 FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email WHERE o.email=${column} AND o.status='active' AND (o.role='owner' OR m.active=1))`;
function addDays(day: string, n: number) { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const handoffJson = (h: Data, items: Data[]) => ({ id: h.id, from: h.from_email, to: h.to_email, reason: h.reason, createdBy: h.created_by, createdAt: h.created_at, acknowledgedAt: h.acknowledged_at, items: items.filter(i => i.handoff_id === h.id).map(i => ({ kind: i.kind, id: i.item_id, matterId: i.matter_id, title: i.title })) });

async function openWork(db: D1Database, actor: Actor) {
 return rows(db, `SELECT 'task' kind,t.id,t.matter_id,t.title,t.owner_email owner,COALESCE(d.date,t.due_date) due FROM s_tasks t LEFT JOIN s_deadlines d ON d.id=t.deadline_id WHERE t.status='open' AND ${matterScope('t.matter_id')}
  UNION ALL SELECT 'deadline',d.id,d.matter_id,d.title,d.owner_email,d.date FROM s_deadlines d WHERE d.status IN ('proposed','confirmed') AND ${matterScope('d.matter_id')} ORDER BY due,title`,actor.role,actor.email,actor.role,actor.email);
}

// Due soon = overdue or due within 14 days of today in the firm's timezone, inclusive.
// An unowned matter has open work and no active person owning any of it.
export async function workload(db: D1Database, actor: Actor) {
 human(actor); need(actor, 'owner');
 const today = await firmToday(db), soon = addDays(today, SOON_DAYS), work = await openWork(db,actor);
 const people = await rows(db, `SELECT o.email,o.display_name name,CASE WHEN o.role='owner' THEN 'owner' ELSE m.role END role FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email WHERE o.status='active' AND (o.role='owner' OR m.active=1) ORDER BY o.display_name,o.email`);
 const active = new Set(people.map(p => p.email));
 const absences = await rows(db, "SELECT a.*,(SELECT covering_email FROM s_absence_coverage c WHERE c.absence_id=a.id ORDER BY assigned_at DESC,id DESC LIMIT 1) covering_email FROM s_absences a WHERE a.end_date>=? ORDER BY a.start_date", today);
 const matters = await rows(db, `SELECT id,title,matter_number FROM s_matters WHERE ${matterScope('s_matters.id')} ORDER BY matter_number,id`,actor.role,actor.email);
 const item = (w: Data) => ({ kind: w.kind, id: w.id, matterId: w.matter_id, matterNumber: matters.find(m => m.id === w.matter_id)?.matter_number, title: w.title, due: w.due, owner: w.owner, overdue: Boolean(w.due && w.due < today), imminent: Boolean(w.due && w.due <= soon) });
 const handoffs = await pendingHandoffs(db,actor);
 return {
  today, soonDays: SOON_DAYS,
  people: people.map(p => { const mine = work.filter(w => w.owner === p.email).map(item); return { ...p, open: mine.length, dueSoon: mine.filter(w => w.imminent), overdue: mine.filter(w => w.overdue).length, absences: absences.filter(a => a.email === p.email).map(a => ({ id: a.id, startDate: a.start_date, endDate: a.end_date, coveredBy: a.covering_email ?? null })), pendingHandoffs: handoffs.filter(h => h.to === p.email).length, matters: [...new Set(mine.map(w => w.matterId))] }; }),
  unowned: work.filter(w => !w.owner || !active.has(w.owner)).map(item),
  imminentUnowned: work.filter(w => (!w.owner || !active.has(w.owner)) && w.due && w.due <= soon).map(item),
  unownedMatters: matters.filter(m => { const open = work.filter(w => w.matter_id === m.id); return open.length && !open.some(w => w.owner && active.has(w.owner)); }).map(m => ({ id: m.id, matterNumber: m.matter_number, title: m.title })),
  handoffs,
 };
}

async function pendingHandoffs(db: D1Database, actor: Actor, where = 'h.acknowledged_at IS NULL', ...params: unknown[]) {
 const list = await rows(db, `SELECT h.* FROM s_handoffs h WHERE (${where}) AND NOT EXISTS(SELECT 1 FROM s_handoff_items hi WHERE hi.handoff_id=h.id AND NOT (${matterScope('hi.matter_id')})) ORDER BY h.created_at DESC,h.id`, ...params,actor.role,actor.email);
 const items = list.length ? await rows(db, `SELECT * FROM s_handoff_items WHERE handoff_id IN (${list.map(() => '?').join(',')}) ORDER BY kind,title`, ...list.map(h => h.id)) : [];
 return list.map(h => handoffJson(h, items));
}
export async function myHandoffs(db: D1Database, actor: Actor) {
 human(actor);
 return actor.role === 'owner' ? pendingHandoffs(db,actor, '1=1') : pendingHandoffs(db,actor, 'h.to_email=? OR h.from_email=?', actor.email, actor.email);
}

export async function handOff(db: D1Database, actor: Actor, body: Data) {
 human(actor); need(actor, 'owner');
 const from = text(body.from, 'Handing off from', 254).toLowerCase(), to = text(body.to, 'Receiver', 254).toLowerCase(), reason = text(body.reason, 'Handoff reason', 500);
 insist(from !== to, 'Choose a different receiver');
 insist(await stmt(db, `SELECT 1 FROM oa_operators WHERE email=? AND status='active'`, to).first() && await stmt(db, `SELECT ${activeOwner('?')} ok`, to).first<Data>().then(r => r?.ok), `${to} is not active staff`);
 insist(Array.isArray(body.matterIds) && body.matterIds.length > 0 && body.matterIds.length <= 100, 'Choose 1 to 100 matters');
 const kinds = Array.isArray(body.kinds) && body.kinds.length ? body.kinds : ['task', 'deadline'];
 insist(kinds.every((k: unknown) => k === 'task' || k === 'deadline'), 'Choose tasks, deadlines or both');
 const matterIds = [...new Set((body.matterIds as unknown[]).map(m => text(m, 'Matter', 100)))];
 for (const m of matterIds) { await matter(db,actor,m); insist(await stmt(db, `SELECT ${sees} ok`, to, m).first<Data>().then(r => r?.ok), `${to} cannot see matter ${m}; grant matter access first`, 409); }
 const marks = matterIds.map(() => '?').join(',');
 const tasks = kinds.includes('task') ? await rows(db, `SELECT * FROM s_tasks WHERE status='open' AND owner_email=? AND matter_id IN (${marks})`, from, ...matterIds) : [];
 const deadlines = kinds.includes('deadline') ? await rows(db, `SELECT * FROM s_deadlines WHERE status IN ('proposed','confirmed') AND owner_email=? AND matter_id IN (${marks})`, from, ...matterIds) : [];
 insist(tasks.length + deadlines.length, `${from} owns no open tasks or deadlines on those matters`, 409);
 const h = { id: id(), at: now() }, writes = [stmt(db, 'INSERT INTO s_handoffs(id,from_email,to_email,reason,created_by,created_at) VALUES(?,?,?,?,?,?)', h.id, from, to, reason, actor.email, h.at)];
 for (const m of matterIds) { const g = id(); writes.push(stmt(db, `INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN ${sees} THEN 1 ELSE 0 END`, g, to, m), stmt(db, 'DELETE FROM s_guard WHERE id=?', g)); }
 for (const t of tasks) writes.push(stmt(db, 'UPDATE s_tasks SET owner_email=?,revision=? WHERE id=? AND revision=?', to, id(), t.id, t.revision), stmt(db, 'INSERT INTO s_handoff_items VALUES(?,?,?,?,?)', h.id, 'task', t.id, t.matter_id, t.title), stmt(db, 'INSERT INTO s_task_events VALUES(?,?,?,?,?,?)', id(), t.id, 'handoff', JSON.stringify({ from, to, reason, handoffId: h.id }), actor.email, h.at), stmt(db, 'INSERT INTO s_task_notifications(id,task_id,recipient,message,created_at) VALUES(?,?,?,?,?)', id(), t.id, to, `Handed off to you: ${t.title} (${reason}); acknowledge the handoff`, h.at));
 for (const d of deadlines) writes.push(stmt(db, 'UPDATE s_deadlines SET owner_email=?,revision=? WHERE id=? AND revision=?', to, id(), d.id, d.revision), stmt(db, 'INSERT INTO s_handoff_items VALUES(?,?,?,?,?)', h.id, 'deadline', d.id, d.matter_id, d.title), stmt(db, 'INSERT INTO s_deadline_owners VALUES(?,?,?,?,?)', id(), d.id, to, actor.email, h.at));
 writes.push(audit(db, actor, 'handoff.created', h.id, JSON.stringify({ from, to, reason, matters: matterIds, tasks: tasks.map(t => t.id), deadlines: deadlines.map(d => d.id) })));
 await atomic(db, actor, writes);
 return (await pendingHandoffs(db,actor, 'h.id=?', h.id))[0];
}

export async function acknowledgeHandoff(db: D1Database, actor: Actor, handoffId: string) {
 human(actor);
 insist((await pendingHandoffs(db,actor,'h.id=?',handoffId)).length,'Handoff not found',404);
 const h = await stmt(db, 'SELECT * FROM s_handoffs WHERE id=?', handoffId).first<Data>();
 insist(h && (h.to_email === actor.email || actor.role === 'owner'), 'Handoff not found', 404);
 insist(h.to_email === actor.email, 'Only the receiver acknowledges a handoff', 403); insist(!h.acknowledged_at, 'This handoff is already acknowledged', 409);
 await atomic(db, actor, [stmt(db, 'UPDATE s_handoffs SET acknowledged_by=?,acknowledged_at=? WHERE id=? AND acknowledged_at IS NULL', actor.email, now(), h.id), audit(db, actor, 'handoff.acknowledged', h.id, JSON.stringify({ from: h.from_email, to: h.to_email }))]);
 return (await pendingHandoffs(db,actor, 'h.id=?', h.id))[0];
}
