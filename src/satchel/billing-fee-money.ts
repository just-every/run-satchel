import {insist,rows,stmt,type Actor,type Data} from './model';
// Fee charges and their payments stay distinct from earned fees, tax and trust.
export function lateChargeSql(bill='?',cutoff="'9999-12-31'"){
 return `COALESCE((SELECT SUM(d.cents) FROM s_billing_fee_drafts d JOIN s_billing_fee_postings p ON p.draft_id=d.id WHERE d.bill_id=${bill} AND p.effective_date<=${cutoff} AND NOT EXISTS(SELECT 1 FROM s_billing_fee_waivers w WHERE w.draft_id=d.id AND substr(w.at,1,10)<=${cutoff})),0)`;
}
export function latePaidSql(bill='?',cutoff="'9999-12-31'"){
 return `COALESCE((SELECT SUM(a.cents) FROM s_billing_fee_allocations a JOIN s_billing_fee_drafts d ON d.id=a.draft_id WHERE d.bill_id=${bill} AND a.effective_date<=${cutoff} AND NOT EXISTS(SELECT 1 FROM s_billing_receipt_reversals r WHERE r.receipt_id=a.receipt_id AND r.effective_date<=${cutoff})),0)`;
}
export async function feePaymentParts(db:D1Database,billId:string,cents:number,effective:string){
 const charges=await rows(db,`SELECT d.id,p.effective_date,d.cents-COALESCE((SELECT SUM(a.cents) FROM s_billing_fee_allocations a WHERE a.draft_id=d.id AND NOT EXISTS(SELECT 1 FROM s_billing_receipt_reversals r WHERE r.receipt_id=a.receipt_id)),0) due_cents FROM s_billing_fee_drafts d JOIN s_billing_fee_postings p ON p.draft_id=d.id WHERE d.bill_id=? AND NOT EXISTS(SELECT 1 FROM s_billing_fee_waivers w WHERE w.draft_id=d.id) ORDER BY p.effective_date,p.at,d.id`,billId),parts:Data[]=[];let remaining=cents;
 for(const d of charges){const value=Math.min(remaining,Math.max(0,d.due_cents));if(value){insist(effective>=d.effective_date,'A fee payment cannot precede its reviewed charge posting',409);parts.push({draftId:d.id,cents:value});remaining-=value;}if(!remaining)break;}
 insist(!remaining,'Fee balance changed; refresh before allocating',409);return parts;
}
export function feePaymentWrites(db:D1Database,a:Actor,receiptId:string,parts:Data[],day:string,at:string){return parts.map(p=>stmt(db,'INSERT INTO s_billing_fee_allocations VALUES(?,?,?,?,?,?,?)',crypto.randomUUID(),receiptId,p.draftId,p.cents,day,a.email,at));}
