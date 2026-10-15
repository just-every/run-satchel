// Adapted from just-every/run-gauge src/gauge/billing-corrections.ts (MIT).
// Copyright (c) 2026 Run Edit Run. See the repository LICENSE for the MIT terms.
import { type Data, insist } from './model';

// Reconstruct current reviewed amounts while preserving every original artifact.
// One live child per package is also enforced by s_bills_correction_branch.
export function correctionReview(bills: Data[], bill: Data) {
 insist(['approved','exported'].includes(bill.status), 'Choose an approved bill', 409);
 insist(!bills.some(b => b.status !== 'void' && b.correctsBillId === bill.id), 'Review the latest correction before correcting this bill', 409);
 const chain: Data[] = [], seen = new Set<string>(), byId = new Map(bills.map(b => [b.id,b]));
 let current: Data | undefined = bill;
 while (current) {
  insist(!seen.has(current.id) && ['approved','exported'].includes(current.status) && current.matterId === bill.matterId, 'Correction history is invalid', 409);
  seen.add(current.id); chain.unshift(current);
  const parent: string | null = current.correctsBillId;
  current = parent ? byId.get(parent) : undefined;
  insist(!parent || current, 'Original bill is unavailable', 409);
 }
 const sources: Data[] = chain[0].snapshot.lines.map((line: Data) => ({...line,currentAmountCents:line.amountCents}));
 for (const step of chain.slice(1)) for (const line of step.snapshot.lines) {
  const source = sources.find(s => s.sourceId === line.sourceId);
  insist(source && Number.isSafeInteger(line.correctedAmountCents) && line.priorAmountCents === source.currentAmountCents, 'Correction source is invalid', 409);
  source.currentAmountCents = line.correctedAmountCents;
 }
 return {billId:bill.id,revision:bill.revision,originalBillId:chain[0].id,sources};
}

export function correctionReviews(bills: Data[]) {
 const parents = new Set(bills.filter(b => b.status !== 'void').map(b => b.correctsBillId));
 return bills.filter(b => ['approved','exported'].includes(b.status) && !parents.has(b.id)).map(b => correctionReview(bills,b));
}
