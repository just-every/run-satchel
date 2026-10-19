import {atomic,audit,human,id,insist,integer,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {visibleDeadline} from './deadlines';
import {matterGuard} from './documents';
import {clock,reminderDue} from './reminder-time';
import {deliveryJson,eligible,reminderCandidates,ruleJson} from './reminder-access';
export async function reminderState(db:D1Database,actor:Actor,deadlineId:string){
 await visibleDeadline(db,actor,deadlineId);
 const [rules,deliveries,candidates]=await Promise.all([rows(db,'SELECT * FROM s_reminder_rules WHERE deadline_id=? ORDER BY created_at DESC,id',deadlineId),rows(db,'SELECT d.* FROM s_reminder_deliveries d JOIN s_reminder_rules r ON r.id=d.rule_id WHERE r.deadline_id=? ORDER BY d.scheduled_for,d.stage,d.channel',deadlineId),reminderCandidates(db,deadlineId)]);
 return {rules:rules.map(ruleJson),deliveries:deliveries.map(deliveryJson),candidates};
}
export async function scheduleReminder(db:D1Database,actor:Actor,deadlineId:string,body:Data){
 human(actor);need(actor,'owner','lawyer');const d=await visibleDeadline(db,actor,deadlineId);
 insist(d.status==='confirmed','Only confirmed deadlines can have reminders',409);insist(body.revision===d.revision,'The deadline changed; review it again',409);
 const recipient=text(body.recipient,'Primary lawyer',254).toLowerCase(),backup=text(body.backup,'Backup lawyer',254).toLowerCase(),candidates=await reminderCandidates(db,deadlineId);
 insist(recipient!==backup,'Choose a different backup lawyer');insist([recipient,backup].every(email=>candidates.some(c=>c.email===email)),'Both recipients must be active lawyers with current matter and source access');
 insist(Array.isArray(body.channels)&&body.channels.length>0&&body.channels.length<=2&&new Set(body.channels).size===body.channels.length&&body.channels.every((c:unknown)=>c==='email'||c==='workspace'),'Choose email and/or workspace reminders');
 const advance=integer(body.advanceDays,'Days in advance',0,3650),time=clock(body.sendTime,'Send time'),start=body.quietStart?clock(body.quietStart,'Quiet hours start'):'',end=body.quietEnd?clock(body.quietEnd,'Quiet hours end'):'';
 insist(!!start===!!end&&(!start||start!==end),'Set distinct start and end quiet hours, or leave both empty');
 const hours=integer(body.escalateHours,'Escalation hours',1,8760),due=reminderDue(d.date,advance,time,d.timezone),rule=id(),guard=id();
 await atomic(db,actor,[...matterGuard(db,actor,d.matter_id),stmt(db,`INSERT INTO s_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM s_deadlines t WHERE t.id=? AND t.revision=? AND t.status='confirmed' AND ${eligible('?','t')} AND ${eligible('?','t')}) THEN 1 ELSE 0 END)`,guard,deadlineId,d.revision,recipient,backup),
 stmt(db,"UPDATE s_reminder_deliveries SET status='cancelled',detail='Rule replaced before delivery' WHERE status='queued' AND rule_id IN(SELECT id FROM s_reminder_rules WHERE deadline_id=? AND status='active')",deadlineId),
 stmt(db,"UPDATE s_reminder_rules SET status='superseded',reason='Replaced by reviewed rule' WHERE deadline_id=? AND status='active'",deadlineId),
 stmt(db,"INSERT INTO s_reminder_rules(id,deadline_id,recipient,backup,advance_days,send_time,quiet_start,quiet_end,channels,escalate_hours,due_at,revision,status,created_by,created_email,created_role,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?)",rule,deadlineId,recipient,backup,advance,time,start,end,JSON.stringify(body.channels),hours,due,id(),actor.id,actor.email,actor.role,now()),
 ...body.channels.map((channel:string)=>stmt(db,"INSERT INTO s_reminder_deliveries(id,rule_id,stage,channel,recipient,status,scheduled_for) VALUES(?,?,'reminder',?,?,'queued',?)",id(),rule,channel,recipient,due)),stmt(db,'DELETE FROM s_guard WHERE id=?',guard),audit(db,actor,'deadline.reminder_scheduled',deadlineId,JSON.stringify({rule,recipient,backup,channels:body.channels,due:new Date(due).toISOString()}))]);
 return reminderState(db,actor,deadlineId);
}
async function delivery(db:D1Database,actor:Actor,deliveryId:string){const d=await stmt(db,'SELECT d.*,r.deadline_id FROM s_reminder_deliveries d JOIN s_reminder_rules r ON r.id=d.rule_id WHERE d.id=?',deliveryId).first<Data>();insist(d,'Reminder not found',404);await visibleDeadline(db,actor,d.deadline_id);return d;}
export async function acknowledgeReminder(db:D1Database,actor:Actor,deliveryId:string){
 human(actor);const d=await delivery(db,actor,deliveryId);insist(d.recipient===actor.email,'Only the actual recipient can acknowledge this reminder',403);insist(d.attempted_at&&!['queued','cancelled','sending'].includes(d.status),'This reminder has not reached the recipient',409);
 const guard=id();await atomic(db,actor,[...matterGuard(db,actor,(await visibleDeadline(db,actor,d.deadline_id)).matter_id),stmt(db,'INSERT INTO s_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM s_reminder_deliveries WHERE id=? AND acknowledged_at IS NULL) THEN 1 ELSE 0 END)',guard,d.id),stmt(db,'UPDATE s_reminder_deliveries SET acknowledged_at=?,acknowledged_by=? WHERE id=?',now(),actor.email,d.id),stmt(db,'DELETE FROM s_guard WHERE id=?',guard),audit(db,actor,'deadline.reminder_acknowledged',d.deadline_id,d.id)]);return {ok:true};
}
export async function resolveReminder(db:D1Database,actor:Actor,deliveryId:string,body:Data){
 human(actor);need(actor,'owner','lawyer');const d=await delivery(db,actor,deliveryId);insist(['uncertain','failed'].includes(d.status)&&!d.resolved_at,'Only an unresolved failed or uncertain delivery needs provider evidence',409);insist(['delivered','not_delivered'].includes(body.outcome),'Choose the verified provider outcome');const evidence=text(body.evidence,'Provider evidence',2000),guard=id();
 await atomic(db,actor,[...matterGuard(db,actor,(await visibleDeadline(db,actor,d.deadline_id)).matter_id),stmt(db,"INSERT INTO s_guard VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM s_reminder_deliveries WHERE id=? AND status IN('uncertain','failed') AND resolved_at IS NULL) THEN 1 ELSE 0 END)",guard,d.id),stmt(db,'UPDATE s_reminder_deliveries SET resolved_at=?,resolved_by=?,resolution=?,evidence=? WHERE id=?',now(),actor.email,body.outcome,evidence,d.id),stmt(db,'DELETE FROM s_guard WHERE id=?',guard),audit(db,actor,'deadline.reminder_resolved',d.deadline_id,JSON.stringify({deliveryId,outcome:body.outcome,evidence}))]);return {ok:true};
}
export async function cancelReminder(db:D1Database,actor:Actor,ruleId:string,body:Data){
 human(actor);need(actor,'owner','lawyer');const r=await stmt(db,'SELECT * FROM s_reminder_rules WHERE id=?',ruleId).first<Data>();insist(r,'Reminder rule not found',404);await visibleDeadline(db,actor,r.deadline_id);insist(r.status==='active','This rule is no longer active',409);const reason=text(body.reason,'Cancellation reason',2000);
 await atomic(db,actor,[...matterGuard(db,actor,(await visibleDeadline(db,actor,r.deadline_id)).matter_id),stmt(db,"UPDATE s_reminder_rules SET status='cancelled',reason=? WHERE id=? AND status='active'",reason,ruleId),stmt(db,"UPDATE s_reminder_deliveries SET status='cancelled',detail='Rule cancelled before delivery' WHERE rule_id=? AND status='queued'",ruleId),audit(db,actor,'deadline.reminder_cancelled',r.deadline_id,reason)]);return {ok:true};
}
