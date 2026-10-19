import { Buffer } from 'node:buffer';
import { openMatter } from '../matters';
import { audit, digest, human, id, insist, need, now, rows, stmt, text, type Actor, type Data } from '../model';
import { parseCsv } from './csv';

const VERSION = 'clio-matters-v1';
const COLUMNS = ['id', 'display_number', 'description', 'client', 'adverse_party'];
type Diagnostic = { severity: 'error' | 'warning'; code: string; message: string; line?: number };
type ImportRow = { sourceId: string; number: string; title: string; client: string; adverse: string; line: number; digest: string; raw: Record<string, string>; status: string; matterId?: string };

async function owner(db: D1Database, actor: Actor) {
  human(actor); need(actor, 'owner');
  insist(await stmt(db, "SELECT 1 FROM oa_operators WHERE id=? AND email=? AND role='owner' AND status='active'", actor.id, actor.email).first(), 'Only the active principal can import matters', 403);
}

async function source(csv: unknown, filename: unknown) {
  insist(typeof csv === 'string' && csv.length > 0, 'Choose a prepared Clio matters CSV');
  const bytes = Buffer.from(csv, 'utf8');
  insist(bytes.length <= 1_000_000, 'The matters CSV must be at most 1 MB');
  insist(!csv.includes('\0'), 'The CSV contains a NUL character');
  const name = filename === undefined ? 'clio-matters.csv' : text(filename, 'CSV filename', 200);
  const parsed = parseCsv(csv), missing = COLUMNS.filter(column => !parsed.headers.includes(column));
  insist(!missing.length, `The CSV is missing required columns: ${missing.join(', ')}`);
  insist(parsed.rows.length > 0 && parsed.rows.length <= 1000, 'Import between 1 and 1,000 matters per file');
  const diagnostics: Diagnostic[] = [], seen = new Set<string>(), numbers = new Set<string>();
  const ignoredColumns = parsed.headers.filter(column => !COLUMNS.includes(column));
  if (ignoredColumns.length) diagnostics.push({ severity: 'warning', code: 'UNMAPPED_COLUMNS', message: `Columns retained in provenance only: ${ignoredColumns.join(', ')}` });
  const importedRows: ImportRow[] = await Promise.all(parsed.rows.map(async ({ line, value: raw }) => {
    const row: ImportRow = { sourceId: raw.id.trim(), number: raw.display_number.trim(), title: raw.description.trim(), client: raw.client.trim(), adverse: raw.adverse_party.trim(), line, raw, digest: '', status: 'pending' };
    const fail = (code: string, message: string) => diagnostics.push({ severity: 'error', code, message: `Row ${line}: ${message}`, line });
    for (const [key, label, max] of [['sourceId', 'id', 300], ['number', 'display_number', 200], ['title', 'description', 200], ['client', 'client', 200], ['adverse', 'adverse_party', 200]] as const) {
      if (!row[key] || row[key].length > max || /[\u0000-\u001f\u007f]/.test(row[key])) fail('INVALID_FIELD', `${label} must contain 1–${max} characters without control characters`);
    }
    if (seen.has(row.sourceId)) fail('DUPLICATE_ID', 'this source matter id appears more than once');
    if (numbers.has(row.number)) fail('DUPLICATE_NUMBER', 'this source display number appears more than once');
    seen.add(row.sourceId); numbers.add(row.number);
    // Exact cell content, including unmapped cells, is part of source identity.
    row.digest = await digest(JSON.stringify(Object.fromEntries(Object.keys(raw).sort().map(key => [key, raw[key]]))));
    return row;
  }));
  const sha256 = await digest(bytes);
  const fingerprint = await digest(JSON.stringify([VERSION, 'main', 'role:owner', name, sha256]));
  return { fingerprint, mappingVersion: VERSION, filename: name, sha256, originalBase64: bytes.toString('base64'), rows: importedRows, diagnostics, ignoredColumns };
}

async function preview(db: D1Database, plan: Awaited<ReturnType<typeof source>>) {
  const existing = await rows(db, 'SELECT source_id,source_digest,matter_id FROM s_matter_import_rows WHERE source_id IN (SELECT value FROM json_each(?))', JSON.stringify(plan.rows.map(row => row.sourceId)));
  const numbered = await rows(db, 'SELECT id,matter_number AS number FROM s_matters WHERE matter_number IN (SELECT value FROM json_each(?))', JSON.stringify(plan.rows.map(row => row.number)));
  const byId = new Map(existing.map(row => [row.source_id, row])), byNumber = new Map(numbered.map(row => [row.number, row]));
  for (const row of plan.rows) {
    const old = byId.get(row.sourceId), collision = byNumber.get(row.number);
    if (old) {
      row.matterId = old.matter_id;
      row.status = old.source_digest === row.digest ? 'imported' : 'conflict';
      if (row.status === 'conflict') plan.diagnostics.push({ severity: 'error', code: 'SOURCE_CHANGED', line: row.line, message: `Row ${row.line}: this source identity was already imported with different content. Reconcile it with the principal; no overwrite is allowed.` });
    } else if (collision) {
      row.status = 'conflict';
      plan.diagnostics.push({ severity: 'error', code: 'NUMBER_TAKEN', line: row.line, message: `Row ${row.line}: this display number already belongs to a matter. Reconcile the source identity before importing.` });
    }
  }
  return { fingerprint: plan.fingerprint, mappingVersion: VERSION, filename: plan.filename, rows: plan.rows.map(({ raw, ...row }) => row), diagnostics: plan.diagnostics, summary: { total: plan.rows.length, imported: plan.rows.filter(row => row.status === 'imported').length, pending: plan.rows.filter(row => row.status === 'pending').length, ignoredColumns: plan.ignoredColumns, errors: plan.diagnostics.filter(d => d.severity === 'error').map(d => d.message) } };
}

