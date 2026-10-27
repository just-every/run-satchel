import {getBill,prepareNonhourlyFeeBill,type BillStage} from './billing';
import {atomic,audit,date,human,id,insist,need,now,stmt,text,type Actor,type Data} from './model';
import {approvedSettlement} from './settlements';
import {guard} from './trust-guards';
import {checkCodes,utbmsActivity,utbmsTask} from './utbms-codes';

const liveFeeSql="SELECT id,snapshot FROM s_bills WHERE matter_id=? AND corrects_bill_id IS NULL AND status<>'void' AND json_extract(snapshot,'$.feePlan.kind')='settlement'";

// The statement authorizes allocations, while this explicit counsel action prepares
// only the fee draft. Referral shares are already inside the full counsel fee.
export async function prepareSettlementBill(db:D1Database,actor:Actor,matterId:string,body:Data){
 human(actor);need(actor,'owner','lawyer');
 const {statement:s,guards}=await approvedSettlement(db,actor,matterId,text(body.statementId,'Exact settlement statement',100));
 insist(body.reviewed===true,'Counsel must confirm the exact settlement fee and earning terms',422);
 insist(['permitted','prohibited'].includes(body.trustDraw),'Review settlement fee trust draw-down eligibility',422);
 const period=date(body.date),task=utbmsTask(body.utbmsTask),activity=utbmsActivity(body.utbmsActivity);
 await checkCodes(db,{task,activity,expense:null});
 insist(s.snapshot.feeCents>0,'This settlement has no counsel fee to bill',422);
 const prior=await stmt(db,liveFeeSql,matterId).first<Data>();
 if(prior){
  const p=JSON.parse(prior.snapshot).feePlan;
  insist(p.settlementStatementId===s.id&&p.startDate===period&&p.trustDraw===body.trustDraw&&p.utbmsTask===task&&p.utbmsActivity===activity,'This matter already has a settlement fee bill; review or void that bill before preparing another',409);
  return getBill(db,actor,prior.id);
 }
 const p={id:s.id,matterId,kind:'settlement',title:'Settlement counsel fee',startDate:period,endDate:period,recurrence:'once',earning:'milestone',trustDraw:body.trustDraw,amountCents:s.snapshot.feeCents,includedWork:'Counsel fee for '+s.snapshot.outcome.name+' recovery',exceptions:'none',reference:s.snapshot.terms.reference,earningCondition:s.snapshot.terms.earningEvidence,completedEarningEvidence:s.snapshot.earningEvidence,utbmsTask:task,utbmsActivity:activity,reviewedBy:actor.email,reviewedAt:now(),settlementStatementId:s.id,settlementVersion:s.version,settlementTermsId:s.terms_id,settlementTermsVersion:s.snapshot.termsVersion};
 const stage:BillStage={billId:id(),snapshot:{},writes:[...guards,guard(db,`NOT EXISTS(${liveFeeSql})`,matterId),guard(db,'NOT EXISTS(SELECT 1 FROM s_settlement_erasures WHERE matter_id=?)',matterId)]};
 await prepareNonhourlyFeeBill(db,actor,matterId,p,period,stage);
 stage.writes.push(audit(db,actor,'settlement.fee_prepared',s.id,'',{matterId,statementId:s.id,version:s.version,billId:stage.billId}));
 await atomic(db,actor,stage.writes);
 return getBill(db,actor,stage.billId);
}

// Approval, including additive corrections, must still refer to the exact current
// approved source. Standard fee earning review supplies the earned/trust record.
export async function settlementFeeGuards(db:D1Database,actor:Actor,bill:Data){
 const p=bill.snapshot.feePlan;if(p?.kind!=='settlement')return [];
 const {statement:s,guards}=await approvedSettlement(db,actor,bill.matterId,p.settlementStatementId);
 insist(s.version===p.settlementVersion&&s.terms_id===p.settlementTermsId&&s.snapshot.termsVersion===p.settlementTermsVersion&&s.snapshot.feeCents===p.amountCents,'The settlement fee source changed; review the current exact statement',409);
 const sourceId=s.id+':'+bill.snapshot.feePeriod;
 insist(bill.snapshot.lines.every((l:Data)=>l.kind==='fee'&&l.sourceId===sourceId&&l.sourceRevision===s.id),'The settlement bill must retain its exact fee source',409);
 if(!bill.correctsBillId)insist(bill.snapshot.totalCents===s.snapshot.feeCents,'Bill the full exact counsel fee once, including its referral shares',409);
 return guards;
}
