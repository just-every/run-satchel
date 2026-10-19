import {invoiceFunds} from './trust-transfers';
// Adapted from just-every/run-gauge src/gauge/{billing,time,model}.ts (MIT):
// source reservations, exact rounded minor units, reviewed CSV, additive corrections.
// Copyright (c) 2026 Run Edit Run. See the repository LICENSE for the MIT terms.
import { type Actor, type Data, insist, text, integer, date, id, now, need, human, stmt, rows, matter, audit, atomic, digest } from './model';
import { correctionReview, correctionReviews } from './billing-corrections';
import { budgetAlerts, loadPricing, price, pricingGuard } from './rates';
import { utbmsActivity, utbmsTask } from './timesheets';

const maxMoney = 1_000_000_000_000;
const money = (v: unknown) => integer(v, 'Amount in USD cents', 0, maxMoney);
function guard(db: D1Database, sql: string, ...values: any[]) {
 // A failed predicate aborts the batch; successful checks leave no guard rows.
 return stmt(db, `INSERT INTO s_guard(id,ok) SELECT ?,0 WHERE NOT COALESCE((${sql}),0)`, id(), ...values);
}
function accessGuard(db: D1Database, actor: Actor, matterId: string) {
 return guard(db, `EXISTS(SELECT 1 FROM s_matters m WHERE m.id=? AND (?='owner' OR EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=m.id AND a.email=?)))`, matterId, actor.role, actor.email);
}
function revisionGuard(db: D1Database, bill: Data) {
 return guard(db, 'EXISTS(SELECT 1 FROM s_bills WHERE id=? AND revision=? AND status=?)', bill.id, bill.revision, bill.status);
}
const entryRow = (r: Data) => ({id:r.id,matterId:r.matter_id,revision:r.revision,kind:r.kind,date:r.date,description:r.description,minutes:r.minutes,rateCents:r.rate_cents,amountCents:r.amount_cents,currency:r.currency,createdBy:r.created_by,createdAt:r.created_at,reservedBy:r.bill_id ?? null,billable:r.billable!==0,utbmsTask:r.utbms_task??null,utbmsActivity:r.utbms_activity??null,billedMinutes:r.billed_minutes??null,discountBps:r.discount_bps??null,rateSource:r.rate_source??null,rateRuleId:r.rate_rule_id??null});
const billRow = (r: Data) => ({id:r.id,matterId:r.matter_id,revision:r.revision,status:r.status,snapshot:JSON.parse(r.snapshot),correctsBillId:r.corrects_bill_id,artifact:r.artifact,artifactDigest:r.artifact_digest,approvedBy:r.approved_by,approvedAt:r.approved_at,reviewNote:r.review_note,exportedAt:r.exported_at,voidReason:r.void_reason,voidedBy:r.voided_by,voidedAt:r.voided_at,createdBy:r.created_by,createdAt:r.created_at});
async function getBill(db: D1Database, actor: Actor, billId: string) {
 const bill = await stmt(db, 'SELECT * FROM s_bills WHERE id=?', billId).first<Data>();
 insist(bill, 'Bill not found', 404); await matter(db,actor,bill.matter_id); return billRow(bill);
}
async function matterBills(db: D1Database, matterId: string) {
 return (await rows(db,'SELECT * FROM s_bills WHERE matter_id=? ORDER BY created_at,id',matterId)).map(billRow);
}
function reviewedRevision(bill: Data, body: Data) {
 insist(text(body.revision,'Reviewed revision',100) === bill.revision, 'Bill changed; review the current revision', 409);
}
function sum(lines: Data[]) {
 const total = lines.reduce((n,line) => n + line.amountCents,0);
 insist(Number.isSafeInteger(total), 'Bill total exceeds exact integer range'); return total;
}
// Formula protection applies to strings; numeric credit amounts remain numbers.
const csv = (data: unknown[][]) => data.map(row => row.map(value => {
 let v = String(value ?? ''); if (typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(v)) v = `'${v}`;
 return `"${v.replaceAll('"','""')}"`;
}).join(',')).join('\r\n') + '\r\n';
function artifact(bill: Data) {
 const s = bill.snapshot;
 return csv([
  ['Satchel bill',bill.id,s.title,s.date,s.currency],
  ['Matter',s.matterNumber,s.matterId,s.matterTitle,'Client',s.client],
  ['Corrects bill',s.correctsBillId ?? '', 'Original bill',s.originalBillId ?? bill.id],
  ['Correction reason',s.reason ?? ''],
  ['kind','source id','source revision','date','description','minutes','rate USD cents/hour','amount USD cents','prior USD cents','corrected USD cents','rounding'],
  ...s.lines.map((l: Data) => [l.kind,l.sourceId,l.sourceRevision,l.date,l.description,l.minutes,l.rateCents,l.amountCents,l.priorAmountCents,l.correctedAmountCents,l.rounding]),
  ['TOTAL','','','','','','',s.totalCents],['Approved by',bill.approvedBy,bill.approvedAt,bill.reviewNote],
 ]);
}
async function createBill(db: D1Database, actor: Actor, matterId: string, snapshot: Data, sources: Data[], extra: D1PreparedStatement[] = []) {
 const billId = actor.approval?.resultId ?? id(), revision = id(), at = now();
 await atomic(db,actor,[accessGuard(db,actor,matterId),...extra,
  stmt(db,`INSERT INTO s_bills(id,matter_id,revision,status,snapshot,corrects_bill_id,created_by,created_at) VALUES(?,?,?,'draft',?,?,?,?)`,billId,matterId,revision,JSON.stringify(snapshot),snapshot.correctsBillId ?? null,actor.email,at),
  ...(sources.length ? [
   stmt(db,`INSERT INTO s_billing_sources(entry_id,bill_id,source_revision) SELECT e.id,?,e.revision FROM s_entries e JOIN json_each(?) l ON e.id=json_extract(l.value,'$.sourceId') AND e.revision=json_extract(l.value,'$.sourceRevision') WHERE e.matter_id=?`,billId,JSON.stringify(sources),matterId),
   guard(db,'(SELECT COUNT(*) FROM s_billing_sources WHERE bill_id=?)=?',billId,sources.length),
  ] : []),
  audit(db,actor,snapshot.correctsBillId ? 'bill.correction.prepared' : 'bill.prepared',billId,snapshot.reason ?? snapshot.title),
 ]);
 return getBill(db,actor,billId);
}

