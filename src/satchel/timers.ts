// TIME-001: server-side timers, so a timer started on one device resumes on another.
// One running timer per person; starting or resuming another pauses it visibly.
import {atomic,audit,human,id,insist,matter,now,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';

// Every staff member who records work keeps their own timers, as for billing entries.
export function timekeeper(actor:Actor) {human(actor);}
export async function firmClock(db:D1Database) {
 const f=await stmt(db,'SELECT timezone,default_rate_cents FROM s_firm WHERE id=1').first<Data>();
 return {timezone:(f?.timezone as string)??'UTC',rateCents:(f?.default_rate_cents as number)??0};
}
export const localDate=(iso:string,timezone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));

// Closing an interval drafts exactly one attributed entry: elapsed time rounded
// up to a whole minute, dated by its start in the firm timezone (UTC before setup).
async function closeInterval(db:D1Database,actor:Actor,timer:Data,reason:string,at:string) {
 const open=await stmt(db,'SELECT * FROM s_timer_intervals WHERE timer_id=? AND ended_at IS NULL',timer.id).first<Data>();
 if(!open)return [];
 const clock=await firmClock(db),elapsed=Math.max(1,Math.ceil((Date.parse(at)-Date.parse(open.started_at))/60000));
 const description=elapsed>1440?`${timer.description} (interval exceeded 24 hours; review)`:timer.description;
 return [stmt(db,'UPDATE s_timer_intervals SET ended_at=?,ended_reason=? WHERE id=? AND ended_at IS NULL',at,reason,open.id),
  stmt(db,"INSERT INTO s_time_drafts(id,owner_email,matter_id,date,minutes,rate_cents,description,billable,source,interval_id,status,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'timer',?,'draft',?,?,?)",id(),actor.email,timer.matter_id,localDate(open.started_at,clock.timezone),Math.min(elapsed,1440),clock.rateCents,description,timer.billable,open.id,id(),at,at)];
}
const running=(db:D1Database,actor:Actor)=>stmt(db,"SELECT t.*,m.matter_number FROM s_timers t JOIN s_matters m ON m.id=t.matter_id WHERE t.owner_email=? AND t.status='running'",actor.email).first<Data>();
async function switchFrom(db:D1Database,actor:Actor,exceptId:string|null,at:string) {
 const current=await running(db,actor);
 if(!current||current.id===exceptId)return {writes:[] as D1PreparedStatement[],paused:null};
 return {writes:[...await closeInterval(db,actor,current,'switched',at),stmt(db,"UPDATE s_timers SET status='paused',revision=?,updated_at=? WHERE id=? AND status='running'",id(),at,current.id)],paused:{id:current.id,matterNumber:current.matter_number,description:current.description}};
}
function openInterval(db:D1Database,actor:Actor,timerId:string,at:string) {
 return stmt(db,'INSERT INTO s_timer_intervals(id,timer_id,owner_email,started_at,started_channel) VALUES(?,?,?,?,?)',id(),timerId,actor.email,at,actor.channel);
}

export async function timers(db:D1Database,actor:Actor) {
 const list=await rows(db,"SELECT t.*,m.matter_number,m.title AS matter_title,(SELECT started_at FROM s_timer_intervals i WHERE i.timer_id=t.id AND i.ended_at IS NULL) AS running_since FROM s_timers t JOIN s_matters m ON m.id=t.matter_id WHERE t.owner_email=? AND t.status<>'stopped' AND (?='owner' OR EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=t.matter_id AND a.email=?)) ORDER BY t.created_at,t.id",actor.email,actor.role,actor.email);
 return list.map(t=>({id:t.id,matterId:t.matter_id,matterNumber:t.matter_number,matterTitle:t.matter_title,description:t.description,billable:!!t.billable,status:t.status,revision:t.revision,runningSince:t.running_since??null}));
}

export async function startTimer(db:D1Database,actor:Actor,body:Data) {
 timekeeper(actor);
 const matterId=text(body.matterId,'Matter',100);await matter(db,actor,matterId);
 const description=text(body.description,'Work description',2000);
 insist(typeof body.billable==='boolean','Say whether the work is billable');
 const at=now(),timerId=id(),{writes,paused}=await switchFrom(db,actor,null,at);
 await atomic(db,actor,[accessGuard(db,actor,matterId),...writes,
  stmt(db,"INSERT INTO s_timers(id,owner_email,matter_id,description,billable,status,revision,created_at,updated_at) VALUES(?,?,?,?,?,'running',?,?,?)",timerId,actor.email,matterId,description,body.billable?1:0,id(),at,at),
  openInterval(db,actor,timerId,at),audit(db,actor,'time.timer_started',timerId,JSON.stringify({matterId,paused}),{matterId})]);
 return {timers:await timers(db,actor),paused};
}

export async function timerAction(db:D1Database,actor:Actor,timerId:string,op:string,body:Data) {
 timekeeper(actor);insist(['pause','resume','stop'].includes(op),'Unknown timer action',404);
 const timer=await stmt(db,'SELECT * FROM s_timers WHERE id=? AND owner_email=?',timerId,actor.email).first<Data>();
 insist(timer,'Timer not found',404);await matter(db,actor,timer.matter_id);
 insist(body.revision===timer.revision,'The timer changed on another device. Refresh before continuing.',409);
 const at=now(),revision=id();let paused=null;
 const writes=[accessGuard(db,actor,timer.matter_id),guard(db,'EXISTS(SELECT 1 FROM s_timers WHERE id=? AND revision=?)',timerId,timer.revision)];
 if(op==='resume') {
  insist(timer.status==='paused','Only a paused timer can be resumed',409);
  const previous=await switchFrom(db,actor,timerId,at);paused=previous.paused;
  writes.push(...previous.writes,stmt(db,"UPDATE s_timers SET status='running',revision=?,updated_at=? WHERE id=?",revision,at,timerId),openInterval(db,actor,timerId,at));
 } else {
  insist(op==='stop'?timer.status!=='stopped':timer.status==='running',op==='stop'?'This timer is already stopped':'Only a running timer can be paused',409);
  writes.push(...await closeInterval(db,actor,timer,op==='stop'?'stopped':'paused',at),stmt(db,'UPDATE s_timers SET status=?,revision=?,updated_at=? WHERE id=?',op==='stop'?'stopped':'paused',revision,at,timerId));
 }
 writes.push(audit(db,actor,`time.timer_${op}`,timerId,JSON.stringify({matterId:timer.matter_id,paused}),{matterId:timer.matter_id}));
 await atomic(db,actor,writes);
 return {timers:await timers(db,actor),paused};
}
