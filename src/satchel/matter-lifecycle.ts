import { atomic, audit, digest, human, id, insist, matter, need, now, rows, stmt, text, type Actor, type Data } from './model';
import { accessGuard, guard } from './trust-guards';
import { closureChecks, closureDeclarations, closureSourceGuards, readClosureSources } from './matter-closure-checks';
import { visibility } from './deadlines';
import { documentAccess } from './documents';
import { reopenRunWrites } from './workflow-runs';
import { outcomeLabels } from './matter-outcomes';
import { closeUpdateJobWrites, reopenUpdateJobWrites, restrictedUpdateSources, retainedUpdateJobs } from './matter-update-closure';

async function counsel(db: D1Database, actor: Actor, matterId: string) {
 human(actor); need(actor, 'owner', 'lawyer');
 return matter(db, actor, matterId);
}
const previewJson = (p: Data) => ({ id: p.id, matterId: p.matter_id, forEmail: p.for_email, revision: p.revision, digest: p.digest, checks: JSON.parse(p.checks_json), declarations: JSON.parse(p.declarations_json), createdAt: p.created_at });
const eventJson = (e: Data) => ({ id: e.id, kind: e.kind, reason: e.reason, actor: e.actor, actorId: e.actor_id, at: e.at, revision: e.revision, previousRevision: e.previous_revision, previewId: e.preview_id, snapshot: JSON.parse(e.snapshot), exceptions: JSON.parse(e.exceptions), restoration: JSON.parse(e.restoration) });
const outcomeJson = (o: Data) => ({ id: o.id, matterId: o.matter_id, eventId: o.event_id, outcome: o.outcome, note: o.note, recordedBy: o.recorded_by, at: o.at });
async function responseAccess(db: D1Database, actor: Actor, matterId: string) {
 const d = documentAccess(actor), t = visibility(actor);
 const [documents, deadlines] = await Promise.all([
  rows(db, `SELECT d.id FROM s_documents d WHERE d.matter_id=? AND ${d.sql}`, matterId, ...d.params),
  rows(db, `SELECT t.id FROM s_deadlines t WHERE t.matter_id=? AND ${t.sql}`, matterId, ...t.params),
 ]);
 return { documents: new Set(documents.map(d => d.id)), deadlines: new Set(deadlines.map(d => d.id)) };
}
type ResponseAccess = Awaited<ReturnType<typeof responseAccess>>;
function restrictedCheck(check: Data, access: ResponseAccess, source: Record<string, Data[]>) {
 const hiddenTask = (taskId: string) => { const task = source.tasks.find(t => t.id === taskId); return Boolean(task?.deadline_id && !access.deadlines.has(task.deadline_id)); };
 return (check.kind === 'deadline' && !access.deadlines.has(check.sourceId)) || (check.kind === 'task' && hiddenTask(check.sourceId)) ||
  (check.kind === 'handoff' && (check.state.items ?? []).some((i: Data) => i.kind === 'deadline' ? !access.deadlines.has(i.item_id) : hiddenTask(i.item_id))) ||
  (check.state.source_document_id && !access.documents.has(check.state.source_document_id)) ||
  (check.state.source_document_ids ?? []).some((id: string) => !access.documents.has(id)) ||
  (check.state.source_deadline_ids ?? []).some((id: string) => !access.deadlines.has(id)) ||
  (check.state.source?.id && !access.documents.has(check.state.source.id));
}
function publicChecks(checks: Data[], access: ResponseAccess, source: Record<string, Data[]>) {
 const visible=checks.filter(c=>!restrictedCheck(c,access,source));
 return visible.length===checks.length&&!restrictedUpdateSources(source,access)?visible:[...visible,{key:'restricted:review',kind:'restricted',sourceId:null,title:'Restricted item: ask authorized counsel',state:{},restricted:true}];
}
function publicDeclarations(declarations: Data, access: ResponseAccess) {
 const visible = (item: Data) => !item?.source?.id || access.documents.has(item.source.id);
 return { ...declarations, clientPromises: (declarations.clientPromises ?? []).map((p: Data) => visible(p) ? p : { id: p.id, title: 'Restricted promise evidence', status: p.status, restricted: true }),
  originalReturn: visible(declarations.originalReturn) ? declarations.originalReturn : { status: declarations.originalReturn.status, restricted: true } };
}
function publicPreview(p: Data, access: ResponseAccess) {
 const preview = previewJson(p), source = JSON.parse(p.source_json);
 const checks = publicChecks(preview.checks, access, source);
 const declarations=publicDeclarations(preview.declarations,access);
 return { ...preview, checks, declarations, hasRestrictedItems: checks.some(c => c.restricted)||Boolean(declarations.originalReturn?.restricted)||declarations.clientPromises.some((p:Data)=>p.restricted) };
}
function publicEvent(e: Data, access: ResponseAccess, outcome?: Data) {
 const event = eventJson(e), source = event.snapshot.source;
 const checks = publicChecks(event.snapshot.checks ?? [], access, source);
 const hidden = new Set((event.snapshot.checks??[]).filter((c:Data)=>restrictedCheck(c,access,source)).map((c:Data)=>c.key));
 const declarations=event.snapshot.declarations?publicDeclarations(event.snapshot.declarations,access):null;
 const hiddenEvidence=Boolean(declarations?.originalReturn?.restricted)||Boolean(declarations?.clientPromises.some((p:Data)=>p.restricted))||restrictedUpdateSources(source,access);
 return { ...event, ...(event.kind === 'closed' ? { outcome: outcome ? { ...outcomeJson(outcome), ...(hidden.size||hiddenEvidence ? { note: null, restrictedNote: true } : {}) } : null } : {}), reason: hidden.size||hiddenEvidence ? 'Restricted lifecycle decision details' : event.reason,
  snapshot: { ...(event.snapshot.preview ? { preview: { ...event.snapshot.preview, checks, declarations: publicDeclarations(event.snapshot.declarations, access) } } : {}), checks,
   ...(event.snapshot.declarations ? { declarations: publicDeclarations(event.snapshot.declarations, access) } : {}) },
  restoration: { ...event.restoration, ...(event.restoration.workflows ? { workflows: event.restoration.workflows.filter((key:string)=>!key.startsWith('client-update-job:')||retainedUpdateJobs(source,access).some(job=>job.id===key)) } : {}) },
  exceptions: [...event.exceptions.filter((item:Data)=>!hidden.has(item.key)),...(hidden.size?[{key:'restricted:review',reason:'Restricted item: ask authorized counsel',restricted:true}]:[])] };
}
function revisionGuard(db: D1Database, matterId: string, revision: string, status: string) {
 return guard(db, 'EXISTS(SELECT 1 FROM s_matters WHERE id=? AND lifecycle_revision=? AND lifecycle_status=?)', matterId, revision, status);
}
function retainedWorkflows(source: Record<string, Data[]>, access: ResponseAccess) {
 return [...source.tasks.filter(t => t.status === 'open' && (!t.deadline_id || access.deadlines.has(t.deadline_id))).map(t => ({ id: `task:${t.id}`, title: t.title })),
  ...source.deadlines.filter(d => ['proposed','confirmed'].includes(d.status) && access.deadlines.has(d.id)).map(d => ({ id: `deadline:${d.id}`, title: d.title })),
  ...source.appointments.filter(a => !source.appointmentChanges.some(c => c.appointment_id === a.id && c.occurrence === 0 && c.kind === 'cancelled')).map(a => ({ id: `appointment:${a.id}`, title: a.title })),
  ...source.workflowRuns.filter(r => ['proposed','active'].includes(r.status)).map(r => ({ id: `workflow-run:${r.id}`, title: `Workflow run ${r.status}` })),
  ...source.reminderRules.filter(r => r.status === 'active' && access.deadlines.has(r.deadline_id)).map(r => ({ id: `reminder:${r.id}`, title: `Reminder: ${source.deadlines.find(d => d.id === r.deadline_id)?.title ?? r.deadline_id}` })),
  ...retainedUpdateJobs(source, access)];
}
export async function matterLifecycle(db: D1Database, actor: Actor, matterId: string) {
 const m = await counsel(db, actor, matterId);
 const [source, events, previews, outcomes] = await Promise.all([
  readClosureSources(db, matterId), rows(db, 'SELECT * FROM s_matter_lifecycle_events WHERE matter_id=? ORDER BY at,id', matterId),
  rows(db, 'SELECT * FROM s_matter_closure_previews WHERE matter_id=? AND for_email=? ORDER BY created_at DESC,id DESC LIMIT 1', matterId, actor.email),
  rows(db, 'SELECT * FROM s_matter_outcomes WHERE matter_id=?', matterId),
 ]);
 const access = await responseAccess(db, actor, matterId);
 const declarations = { clientPromisesReviewed: false, clientPromises: [], originalReturn: null };
 const checks = publicChecks(closureChecks(source, declarations), access, source);
 const history = events.map(e => publicEvent(e, access, outcomes.find(o => o.event_id === e.id)));
 const latestClosure = history.filter(e => e.kind === 'closed').at(-1);
 return { matterId, status: m.lifecycle_status, revision: m.lifecycle_revision, checks, hasRestrictedItems: checks.some(c => c.restricted), latestPreview: previews.length ? publicPreview(previews[0], access) : null,
  outcome: latestClosure?.outcome ?? null,
  workflows: retainedWorkflows(source, access),
  access: source.access.map(a => a.email), history };
}
export async function closurePreview(db: D1Database, actor: Actor, matterId: string, body: Data) {
 const m = await counsel(db, actor, matterId);
 insist(m.lifecycle_status === 'open', 'Reopen this matter before preparing another closure', 409);
 const declarations = await closureDeclarations(db, actor, matterId, body), source = await readClosureSources(db, matterId);
 const checks = closureChecks(source, declarations), previewId = id(), at = now();
 const sourceJson = JSON.stringify(source), declarationsJson = JSON.stringify(declarations), checksJson = JSON.stringify(checks);
 const hash = await digest(JSON.stringify({ matterId, forEmail: actor.email, revision: m.lifecycle_revision, source, declarations, checks }));
 await atomic(db, actor, [accessGuard(db, actor, matterId), revisionGuard(db, matterId, m.lifecycle_revision, 'open'), ...closureSourceGuards(db, matterId, source),
  stmt(db, 'INSERT INTO s_matter_closure_previews(id,matter_id,for_email,revision,digest,source_json,checks_json,declarations_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)', previewId, matterId, actor.email, m.lifecycle_revision, hash, sourceJson, checksJson, declarationsJson, at),
  audit(db, actor, 'matter.closure_previewed', previewId, JSON.stringify({ matterId, revision: m.lifecycle_revision, digest: hash, unresolved: checks.map(c => c.key) })),
 ]);
 return publicPreview({ id: previewId, matter_id: matterId, for_email: actor.email, revision: m.lifecycle_revision, digest: hash, source_json: sourceJson, checks_json: checksJson, declarations_json: declarationsJson, created_at: at }, await responseAccess(db, actor, matterId));
}
export async function closeMatter(db: D1Database, actor: Actor, matterId: string, body: Data) {
 const m = await counsel(db, actor, matterId), reason = text(body.reason, 'Closure reason', 2000);
 insist(m.lifecycle_status === 'open', 'This matter is already closed', 409);
 const p = await stmt(db, 'SELECT * FROM s_matter_closure_previews WHERE id=? AND matter_id=? AND for_email=?', text(body.previewId, 'Reviewed closure preview', 100), matterId, actor.email).first<Data>();
 insist(p && p.revision === m.lifecycle_revision && body.revision === p.revision && body.digest === p.digest, 'Review the exact current closure preview for this person', 409);
 insist(!publicPreview(p,await responseAccess(db,actor,matterId)).hasRestrictedItems,'Restricted item: ask authorized counsel',403);
 const source = JSON.parse(p.source_json), checks = JSON.parse(p.checks_json), declarations = JSON.parse(p.declarations_json);
 insist(await digest(JSON.stringify({ matterId, forEmail: actor.email, revision: p.revision, source, declarations, checks })) === p.digest, 'Closure preview integrity check failed', 409);
 const live = await readClosureSources(db, matterId);
 // The SQL guards below repeat this check inside the decision transaction.
 insist(JSON.stringify(live) === p.source_json, 'Work or financial records changed; prepare and review another closure preview', 409);
 const carried = body.exceptions ?? [];
 insist(Array.isArray(carried) && carried.length === checks.length, 'Resolve each open item or carry each one with its own reason', 409);
 const exceptions = carried.map((e: Data) => ({ key: text(e?.key, 'Exception item', 200), reason: text(e?.reason, 'Individual exception reason', 2000) }));
 insist(new Set(exceptions.map(e => e.key)).size === checks.length && exceptions.every(e => checks.some((c: Data) => c.key === e.key)), 'Authorize each unresolved item individually from this exact preview', 409);
 insist(actor.role === 'owner' || await stmt(db, 'SELECT 1 FROM s_matter_stage_profiles WHERE matter_id=? AND lawyer_email=?', matterId, actor.email).first(), 'Only the responsible lawyer or principal may record the legal outcome and close this matter', 403);
 insist(typeof body.outcome === 'string' && Object.hasOwn(outcomeLabels, body.outcome), 'Choose a legal outcome');
 const outcome = body.outcome, outcomeNote = body.outcomeNote === undefined || body.outcomeNote === null || body.outcomeNote === '' ? null : text(body.outcomeNote, 'Legal outcome note', 2000);
 insist(outcome !== 'other' || outcomeNote, 'Other outcome details are required');
 const eventId = id(), revision = id(), at = now();
 const snapshot = { preview: previewJson(p), source, checks, declarations };
 await atomic(db, actor, [accessGuard(db, actor, matterId), revisionGuard(db, matterId, p.revision, 'open'),
  guard(db, "?='owner' OR EXISTS(SELECT 1 FROM s_matter_stage_profiles WHERE matter_id=? AND lawyer_email=?)", actor.role, matterId, actor.email),
  guard(db, 'EXISTS(SELECT 1 FROM s_matter_closure_previews WHERE id=? AND for_email=? AND digest=? AND revision=?)', p.id, actor.email, p.digest, p.revision),
  ...closureSourceGuards(db, matterId, source),
  stmt(db, 'INSERT INTO s_matter_lifecycle_events(id,matter_id,kind,previous_revision,revision,reason,actor,actor_id,at,preview_id,snapshot,exceptions,restoration) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', eventId, matterId, 'closed', p.revision, revision, reason, actor.email, actor.id, at, p.id, JSON.stringify(snapshot), JSON.stringify(exceptions), '{}'),
  stmt(db, 'INSERT INTO s_matter_outcomes(id,matter_id,event_id,outcome,note,recorded_by,at) VALUES(?,?,?,?,?,?,?)', id(), matterId, eventId, outcome, outcomeNote, actor.email, at),
  stmt(db, "UPDATE s_matters SET lifecycle_status='closed',lifecycle_revision=? WHERE id=? AND lifecycle_revision=?", revision, matterId, p.revision),
  ...closeUpdateJobWrites(db, actor, matterId, source),
  audit(db, actor, 'matter.closed', eventId, JSON.stringify({ matterId, reason, revision, previewId: p.id, digest: p.digest, exceptions, outcome, outcomeNote }), { snapshot, exceptions }),
 ]);
 return matterLifecycle(db, actor, matterId);
}
export async function reopenMatter(db: D1Database, actor: Actor, matterId: string, body: Data) {
 const m = await counsel(db, actor, matterId), reason = text(body.reason, 'Reopening reason', 2000);
 insist(m.lifecycle_status === 'closed' && body.revision === m.lifecycle_revision, 'Review the current closed matter revision', 409);
 insist(Array.isArray(body.workflows) && Array.isArray(body.access), 'Explicitly name the workflows and existing access approved on reopening (empty lists are allowed)');
 const names = (values: unknown[], label: string) => { insist(values.length <= 500, `Select at most 500 ${label}`); const list = values.map(v => text(v, label, 254)); insist(new Set(list).size === list.length, `Select each ${label} only once`); return list; };
 const workflows = names(body.workflows, 'Workflow'), access = names(body.access, 'Access holder');
 const source = await readClosureSources(db, matterId);
 const allowed = new Set(retainedWorkflows(source, await responseAccess(db, actor, matterId)).map(w => w.id));
 insist(workflows.every(w => allowed.has(w)), 'Approve only existing retained workflows; reopening starts no jobs', 409);
 insist(access.every(email => source.access.some(a => a.email === email)), 'Approve only existing matter access; grant changes separately', 409);
 const updateJobWrites = await reopenUpdateJobWrites(db, actor, matterId, source, workflows);
 const eventId = id(), revision = id(), at = now(), restoration = { workflows, access };
 await atomic(db, actor, [accessGuard(db, actor, matterId), revisionGuard(db, matterId, m.lifecycle_revision, 'closed'), ...closureSourceGuards(db, matterId, source),
  stmt(db, 'INSERT INTO s_matter_lifecycle_events(id,matter_id,kind,previous_revision,revision,reason,actor,actor_id,at,preview_id,snapshot,exceptions,restoration) VALUES(?,?,?,?,?,?,?,?,?,NULL,?,?,?)', eventId, matterId, 'reopened', m.lifecycle_revision, revision, reason, actor.email, actor.id, at, JSON.stringify({ source }), '[]', JSON.stringify(restoration)),
  stmt(db, "UPDATE s_matters SET lifecycle_status='open',lifecycle_revision=? WHERE id=? AND lifecycle_revision=?", revision, matterId, m.lifecycle_revision),
  ...reopenRunWrites(db, actor, matterId, source.workflowRuns, workflows, at),
  ...updateJobWrites,
  audit(db, actor, 'matter.reopened', eventId, JSON.stringify({ matterId, reason, revision, restoration }), { source, restoration }),
 ]);
 return matterLifecycle(db, actor, matterId);
}