export async function addEntry(db: D1Database, actor: Actor, matterId: string, body: Data) {
 insist(['time','disbursement'].includes(body.kind), 'Choose time or disbursement');
 const kind = body.kind, workDate = date(body.date), description = text(body.description,'Description',2000);
 insist(body.billable === undefined || typeof body.billable === 'boolean', 'Say whether the work is billable');
 const requested = body.billable !== false, task = kind === 'time' ? utbmsTask(body.utbmsTask) : null, activity = kind === 'time' ? utbmsActivity(body.utbmsActivity) : null;
 const m = await matter(db,actor,matterId), pricing = await loadPricing(db), entryId = id(), at = now();
 // An explicit hourly rate is recorded exactly as entered (SAT-004); without one,
 // TIME-003's fee agreement resolves the rate, increment, discount and billability.
 const p = kind === 'time' ? price(pricing,{matterId,client:m.client,date:workDate,timekeeper:actor.email,task,minutes:integer(body.minutes,'Minutes',1,1440),billable:requested,rateCents:body.rateCents === undefined ? undefined : integer(body.rateCents,'Hourly rate in USD cents',0,100000000)}) : null;
 const minutes = p ? integer(body.minutes,'Minutes',1,1440) : null, amount = p ? p.amountCents : money(body.amountCents);
 await atomic(db,actor,[accessGuard(db,actor,matterId),pricingGuard(db,pricing),
  stmt(db,'INSERT INTO s_entries(id,matter_id,revision,kind,date,description,minutes,rate_cents,amount_cents,created_by,created_at,billable,utbms_task,utbms_activity,billed_minutes,discount_bps,rate_rule_id,rate_source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',entryId,matterId,id(),kind,workDate,description,minutes,p?.rateCents ?? null,amount,actor.email,at,(p ? p.billable : requested) ? 1 : 0,task,activity,p?.billedMinutes ?? null,p?.discountBps ?? null,p?.ruleId ?? null,p?.rateSource ?? null),
  budgetAlerts(db,matterId,entryId,at),audit(db,actor,'billing.entry.recorded',entryId,kind),
 ]);
 return entryRow((await stmt(db,'SELECT * FROM s_entries WHERE id=?',entryId).first<Data>())!);
}

