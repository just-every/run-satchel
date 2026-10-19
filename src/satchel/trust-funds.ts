import {now} from './model';
import {guard} from './trust-guards';
// A backdated debit reduces every later balance. Check each effective/clearance
// boundary, so later deposits cannot finance an earlier payment or correction.
export function historicalFundsGuard(db:D1Database,ledgerId:string,cents:number,day:string){
 return guard(db,`WITH originals AS (
 SELECT e.id,e.cents,CASE WHEN e.cents<0 THEN e.effective_date ELSE MAX(e.effective_date,COALESCE(e.cleared_date,c.cleared_date)) END active_date
 FROM s_trust_entries e LEFT JOIN s_trust_clearings c ON c.entry_id=e.id
 WHERE e.ledger_id=? AND e.kind<>'journal_reversal' AND (e.cents<0 OR COALESCE(e.cleared_date,c.cleared_date) IS NOT NULL)
 ), events(day,cents) AS (
 SELECT active_date,cents FROM originals
 UNION ALL SELECT MAX(o.active_date,r.effective_date),-o.cents FROM originals o JOIN s_trust_journal_reversals r ON r.original_entry_id=o.id JOIN s_trust_journal_decisions d ON d.reversal_id=r.id AND d.decision='approved'
 UNION ALL SELECT ?,0
 ), daily AS (SELECT day,SUM(cents) delta FROM events GROUP BY day),
 balances AS (SELECT day,SUM(delta) OVER(ORDER BY day ROWS UNBOUNDED PRECEDING) balance FROM daily)
 SELECT MIN(balance)>=? FROM balances WHERE day>=? AND day<=?`,ledgerId,day,cents,day,now().slice(0,10));
}
