import {wallAllows,matterScope} from './matter-scope';
// MATTER-003: dependent matter work. A task linked to a legal deadline takes its date
// from that deadline; reassignment, coverage and bulk updates never change a deadline.
import { atomic, audit, human, id, insist, integer, matter, need, now, rows, stmt, text, type Actor, type Data } from './model';
import { calendarDate, visibleDeadline } from './deadlines';
import { matterGuard } from './documents';
import { firmToday } from './retention';

const priorities = ['low', 'normal', 'high', 'urgent'], recurrences = ['none', 'daily', 'weekly', 'monthly'];
const sees = `EXISTS(SELECT 1 FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email WHERE o.email=? AND o.status='active' AND EXISTS(SELECT 1 FROM s_matters scope_matter WHERE scope_matter.id=? AND ${wallAllows('scope_matter.id','o.email')} AND (o.role='owner' OR (m.active=1 AND EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=scope_matter.id AND a.email=o.email)))))`;
function fence(db: D1Database, sql: string, ...params: unknown[]) { const g = id(); return [stmt(db, `INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN ${sql} THEN 1 ELSE 0 END`, g, ...params), stmt(db, 'DELETE FROM s_guard WHERE id=?', g)]; }
const event = (db: D1Database, actor: Actor, taskId: string, kind: string, detail: Data) => stmt(db, 'INSERT INTO s_task_events VALUES(?,?,?,?,?,?)', id(), taskId, kind, JSON.stringify(detail), actor.email, now());
const notify = (db: D1Database, taskId: string, recipient: string, message: string) => stmt(db, 'INSERT INTO s_task_notifications(id,task_id,recipient,message,created_at) VALUES(?,?,?,?,?)', id(), taskId, recipient, message, now());
async function assignee(db: D1Database, email: unknown, matterId: string) {
 const e = text(email, 'Task owner', 254).toLowerCase();
 insist(await stmt(db, `SELECT ${sees} ok`, e, matterId).first<Data>().then(r => r?.ok), `${e} cannot see this matter; grant matter access first`);
 return e;
}
function nextDue(day: string, recurrence: string) {
 const d = new Date(day + 'T00:00:00Z');
 if (recurrence === 'daily') d.setUTCDate(d.getUTCDate() + 1);
 else if (recurrence === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
 else { const target = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(target, last)); }
 return d.toISOString().slice(0, 10);
}

export async function listTasks(db: D1Database, actor: Actor, matterId: string) {
 const m = await matter(db, actor, matterId), today = await firmToday(db);
 const tasks = await rows(db, `SELECT t.*,d.date deadline_date,d.status deadline_status,d.title deadline_title,o.display_name owner_name FROM s_tasks t LEFT JOIN s_deadlines d ON d.id=t.deadline_id LEFT JOIN oa_operators o ON o.email=t.owner_email WHERE t.matter_id=? ORDER BY t.status DESC,COALESCE(d.date,t.due_date,'9999'),t.created_at,t.id`, m.id);
 const deps = await rows(db, 'SELECT x.* FROM s_task_dependencies x JOIN s_tasks t ON t.id=x.task_id WHERE t.matter_id=?', m.id);
 const events = await rows(db, 'SELECT e.* FROM s_task_events e JOIN s_tasks t ON t.id=e.task_id WHERE t.matter_id=? ORDER BY e.at,e.id', m.id);
 const absences = await rows(db, "SELECT a.*,(SELECT covering_email FROM s_absence_coverage c WHERE c.absence_id=a.id ORDER BY assigned_at DESC,id DESC LIMIT 1) covering_email FROM s_absences a");
 return tasks.map(t => {
  const due = t.deadline_id ? t.deadline_date : t.due_date, on = due && due > today ? due : today;
  const away = t.owner_email && t.status === 'open' ? absences.find(a => a.email === t.owner_email && a.start_date <= on && on <= a.end_date) : undefined;
  const prerequisites = tasks.filter(p => deps.some(d => d.task_id === t.id && d.prerequisite_id === p.id));
  const subtasks = tasks.filter(s => s.parent_id === t.id);
  const blockers = [...prerequisites.filter(p => p.status === 'open').map(p => ({ id: p.id, title: p.title, kind: 'prerequisite' })), ...subtasks.filter(s => s.status === 'open').map(s => ({ id: s.id, title: s.title, kind: 'subtask' }))];
  return { id: t.id, matterId: t.matter_id, parentId: t.parent_id, title: t.title, priority: t.priority, dueDate: due, legalDate: t.deadline_id ? { deadlineId: t.deadline_id, title: t.deadline_title, status: t.deadline_status } : null, owner: t.owner_email, ownerName: t.owner_name ?? t.owner_email, recurrence: t.recurrence, seriesId: t.series_id, status: t.status, completedBy: t.completed_by, completedAt: t.completed_at, evidence: t.completion_evidence, revision: t.revision, prerequisites: prerequisites.map(p => ({ id: p.id, title: p.title, status: p.status })), subtasks: subtasks.map(s => s.id), blockers, coverage: away ? { absent: away.email, coveredBy: away.covering_email ?? null } : null, history: events.filter(e => e.task_id === t.id).map(e => ({ kind: e.kind, actor: e.actor, at: e.at, detail: JSON.parse(e.detail) })) };
 });
}