export async function listBilling(db: D1Database, actor: Actor, matterId: string) {
 await matter(db,actor,matterId);
 const [entries,bills] = await Promise.all([
  rows(db,'SELECT e.*,s.bill_id FROM s_entries e LEFT JOIN s_billing_sources s ON s.entry_id=e.id WHERE e.matter_id=? ORDER BY e.date,e.created_at,e.id',matterId),
  matterBills(db,matterId),
 ]);
 return {entries:entries.map(entryRow),bills:await Promise.all(bills.map(async b=>({...b,trustPayment:await invoiceFunds(db,b.id)}))),correctionReviews:correctionReviews(bills)};
}

export async function prepareBill(db: D1Database, actor: Actor, matterId: string, body: Data) {
 need(actor,'owner','lawyer'); const m = await matter(db,actor,matterId);
 insist(Array.isArray(body.entryIds) && body.entryIds.length > 0 && body.entryIds.length <= 100, 'Select between 1 and 100 entries');
 const ids = body.entryIds.map((v: unknown) => text(v,'Entry ID',100));
 insist(new Set(ids).size === ids.length, 'Select each entry only once');
 const entries = await rows(db,`SELECT e.*,s.bill_id FROM s_entries e LEFT JOIN s_billing_sources s ON s.entry_id=e.id WHERE e.matter_id=? AND e.id IN (SELECT value FROM json_each(?)) ORDER BY e.date,e.id`,matterId,JSON.stringify(ids));
 insist(entries.length === ids.length && entries.every(e => !e.bill_id), 'Entries must belong to this matter and be unbilled',409);
 insist(entries.every(e => e.billable !== 0), 'Nonbillable time is recorded but never billed',409);
 const lines = entries.map(e => ({kind:e.kind,sourceId:e.id,sourceRevision:e.revision,date:e.date,description:e.description,minutes:e.minutes,rateCents:e.rate_cents,amountCents:e.amount_cents,rounding:e.kind !== 'time' ? 'exact USD cents' : e.billed_minutes == null || e.rate_source === 'entry' ? 'minutes × hourly USD cents / 60; half-up to cents' : `${e.billed_minutes} billed minutes (${e.minutes} worked, rounded up to the agreed increment) × hourly USD cents / 60${e.discount_bps ? `, less ${e.discount_bps / 100}% discount` : ''}; half-up to cents`}));
 return createBill(db,actor,matterId,{title:text(body.title,'Bill title',200),date:date(body.date),currency:'USD',matterId,matterNumber:m.matter_number,matterTitle:m.title,client:m.client,lines,totalCents:sum(lines)},lines);
}

export async function approveBill(db: D1Database, actor: Actor, billId: string, body: Data) {
 need(actor,'owner','lawyer'); human(actor);
 const bill = await getBill(db,actor,billId); reviewedRevision(bill,body);
 insist(bill.status === 'draft', 'Only a draft can be approved',409);
 const reviewNote = text(body.reviewNote,'Review note',2000), at = now();
 const approved = {...bill,approvedBy:actor.email,approvedAt:at,reviewNote}, exportedArtifact = artifact(approved);
 const checks = bill.correctsBillId ? [guard(db,"EXISTS(SELECT 1 FROM s_bills WHERE id=? AND status='exported')",bill.correctsBillId)]
  : [guard(db,`NOT EXISTS(SELECT 1 FROM json_each(?) l WHERE NOT EXISTS(SELECT 1 FROM s_billing_sources s JOIN s_entries e ON e.id=s.entry_id WHERE s.entry_id=json_extract(l.value,'$.sourceId') AND s.bill_id=? AND s.source_revision=json_extract(l.value,'$.sourceRevision') AND e.revision=s.source_revision))`,JSON.stringify(bill.snapshot.lines),bill.id)];
 await atomic(db,actor,[accessGuard(db,actor,bill.matterId),revisionGuard(db,bill),...checks,
  stmt(db,"UPDATE s_bills SET status='approved',revision=?,artifact=?,artifact_digest=?,approved_by=?,approved_at=?,review_note=? WHERE id=? AND revision=? AND status='draft'",id(),exportedArtifact,await digest(exportedArtifact),actor.email,at,reviewNote,bill.id,bill.revision),
  audit(db,actor,'bill.approved',bill.id,reviewNote),
 ]);
 return getBill(db,actor,bill.id);
}

