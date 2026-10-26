import { audit, insist, stmt, type Actor, type Data } from './model';
import { currentUpdateCounsel, updateAuthorityGuards } from './matter-update-authority';

type Sources = Record<string, Data[]>;
export type UpdateClosureAccess = { documents: Set<string>; deadlines: Set<string> };

// Keep even draft edits and delivery and reply reconciliation in the exact closure
// snapshot. An approval cannot silently outlive a changed client communication.
export function updateClosureQueries() {
 const updates = 'SELECT id FROM s_matter_updates WHERE matter_id=?';
 return {
  matterUpdates: 'SELECT * FROM s_matter_updates WHERE matter_id=?',
  updatePromises: `SELECT * FROM s_matter_update_promises WHERE update_id IN (${updates})`,
  updateRecipients: `SELECT * FROM s_matter_update_recipients WHERE update_id IN (${updates})`,
  updateJobs: 'SELECT * FROM s_matter_update_jobs WHERE matter_id=?',
  updateReplies: `SELECT * FROM s_matter_update_replies WHERE update_id IN (${updates})`,
 };
}

function reviewedUpdates(source: Sources) {
 return (source.matterUpdates ?? []).filter(u => u.status === 'approved');
}
function updateDocumentIds(update: Data, source: Sources) {
 const ids = [update.source_document_id];
 for (const deadlineId of [update.deadline_id, update.previous_deadline_id]) {
  const deadline = source.deadlines.find(d => d.id === deadlineId);
  if (deadline?.document_id) ids.push(deadline.document_id);
 }
 return ids.filter((id): id is string => Boolean(id));
}
export function restrictedUpdate(update: Data, source: Sources, access: UpdateClosureAccess) {
 return updateDocumentIds(update, source).some(id => !access.documents.has(id)) ||
  [update.deadline_id, update.previous_deadline_id].some(id => id && !access.deadlines.has(id));
}
export function restrictedUpdateSources(source: Sources, access: UpdateClosureAccess) {
 return reviewedUpdates(source).some(update => restrictedUpdate(update, source, access) ||
  (source.updatePromises ?? []).some(p => p.update_id === update.id && p.fulfilled_document_id && !access.documents.has(p.fulfilled_document_id)));
}

function evidencedFulfillment(promise: Data, source: Sources) {
 return promise.status === 'fulfilled' && promise.fulfilled_evidence && promise.fulfilled_by && promise.fulfilled_at &&
  source.documents.some(d => d.id === promise.fulfilled_document_id && !d.erased_at) &&
  source.versions.some(v => v.document_id === promise.fulfilled_document_id && v.version === promise.fulfilled_version && v.sha256 === promise.fulfilled_digest && v.intact);
}
export function updatePromiseChecks(source: Sources) {
 return reviewedUpdates(source).flatMap(update => (source.updatePromises ?? [])
  .filter(p => p.update_id === update.id && !evidencedFulfillment(p, source))
  .map(p => ({ key: `client-update-promise:${p.id}`, kind: 'client-update-promise', sourceId: p.id, title: p.text,
   state: { ...p, source_document_ids: [...updateDocumentIds(update, source), ...(p.fulfilled_document_id ? [p.fulfilled_document_id] : [])],
    source_deadline_ids: [update.deadline_id, update.previous_deadline_id].filter(Boolean) } })));
}

export function retainedUpdateJobs(source: Sources, access: UpdateClosureAccess) {
 return (source.updateJobs ?? []).filter(job => job.status === 'paused' && reviewedUpdates(source).some(update => update.id === job.update_id && !restrictedUpdate(update, source, access)))
  .map(job => ({ id: `client-update-job:${job.id}`, title: `Scheduled client update: ${source.matterUpdates.find(update => update.id === job.update_id)!.title}` }));
}
export function closeUpdateJobWrites(db: D1Database, actor: Actor, matterId: string, source: Sources) {
 return (source.updateJobs ?? []).filter(job => ['queued', 'prepared'].includes(job.status)).flatMap(job => {
  const status = job.status === 'queued' ? 'paused' : 'stopped';
  const detail = status === 'paused' ? 'Paused on matter closure; explicit reopening approval required' : 'Stopped on matter closure; prepared delivery requires a new counsel decision';
  return [stmt(db, 'UPDATE s_matter_update_jobs SET status=?,detail=? WHERE id=? AND status=?', status, detail, job.id, job.status),
   audit(db, actor, `matter_update.${status}`, job.id, JSON.stringify({ matterId, updateId: job.update_id, reason: detail }))];
 });
}
export async function reopenUpdateJobWrites(db: D1Database, actor: Actor, matterId: string, source: Sources, selected: string[]) {
 const selectedUpdates = reviewedUpdates(source).filter(update => (source.updateJobs ?? []).some(job => job.update_id === update.id && job.status === 'paused' && selected.includes(`client-update-job:${job.id}`)));
 const counsel = new Map(await Promise.all(selectedUpdates.map(async update => [update.id, await currentUpdateCounsel(db, update)] as const)));
 return (source.updateJobs ?? []).filter(job => job.status === 'paused').flatMap(job => {
  const resume = selected.includes(`client-update-job:${job.id}`);
  const update = selectedUpdates.find(update => update.id === job.update_id), approver = counsel.get(job.update_id);
  insist(!resume || (update && approver), 'Retain only previously approved scheduled updates', 409);
  const detail = resume ? 'Retained on explicit matter reopening approval' : 'Not resumed on reopening';
  // These guards execute after the lifecycle transaction opens the matter, so
  // resumed schedules retain their original counsel and exact source authority.
  return [...(resume ? updateAuthorityGuards(db, approver!, update!) : []),
   stmt(db, 'UPDATE s_matter_update_jobs SET status=?,detail=? WHERE id=? AND status=\'paused\'', resume ? 'queued' : 'stopped', detail, job.id),
   audit(db, actor, resume ? 'matter_update.resumed' : 'matter_update.stopped', job.id, JSON.stringify({ matterId, updateId: job.update_id, reason: detail }))];
 });
}
