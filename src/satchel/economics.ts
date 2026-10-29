import {atomic,audit,digest,id,insist,rows,stmt,type Actor,type Data} from './model';
import {accessGuard} from './trust-guards';
import {economicsPrincipal as principal} from './staff-costs';
import {readReportData} from './report-data';
import {invoiceFunds} from './trust-transfers';

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
 const report=await readReportData(db,actor,filters),costs=await rows(db,'SELECT * FROM s_approved_staff_cost_rates ORDER BY effective_from,approved_at,id'),matterRows:Data[]=[];
 for(const m of report.cohort){
  const entries=await rows(db,'SELECT * FROM s_entries WHERE matter_id=? ORDER BY date,id',m.id),bills=await rows(db,"SELECT b.*,i.number,t.snapshot tax_snapshot FROM s_bills b JOIN s_invoice_issues i ON i.bill_id=b.id LEFT JOIN s_bill_tax_approvals t ON t.bill_id=b.id WHERE b.matter_id=? AND b.status<>'void' ORDER BY i.issued_at,b.id",m.id);
  const invoices:Data[]=[],lines:Data[]=[];
  for(const b of bills){const snapshot=JSON.parse(b.tax_snapshot??b.snapshot),funds=b.corrects_bill_id?null:await invoiceFunds(db,b.id),delivery=await stmt(db,'SELECT due_date FROM s_invoice_deliveries WHERE bill_id=? ORDER BY created_at DESC,id DESC LIMIT 1',b.id).first<Data>();
   const selected=snapshot.lines.map((l:Data)=>({...l,billId:b.id,number:b.number,correction:Boolean(b.corrects_bill_id)}));lines.push(...selected);
   const overdueDays=delivery?Math.floor((Date.parse(report.today+'T12:00:00Z')-Date.parse(delivery.due_date+'T12:00:00Z'))/86400000):null;
   invoices.push({billId:b.id,number:b.number,correctsBillId:b.corrects_bill_id,totalCents:snapshot.totalCents,earnedCents:snapshot.feePlan?Number((await stmt(db,'SELECT earned_cents FROM s_fee_earning_reviews WHERE bill_id=?',b.id).first<Data>())?.earned_cents??0):sum(selected,'amountCents'),paidCents:funds?.paid_cents??0,pendingCents:funds?.reserved_cents??0,dueCents:funds?.due_cents??0,dueDate:delivery?.due_date??null,agingBucket:overdueDays===null?'unknown':overdueDays<=0?'current':overdueDays<=30?'1–30':overdueDays<=60?'31–60':overdueDays<=90?'61–90':'91+'});
  }
  const sourceIds=new Set(lines.filter(l=>!l.correction).map(l=>l.sourceId)),time=entries.filter(e=>e.kind==='time'),billableTime=time.filter(e=>e.billable===1),billedTime=time.filter(e=>sourceIds.has(e.id)),timeLines=lines.filter(l=>l.kind==='time'),unbilled=entries.filter(e=>e.billable===1&&!sourceIds.has(e.id));
  const costBasis=time.map(e=>{const c=costs.filter(c=>c.email===(e.timekeeper_email??e.created_by)&&c.effective_from<=e.date).at(-1);return {sourceId:e.id,timekeeper:e.timekeeper_email??e.created_by,minutes:e.minutes,approvalId:c?.id??null,effectiveFrom:c?.effective_from??null,approvedBy:c?.approved_by??null,approvedAt:c?.approved_at??null,createdBy:c?.created_by??null,createdAt:c?.created_at??null,basis:c?.reason??null,hourlyCents:c?.hourly_cents??null,costCents:c?Number((BigInt(e.minutes)*BigInt(c.hourly_cents)+30n)/60n):null};});
  const billedCents=sum(lines,'amountCents'),earnedCents=sum(invoices,'earnedCents'),paidCents=sum(invoices,'paidCents'),pendingCents=sum(invoices,'pendingCents'),staffCostCents=costBasis.some(c=>c.costCents===null)?null:sum(costBasis,'costCents'),expenseCents=sum(entries.filter(e=>e.kind==='disbursement'),'amount_cents');
  const trustCashCents=Number((await stmt(db,'SELECT COALESCE(SUM(e.cents),0) cents FROM s_trust_entries e JOIN s_trust_ledgers l ON l.id=e.ledger_id WHERE l.matter_id=?',m.id).first<Data>())!.cents);
  const metricBasis={utilization:{numerator:sum(billableTime,'minutes'),denominator:sum(time,'minutes')},realization:{numerator:sum(timeLines,'amountCents'),denominator:sum(billedTime,'amount_cents')},collectionRate:{numerator:paidCents,denominator:sum(invoices,'totalCents')},effectiveHourlyCents:{numerator:sum(timeLines,'amountCents')*60,denominator:sum(billedTime,'minutes')}};
  const aging=Object.fromEntries(['current','1–30','31–60','61–90','91+','unknown'].map(bucket=>[bucket,sum(invoices.filter(i=>i.agingBucket===bucket),'dueCents')]));
  matterRows.push({matterId:m.id,matterNumber:m.matter_number,title:m.title,metricBasis,aging,billedCents,earnedCents,paidCents,pendingCents,trustCashCents,unbilledCents:sum(unbilled,'amount_cents'),wipCents:sum(unbilled,'amount_cents'),utilization:ratio(sum(billableTime,'minutes'),sum(time,'minutes')),realization:ratio(sum(timeLines,'amountCents'),sum(billedTime,'amount_cents')),collectionRate:ratio(paidCents,sum(invoices,'totalCents')),effectiveHourlyCents:ratio(sum(timeLines,'amountCents')*60,sum(billedTime,'minutes')),staffCostCents,expenseCents,profitCents:staffCostCents===null?null:earnedCents-staffCostCents-expenseCents,costCoverage:{totalTimeEntries:costBasis.length,approvedTimeEntries:costBasis.filter(c=>c.approvalId!==null).length,missingSourceIds:costBasis.filter(c=>c.approvalId===null).map(c=>c.sourceId),coveredCostCents:sum(costBasis.filter(c=>c.costCents!==null),'costCents'),complete:staffCostCents!==null},source:{entries:entries.map(e=>({sourceId:e.id,revision:e.revision,workDate:e.date,kind:e.kind,minutes:e.minutes,recordedCents:e.amount_cents,billable:e.billable===1,liveIssued:sourceIds.has(e.id)})),lines,invoices,costBasis}});
 }
 const complete=matterRows.every(m=>m.costCoverage.complete),costCoverage={totalTimeEntries:sum(matterRows.map(m=>m.costCoverage),'totalTimeEntries'),approvedTimeEntries:sum(matterRows.map(m=>m.costCoverage),'approvedTimeEntries'),coveredCostCents:sum(matterRows.map(m=>m.costCoverage),'coveredCostCents'),missingSourceIds:matterRows.flatMap(m=>m.costCoverage.missingSourceIds),complete};
 const totals={matterCount:matterRows.length,billedCents:sum(matterRows,'billedCents'),earnedCents:sum(matterRows,'earnedCents'),paidCents:sum(matterRows,'paidCents'),pendingCents:sum(matterRows,'pendingCents'),trustCashCents:sum(matterRows,'trustCashCents'),unbilledCents:sum(matterRows,'unbilledCents'),wipCents:sum(matterRows,'wipCents'),expenseCents:sum(matterRows,'expenseCents'),staffCostCents:complete?sum(matterRows,'staffCostCents'):null,profitCents:complete?sum(matterRows,'profitCents'):null,costCoverage};
 const metricBasis=Object.fromEntries(['utilization','realization','collectionRate','effectiveHourlyCents'].map(metric=>[metric,{numerator:sum(matterRows.map(m=>m.metricBasis[metric]),'numerator'),denominator:sum(matterRows.map(m=>m.metricBasis[metric]),'denominator')}]));
 const ratios=Object.fromEntries(Object.entries(metricBasis).map(([metric,basis])=>[metric,ratio(basis.numerator,basis.denominator)]));
 return {asOf:report.asOf,timezone:report.timezone,filters:report.filters,units:{money:'USD cents',time:'Recorded minutes',effectiveHourlyCents:'USD cents per hour',utilization:'Billable recorded minutes divided by all recorded minutes',realization:'Live billed time cents divided by recorded billed-source cents',collectionRate:'Net cleared operating cents divided by invoice cents including tax',aging:'Unpaid USD cents by firm-local calendar days after the frozen due date'},formulas:economicsFormulas,matters:matterRows,totals:{...totals,...ratios,metricBasis,aging:Object.fromEntries(['current','1–30','31–60','61–90','91+','unknown'].map(bucket=>[bucket,sum(matterRows.map(m=>m.aging),bucket)]))}};
}
export async function exportEconomics(db:D1Database,actor:Actor,filters:Data){
 const report=await economics(db,actor,filters),firm=await stmt(db,'SELECT name FROM s_firm WHERE id=1').first<Data>();
 insist(firm?.name,'Enter firm settings before exporting economics',422);
 const manifest={marking:'CONFIDENTIAL — INTERNAL USE ONLY',firm:{name:firm.name},requestedBy:{id:actor.id,email:actor.email},generatedAt:report.asOf,filters:report.filters,asOfBasis:report.formulas.asOf,payloadSha256:await digest(JSON.stringify(report)),hashBasis:'SHA-256 of UTF-8 JSON.stringify(report), excluding this manifest',missingCostSourceIds:report.matters.flatMap(m=>m.source.costBasis.filter((c:Data)=>c.approvalId===null).map((c:Data)=>c.sourceId))};
 const artifact=JSON.stringify({...report,manifest},null,2),artifactSha256=await digest(artifact);
 await atomic(db,actor,[...report.matters.map(m=>accessGuard(db,actor,m.matterId)),audit(db,actor,'report.economics_exported',id(),JSON.stringify({asOf:report.asOf,matterIds:report.matters.map(m=>m.matterId),artifactSha256,payloadSha256:manifest.payloadSha256,marking:manifest.marking,delivery:'Explicit authenticated download response; receipt by the reader is not asserted'}))]);
 return new Response(artifact,{headers:{'content-type':'application/json','content-disposition':'attachment; filename="satchel-economics.json"','cache-control':'private, no-store','x-content-type-options':'nosniff','x-satchel-sha256':artifactSha256}});
}
