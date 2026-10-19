import { date, insist, stmt, text, type Actor, type Data } from './model';
import { guard } from './trust-guards';
import { sourceDocument } from './trust';

// These queries are also used inside the close transaction. Matching every column
// and the collection size catches edits, inserts and removals after a preview.
export function closureSources(matterId: string) {
 const tasks = 'SELECT id FROM s_tasks WHERE matter_id=?', deadlines = 'SELECT id FROM s_deadlines WHERE matter_id=?';
 const ledgers = 'SELECT id FROM s_trust_ledgers WHERE matter_id=?', bills = 'SELECT id FROM s_bills WHERE matter_id=?';
 const transfers = `SELECT id FROM s_trust_transfers WHERE ledger_id IN (${ledgers})`;
 const reversals = `SELECT id FROM s_trust_reversals WHERE transfer_id IN (${transfers})`;
 const entries = `SELECT id FROM s_trust_entries WHERE ledger_id IN (${ledgers})`;
 const journal = `SELECT id FROM s_trust_journal_reversals WHERE original_entry_id IN (${entries})`;
 const queries: Record<string, string> = {
  matter: 'SELECT * FROM s_matters WHERE id=?', access: 'SELECT * FROM s_matter_access WHERE matter_id=?',
  tasks: 'SELECT * FROM s_tasks WHERE matter_id=?', taskEvents: `SELECT * FROM s_task_events WHERE task_id IN (${tasks})`,
  dependencies: `SELECT * FROM s_task_dependencies WHERE task_id IN (${tasks})`,
  deadlines: 'SELECT * FROM s_deadlines WHERE matter_id=?', deadlineEvents: `SELECT * FROM s_deadline_events WHERE deadline_id IN (${deadlines})`,
  deadlineOwners: `SELECT * FROM s_deadline_owners WHERE deadline_id IN (${deadlines})`,
  appointments: 'SELECT * FROM s_appointments WHERE matter_id=?',
  appointmentChanges: 'SELECT * FROM s_appointment_changes WHERE appointment_id IN (SELECT id FROM s_appointments WHERE matter_id=?)',
  appointmentAttendees: 'SELECT * FROM s_appointment_attendees WHERE appointment_id IN (SELECT id FROM s_appointments WHERE matter_id=?)',
  reminderRules: `SELECT * FROM s_reminder_rules WHERE deadline_id IN (${deadlines})`,
  handoffs: 'SELECT * FROM s_handoffs WHERE id IN (SELECT handoff_id FROM s_handoff_items WHERE matter_id=?)',
  handoffItems: 'SELECT * FROM s_handoff_items WHERE matter_id=?',
  entries: 'SELECT * FROM s_entries WHERE matter_id=?', bills: 'SELECT * FROM s_bills WHERE matter_id=?',
  billingSources: 'SELECT * FROM s_billing_sources WHERE entry_id IN (SELECT id FROM s_entries WHERE matter_id=?)',
  ledgers: 'SELECT * FROM s_trust_ledgers WHERE matter_id=?',
  trustEntries: `SELECT * FROM s_trust_entries WHERE ledger_id IN (${ledgers})`,
  openings: `SELECT * FROM s_trust_openings WHERE ledger_id IN (${ledgers})`,
  transactions: `SELECT * FROM s_trust_transactions WHERE ledger_id IN (${ledgers})`,
  transactionDecisions: `SELECT * FROM s_trust_decisions WHERE transaction_id IN (SELECT id FROM s_trust_transactions WHERE ledger_id IN (${ledgers}))`,
  clearings: `SELECT * FROM s_trust_clearings WHERE entry_id IN (${entries})`,
  transfers: `SELECT * FROM s_trust_transfers WHERE ledger_id IN (${ledgers})`,
  transferActions: `SELECT * FROM s_trust_transfer_actions WHERE transfer_id IN (${transfers})`,
  payments: `SELECT * FROM s_operating_payments WHERE bill_id IN (${bills})`,
  paymentReversals: `SELECT * FROM s_operating_payment_reversals WHERE payment_id IN (SELECT id FROM s_operating_payments WHERE bill_id IN (${bills}))`,
  reversals: `SELECT * FROM s_trust_reversals WHERE transfer_id IN (${transfers})`,
  reversalActions: `SELECT * FROM s_trust_reversal_actions WHERE reversal_id IN (${reversals})`,
  journalReversals: `SELECT * FROM s_trust_journal_reversals WHERE original_entry_id IN (${entries})`,
  journalDecisions: `SELECT * FROM s_trust_journal_decisions WHERE reversal_id IN (${journal})`,
  // No original bytes or private document titles are exposed by a closure review.
  documents: 'SELECT id,matter_id,current_version,revision,erased_at,visibility,created_by FROM s_documents WHERE matter_id=?',
  versions: 'SELECT document_id,version,sha256,(content_base64 IS NOT NULL) intact FROM s_document_versions WHERE document_id IN (SELECT id FROM s_documents WHERE matter_id=?)',
 };
 return Object.entries(queries).map(([key, sql]) => ({ key, sql, params: [matterId] }));
}
export async function readClosureSources(db: D1Database, matterId: string) {
 const queries = closureSources(matterId), result = await db.batch<Data>(queries.map(q => stmt(db, q.sql, ...q.params)));
 return Object.fromEntries(queries.map((q, i) => [q.key, result[i].results.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))])) as Record<string, Data[]>;
}
export function closureSourceGuards(db: D1Database, matterId: string, source: Record<string, Data[]>) {
 return closureSources(matterId).map(q => {
  const expected = source[q.key];
  insist(Array.isArray(expected), 'Closure source snapshot is incomplete', 409);
  const columns = expected.length ? Object.keys(expected[0]) : [];
  const matches = columns.map(c => `live."${c}" IS json_extract(expected.value,'$.${c}')`).join(' AND ');
  return guard(db, `(SELECT COUNT(*) FROM (${q.sql}))=?${expected.length ? ` AND (SELECT COUNT(*) FROM (${q.sql}) live WHERE EXISTS(SELECT 1 FROM json_each(?) expected WHERE ${matches}))=?` : ''}`,
   ...q.params, expected.length, ...(expected.length ? [...q.params, JSON.stringify(expected), expected.length] : []));
 });
}