export async function createTask(db: D1Database, actor: Actor, matterId: string, body: Data) {
 human(actor); need(actor, 'owner', 'lawyer', 'assistant');
 const m = await matter(db, actor, matterId);
 const priority = body.priority ?? 'normal', recurrence = body.recurrence ?? 'none';
 insist(priorities.includes(priority), 'Choose low, normal, high or urgent'); insist(recurrences.includes(recurrence), 'Choose none, daily, weekly or monthly');
 const deadline = body.deadlineId ? await visibleDeadline(db, actor, text(body.deadlineId, 'Legal date', 100)) : null;
 insist(!deadline || deadline.matter_id === m.id, 'Legal date not found', 404);
 insist(!deadline || !body.dueDate, 'A task linked to a legal date takes its date from that deadline');
 const due = body.dueDate ? calendarDate(body.dueDate) : null;
 insist(recurrence === 'none' || due, 'A recurring task needs its own due date');
 const owner = body.ownerEmail ? await assignee(db, body.ownerEmail, m.id) : null;
 const parent = body.parentId ? await stmt(db, 'SELECT * FROM s_tasks WHERE id=? AND matter_id=?', text(body.parentId, 'Parent task', 100), m.id).first<Data>() : null;
 insist(!body.parentId || parent, 'Parent task not found', 404); insist(!parent || parent.status === 'open', 'Add subtasks only to open tasks', 409);
 insist(!body.prerequisites || Array.isArray(body.prerequisites) && body.prerequisites.length <= 20, 'Choose at most 20 prerequisites');
 const prerequisites = [...new Set(((body.prerequisites ?? []) as unknown[]).map(p => text(p, 'Prerequisite', 100)))];
 for (const p of prerequisites) insist(await stmt(db, 'SELECT 1 FROM s_tasks WHERE id=? AND matter_id=?', p, m.id).first(), 'Prerequisite not found', 404);
 const t = { id: id(), title: text(body.title, 'Task title', 300) };
 await atomic(db, actor, [...matterGuard(db, actor, m.id), ...(owner ? fence(db, sees, owner, m.id) : []),
  stmt(db, 'INSERT INTO s_tasks(id,matter_id,parent_id,title,priority,due_date,deadline_id,owner_email,recurrence,series_id,status,revision,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', t.id, m.id, parent?.id ?? null, t.title, priority, due, deadline?.id ?? null, owner, recurrence, t.id, 'open', id(), actor.email, now()),
  ...prerequisites.map(p => stmt(db, 'INSERT INTO s_task_dependencies VALUES(?,?)', t.id, p)),
  event(db, actor, t.id, 'created', { owner, priority, due, deadlineId: deadline?.id ?? null, prerequisites, parentId: parent?.id ?? null, recurrence }),
  ...(owner && owner !== actor.email ? [notify(db, t.id, owner, `Assigned to you: ${t.title}`)] : []),
  audit(db, actor, 'task.created', t.id, JSON.stringify({ matterId: m.id, owner }), { matterId: m.id })]);
 return (await listTasks(db, actor, m.id)).find(x => x.id === t.id);
}

