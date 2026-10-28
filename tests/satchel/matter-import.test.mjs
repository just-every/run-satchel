import {proveWholeFirmMove,proveMoveRefusals} from './migration-flow.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { harness, open } from './harness.mjs';

const filename = 'clio-reviewed-matters.csv';
const csv = '\uFEFFid,display_number,description,client,adverse_party,source_note\r\n842,2019-0042,"Lease, review",Barton Workshop LLC,Riverbend Holdings LLC,Retain me\r\n843,2019-0043,Boundary dispute,Pine Studio,Cedar Property,Original note\r\n';
const preview = (h, contents = csv) => h.json('/matter-import/preview', { csv: contents, filename }, h.owner);
async function commit(h, plan, row, extra = {}, expected = 200) {
  const search = await h.json('/conflicts', { client: row.client, adverse: row.adverse }, h.owner);
  return h.json('/matter-import/commit', { csv, filename, fingerprint: plan.fingerprint, sourceId: row.sourceId, conflictId: search.id, confirmed: true, reviewNote: 'Principal reviewed the matches and obtained necessary clearance.', ...extra }, h.owner, expected);
}
async function archive(h) { return (await h.request('/api/satchel/backup', undefined, h.owner)).text(); }
function nativeRows(contents) {
  return contents.trim().split('\n').map(line => JSON.parse(line)).filter(row => row.kind === 'part').flatMap(part => part.items).filter(item => item.kind === 'row').map(item => JSON.stringify({ table: item.table, row: item.row })).sort();
}

test('MATTER-008 / MOVE-002 matter subset previews without writes, preserves source numbers and bytes, resumes after restore and replays without duplicates', async () => {
  const h = await harness(); let restored;
  try {
    const before = await archive(h), plan = await preview(h);
    const after=await archive(h),afterRows=nativeRows(after),priorIds=new Set(nativeRows(before).map(row=>JSON.parse(row).row.id));
    const custody=afterRows.map(JSON.parse).filter(item=>item.table==='s_audit'&&!priorIds.has(item.row.id));
    assert.equal(custody.length,1,'The measuring archive adds exactly its export custody action');assert.equal(custody[0].row.action,'firm.archive_exported');assert.equal(JSON.parse(custody[0].row.detail).sha256,createHash('sha256').update(before).digest('hex'));
    assert.deepEqual(afterRows.filter(row=>JSON.parse(row).row.id!==custody[0].row.id),nativeRows(before),'Preview changes no product row; the separately proven archive custody action is retained');
    assert.equal(plan.summary.pending, 2);
    assert.ok(plan.diagnostics.some(item => item.code === 'UNMAPPED_COLUMNS'));
    await commit(h, plan, plan.rows[0], { fingerprint: 'changed' }, 409);
    await commit(h, plan, plan.rows[0], { confirmed: false }, 400);
    assert.equal((await h.json('/matter-import', undefined, h.owner)).imports.length, 0);
    const first = await commit(h, plan, plan.rows[0]);
    assert.equal(first.matter.number, plan.rows[0].number);
    const replay = await h.json('/matter-import/resume', { csv, filename, fingerprint: plan.fingerprint, sourceId: plan.rows[0].sourceId }, h.owner);
    assert.equal(replay.matter.id, first.matter.id); assert.equal(replay.replayed, true);
    const journal = await h.json('/matter-import/status', { fingerprint: plan.fingerprint }, h.owner);
    assert.equal(Buffer.from(journal.original.original_base64, 'base64').toString('utf8'), csv);
    assert.equal(journal.original.sha256, createHash('sha256').update(csv).digest('hex'));
    assert.equal(JSON.parse(journal.rows[0].source_json).source_note, 'Retain me');
    assert.equal(journal.rows[0].conflict_id, first.matter.conflict_id);
    assert.equal(journal.rows[0].review_note, first.matter.review_note);
    assert.equal((await preview(h)).summary.imported, 1);
    const interrupted = await archive(h);
    restored = await harness();
    await restored.json('/restore', { archive: interrupted, confirm: 'RESTORE' }, restored.owner);
    const restoredPlan = await preview(restored);
    assert.equal(restoredPlan.summary.imported, 1);
    const existing = await restored.json('/matter-import/resume', { csv, filename, fingerprint: restoredPlan.fingerprint, sourceId: plan.rows[0].sourceId }, restored.owner);
    assert.equal(existing.matter.id, first.matter.id);
    const second = await commit(restored, restoredPlan, restoredPlan.rows[1]);
    assert.equal(second.matter.number, plan.rows[1].number);
    assert.equal((await restored.json('/state', undefined, restored.owner)).matters.length, 2);
    const restoredJournal = await restored.json('/matter-import/status', { fingerprint: plan.fingerprint }, restored.owner);
    assert.equal(restoredJournal.rows.length, 2);
    assert.equal(restoredJournal.original.original_base64, journal.original.original_base64);
    const numbering=await restored.json('/numbering',undefined,restored.owner);
    await restored.json('/numbering',{...numbering,pattern:'2019-{sequence}',start:42,padding:4,perClient:false},restored.owner);
    const native=await open(restored,'New native matter','Maple Client','Elm Adverse');
    assert.equal(native.matter_number,'2019-0044','New numbering skips both imported source numbers');
    const changedCsv = csv.replace('Lease, review', 'Changed description');
    const changed = await preview(restored, changedCsv);
    assert.ok(changed.diagnostics.some(item => item.code === 'SOURCE_CHANGED'));
    await restored.json('/matter-import/commit', { csv: changedCsv, filename, fingerprint: changed.fingerprint, sourceId: plan.rows[0].sourceId }, restored.owner, 409);
    assert.equal((await restored.json('/state', undefined, restored.owner)).matters.length, 3);
    await proveWholeFirmMove(h);
  } finally { await restored?.close(); await h.close(); }
});

