// TIME-001: weekly timesheets of draft entries. A timekeeper edits durations,
// billability and UTBMS codes, rejects drafts, and posts a day or week once.
import {atomic,audit,date,id,insist,integer,matter,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {firmClock,localDate,timekeeper,timers} from './timers';
import {budgetAlerts,loadPricing,price,pricingGuard,type Pricing} from './rates';
import {checkCodes,utbmsActivity,utbmsTask} from './utbms-codes';

const task=utbmsTask,activity=utbmsActivity;
// TIME-003 prices each draft from the fee agreement on its work date, unless the
// timekeeper gave the draft an explicit rate; posting freezes that price on the entry.
const draftPrice=(p:Pricing,d:Data)=>price(p,{matterId:d.matter_id,client:d.client,date:d.date,timekeeper:d.owner_email,task:d.utbms_task,minutes:d.minutes,billable:!!d.billable,rateCents:d.rate_source==='entry'?d.rate_cents:undefined});
function monday(day:string) {const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
function addDays(day:string,n:number) {const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
const draftJson=(p:Pricing,d:Data)=>{const q=d.status==='posted'&&d.entry_minutes!=null?{rateCents:d.entry_rate,billedMinutes:d.entry_billed??d.minutes,amountCents:d.entry_amount,billable:!!d.entry_billable,rateSource:d.entry_source??'entry'}:draftPrice(p,d);return {id:d.id,matterId:d.matter_id,matterNumber:d.matter_number,date:d.date,minutes:d.minutes,billedMinutes:q.billedMinutes,rateCents:q.rateCents,rateSource:q.rateSource,amountCents:q.amountCents,description:d.description,billable:q.billable,utbmsTask:d.utbms_task,utbmsActivity:d.utbms_activity,source:d.source,status:d.status,entryId:d.entry_id,revision:d.revision};};
// Daily totals count every non-rejected draft; USD totals are billable work only.
function totals(list:Data[]) {
 const live=list.filter(d=>d.status!=='rejected'),billable=live.filter(d=>d.billable),posted=live.filter(d=>d.status==='posted');
 return {minutes:live.reduce((n,d)=>n+d.minutes,0),billableMinutes:billable.reduce((n,d)=>n+d.minutes,0),billableCents:billable.reduce((n,d)=>n+d.amountCents,0),postedMinutes:posted.reduce((n,d)=>n+d.minutes,0),postedBillableCents:posted.filter(d=>d.billable).reduce((n,d)=>n+d.amountCents,0)};
}

export async function timesheet(db:D1Database,actor:Actor,week?:string) {
 timekeeper(actor);
 const clock=await firmClock(db),start=monday(week?date(week):localDate(now(),clock.timezone)),end=addDays(start,6);
 const pricing=await loadPricing(db);
 const drafts=(await rows(db,"SELECT d.*,m.matter_number,m.client,e.minutes AS entry_minutes,e.rate_cents AS entry_rate,e.billed_minutes AS entry_billed,e.amount_cents AS entry_amount,e.billable AS entry_billable,e.rate_source AS entry_source FROM s_time_drafts d JOIN s_matters m ON m.id=d.matter_id LEFT JOIN s_entries e ON e.id=d.entry_id WHERE d.owner_email=? AND d.date BETWEEN ? AND ? AND (?='owner' OR EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=d.matter_id AND a.email=?)) ORDER BY d.date,d.created_at,d.id",actor.email,start,end,actor.role,actor.email)).map(d=>draftJson(pricing,d));
 const days=Array.from({length:7},(_,i)=>{const day=addDays(start,i),own=drafts.filter(d=>d.date===day);return {date:day,drafts:own,totals:totals(own)};});
 return {timezone:clock.timezone,defaultRateCents:clock.rateCents,week:{start,end,totals:totals(drafts)},days,timers:await timers(db,actor)};
}

export async function addDraft(db:D1Database,actor:Actor,body:Data) {
 timekeeper(actor);
 const matterId=text(body.matterId,'Matter',100);await matter(db,actor,matterId);
 insist(typeof body.billable==='boolean','Say whether the work is billable');
 const clock=await firmClock(db),draftId=id(),at=now(),day=date(body.date),minutes=integer(body.minutes,'Minutes',1,1440);
 const rate=body.rateCents===undefined?clock.rateCents:integer(body.rateCents,'Hourly rate in USD cents',0,100000000);
 const coding={task:task(body.utbmsTask),activity:activity(body.utbmsActivity),expense:null};await checkCodes(db,coding);
 await atomic(db,actor,[accessGuard(db,actor,matterId),stmt(db,"INSERT INTO s_time_drafts(id,owner_email,matter_id,date,minutes,rate_cents,rate_source,description,billable,utbms_task,utbms_activity,source,status,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'timesheet','draft',?,?,?)",draftId,actor.email,matterId,day,minutes,rate,body.rateCents===undefined?'schedule':'entry',text(body.description,'Work description',2000),body.billable?1:0,coding.task,coding.activity,id(),at,at),audit(db,actor,'time.draft_added',draftId,JSON.stringify({matterId,date:day,minutes}),{matterId})]);
 return timesheet(db,actor,day);
}

export async function reviewDraft(db:D1Database,actor:Actor,draftId:string,body:Data) {
 timekeeper(actor);
 const d=await stmt(db,'SELECT * FROM s_time_drafts WHERE id=? AND owner_email=?',draftId,actor.email).first<Data>();
 insist(d,'Draft not found',404);await matter(db,actor,d.matter_id);
 insist(body.revision===d.revision,'The draft changed on another device. Refresh before editing.',409);
 insist(d.status!=='posted','Posted time is final; record a correction on the bill instead',409);
 const next={status:body.reject===true?'rejected':body.restore===true?'draft':d.status,minutes:body.minutes===undefined?d.minutes:integer(body.minutes,'Minutes',1,1440),description:body.description===undefined?d.description:text(body.description,'Work description',2000),billable:body.billable===undefined?d.billable:(insist(typeof body.billable==='boolean','Say whether the work is billable'),body.billable?1:0),utbms_task:body.utbmsTask===undefined?d.utbms_task:task(body.utbmsTask),utbms_activity:body.utbmsActivity===undefined?d.utbms_activity:activity(body.utbmsActivity)};
 await checkCodes(db,{task:next.utbms_task,activity:next.utbms_activity,expense:null});const at=now();
 await atomic(db,actor,[accessGuard(db,actor,d.matter_id),guard(db,"EXISTS(SELECT 1 FROM s_time_drafts WHERE id=? AND revision=? AND status<>'posted')",draftId,d.revision),
  stmt(db,'UPDATE s_time_drafts SET status=?,minutes=?,description=?,billable=?,utbms_task=?,utbms_activity=?,revision=?,updated_at=? WHERE id=?',next.status,next.minutes,next.description,next.billable,next.utbms_task,next.utbms_activity,id(),at,draftId),
  audit(db,actor,'time.draft_reviewed',draftId,JSON.stringify({previous:{status:d.status,minutes:d.minutes,billable:d.billable,utbmsTask:d.utbms_task,utbmsActivity:d.utbms_activity},next}),{matterId:d.matter_id})]);
 return timesheet(db,actor,d.date);
}

// Posting a day or week turns each remaining draft into one attributed,
// immutable entry. Rejected drafts are excluded; a repeat posts nothing.
export async function postTime(db:D1Database,actor:Actor,body:Data) {
 timekeeper(actor);
 const from=date(body.from),to=date(body.to);insist(from<=to&&to<=addDays(from,6),'Post one day or one week at a time');
 const live=await stmt(db,"SELECT t.description,m.matter_number FROM s_timers t JOIN s_matters m ON m.id=t.matter_id WHERE t.owner_email=? AND t.status='running'",actor.email).first<Data>();
 insist(!live,`Pause or stop your running timer (${live?.matter_number} · ${live?.description}) before posting`,409);
 const drafts=await rows(db,"SELECT d.*,m.client FROM s_time_drafts d JOIN s_matters m ON m.id=d.matter_id WHERE d.owner_email=? AND d.status='draft' AND d.date BETWEEN ? AND ? ORDER BY d.date,d.created_at,d.id",actor.email,from,to);
 const pricing=await loadPricing(db),at=now(),writes:D1PreparedStatement[]=[guard(db,"NOT EXISTS(SELECT 1 FROM s_timers WHERE owner_email=? AND status='running')",actor.email),pricingGuard(db,pricing)],posted:string[]=[],last=new Map<string,string>();
 for(const d of drafts) {
  await matter(db,actor,d.matter_id);
  const entryId=id(),q=draftPrice(pricing,d);posted.push(entryId);last.set(d.matter_id,entryId);
  writes.push(accessGuard(db,actor,d.matter_id),guard(db,"EXISTS(SELECT 1 FROM s_time_drafts WHERE id=? AND revision=? AND status='draft')",d.id,d.revision),
   stmt(db,"INSERT INTO s_entries(id,matter_id,revision,kind,date,description,minutes,rate_cents,amount_cents,created_by,created_at,billable,utbms_task,utbms_activity,billed_minutes,discount_bps,rate_rule_id,rate_source) VALUES(?,?,?,'time',?,?,?,?,?,?,?,?,?,?,?,?,?,?)",entryId,d.matter_id,id(),d.date,d.description,d.minutes,q.rateCents,q.amountCents,actor.email,at,q.billable?1:0,d.utbms_task,d.utbms_activity,q.billedMinutes,q.discountBps,q.ruleId,q.rateSource),
   stmt(db,"UPDATE s_time_drafts SET status='posted',entry_id=?,revision=?,updated_at=? WHERE id=?",entryId,id(),at,d.id),
   audit(db,actor,'billing.entry.recorded',entryId,JSON.stringify({kind:'time',draftId:d.id,source:d.source,billable:q.billable}),{matterId:d.matter_id}));
 }
 for(const [matterId,entryId] of last)writes.push(budgetAlerts(db,matterId,entryId,at));
 if(posted.length)writes.push(audit(db,actor,'time.posted',from,JSON.stringify({from,to,entries:posted})));
 await atomic(db,actor,writes);
 return {posted:posted.length,...await timesheet(db,actor,from)};
}