async function openTask(db: D1Database, actor: Actor, taskId: string) {
 human(actor); need(actor, 'owner', 'lawyer', 'assistant');
 const t = await stmt(db, 'SELECT * FROM s_tasks WHERE id=?', taskId).first<Data>(); insist(t, 'Task not found', 404);
 await matter(db, actor, t.matter_id); return t;
}

export async function assignTask(db: D1Database, actor: Actor, taskId: string, body: Data) {
 const t = await openTask(db, actor, taskId); insist(t.status === 'open', 'A completed task keeps its owner', 409);
 const owner = await assignee(db, body.email, t.matter_id), reason = text(body.reason, 'Reassignment reason', 500);
 insist(body.revision === undefined || body.revision === t.revision, 'The task changed. Refresh before reassigning.', 409);
 await atomic(db, actor, [...matterGuard(db, actor, t.matter_id), ...fence(db, sees, owner, t.matter_id),
  stmt(db, 'UPDATE s_tasks SET owner_email=?,revision=? WHERE id=? AND revision=?', owner, id(), t.id, t.revision),
  event(db, actor, t.id, 'reassigned', { from: t.owner_email, to: owner, reason }), notify(db, t.id, owner, `Reassigned to you: ${t.title} (${reason})`),
  audit(db, actor, 'task.reassigned', t.id, JSON.stringify({ matterId: t.matter_id, from: t.owner_email, to: owner, reason }), { matterId: t.matter_id })]);
 return (await listTasks(db, actor, t.matter_id)).find(x => x.id === t.id);
}

export async function completeTask(db: D1Database, actor: Actor, taskId: string, body: Data) {
 const t = await openTask(db, actor, taskId), task = (await listTasks(db, actor, t.matter_id)).find(x => x.id === t.id)!;
 insist(t.status === 'open', 'This task is already complete', 409);
 insist(!task.blockers.length, `Finish first: ${task.blockers.map(b => b.title).join(', ')}`, 409);
 const evidence = text(body.evidence, 'Completion evidence', 2000), at = now();
 const writes = [...matterGuard(db, actor, t.matter_id),
  ...fence(db, "NOT EXISTS(SELECT 1 FROM s_task_dependencies x JOIN s_tasks p ON p.id=x.prerequisite_id WHERE x.task_id=? AND p.status='open') AND NOT EXISTS(SELECT 1 FROM s_tasks s WHERE s.parent_id=? AND s.status='open')", t.id, t.id),
  stmt(db, "UPDATE s_tasks SET status='done',completed_by=?,completed_at=?,completion_evidence=?,revision=? WHERE id=? AND status='open' AND revision=?", actor.email, at, evidence, id(), t.id, t.revision),
  event(db, actor, t.id, 'completed', { evidence }), audit(db, actor, 'task.completed', t.id, JSON.stringify({ matterId: t.matter_id, evidence }), { matterId: t.matter_id })];
 // Owners of dependent work learn what was finished and what still blocks them.
 const all = await listTasks(db, actor, t.matter_id);
 for (const d of all.filter(x => x.status === 'open' && x.prerequisites.some((p: Data) => p.id === t.id) && x.owner)) {
  const remaining = d.blockers.filter((b: Data) => b.id !== t.id).map((b: Data) => b.title);
  writes.push(notify(db, d.id, d.owner, remaining.length ? `${t.title} is done; ${d.title} is still blocked by ${remaining.join(', ')}` : `${t.title} is done; ${d.title} is ready to start`));
 }
 if (t.recurrence !== 'none') {
  const next = id(), due = nextDue(t.due_date, t.recurrence);
  writes.push(stmt(db, 'INSERT INTO s_tasks(id,matter_id,parent_id,title,priority,due_date,deadline_id,owner_email,recurrence,series_id,status,revision,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', next, t.matter_id, t.parent_id, t.title, t.priority, due, null, t.owner_email, t.recurrence, t.series_id, 'open', id(), actor.email, at), event(db, actor, next, 'recurred', { previous: t.id, due }));
 }
 await atomic(db, actor, writes);
 return (await listTasks(db, actor, t.matter_id)).find(x => x.id === t.id);
}

