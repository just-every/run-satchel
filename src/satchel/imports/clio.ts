import { Buffer } from 'node:buffer';
import { canonicalJson, sha256, type Diagnostic, type ImportMapping, type SourceBundle, type SourceRecord } from '../../modules/import-kit/src/d1/index';
import { insist } from '../model';
import { parseCsv } from './csv';

export const NAMESPACE = 'clio-contacts';
export const MAPPING_VERSION = 'clio-contacts-v1';
const REQUIRED = ['first_name', 'last_name', 'company', 'email_address'];
const OPTIONAL = ['id', 'aliases'];

/** Clio's documented contacts migration-template CSV subset; see IMPORTING.md. */
export function clioSource(raw: unknown, filename: unknown) {
  insist(typeof raw === 'string' && raw.length > 0, 'Choose a Clio contacts CSV');
  const bytes = Buffer.from(raw, 'utf8');
  insist(bytes.length <= 1_000_000, 'The contacts CSV must be at most 1 MB');
  insist(!raw.includes('\0'), 'The CSV contains a NUL character');
  const name = typeof filename === 'string' && filename.trim() ? filename.trim().slice(0, 200) : 'clio-contacts.csv';
  const { headers, rows } = parseCsv(raw);
  const missing = REQUIRED.filter(header => !headers.includes(header));
  insist(!missing.length, `The CSV is missing required columns: ${missing.join(', ')}`);
  insist(rows.length > 0 && rows.length <= 1000, 'Import between 1 and 1,000 contacts per file');
  const artifactHash = sha256(bytes), diagnostics: Diagnostic[] = [], records: SourceRecord[] = [];
  const ignoredColumns = headers.filter(header => !REQUIRED.includes(header) && !OPTIONAL.includes(header));
  if (ignoredColumns.length) diagnostics.push({ severity: 'warning', code: 'UNMAPPED_COLUMNS', message: `Columns retained in the original only: ${ignoredColumns.join(', ')}` });
  const seen = new Set<string>(), parties: { sourceId: string; name: string; aliases: string; email: string }[] = [];
  for (const { line, value: row } of rows) {
    const first = row.first_name.trim(), last = row.last_name.trim(), company = row.company.trim();
    const displayName = [first, last].filter(Boolean).join(' ') || company;
    const email = row.email_address.trim().toLowerCase(), aliases = (row.aliases ?? '').trim();
    // Template rows have no native ID. The documented identity is the exact
    // normalized name/email pair unless an exported Clio ID was explicitly added.
    const sourceId = row.id?.trim() || `contact:${sha256(canonicalJson([displayName.toLowerCase(), email]))}`;
    const location = { artifact: name, row: line };
    const fail = (code: string, message: string) => diagnostics.push({ severity: 'error', code, message: `Row ${line}: ${message}`, kind: 'contact', sourceId, location });
    if (!displayName || displayName.length > 300) fail('BAD_NAME', 'a contact name of at most 300 characters is required');
    if ((first || last) && (!first || !last)) fail('INCOMPLETE_PERSON', 'person contacts require both first_name and last_name');
    if (email && (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) fail('BAD_EMAIL', 'email_address must be empty or a valid email address');
    if (aliases.length > 2000) fail('BAD_ALIASES', 'aliases must be at most 2,000 characters');
    if (sourceId.length > 300) fail('BAD_ID', 'id must be at most 300 characters');
    const duplicate = seen.has(sourceId);
    if (duplicate) fail('DUPLICATE_CONTACT', 'this contact identity appears more than once');
    seen.add(sourceId);
    if ((first || last) && company) diagnostics.push({ severity: 'warning', code: 'PERSON_COMPANY', message: `Row ${line}: company is retained in provenance; no company or matter relationship is created`, kind: 'contact', sourceId, location });
    // Duplicate identities are file errors, never two competing Base records.
    // The entire artifact is retained on successful imports, without stripping
    // unknown columns from its individual source payloads.
    if (!duplicate) records.push({ namespace: NAMESPACE, kind: 'contact', sourceId, payload: row, payloadHash: sha256(canonicalJson(row)), artifactHash, location });
    parties.push({ sourceId, name: displayName, email, aliases });
  }
  const blocked = diagnostics.some(diagnostic => diagnostic.severity === 'error');
  const values = new Map(parties.map(party => [party.sourceId, { name: party.name, aliases: party.aliases, email: party.email, source: 'clio' }]));
  const source: SourceBundle = {
    artifacts: [{ name, sha256: artifactHash, size: bytes.length, original: { status: 'available', base64: bytes.toString('base64') } }], records, diagnostics,
  };
  const mapping: ImportMapping = {
    version: MAPPING_VERSION,
    map: record => blocked ? { effects: [], rejection: 'Resolve the CSV errors before importing' } : {
      effects: [{ targetKind: 'party', targetId: `clio:${sha256(record.sourceId)}`, value: values.get(record.sourceId)! }],
    },
  };
  return { source, mapping, parties, summary: {
    contacts: rows.length, ignoredColumns,
    errors: diagnostics.filter(diagnostic => diagnostic.severity === 'error').map(diagnostic => diagnostic.message),
    warnings: diagnostics.filter(diagnostic => diagnostic.severity === 'warning').map(diagnostic => diagnostic.message),
  } };
}
