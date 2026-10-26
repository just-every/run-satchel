import {atomic,audit,date,human,id,insist,integer,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {guard} from './trust-guards';
import {readReportData} from './report-data';
import {invoiceFunds} from './trust-transfers';
import {requireArea} from './role-areas';

// Conservative initial authority: only the principal sees staff costs or firm economics.
function principal(actor:Actor){human(actor);need(actor,'owner');requireArea(actor,'reports','firm');requireArea(actor,'rates','all');requireArea(actor,'bank','full');}
export async function approveStaffCost(db:D1Database,actor:Actor,b:Data){
 principal(actor);insist(b.confirmed===true,'Approve this exact staff cost rate');
 const email=text(b.email,'Staff email',254).toLowerCase(),effectiveFrom=date(b.effectiveFrom),hourlyCents=integer(b.hourlyCents,'Hourly staff cost in USD cents',0,100000000),reason=text(b.reason,'Cost approval reason',2000),costId=id(),at=now();
 const staff="EXISTS(SELECT 1 FROM oa_operators o WHERE o.email=? AND o.status='active' AND (o.role='owner' OR EXISTS(SELECT 1 FROM s_members m WHERE m.email=o.email AND m.active=1 AND m.role<>'client')))";
 insist((await stmt(db,'SELECT '+staff+' ok',email).first<Data>())?.ok,'Choose active staff');
 await atomic(db,actor,[guard(db,staff,email),stmt(db,'INSERT INTO s_staff_cost_rates VALUES(?,?,?,?,?,?,?)',costId,email,effectiveFrom,hourlyCents,reason,actor.email,at),audit(db,actor,'report.staff_cost_approved',costId,JSON.stringify({email,effectiveFrom,hourlyCents,reason}))]);return {id:costId,email,effectiveFrom,hourlyCents,approvedBy:actor.email,approvedAt:at};
}
const sum=(list:Data[],key:string)=>{const total=list.reduce((n,x)=>n+Number(x[key]??0),0);insist(Number.isSafeInteger(total),'Report exceeds the exact integer range',422);return total;};
const ratio=(numerator:number,denominator:number)=>denominator?numerator / denominator:null;
export const economicsFormulas={
 utilization:'Billable recorded time minutes divided by all recorded time minutes; this is recorded-time utilization, not staff capacity.',
 realization:'Live issued time-line USD cents divided by recorded billable value of those same source entries. Void invoices contribute zero; additive correction deltas are included once.',
 collection:'Net cleared operating receipts divided by live invoice totals including tax. Pending payments and trust cash are excluded.',
 effectiveRate:'Live issued time-line USD cents times 60 divided by worked minutes for distinct billed time sources.',
 billed:'Pre-tax total of live issued invoice lines and additive issued correction deltas.',
 unbilled:'Recorded billable value of entries not present on a live issued invoice; draft reservations remain WIP.',
 wip:'Same recorded value as unbilled; no estimate of future fees.',
 profitability:'Earned pre-tax invoice value minus recorded disbursement costs minus approved staff hourly cost times worked minutes divided by 60, rounded half-up per entry. Missing cost approval makes profitability unknown.',
 aging:'Current unpaid live invoice balance grouped by days since frozen delivery due date. Undelivered invoices have unknown due date.',
 asOf:'Current retained state read at the returned UTC timestamp; no historical reconstruction or period accounting is claimed.'
};
export async function economics(db:D1Database,actor:Actor,filters:Data={}){
 principal(actor);insist(filters.asOf===undefined,'Historical as-of reconstruction is not available',422);
 const report=await readReportData(db,actor,filters),costs=await rows(db,'SELECT * FROM s_staff_cost_rates ORDER BY effective_from,approved_at,id'),matterRows:Data[]=[];
 for(const m of report.cohort){
  const entries=await rows(db,'SELECT * FROM s_entries WHERE matter_id=? ORDER BY date,id',m.id),bills=await rows(db,"SELECT b.*,i.number,t.snapshot tax_snapshot FROM s_bills b JOIN s_invoice_issues i ON i.bill_id=b.id LEFT JOIN s_bill_tax_approvals t ON t.bill_id=b.id WHERE b.matter_id=? AND b.status<>'void' ORDER BY i.issued_at,b.id",m.id);
  const invoices:Data[]=[],lines:Data[]=[];
  for(const b of bills){const snapshot=JSON.parse(b.tax_snapshot??b.snapshot),funds=b.corrects_bill_id?null:await invoiceFunds(db,b.id),delivery=await stmt(db,'SELECT due_date FROM s_invoice_deliveries WHERE bill_id=? ORDER BY created_at DESC,id DESC LIMIT 1',b.id).first<Data>();
   const selected=snapshot.lines.map((l:Data)=>({...l,billId:b.id,number:b.number,correction:Boolean(b.corrects_bill_id)}));lines.push(...selected);
   const overdueDays=delivery?Math.floor((Date.parse(report.today+'T12:00:00Z')-Date.parse(delivery.due_date+'T12:00:00Z'))/86400000):null;
   invoices.push({billId:b.id,number:b.number,correctsBillId:b.corrects_bill_id,totalCents:snapshot.totalCents,earnedCents:snapshot.feePlan?Number((await stmt(db,'SELECT earned_cents FROM s_fee_earning_reviews WHERE bill_id=?',b.id).first<Data>())?.earned_cents??0):sum(selected,'amountCents'),paidCents:funds?.paid_cents??0,pendingCents:funds?.reserved_cents??0,dueCents:funds?.due_cents??0,dueDate:delivery?.due_date??null,agingBucket:overdueDays===null?'unknown':overdueDays<=0?'current':overdueDays<=30?'1–30':overdueDays<=60?'31–60':overdueDays<=90?'61–90':'91+'});
  }
  const sourceIds=new Set(lines.filter(l=>!l.correction).map(l=>l.sourceId)),time=entries.filter(e=>e.kind==='time'),billableTime=time.filter(e=>e.billable===1),billedTime=time.filter(e=>sourceIds.has(e.id)),timeLines=lines.filter(l=>l.kind==='time'),unbilled=entries.filter(e=>e.billable===1&&!sourceIds.has(e.id));
  const costBasis=time.map(e=>{const c=costs.filter(c=>c.email===e.created_by&&c.effective_from<=e.date).at(-1);return {sourceId:e.id,timekeeper:e.created_by,minutes:e.minutes,approvalId:c?.id??null,hourlyCents:c?.hourly_cents??null,costCents:c?Number((BigInt(e.minutes)*BigInt(c.hourly_cents)+30n)/60n):null};});
  const billedCents=sum(lines,'amountCents'),earnedCents=sum(invoices,'earnedCents'),paidCents=sum(invoices,'paidCents'),pendingCents=sum(invoices,'pendingCents'),staffCostCents=costBasis.some(c=>c.costCents===null)?null:sum(costBasis,'costCents'),expenseCents=sum(entries.filter(e=>e.kind==='disbursement'),'amount_cents');
  const trustCashCents=Number((await stmt(db,'SELECT COALESCE(SUM(e.cents),0) cents FROM s_trust_entries e JOIN s_trust_ledgers l ON l.id=e.ledger_id WHERE l.matter_id=?',m.id).first<Data>())!.cents);
  matterRows.push({matterId:m.id,matterNumber:m.matter_number,title:m.title,billedCents,earnedCents,paidCents,pendingCents,trustCashCents,unbilledCents:sum(unbilled,'amount_cents'),wipCents:sum(unbilled,'amount_cents'),utilization:ratio(sum(billableTime,'minutes'),sum(time,'minutes')),realization:ratio(sum(timeLines,'amountCents'),sum(billedTime,'amount_cents')),collectionRate:ratio(paidCents,sum(invoices,'totalCents')),effectiveHourlyCents:ratio(sum(timeLines,'amountCents')*60,sum(billedTime,'minutes')),staffCostCents,expenseCents,profitCents:staffCostCents===null?null:earnedCents-staffCostCents-expenseCents,source:{entries:entries.map(e=>({sourceId:e.id,kind:e.kind,minutes:e.minutes,recordedCents:e.amount_cents,billable:e.billable===1,liveIssued:sourceIds.has(e.id)})),lines,invoices,costBasis}});
 }
 return {asOf:report.asOf,timezone:report.timezone,filters:report.filters,formulas:economicsFormulas,matters:matterRows};
}
export async function exportEconomics(db:D1Database,actor:Actor,filters:Data){
 const report=await economics(db,actor,filters);await atomic(db,actor,[audit(db,actor,'report.economics_exported',id(),JSON.stringify({asOf:report.asOf,matterIds:report.matters.map(m=>m.matterId)}))]);
 return new Response(JSON.stringify(report,null,2),{headers:{'content-type':'application/json','content-disposition':'attachment; filename="satchel-economics.json"','cache-control':'private, no-store'}});
}
