import { applyD1ImportBatches, createD1ImportJob, planD1Import, readD1ImportJob, readD1ImportOriginals, readD1ImportUndoReport, resumeD1Import, undoD1Import, type D1ImportContext } from '../modules/import-kit/src/d1/index';
import { Fault, human, insist, integer, need, stmt, text, type Actor, type Data } from './model';
import { clioSource, MAPPING_VERSION, NAMESPACE } from './imports/clio';
import { partyTargets } from './imports/target';

function authority(actor: Actor) {
  need(actor, 'owner'); human(actor);
  return { sql: "EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND email=? AND role='owner' AND status='active')", params: [actor.id, actor.email] };
}
function context(db: D1Database, actor: Actor): D1ImportContext {
  const guard = authority(actor);
  return {
    destination: 'main', namespace: NAMESPACE, mappingVersion: MAPPING_VERSION, reversalPolicy: 'preserve-conflicts',
    storage: { database: db, targets: partyTargets },
    // Role custody survives installation export/restore; each operation still
    // checks the current native owner row inside Base's atomic transaction.
    authorization: { principalId: 'role:owner', predicate: () => guard }, batchSize: 20, maxBatches: 2,
  };
}

export async function importAction(db: D1Database, actor: Actor, op: string, body: Data) {
  try { return await action(db, actor, op, body); }
  catch (error) {
    if (error instanceof Fault) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (['IMPORT_JOB_NOT_FOUND', 'JOB_BINDING_MISMATCH'].includes(message)) throw new Fault('Import job not found', 404);
    if (['SOURCE_ID_CONTENT_CONFLICT', 'NATIVE_EDIT_CONFLICT', 'TARGET_REVISION_CONFLICT'].includes(message)) throw new Fault('This contact identity already exists with different content or has been edited. Reconcile the contact before importing it again.', 409);
    if (message === 'UNDO_REQUIRES_COMPLETED_IMPORT') throw new Fault('Resume the import to completion before undoing it', 409);
    if (/IMPORT_ATOMIC_GUARD|IMPORT_FINAL_GUARD/.test(message)) throw new Fault('Import authority or data changed. Refresh before continuing.', 409);
    throw error;
  }
}

async function action(db: D1Database, actor: Actor, op: string, body: Data) {
  const ctx = context(db, actor);
  insist(body && typeof body === 'object' && !Array.isArray(body), 'Supply an import JSON object');
  if (op === 'preview' || op === 'commit') {
    const { source, mapping, summary, parties } = clioSource(body.csv, body.filename);
    const plan = await planD1Import(source, mapping, ctx);
    const review = { fingerprint: plan.fingerprint, mappingVersion: mapping.version, counts: plan.counts, summary, parties, diagnostics: plan.diagnostics };
    if (op === 'preview') return review;
    insist(summary.errors.length === 0 && plan.counts.rejected === 0, 'Resolve the CSV errors before importing', 409);
    insist(body.fingerprint === plan.fingerprint, 'The file changed since preview; preview it again before committing', 409);
    // Keep an undone job and its evidence; a deliberate later re-import is a
    // new operation. Concurrent identical commits share the same operation key.
    const undone = await stmt(db, "SELECT COUNT(*) AS n FROM ik_jobs WHERE destination='main' AND namespace=? AND fingerprint=? AND state='undone'", NAMESPACE, plan.fingerprint).first<{ n: number }>();
    const job = await createD1ImportJob(plan, { ...ctx, reviewedFingerprint: body.fingerprint, operationKey: `${NAMESPACE}:${plan.fingerprint}:${undone?.n ?? 0}` });
    return { ...review, job: await applyD1ImportBatches(job.id, ctx) };
  }
  insist(['status', 'resume', 'undo'].includes(op), 'Unknown import action', 404);
  const id = text(body.id, 'Import job ID', 100);
  if (body.mappingVersion !== undefined) insist(body.mappingVersion === MAPPING_VERSION, 'Import mapping version does not match', 409);
  if (op === 'resume') return { job: await resumeD1Import(id, ctx) };
  if (op === 'undo') return { job: await undoD1Import(id, ctx) };
  const offset = body.offset === undefined ? 0 : integer(body.offset, 'Undo report offset');
  const limit = body.limit === undefined ? 100 : integer(body.limit, 'Undo report limit', 1, 1000);
  return { job: await readD1ImportJob(id, ctx), originals: await readD1ImportOriginals(id, ctx), undo: await readD1ImportUndoReport(id, ctx, { offset, limit }) };
}

export async function importState(db: D1Database, actor: Actor) {
  const guard = authority(actor);
  const results = await db.batch<Data>([
    stmt(db, `SELECT CASE WHEN (${guard.sql}) THEN 1 ELSE 0 END AS ok`, ...guard.params),
    stmt(db, `SELECT id,mapping_version AS mappingVersion,fingerprint,state,checkpoint,total,error FROM ik_jobs WHERE destination='main' AND namespace=? AND principal_id='role:owner' AND (${guard.sql}) ORDER BY rowid DESC`, NAMESPACE, ...guard.params),
    stmt(db, `SELECT CASE WHEN (${guard.sql}) THEN 1 ELSE 0 END AS ok`, ...guard.params),
  ]);
  insist(results[0].results[0]?.ok === 1 && results[2].results[0]?.ok === 1, 'Only the active owner can view imports', 403);
  return { jobs: results[1].results };
}
