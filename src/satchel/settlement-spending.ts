import {approvedSettlement} from './settlement-authority';
import {availabilitySql,guard} from './trust-guards';
import {insist,integer,stmt,type Actor,type Data} from './model';
const liveFeeTransfer=`SELECT 1 FROM s_trust_transfers t JOIN s_bills b ON b.id=t.bill_id WHERE b.matter_id=? AND json_extract(b.snapshot,'$.feePlan.kind')='settlement' AND NOT EXISTS(SELECT 1 FROM s_trust_transfer_actions a WHERE a.transfer_id=t.id AND a.kind IN('declined','not_executed'))`;
const funded=`(${availabilitySql()}) + COALESCE((SELECT SUM(t.cents) FROM s_settlement_disbursements d JOIN s_trust_transactions t ON t.id=d.transaction_id LEFT JOIN s_trust_decisions a ON a.transaction_id=t.id WHERE d.statement_id=? AND t.ledger_id=? AND (a.decision IS NULL OR a.decision='approved')),0)>=?`;
const allocationFree=`NOT EXISTS(SELECT 1 FROM s_settlement_disbursements d JOIN s_trust_transactions t ON t.id=d.transaction_id LEFT JOIN s_trust_decisions a ON a.transaction_id=t.id WHERE d.statement_id=? AND d.allocation_index=? AND t.id<>? AND (a.decision IS NULL OR a.decision='approved'))`;
export async function settlementDisbursementGuards(db:D1Database,a:Actor,ledger:Data|null,body:Data,transactionId:string){
 if(!ledger){insist(!body.settlement,'Settlement spending requires its same-matter ledger',409);return [];}
 const hasSettlement=await stmt(db,'SELECT 1 FROM s_settlement_statements WHERE matter_id=?',ledger.matter_id).first();
 if(!hasSettlement){insist(!body.settlement,'Settlement statement not found',409);return [];}
 insist(body.settlement&&body.direction==='disbursement','Bind disbursement to the exact current settlement allocation',409);
 const {statement:s,guards}=await approvedSettlement(db,a,ledger.matter_id,body.settlement.statementId),index=integer(body.settlement.allocationIndex,'Settlement allocation',0,s.snapshot.allocations.length-1),allocation=s.snapshot.allocations[index];
 insist(allocation.amountCents>0&&body.cents===allocation.amountCents&&body.counterparty===allocation.payee,'Disbursement must match the exact settlement allocation, payee and amount',409);
 const prior=await stmt(db,'SELECT * FROM s_settlement_disbursements WHERE transaction_id=?',transactionId).first<Data>();
 if(prior)insist(prior.statement_id===s.id&&prior.allocation_index===index,'This transaction binds a different settlement allocation',409);
 insist(await stmt(db,`SELECT 1 WHERE ${allocationFree}`,s.id,index,transactionId).first(),'This settlement allocation is already reserved or disbursed',409);
 const funds=[ledger.id,ledger.id,'',ledger.id,'',s.id,ledger.id,s.snapshot.grossCents];
 insist(await stmt(db,`SELECT 1 WHERE ${funded}`,...funds).first(),'Cleared unreserved same-matter funds must cover the remaining gross settlement',409);
 guards.push(guard(db,allocationFree,s.id,index,transactionId),guard(db,funded,...funds));
 if(['counsel','referral'].includes(allocation.kind)){
  insist(!await stmt(db,liveFeeTransfer,ledger.matter_id).first(),'The counsel fee is reserved or applied through its bill; do not disburse it twice',409);
  guards.push(guard(db,`NOT EXISTS(${liveFeeTransfer})`,ledger.matter_id));
 }
 return [...(prior?[]:[stmt(db,'INSERT INTO s_settlement_disbursements VALUES(?,?,?)',transactionId,s.id,index)]),...guards];
}
export async function settlementTransactionGuards(db:D1Database,a:Actor,t:Data,ledger:Data|null){
 const binding=await stmt(db,'SELECT * FROM s_settlement_disbursements WHERE transaction_id=?',t.id).first<Data>();
 return settlementDisbursementGuards(db,a,ledger,{...t,settlement:binding?{statementId:binding.statement_id,allocationIndex:binding.allocation_index}:undefined},t.id);
}
export async function settlementFeeTransferGuards(db:D1Database,a:Actor,bill:Data,ledgerId:string,excludeTransferId=''){
 if(bill.snapshot.feePlan?.kind!=='settlement')return [];
 const m=bill.matterId,ledger=await stmt(db,'SELECT * FROM s_trust_ledgers WHERE id=? AND matter_id=?',ledgerId,m).first<Data>();insist(ledger,'Use the settlement matter ledger',409);
 const sql=`NOT EXISTS(SELECT 1 FROM s_settlement_disbursements d JOIN s_settlement_statements s ON s.id=d.statement_id JOIN s_trust_transactions t ON t.id=d.transaction_id LEFT JOIN s_trust_decisions a ON a.transaction_id=t.id WHERE s.matter_id=? AND json_extract(s.snapshot,'$.allocations['||d.allocation_index||'].kind') IN('counsel','referral') AND (a.decision IS NULL OR a.decision='approved'))`;
 insist(await stmt(db,`SELECT 1 WHERE ${sql}`,m).first(),'Counsel or referral funds are already reserved or disbursed from this settlement',409);
 const coverage=`(${availabilitySql()}) + COALESCE((SELECT SUM(t.cents) FROM s_settlement_disbursements d JOIN s_trust_transactions t ON t.id=d.transaction_id LEFT JOIN s_trust_decisions a ON a.transaction_id=t.id WHERE d.statement_id=? AND t.ledger_id=? AND (a.decision IS NULL OR a.decision='approved')),0) + COALESCE((SELECT SUM(t.cents) FROM s_trust_transfers t JOIN s_bills b ON b.id=t.bill_id WHERE t.ledger_id=? AND json_extract(b.snapshot,'$.feePlan.settlementStatementId')=? AND NOT EXISTS(SELECT 1 FROM s_trust_transfer_actions a WHERE a.transfer_id=t.id AND a.kind IN('declined','not_executed'))),0)>=?`;
 const {statement:s}=await approvedSettlement(db,a,m,bill.snapshot.feePlan.settlementStatementId),values=[ledgerId,ledgerId,'',ledgerId,'',s.id,ledgerId,ledgerId,s.id,s.snapshot.grossCents];
 insist(await stmt(db,`SELECT 1 WHERE ${coverage}`,...values).first(),'Cleared unreserved same-matter funds must cover the remaining gross settlement',409);
 return [guard(db,sql,m),guard(db,coverage,...values)];
}