export async function matterImport(db: D1Database, actor: Actor, op: string, body: Data) {
  await owner(db, actor);
  insist(body && typeof body === 'object' && !Array.isArray(body), 'Supply an import JSON object');
  if (op === 'status') {
    const fingerprint = text(body.fingerprint, 'Import fingerprint', 64);
    const original = await stmt(db, 'SELECT * FROM s_matter_import_files WHERE fingerprint=?', fingerprint).first();
    insist(original, 'Matter import not found', 404);
    return { original, rows: await rows(db, 'SELECT * FROM s_matter_import_rows WHERE fingerprint=? ORDER BY source_line', fingerprint) };
  }
  insist(['preview', 'commit', 'resume'].includes(op), 'Unknown matter import action', 404);
  const plan = await source(body.csv, body.filename), review = await preview(db, plan);
  if (op === 'preview') return review;
  insist(body.fingerprint === plan.fingerprint, 'The file changed since preview; preview it again before committing', 409);
  insist(review.summary.errors.length === 0, 'Resolve the CSV and reconciliation errors before importing', 409);
  const row = plan.rows.find(candidate => candidate.sourceId === text(body.sourceId, 'Source matter id', 300));
  insist(row, 'Source matter not found in this file', 404);
  const replay = async () => {
    const old = await stmt(db, 'SELECT source_digest,matter_id,source_number FROM s_matter_import_rows WHERE source_id=?', row.sourceId).first<Data>();
    if (!old) return undefined;
    insist(old.source_digest === row.digest, 'This source matter was already imported with different content; reconcile it before proceeding', 409);
    return { replayed: true, matter: { id: old.matter_id, number: old.source_number }, sourceId: row.sourceId, fingerprint: plan.fingerprint };
  };
  const previous = await replay();
  if (previous) return previous;
  const conflictId = text(body.conflictId, 'Conflict search', 100);
  const conflict = await stmt(db, 'SELECT client,adverse FROM s_conflicts WHERE id=? AND actor=?', conflictId, actor.email).first<Data>();
  insist(conflict && conflict.client === row.client && conflict.adverse === row.adverse, 'Run and review a fresh conflict search for this row’s exact client and adverse party', 409);
  const matterId = `clio-matter:${await digest(row.sourceId)}`, at = now(), guard = id();
  const statements = [
    stmt(db, "INSERT INTO s_guard(id,ok) VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND email=? AND role='owner' AND status='active') THEN 1 ELSE 0 END)", guard, actor.id, actor.email),
    stmt(db, 'INSERT OR IGNORE INTO s_matter_import_files(fingerprint,mapping_version,filename,sha256,original_base64,total,imported_by,imported_at) VALUES(?,?,?,?,?,?,?,?)', plan.fingerprint, VERSION, plan.filename, plan.sha256, plan.originalBase64, plan.rows.length, actor.email, at),
    stmt(db, 'INSERT INTO s_matter_import_rows(source_id,source_digest,source_number,matter_id,fingerprint,source_line,source_json,conflict_id,review_note,reviewed_by,imported_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', row.sourceId, row.digest, row.number, matterId, plan.fingerprint, row.line, JSON.stringify(row.raw), conflictId, text(body.reviewNote, 'Conflict review conclusion', 2000), actor.email, at),
    audit(db, actor, 'matter.imported', matterId, `Clio ${row.sourceId}; source number ${row.number}; file ${plan.sha256}; reviewed fingerprint ${plan.fingerprint}`),
    stmt(db, 'DELETE FROM s_guard WHERE id=?', guard),
  ];
  try {
    const matter = await openMatter(db, actor, { title: row.title, conflictId, confirmed: body.confirmed, reviewNote: body.reviewNote }, matterId, { number: row.number, statements });
    return { replayed: false, matter, sourceId: row.sourceId, fingerprint: plan.fingerprint };
  } catch (error) {
    // A competing identical commit may have won. Its durable row is sufficient
    // to acknowledge success without creating another review or native matter.
    const concurrent = await replay();
    if (concurrent) return concurrent;
    throw error;
  }
}

export async function matterImportState(db: D1Database, actor: Actor) {
  await owner(db, actor);
  return { imports: await rows(db, 'SELECT f.fingerprint,f.mapping_version AS mappingVersion,f.filename,f.sha256,f.total,f.imported_by,f.imported_at,COUNT(r.source_id) AS imported FROM s_matter_import_files f LEFT JOIN s_matter_import_rows r ON r.fingerprint=f.fingerprint GROUP BY f.fingerprint ORDER BY f.imported_at DESC') };
}
