import {atomic,audit,human,id,insist,date,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard} from './trust-guards';
import {matterScope} from './matter-scope';
import {listBilling,prepareBill} from './billing';

export async function prebillRun(db:D1Database,actor:Actor,runId:string){
 human(actor);need(actor,'owner','lawyer','billing');
 const run=await stmt(db,'SELECT * FROM s_prebill_runs WHERE id=?',runId).first<Data>();insist(run,'Prebill run not found',404);
 const items=await rows(db,`SELECT i.bill_id FROM s_prebill_run_items i JOIN s_bills b ON b.id=i.bill_id WHERE i.run_id=? AND ${matterScope('b.matter_id',"'person'")} ORDER BY i.position`,runId,actor.role,actor.email);
 insist(items.length,'Prebill run not found',404);
 const bills=await Promise.all(items.map(async item=>{const raw=await stmt(db,'SELECT matter_id FROM s_bills WHERE id=?',item.bill_id).first<Data>();const b=(await listBilling(db,actor,raw!.matter_id)).bills.find(b=>b.id===item.bill_id)!;return {...b,prebill:b.snapshot.prebill,reviews:await rows(db,'SELECT id,before_revision,after_revision,action,note,excluded_sources,actor,at FROM s_prebill_reviews WHERE bill_id=? ORDER BY at,id',b.id)};}));
 return {id:run.id,title:run.title,createdBy:run.created_by,createdAt:run.created_at,bills};
}
export async function prebillRuns(db:D1Database,actor:Actor){
 human(actor);need(actor,'owner','lawyer','billing');
 const runs=await rows(db,`SELECT DISTINCT r.id,r.created_at FROM s_prebill_runs r JOIN s_prebill_run_items i ON i.run_id=r.id JOIN s_bills b ON b.id=i.bill_id WHERE ${matterScope('b.matter_id',"'person'")} ORDER BY r.created_at DESC,r.id`,actor.role,actor.email);
 return {runs:await Promise.all(runs.map(r=>prebillRun(db,actor,r.id)))};
}
export async function preparePrebillRun(db:D1Database,actor:Actor,body:Data){
 human(actor);need(actor,'owner','lawyer','billing');
 insist(Array.isArray(body.items)&&body.items.length>0&&body.items.length<=50,'Select 1–50 matters for a prebill run');
 const runId=id(),at=now(),title=text(body.title,'Run title',200),billDate=date(body.date),writes:D1PreparedStatement[]=[stmt(db,'INSERT INTO s_prebill_runs VALUES(?,?,?,?)',runId,title,actor.email,at)];
 insist(new Set(body.items.map((i:Data)=>i.matterId)).size===body.items.length,'Select each matter only once in a run');
 // All reads and validation finish before one transaction reserves any source.
 for(const [position,item] of body.items.entries()){
  const matterId=text(item.matterId,'Matter',100),m=await matter(db,actor,matterId),periodStart=date(item.periodStart),periodEnd=date(item.periodEnd);
  insist(periodStart<=periodEnd,'Prebill period must end on or after its start');
  const payer=text(item.payer,'Payer',200),arrangement=text(item.arrangement,'Arrangement',100),billId=id();
  const prebill={runId,payer,periodStart,periodEnd,arrangement,reviewState:'ready'};
  const prepared=await prepareBill(db,actor,matterId,{...item,title:item.title??title+' — '+m.matter_number,date:billDate},{writes,snapshot:{prebill},billId});
  insist(prepared.snapshot.lines.every((l:Data)=>l.date>=periodStart&&l.date<=periodEnd),'Every selected source must fall within this prebill period',422);
  const kind=prepared.snapshot.feePlan?.kind??'hourly';
  insist(arrangement===kind,'Select the matter’s current reviewed arrangement: '+kind,422);
  writes.push(accessGuard(db,actor,matterId),stmt(db,'INSERT INTO s_prebill_run_items VALUES(?,?,?)',runId,billId,position));
 }
 writes.push(audit(db,actor,'prebill.run_prepared',runId,title));await atomic(db,actor,writes);
 return prebillRun(db,actor,runId);
}
