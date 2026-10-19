import {matterReservationSql} from './trust-matter-transfer-reservations';
import {id,stmt,type Actor} from './model';
export function guard(db:D1Database,sql:string,...values:any[]){return stmt(db,`INSERT INTO s_guard(id,ok) SELECT ?,0 WHERE NOT COALESCE((${sql}),0)`,id(),...values);}
export function accessGuard(db:D1Database,actor:Actor,matterId:string){return guard(db,"EXISTS(SELECT 1 FROM s_matters WHERE id=? AND (?='owner' OR EXISTS(SELECT 1 FROM s_matter_access WHERE matter_id=? AND email=?)))",matterId,actor.role,matterId,actor.email);}
export function availabilitySql(ledger='?',exclude='?'){return `WITH av AS (SELECT ${ledger} ledger_id,${ledger} transaction_ledger_id,${exclude} transaction_exclude,${ledger} earned_ledger_id,${exclude} earned_exclude)
 SELECT COALESCE((SELECT SUM(CASE WHEN EXISTS(SELECT 1 FROM s_trust_journal_reversals r JOIN s_trust_journal_decisions d ON d.reversal_id=r.id AND d.decision='approved' WHERE r.original_entry_id=e.id OR r.id=e.source_id) THEN 0 WHEN e.cents<0 OR e.cleared_date IS NOT NULL OR EXISTS(SELECT 1 FROM s_trust_clearings c WHERE c.entry_id=e.id) THEN e.cents ELSE 0 END) FROM s_trust_entries e WHERE e.ledger_id=av.ledger_id),0)
 -COALESCE((SELECT SUM(t.cents) FROM s_trust_transactions t WHERE t.ledger_id=av.transaction_ledger_id AND t.direction='disbursement' AND t.id<>av.transaction_exclude AND NOT EXISTS(SELECT 1 FROM s_trust_decisions d WHERE d.transaction_id=t.id)),0)
 -COALESCE((SELECT SUM(t.cents) FROM s_trust_transfers t WHERE t.ledger_id=av.earned_ledger_id AND t.id<>av.earned_exclude AND NOT EXISTS(SELECT 1 FROM s_trust_transfer_actions a WHERE a.transfer_id=t.id AND a.kind IN('declined','cleared','not_executed'))),0)
 -${matterReservationSql('av.ledger_id','av.earned_exclude')} FROM av`; }

// Reopened statement periods are the explicit authority for historical corrections.
// Database period locks still refuse writes affecting any other signed cutoff.
export function postingDateGuard(db:D1Database,accountId:string,day:string){return guard(db,`? >= COALESCE((SELECT MAX(effective_date) FROM s_trust_entries WHERE account_id=?),?) OR EXISTS(SELECT 1 FROM s_trust_periods p WHERE p.account_id=? AND ? BETWEEN p.start_date AND p.end_date AND (SELECT kind FROM s_trust_period_events WHERE period_id=p.id ORDER BY sequence DESC LIMIT 1)='reopened')`,day,accountId,day,accountId,day);}