export async function exportBill(db: D1Database, actor: Actor, billId: string): Promise<Response> {
 need(actor,'owner','lawyer'); human(actor); const bill = await getBill(db,actor,billId);
 insist(['approved','exported'].includes(bill.status) && bill.approvedBy && bill.artifact, 'A person must approve this bill before export',409);
 insist(await digest(bill.artifact) === bill.artifactDigest, 'Reviewed artifact integrity check failed',409);
 await atomic(db,actor,[accessGuard(db,actor,bill.matterId),revisionGuard(db,bill),
  ...(bill.status === 'approved' ? [stmt(db,"UPDATE s_bills SET status='exported',exported_at=?,revision=? WHERE id=? AND revision=? AND status='approved'",now(),id(),bill.id,bill.revision)] : []),
  audit(db,actor,'bill.exported',bill.id,bill.artifactDigest),
 ]);
 return new Response(bill.artifact,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="satchel-bill-${bill.id}.csv"`,'Cache-Control':'private, no-store'}});
}

export async function voidBill(db: D1Database, actor: Actor, billId: string, body: Data) {
 need(actor,'owner','lawyer'); human(actor);
 const bill = await getBill(db,actor,billId); reviewedRevision(bill,body);
 insist(['draft','approved'].includes(bill.status), 'Exported bills require an additive correction; only unexported bills can be voided',409);
 const reason = text(body.reason,'Void reason',2000);
 await atomic(db,actor,[accessGuard(db,actor,bill.matterId),revisionGuard(db,bill),
  guard(db,"NOT EXISTS(SELECT 1 FROM s_operating_payments p WHERE p.bill_id=? AND p.cents>COALESCE((SELECT SUM(r.cents) FROM s_operating_payment_reversals r WHERE r.payment_id=p.id),0)) AND NOT EXISTS(SELECT 1 FROM s_trust_transfers t WHERE t.bill_id=? AND NOT EXISTS(SELECT 1 FROM s_trust_transfer_actions a WHERE a.transfer_id=t.id AND a.kind IN('declined','not_executed','cleared')))",bill.id,bill.id),
  stmt(db,"UPDATE s_bills SET status='void',revision=?,void_reason=?,voided_by=?,voided_at=? WHERE id=? AND revision=? AND status IN ('draft','approved')",id(),reason,actor.email,now(),bill.id,bill.revision),
  stmt(db,'DELETE FROM s_billing_sources WHERE bill_id=?',bill.id),audit(db,actor,'bill.voided',bill.id,reason),
 ]);
 return getBill(db,actor,bill.id);
}

export async function correctBill(db: D1Database, actor: Actor, billId: string, body: Data) {
 need(actor,'owner','lawyer'); const bill = await getBill(db,actor,billId); reviewedRevision(bill,body);
 insist(bill.status === 'exported', 'Export the approved bill before preparing its correction',409);
 const review = correctionReview(await matterBills(db,bill.matterId),bill), sourceId = text(body.sourceId,'Source entry ID',100);
 const source = review.sources.find(s => s.sourceId === sourceId);
 insist(source, 'Choose an original source entry from this correction branch');
 const corrected = money(body.correctedAmountCents), prior = source.currentAmountCents, reason = text(body.reason,'Correction reason',2000);
 insist(corrected !== prior, 'Correction must change the reviewed amount');
 const {currentAmountCents:_,...line} = source;
 const lines = [{...line,description:reason,amountCents:corrected-prior,priorAmountCents:prior,correctedAmountCents:corrected}];
 return createBill(db,actor,bill.matterId,{title:body.title == null ? `Correction: ${bill.snapshot.title}`.slice(0,200) : text(body.title,'Bill title',200),date:date(body.date),currency:'USD',matterId:bill.matterId,matterNumber:bill.snapshot.matterNumber,matterTitle:bill.snapshot.matterTitle,client:bill.snapshot.client,correctsBillId:bill.id,originalBillId:review.originalBillId,reason,lines,totalCents:sum(lines)},[],[
  revisionGuard(db,bill),guard(db,"NOT EXISTS(SELECT 1 FROM s_bills WHERE corrects_bill_id=? AND status<>'void')",bill.id),
 ]);
}
