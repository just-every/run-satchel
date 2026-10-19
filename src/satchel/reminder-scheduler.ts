import type {Bindings} from '../auth.server';
import {operatorMail} from '../mail.server.mjs';
import {id,now,rows,stmt,type Data} from './model';
import {eligible} from './reminder-access';
import {isQuiet} from './reminder-time';
const live=`r.status='active' AND t.status='confirmed' AND EXISTS(SELECT 1 FROM oa_operators so WHERE so.id=r.created_by AND so.status='active' AND (so.role='owner' OR EXISTS(SELECT 1 FROM s_members sm JOIN s_matter_access sa ON sa.email=sm.email WHERE sm.email=so.email AND sm.active=1 AND sm.role='lawyer' AND sa.matter_id=t.matter_id)))`;
async function outcome(db:D1Database,d:Data,claim:string,status:string,provider:string,providerId:string|null,detail:string){
 await db.batch([stmt(db,"UPDATE s_reminder_deliveries SET status=?,provider=?,provider_id=?,detail=? WHERE id=? AND claim=? AND status='sending'",status,provider,providerId,detail,d.id,claim),stmt(db,"INSERT INTO s_audit(id,actor,action,object_id,detail,at) SELECT ?,'scheduler',?,id,?,? FROM s_reminder_deliveries WHERE id=? AND claim=?",id(),'deadline.reminder_result',JSON.stringify({recipient:d.recipient,status,provider,providerId,detail}),now(),d.id,claim)]);
}
export async function runReminders(env:Bindings,at=Date.now()){
 const db=env.DB;
 // A claimed send interrupted by a Worker restart is uncertain, never retried.
 await stmt(db,"UPDATE s_reminder_deliveries SET status='uncertain',detail='Worker stopped before recording the provider outcome. Reconcile before any new send.' WHERE status='sending' AND claimed_at<=?",at-600000).run();
 await stmt(db,`UPDATE s_reminder_deliveries SET status='cancelled',detail='Deadline or scheduling authority is no longer active' WHERE status='queued' AND NOT EXISTS(SELECT 1 FROM s_reminder_rules r JOIN s_deadlines t ON t.id=r.deadline_id WHERE r.id=rule_id AND ${live})`).run();
 const rules=await rows(db,`SELECT r.*,t.timezone FROM s_reminder_rules r JOIN s_deadlines t ON t.id=r.deadline_id WHERE ${live} AND r.due_at<=?`,at);
 for(const rule of rules){
  if(isQuiet(at,rule.timezone,rule.quiet_start,rule.quiet_end))continue;
  const primary=await rows(db,"SELECT * FROM s_reminder_deliveries WHERE rule_id=? AND stage='reminder'",rule.id);
  // Escalation waits for the actual primary attempt (quiet hours may defer it).
  const attempted=primary.filter(p=>p.attempted_at).map(p=>Date.parse(p.attempted_at));
  const base=attempted.length?Math.max(...attempted):rule.due_at;
  if(at>=base+rule.escalate_hours*3600000&&!primary.some(p=>p.acknowledged_at)){
   await db.batch((JSON.parse(rule.channels) as string[]).map(channel=>stmt(db,`INSERT OR IGNORE INTO s_reminder_deliveries(id,rule_id,stage,channel,recipient,status,scheduled_for) SELECT ?,r.id,'escalation',?,r.backup,'queued',? FROM s_reminder_rules r JOIN s_deadlines t ON t.id=r.deadline_id WHERE r.id=? AND ${live} AND NOT EXISTS(SELECT 1 FROM s_reminder_deliveries p WHERE p.rule_id=r.id AND p.stage='reminder' AND p.acknowledged_at IS NOT NULL)`,id(),channel,base+rule.escalate_hours*3600000,rule.id)));
  }
 }
 const pending=await rows(db,`SELECT d.*,r.quiet_start,r.quiet_end,t.timezone FROM s_reminder_deliveries d JOIN s_reminder_rules r ON r.id=d.rule_id JOIN s_deadlines t ON t.id=r.deadline_id WHERE d.status='queued' AND d.scheduled_for<=? AND ${live} ORDER BY d.scheduled_for,d.stage,d.id LIMIT 100`,at);
 for(const d of pending){
  if(isQuiet(at,d.timezone,d.quiet_start,d.quiet_end))continue;
  const claim=id(),attempted=new Date(at).toISOString();
  const result=await stmt(db,`UPDATE s_reminder_deliveries SET status='sending',claim=?,claimed_at=?,attempted_at=? WHERE id=? AND status='queued' AND EXISTS(SELECT 1 FROM s_reminder_rules r JOIN s_deadlines t ON t.id=r.deadline_id WHERE r.id=rule_id AND ${live} AND ${eligible('s_reminder_deliveries.recipient','t')} AND (s_reminder_deliveries.stage='reminder' OR NOT EXISTS(SELECT 1 FROM s_reminder_deliveries p WHERE p.rule_id=r.id AND p.stage='reminder' AND p.acknowledged_at IS NOT NULL)))`,claim,at,attempted,d.id).run();
  if(!result.meta.changes){await stmt(db,"UPDATE s_reminder_deliveries SET status='cancelled',detail='Recipient access changed, rule replaced, or primary acknowledged before sending' WHERE id=? AND status='queued'",d.id).run();continue;}
  if(d.channel==='workspace'){await outcome(db,d,claim,'available','workspace',d.id,'Reminder available to this recipient in the authenticated workspace; acknowledgment is separate.');continue;}
  const sender=operatorMail(env);
  if(!sender||!env.MAIL_FROM){await outcome(db,d,claim,'failed',env.MAIL_PROVIDER??'unconfigured',null,'Configure the firm mail provider and sender. No alternative delivery was attempted.');continue;}
  try{
   const result=await sender.send({deliveryId:d.id,from:env.MAIL_FROM,to:[d.recipient],subject:d.stage==='escalation'?'Satchel deadline escalation':'Satchel deadline reminder',text:`A ${d.stage==='escalation'?'backup escalation':'deadline reminder'} needs your attention. Open your authenticated Satchel workspace: ${env.AUTH_ORIGIN}/app . Acknowledgment does not complete the underlying deadline.`,html:'',headers:{}});
   const status=result.status==='accepted'?'accepted':result.status==='development'?'development':result.status==='uncertain'?'uncertain':'failed';
   await outcome(db,d,claim,status,result.provider,result.providerMessageId,result.code??(status==='accepted'?'Provider accepted this message; mailbox delivery is unconfirmed.':`Provider result: ${result.status}`));
  }catch{await outcome(db,d,claim,'uncertain',env.MAIL_PROVIDER??'unconfigured',null,'The provider outcome is uncertain. Check the provider before resolving; no automatic resend.');}
 }
 return {processed:pending.length};
}