// CLIENT-008 and AGENT-007 must inherit this reviewed promise inventory before
// shipping. Until then counsel records actual promises explicitly, with evidence.
export async function closureDeclarations(db: D1Database, actor: Actor, matterId: string, body: Data) {
 const promises = body.clientPromises ?? [];
 insist(Array.isArray(promises) && promises.length <= 100, 'Record up to 100 client promises');
 const clientPromises = await Promise.all(promises.map(async (p: Data) => {
  insist(p && ['open', 'fulfilled'].includes(p.status), 'Choose open or fulfilled for each promise');
  const source = p.documentId ? await sourceDocument(db, actor, p.documentId, matterId) : null;
  insist(p.status !== 'fulfilled' || source, 'A fulfilled promise needs source evidence');
  return { id: text(p.id, 'Promise identifier', 100), title: text(p.title, 'Promise', 500), dueDate: p.dueDate ? date(p.dueDate) : null, status: p.status, note: p.note ? text(p.note, 'Promise evidence', 2000) : '', source };
 }));
 insist(new Set(clientPromises.map(p => p.id)).size === clientPromises.length, 'Use a distinct identifier for each promise');
 const original = body.originalReturn;
 let originalReturn = null;
 if (original) {
  insist(['returned', 'not_held', 'outstanding'].includes(original.status), 'Choose the original-file return status');
  const source = original.documentId ? await sourceDocument(db, actor, original.documentId, matterId) : null;
  insist(original.status !== 'returned' || source, 'Original-file return confirmation needs source evidence');
  originalReturn = { status: original.status, note: text(original.note, 'Original-file return evidence', 2000), source };
 }
 return { clientPromisesReviewed: body.clientPromisesReviewed === true, clientPromises, originalReturn };
}
export type ClosureCheck = { key: string; kind: string; sourceId: string | null; title: string; state: Data };
export function closureChecks(s: Record<string, Data[]>, declarations: Data) {
 const checks: ClosureCheck[] = [];
 const add = (kind: string, sourceId: string | null, title: string, state: Data) => checks.push({ key: `${kind}:${sourceId ?? 'review'}`, kind, sourceId, title, state });
 for (const t of s.tasks.filter(t => t.status === 'open')) add('task', t.id, t.title, { ...t, due: s.deadlines.find(d => d.id === t.deadline_id)?.date ?? t.due_date });
 for (const d of s.deadlines.filter(d => ['proposed','confirmed'].includes(d.status))) add('deadline', d.id, d.title, d);
 for (const h of s.handoffs.filter(h => !h.acknowledged_at)) add('handoff', h.id, `Handoff awaiting ${h.to_email}`, { ...h, items: s.handoffItems.filter(i => i.handoff_id === h.id) });
 for (const e of s.entries.filter(e => !s.billingSources.some(b => b.entry_id === e.id))) add('unbilled-entry', e.id, e.description, e);
 for (const b of s.bills.filter(b => b.status === 'draft')) add('draft-bill', b.id, JSON.parse(b.snapshot).title, b);
 // Corrections are additive: reconcile the entire approved branch against its
 // original invoice's net payments, preserving credits as obligations as well.
 for (const bill of s.bills.filter(b => !b.corrects_bill_id && ['approved','exported'].includes(b.status))) {
  const branch = [bill];
  for (let i = 0; i < branch.length; i++) branch.push(...s.bills.filter(b => b.corrects_bill_id === branch[i].id && ['approved','exported'].includes(b.status)));
  const earned = branch.reduce((n, b) => n + BigInt(JSON.parse(b.snapshot).totalCents), 0n);
  const paid = s.payments.filter(p => p.bill_id === bill.id).reduce((n, p) => n + BigInt(p.cents) - s.paymentReversals.filter(r => r.payment_id === p.id).reduce((v, r) => v + BigInt(r.cents), 0n), 0n);
  const balance = earned - paid;
  insist([earned, paid, balance].every(value => value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)), 'Bill balance exceeds exact USD cents');
  if (balance !== 0n) add('bill-balance', bill.id, `${JSON.parse(bill.snapshot).title}: ${balance > 0n ? 'unpaid' : 'credit owed'}`, { earnedCents: Number(earned), paidCents: Number(paid), balanceCents: Number(balance), billIds: branch.map(b => b.id) });
 }
 for (const ledger of s.ledgers) {
  const cents = s.trustEntries.filter(e => e.ledger_id === ledger.id).reduce((n, e) => n + BigInt(e.cents), 0n);
  insist(cents <= BigInt(Number.MAX_SAFE_INTEGER) && cents >= BigInt(Number.MIN_SAFE_INTEGER), 'Trust balance exceeds exact USD cents');
  if (cents !== 0n) add('trust-balance', ledger.id, 'Nonzero client trust balance', { ledgerId: ledger.id, balanceCents: Number(cents) });
 }
 const terminal = (actions: Data[], field: string, id: string) => actions.some(a => a[field] === id && ['declined','cleared','not_executed'].includes(a.kind));
 for (const t of s.transactions.filter(t => !s.transactionDecisions.some(d => d.transaction_id === t.id))) add('trust-transaction', t.id, `Pending trust ${t.direction}`, t);
 for (const t of s.transfers.filter(t => !terminal(s.transferActions, 'transfer_id', t.id))) add('trust-transfer', t.id, 'Pending trust application', t);
 for (const r of s.reversals.filter(r => !terminal(s.reversalActions, 'reversal_id', r.id))) add('trust-reversal', r.id, 'Pending trust application reversal', r);
 for (const r of s.journalReversals.filter(r => !s.journalDecisions.some(d => d.reversal_id === r.id))) add('trust-journal-reversal', r.id, 'Pending journal correction', r);
 for (const o of s.openings.filter(o => !s.trustEntries.some(e => e.source_id === o.id))) add('trust-opening', o.id, 'Unapproved trust opening balance', o);
 if (!declarations.clientPromisesReviewed) add('client-promises', null, 'Review all outstanding client promises', {});
 for (const p of declarations.clientPromises) if (p.status === 'open') add('client-promise', p.id, p.title, p);
 if (!declarations.originalReturn || declarations.originalReturn.status === 'outstanding') add('originals', 'return', 'Confirm original-file return', declarations.originalReturn ?? {});
 return checks;
}
