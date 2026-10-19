// Deduct from every trust availability calculation, including earned-fee and
// disbursement requests, so competing public doors share the same reservation.
export function matterReservationSql(ledger='?',exclude="''"){
 return `COALESCE((SELECT SUM(mt.cents) FROM s_trust_matter_transfers mt WHERE mt.from_ledger_id=${ledger} AND mt.id<>${exclude} AND NOT EXISTS(SELECT 1 FROM s_trust_matter_transfer_actions ma WHERE ma.transfer_id=mt.id AND ma.kind IN('posted','cleared','declined','not_executed'))),0)`;
}
