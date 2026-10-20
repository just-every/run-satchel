// TIME-004: all amounts are integer USD cents; terms are human-reviewed originals.
import {atomic,audit,date,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {checkCodes,utbmsTask,utbmsActivity} from './utbms-codes';
export const feePlan=(r:Data)=>({id:r.id,matterId:r.matter_id,...JSON.parse(r.terms),reviewedBy:r.created_by,reviewedAt:r.created_at});
export async function loadFeePlan(db:D1Database,actor:Actor,matterId:string,planId:string){
 await matter(db,actor,matterId);const r=await stmt(db,'SELECT * FROM s_fee_plans WHERE id=? AND matter_id=?',planId,matterId).first<Data>();insist(r,'Fee plan not found',404);return feePlan(r);
}
export async function feePlans(db:D1Database,actor:Actor,matterId:string){
 await matter(db,actor,matterId);return {errors:await rows(db,'SELECT at,reason FROM s_fee_schedule_errors WHERE matter_id=? ORDER BY at DESC,id DESC LIMIT 20',matterId),plans:(await rows(db,'SELECT * FROM s_fee_plans WHERE matter_id=? ORDER BY created_at,id',matterId)).map(feePlan),occurrences:await rows(db,'SELECT o.*,b.status FROM s_fee_occurrences o JOIN s_fee_plans p ON p.id=o.plan_id JOIN s_bills b ON b.id=o.bill_id WHERE p.matter_id=? ORDER BY o.period',matterId)};
}
export async function saveFeePlan(db:D1Database,actor:Actor,matterId:string,b:Data){
 human(actor);need(actor,'owner','lawyer');await matter(db,actor,matterId);
 insist(['flat','retainer','milestone','capped','blended'].includes(b.kind),'Choose a flat, retainer, milestone, capped or blended fee');
 insist(['once','monthly'].includes(b.recurrence),'Choose once or monthly recurrence');
 insist(['on_approval','period_end','milestone'].includes(b.earning),'Unknown earning eligibility: choose reviewed earning terms',422);
 insist(['permitted','prohibited'].includes(b.trustDraw),'Unknown retainer draw-down eligibility: review the trust terms',422);
 insist(b.reviewed===true,'Counsel must confirm the exact fee terms',422);
 const start=date(b.startDate),end=b.endDate?date(b.endDate):start;
 insist(end>=start,'Fee end date precedes its start');
 insist(b.recurrence!=='monthly'||end.slice(0,7)>=start.slice(0,7),'Give the final recurring month');
 insist(!['capped','blended'].includes(b.kind)||b.recurrence==='once','Caps and blended rates apply across this plan, without monthly reset');
 const task=utbmsTask(b.utbmsTask),activity=utbmsActivity(b.utbmsActivity);await checkCodes(db,{task,activity,expense:null});
 const terms={kind:b.kind,title:text(b.title,'Fee plan title',150),startDate:start,endDate:end,recurrence:b.recurrence,earning:b.earning,trustDraw:b.trustDraw,amountCents:integer(b.amountCents,'Fee, cap or hourly blended rate in USD cents',1,100000000000),includedWork:text(b.includedWork,'Included work',2000),exceptions:text(b.exceptions,'Approved exceptions (or none)',2000),reference:text(b.reference,'Reviewed agreement reference',1000),utbmsTask:task,utbmsActivity:activity};
 if(terms.recurrence==='monthly'){insist(start.endsWith('-01'),'Monthly plans start on the first calendar day');periods(terms,end);}
 const existing=(await rows(db,'SELECT * FROM s_fee_plans WHERE matter_id=?',matterId)).map(feePlan);
 if(['capped','blended'].includes(terms.kind)){insist(!existing.some(p=>['capped','blended'].includes(p.kind)&&p.startDate<=end&&p.endDate>=start),'A capped or blended plan already covers these dates',409);}
 const planCount=existing.length;
 const planId=id();await atomic(db,actor,[accessGuard(db,actor,matterId),guard(db,'(SELECT COUNT(*) FROM s_fee_plans WHERE matter_id=?)=?',matterId,planCount),stmt(db,'INSERT INTO s_fee_plans VALUES(?,?,?,?,?)',planId,matterId,JSON.stringify(terms),actor.email,now()),audit(db,actor,'fee.terms_reviewed',planId,JSON.stringify(terms),{matterId})]);return loadFeePlan(db,actor,matterId,planId);
}
export function periods(p:Data,asOf:string){
 if(p.recurrence==='once')return p.startDate<=asOf?[p.startDate]:[];
 const out:string[]=[];let month=p.startDate.slice(0,7);
 while(month<=asOf.slice(0,7)&&month<=p.endDate.slice(0,7)){
  const first=month+'-01';if(first<=asOf)out.push(first);
  const d=new Date(first+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);month=d.toISOString().slice(0,7);
 }
 return out;
}
export function periodEnd(period:string){const d=new Date(period+'T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);return d.toISOString().slice(0,10);}
export async function earningReview(db:D1Database,actor:Actor,bill:Data,body:Data){
 const p=bill.snapshot.feePlan;if(!p)return [];
 insist(body.earnedConfirmed===true,'Unknown earning eligibility: review the fee plan and confirm its earning event',422);
 const evidence=text(body.earningEvidence,'Earning event evidence',2000);
 const timezone=(await stmt(db,'SELECT timezone FROM s_firm WHERE id=1').first<Data>())?.timezone??'UTC';
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 insist(day>=bill.snapshot.feePeriod,'The fee period has not started; this fee is unearned',409);
 if(p.earning==='period_end')insist(day>(p.recurrence==='monthly'?periodEnd(bill.snapshot.feePeriod):p.endDate),'Fee period has not ended; its fees are unearned',409);
 if(p.earning==='milestone')insist(body.milestoneCompleted===true,'Confirm milestone completion with source evidence before earning this fee',422);
 return [stmt(db,'INSERT INTO s_fee_earning_reviews VALUES(?,?,?,?,?,?)',bill.id,bill.snapshot.totalCents,p.trustDraw==='permitted'?1:0,evidence,actor.email,now()),audit(db,actor,'fee.earning_reviewed',bill.id,evidence,{matterId:bill.matterId})];
}
export async function feeAdjustedLines(db:D1Database,actor:Actor,matterId:string,entries:Data[],lines:Data[],body:Data){
 const allPlans=(await rows(db,'SELECT * FROM s_fee_plans WHERE matter_id=?',matterId)).map(feePlan),planGuard=guard(db,'(SELECT COUNT(*) FROM s_fee_plans WHERE matter_id=?)=?',matterId,allPlans.length);
 const count=await stmt(db,'SELECT COUNT(*) n FROM s_bills WHERE matter_id=?',matterId).first<Data>();
 const plans=allPlans.filter(p=>['capped','blended'].includes(p.kind)&&entries.some(e=>e.kind==='time'&&e.date>=p.startDate&&e.date<=p.endDate));
 insist(!plans.length||body.feePlanId,'Review the applicable capped or blended fee plan before billing',422);
 if(!body.feePlanId)return {lines,guards:[planGuard]};
 const p=await loadFeePlan(db,actor,matterId,text(body.feePlanId,'Fee plan'));
 insist(plans.every(x=>x.id===p.id),'Selected work belongs to a different capped or blended plan',422);
 insist(['capped','blended'].includes(p.kind),'Flat, retainer and milestone fees use their due schedule');
 insist(entries.every(e=>e.date>=p.startDate&&e.date<=p.endDate),'Selected work is outside the reviewed fee plan dates',422);
 const exception=body.exceptionReason?text(body.exceptionReason,'Approved exception evidence',2000):null;
 if(exception)insist(p.exceptions.toLowerCase()!=='none','This plan permits no exceptions',422);
 let remaining=p.amountCents;
 if(p.kind==='capped'){
  const used=await stmt(db,"SELECT COALESCE(SUM((SELECT COALESCE(SUM(CAST(json_extract(value,'$.amountCents') AS INTEGER)),0) FROM json_each(json_extract(snapshot,'$.lines')) WHERE json_extract(value,'$.kind')='time')),0) cents FROM s_bills WHERE matter_id=? AND json_extract(snapshot,'$.feePlan.id')=? AND status<>'void'",matterId,p.id).first<Data>();remaining=Math.max(0,p.amountCents-used!.cents);
 }
 const adjusted=lines.map(l=>{if(exception||l.kind!=='time')return l;const amount=p.kind==='blended'?Number((BigInt(l.minutes)*BigInt(p.amountCents)+30n)/60n):Math.min(l.amountCents,remaining);if(p.kind==='capped')remaining-=amount;return {...l,amountCents:amount,rateCents:p.kind==='blended'?p.amountCents:l.rateCents,rounding:p.kind==='blended'?'worked minutes × reviewed blended hourly USD cents / 60; half-up to cents':'reviewed cap across all live drafts and invoices; chronological lines consume remaining cap'};});
 return {lines:adjusted,feePlan:p,feePeriod:p.startDate,exception,guards:[planGuard,guard(db,'(SELECT COUNT(*) FROM s_bills WHERE matter_id=?)=?',matterId,count!.n)]};
}

export async function feeCorrectionGuards(db:D1Database,bill:Data,body:Data,delta:number){
 const p=bill.snapshot.feePlan;if(!p||p.kind!=='capped'||delta<=0)return [];
 const count=await stmt(db,'SELECT COUNT(*) n FROM s_bills WHERE matter_id=?',bill.matterId).first<Data>();
 const totals=await rows(db,"SELECT * FROM s_bills WHERE matter_id=? AND status<>'void'",bill.matterId);
 const used=totals.filter(b=>JSON.parse(b.snapshot).feePlan?.id===p.id).reduce((n,b)=>n+JSON.parse(b.snapshot).lines.filter((l:Data)=>l.kind==='time').reduce((v:number,l:Data)=>v+l.amountCents,0),0);
 insist(used+delta<=p.amountCents,'Correction would exceed the reviewed cap; review a new fee agreement before increasing it',422);
 return [guard(db,'(SELECT COUNT(*) FROM s_bills WHERE matter_id=?)=?',bill.matterId,count!.n)];
}
