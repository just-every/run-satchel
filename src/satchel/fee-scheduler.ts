import {atomic,audit,id,date,matter,need,rows,stmt,now,type Actor,type Data} from './model';
import {feePlan,periods} from './fee-plans';
import {prepareFeeBill} from './billing';
export async function runDueFees(db:D1Database,actor:Actor,matterId:string,asOf:unknown){
 need(actor,'owner','lawyer');await matter(db,actor,matterId);const day=date(asOf),plans=(await rows(db,'SELECT * FROM s_fee_plans WHERE matter_id=?',matterId)).map(feePlan),bills=[];
 for(const p of plans.filter(p=>!['capped','blended'].includes(p.kind)))for(const period of periods(p,day))bills.push(await prepareFeeBill(db,actor,matterId,p.id,period));
 return {bills};
}
// A scheduled run prepares only drafts. It uses the plan reviewer's current native
// authority and never supplies an earning review, payment, send or trust instruction.
export async function scheduledFees(db:D1Database,at:number){
 const plans=await rows(db,'SELECT DISTINCT p.matter_id,p.created_by FROM s_fee_plans p');
 const timezone=(await stmt(db,'SELECT timezone FROM s_firm WHERE id=1').first<Data>())?.timezone??'UTC';
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
 for(const p of plans){const o=await stmt(db,"SELECT o.*,m.role member_role FROM oa_operators o LEFT JOIN s_members m ON m.email=o.email AND m.active=1 WHERE o.email=? AND o.status='active'",p.created_by).first<Data>();if(!o)continue;const role=o.role==='owner'?'owner':o.member_role;if(!['owner','lawyer'].includes(role))continue;
  const actor:Actor={id:o.id,email:o.email,name:o.display_name,role,channel:'agent'};
  // Each plan's failures are durable and visible; a bad guideline cannot starve other matters.
  try{await runDueFees(db,actor,p.matter_id,day);}catch(error){const errorId=id(),reason=String(error instanceof Error?error.message:error);await atomic(db,actor,[stmt(db,'INSERT INTO s_fee_schedule_errors(id,matter_id,at,reason) VALUES(?,?,?,?)',errorId,p.matter_id,now(),reason),audit(db,actor,'fee.schedule_blocked',errorId,reason,{matterId:p.matter_id})]);}
 }
}