test('matter import requires principal authority and exact fresh human clearance, and refuses duplicate source rows and native number collisions', async () => {
  const h = await harness();
  try {
    await h.json('/matter-import/preview', { csv, filename }, '', 401);
    await h.json('/team', { email: 'import-lawyer@example.test', name: 'Associate', role: 'lawyer' }, h.owner);
    await h.json('/team/invite', { email: 'import-lawyer@example.test' }, h.owner);
    const lawyer = await h.login('import-lawyer@example.test');
    await h.json('/matter-import/preview', { csv, filename }, lawyer, 403);
    await h.json('/matter-import', undefined, lawyer, 403);
    const plan = await preview(h), row = plan.rows[0];
    const wrong = await h.json('/conflicts', { client: 'Other client', adverse: row.adverse }, h.owner);
    const body = { csv, filename, fingerprint: plan.fingerprint, sourceId: row.sourceId, conflictId: wrong.id, confirmed: true, reviewNote: 'Reviewed.' };
    await h.json('/matter-import/commit', body, h.owner, 409);
    const search = await h.json('/conflicts', { client: row.client, adverse: row.adverse }, h.owner);
    await open(h, 'Later opened matter', 'Different Client', 'Different Adverse');
    await h.json('/matter-import/commit', { ...body, conflictId: search.id }, h.owner, 409);
    const fresh = await h.json('/conflicts', { client: row.client, adverse: row.adverse }, h.owner);
    const attempts = await Promise.all([h.json('/matter-import/commit', { ...body, conflictId: fresh.id }, h.owner), h.json('/matter-import/commit', { ...body, conflictId: fresh.id }, h.owner)]);
    assert.equal(attempts[0].matter.id, attempts[1].matter.id);
    assert.equal((await h.json('/state', undefined, h.owner)).matters.length, 2);
    const duplicate = csv.replace('843,2019-0043', '842,2019-0043');
    const rejected = await preview(h, duplicate);
    assert.ok(rejected.diagnostics.some(item => item.code === 'DUPLICATE_ID'));
    const collision = csv.replace('842,2019-0042', 'another-source,2019-0042');
    const collisionPlan = await preview(h, collision);
    assert.ok(collisionPlan.diagnostics.some(item => item.code === 'NUMBER_TAKEN'));
    await h.json('/matter-import/commit', { ...body, csv: collision, fingerprint: collisionPlan.fingerprint, sourceId: 'another-source' }, h.owner, 409);
    await proveMoveRefusals(h,lawyer);
  } finally { await h.close(); }
});
