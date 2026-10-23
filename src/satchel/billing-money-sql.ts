// SQL fragments accept only program-owned expressions, never request text.
export function offlinePaidSql(bill='?',cutoff="'9999-12-31'",component='cents'){
 return `COALESCE((SELECT SUM(a.${component}) FROM s_billing_allocations a WHERE a.bill_id=${bill} AND a.effective_date<=${cutoff} AND NOT EXISTS(SELECT 1 FROM s_billing_receipt_reversals r WHERE r.receipt_id=a.receipt_id AND r.effective_date<=${cutoff})),0)`;
}
export function writeoffSql(bill='?',cutoff="'9999-12-31'",component='cents'){
 return `COALESCE((SELECT SUM(w.${component}) FROM s_billing_writeoffs w JOIN s_billing_writeoff_decisions d ON d.writeoff_id=w.id WHERE w.bill_id=${bill} AND w.effective_date<=${cutoff}),0)`;
}