// Bulk updates apply per task with their own history; a task linked to a legal date never moves.
export async function bulkTasks(db: D1Database, actor: Actor, matterId: string, body: Data) {
 human(actor); need(actor, 'owner', 'lawyer', 'assistant');
 const m = await matter(db, actor, matterId), reason = text(body.reason, 'Bulk update reason', 500);
 insist(Array.isArray(body.taskIds) && body.taskIds.length > 0 && body.taskIds.length <= 100, 'Choose 1 to 100 tasks');
 const owner = body.ownerEmail ? await assignee(db, body.ownerEmail, m.id) : null, priority = body.priority ?? null;
 insist(!priority || priorities.includes(priority), 'Choose low, normal, high or urgent');
 const shift = body.shiftDays === undefined || body.shiftDays === null || body.shiftDays === 0 ? 0 : integer(Math.abs(Number(body.shiftDays)), 'Days to shift', 1, 365) * Math.sign(Number(body.shiftDays));
 insist(owner || priority || shift, 'Choose an owner, a priority or days to shift');
 const tasks = await rows(db, `SELECT * FROM s_tasks WHERE matter_id=? AND status='open' AND id IN (${body.taskIds.map(() => '?').join(',')})`, m.id, ...body.taskIds.map((t: unknown) => text(t, 'Task', 100)));
 insist(tasks.length === new Set(body.taskIds).size, 'Every selected task must be open on this matter', 409);
 const writes = [...matterGuard(db, actor, m.id), ...(owner ? fence(db, sees, owner, m.id) : [])], skipped: Data[] = [];
 for (const t of tasks) {
  const due = shift && t.due_date ? (() => { const d = new Date(t.due_date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + shift); return d.toISOString().slice(0, 10); })() : t.due_date;
  if (shift && t.deadline_id) skipped.push({ id: t.id, title: t.title, reason: 'linked to a legal date; change the deadline itself' });
  const change = { owner: owner && owner !== t.owner_email ? { from: t.owner_email, to: owner } : null, priority: priority && priority !== t.priority ? { from: t.priority, to: priority } : null, due: due !== t.due_date ? { from: t.due_date, to: due } : null };
  if (!change.owner && !change.priority && !change.due) continue;
  writes.push(stmt(db, 'UPDATE s_tasks SET owner_email=?,priority=?,due_date=?,revision=? WHERE id=? AND revision=?', owner ?? t.owner_email, priority ?? t.priority, due, id(), t.id, t.revision), event(db, actor, t.id, 'bulk', { ...change, reason }));
  if (change.owner) writes.push(notify(db, t.id, owner!, `Reassigned to you: ${t.title} (${reason})`));
 }
 writes.push(audit(db, actor, 'task.bulk_updated', m.id, JSON.stringify({ matterId: m.id, tasks: tasks.map(t => t.id), owner, priority, shift, skipped: skipped.map(s => s.id), reason }), { matterId: m.id }));
 await atomic(db, actor, writes);
 return { tasks: (await listTasks(db, actor, m.id)).filter(t => tasks.some(x => x.id === t.id)), skipped };
}

export async function myNotifications(db: D1Database, actor: Actor) {
 human(actor);
 const list = await rows(db, `SELECT n.*,t.matter_id,t.title task_title FROM s_task_notifications n JOIN s_tasks t ON t.id=n.task_id WHERE n.recipient=? AND (${matterScope('t.matter_id', actor.channel === 'agent' ? "'agent'" : "'person'")}) ORDER BY n.created_at DESC,n.id`, actor.email, actor.role, actor.email);
 return list.map(n => ({ id: n.id, taskId: n.task_id, matterId: n.matter_id, message: n.message, createdAt: n.created_at, readAt: n.read_at }));
}
export async function readNotification(db: D1Database, actor: Actor, notificationId: string) {
 human(actor);
 await atomic(db, actor, [...fence(db, `EXISTS(SELECT 1 FROM s_task_notifications n JOIN s_tasks t ON t.id=n.task_id WHERE n.id=? AND n.recipient=? AND n.read_at IS NULL AND ${matterScope('t.matter_id')})`, notificationId, actor.email,actor.role,actor.email), stmt(db, 'UPDATE s_task_notifications SET read_at=? WHERE id=? AND recipient=?', now(), notificationId, actor.email)]);
 return { id: notificationId, read: true };
}
