import {insist,rows,stmt,type Data} from './model';

export function economicsCutoff(value:unknown,calculatedAt:string){
 if(value===undefined)return undefined;
 insist(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value,'Use a complete ISO UTC timestamp for historical economics',422);
 insist(value<=calculatedAt,'Historical economics cannot read a future state',422);return value;
}
export async function economicsHistoryAvailability(db:D1Database,matterIds:string[]){
 const ids=JSON.stringify(matterIds),result=await stmt(db,`SELECT (SELECT MIN(first_at) FROM (SELECT MIN(created_at) first_at FROM s_entries WHERE matter_id IN(SELECT value FROM json_each(?)) UNION ALL SELECT MIN(created_at) first_at FROM s_bills WHERE matter_id IN(SELECT value FROM json_each(?)))) first_recorded_at,EXISTS(SELECT 1 FROM s_bills b WHERE b.matter_id IN(SELECT value FROM json_each(?)) AND (json_extract(b.snapshot,'$.imported')=1 OR EXISTS(SELECT 1 FROM s_move_invoice_balances i WHERE i.bill_id=b.id))) migrated`,ids,ids,ids).first<Data>();
 const firstRecordedAt=result?.first_recorded_at??null,reason=result?.migrated?'Historical reconstruction of migrated financial observations is not available':firstRecordedAt?null:'This current cohort has no retained financial timeline';
 return {firstRecordedAt,nativeReconstructionAvailable:reason===null,reason};
}
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
const editable=new Set(['matter_id','description','rate_cents','amount_cents','utbms_task','utbms_activity','utbms_expense','billed_minutes','discount_bps','rate_rule_id','rate_source']);
// A read-only projection of native recorded finance. Authority, matter cohorts,
// ethical walls, erasure and disposal fences remain current, never historical.
export async function historicalEconomicsDatabase(db:D1Database,at:string,matterIds:string[]){
 const ids=JSON.stringify(matterIds),cut="'"+at+"'";
 const availability=await economicsHistoryAvailability(db,matterIds);
 insist(availability.firstRecordedAt&&at>=availability.firstRecordedAt,'No retained financial timeline covers this historical cutoff',422);
 insist(availability.nativeReconstructionAvailable,availability.reason??'Historical reconstruction is not available',422);
 const moved=await stmt(db,`SELECT 1 FROM s_entry_edits edit JOIN s_entries current_work ON current_work.id=edit.entry_id WHERE edit.at>? AND current_work.matter_id NOT IN(SELECT value FROM json_each(?)) AND json_extract(edit.before_json,'$.matter_id') IN(SELECT value FROM json_each(?)) LIMIT 1`,at,ids,ids).first();
 insist(!moved,'Historical economics cannot reconstruct work moved beyond the current permitted cohort',422);
 const unordered=await stmt(db,'SELECT 1 FROM s_entry_edits e JOIN s_entry_edits p ON p.entry_id=e.entry_id AND p.revision=e.previous_revision JOIN s_entries work ON work.id=e.entry_id WHERE work.matter_id IN(SELECT value FROM json_each(?)) AND e.at<p.at LIMIT 1',ids).first();
 insist(!unordered,'The retained entry timeline cannot distinguish this historical boundary',422);
 const ambiguous=await stmt(db,`SELECT 1 FROM s_stripe_checkouts sc JOIN s_bills b ON b.id=sc.bill_id JOIN s_stripe_events e ON e.checkout_id=sc.id WHERE b.matter_id IN(SELECT value FROM json_each(?)) AND sc.updated_at>? AND e.at=(SELECT MAX(last.at) FROM s_stripe_events last WHERE last.checkout_id=sc.id AND last.at<=?) GROUP BY sc.id HAVING COUNT(DISTINCT e.status)>1 LIMIT 1`,ids,at,at).first();
 insist(!ambiguous,'The retained processor timeline cannot distinguish this historical boundary',422);
 const [entryColumns,billColumns,checkoutColumns]=await Promise.all(['s_entries','s_bills','s_stripe_checkouts'].map(table=>rows(db,`PRAGMA table_info(${quote(table)})`)));
 const entrySelect=entryColumns.map(c=>c.name==='revision'?`CASE WHEN future_edit.id IS NULL THEN e.revision ELSE future_edit.previous_revision END AS revision`:editable.has(c.name)?`CASE WHEN future_edit.id IS NULL THEN e.${quote(c.name)} ELSE json_extract(future_edit.before_json,'$.${c.name}') END AS ${quote(c.name)}`:`e.${quote(c.name)}`).join(',');
 const billSelect=billColumns.map(c=>c.name==='status'?`CASE WHEN b.voided_at IS NOT NULL AND b.voided_at<=${cut} THEN 'void' WHEN b.exported_at IS NOT NULL AND b.exported_at<=${cut} THEN 'exported' WHEN b.approved_at IS NOT NULL AND b.approved_at<=${cut} THEN 'approved' ELSE 'draft' END AS status`:`b.${quote(c.name)}`).join(',');
 const checkoutSelect=checkoutColumns.map(c=>c.name==='status'?`CASE WHEN sc.updated_at<=${cut} THEN sc.status ELSE COALESCE((SELECT e.status FROM main.s_stripe_events e WHERE e.checkout_id=sc.id AND e.at<=${cut} ORDER BY e.at DESC LIMIT 1),'creating') END AS status`:`sc.${quote(c.name)}`).join(',');
 const definitions=[
  `s_entries AS (SELECT ${entrySelect} FROM main.s_entries e LEFT JOIN main.s_entry_edits future_edit ON future_edit.entry_id=e.id AND future_edit.at>${cut} AND NOT EXISTS(SELECT 1 FROM main.s_entry_edits preceding WHERE preceding.entry_id=e.id AND preceding.revision=future_edit.previous_revision AND preceding.at>${cut}) WHERE e.created_at<=${cut})`,
  `s_bills AS (SELECT ${billSelect} FROM main.s_bills b WHERE b.created_at<=${cut})`,
  `s_stripe_checkouts AS (SELECT ${checkoutSelect} FROM main.s_stripe_checkouts sc WHERE sc.created_at<=${cut})`,
  ...[['s_invoice_issues','issued_at'],['s_bill_tax_approvals','approved_at'],['s_invoice_deliveries','created_at'],['s_operating_payments','at'],['s_operating_payment_reversals','at'],['s_trust_transfers','created_at'],['s_trust_transfer_actions','at'],['s_trust_entries','at'],['s_stripe_adjustments','at'],['s_fee_earning_reviews','reviewed_at'],['s_offline_actions','at'],['s_offline_receipts','at'],['s_invoice_writeoffs','at'],['s_invoice_writeoff_reversals','at']].map(([table,field])=>`${table} AS (SELECT * FROM main.${table} WHERE ${field}<=${cut})`),
  's_offline_allocations AS (SELECT x.* FROM main.s_offline_allocations x JOIN s_offline_actions a ON a.id=x.action_id)',
  's_offline_releases AS (SELECT x.* FROM main.s_offline_releases x JOIN s_offline_actions a ON a.id=x.action_id)',
  `s_approved_staff_cost_rates AS (SELECT c.*,c.approved_by created_by,c.approved_at created_at FROM main.s_staff_cost_rates c WHERE c.approved_at<=${cut} AND NOT EXISTS(SELECT 1 FROM main.s_staff_cost_disposals d WHERE d.revision_id=c.id) AND NOT EXISTS(SELECT 1 FROM main.s_staff_cost_revisions r JOIN main.s_staff_cost_approvals a ON a.revision_id=r.id WHERE r.supersedes_id=c.id AND a.approved_at<=${cut}) UNION ALL SELECT r.id,r.email,r.effective_from,r.hourly_cents,r.reason,a.approved_by,a.approved_at,r.created_by,r.created_at FROM main.s_staff_cost_revisions r JOIN main.s_staff_cost_approvals a ON a.revision_id=r.id WHERE a.approved_at<=${cut} AND NOT EXISTS(SELECT 1 FROM main.s_staff_cost_disposals d WHERE d.revision_id=r.id) AND NOT EXISTS(SELECT 1 FROM main.s_staff_cost_revisions successor JOIN main.s_staff_cost_approvals approved ON approved.revision_id=successor.id WHERE successor.supersedes_id=r.id AND approved.approved_at<=${cut}))`
 ];
 const prefix='WITH '+definitions.join(',')+' ';
 return new Proxy(db,{get(target,key){
  if(['batch','exec','withSession','dump'].includes(String(key)))return ()=>{insist(false,'Historical economics is read-only',500);};
  if(key==='prepare')return (sql:string)=>{insist(/^\s*SELECT\b/i.test(sql),'Historical economics accepts read queries only',500);return target.prepare(prefix+sql);};
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }}) as D1Database;
}
export const historicalEconomicsBasis='Native recorded financial state at the requested UTC cutoff, within the current permitted matter cohort and firm timezone. Later recorded entries, approvals, issues, receipts, reversals, voids and rebills are excluded. Current erasure fences still apply. Migrated financial observations and ambiguous processor boundaries are refused; this is not a reconstruction of historical access, cohort settings or pre-installation activity.';
