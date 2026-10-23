import type {Bindings} from '../auth.server';
import {operatorMail} from '../mail.server.mjs';
import {audit,id,rows,stmt,type Data} from './model';
import {isQuiet} from './reminder-time';
import {requireProviderReview} from './providers';
import {manageLink,optOutLink} from './followup-links';
import {stopStatements} from './followups';
const system={id:'scheduled-followups',email:'scheduler',role:'system',channel:'automation'} as any;
const week=7*86400000;
// Contact limit: sends to one lead (all kinds) in the trailing seven days.
const eligible=`EXISTS(SELECT 1 FROM s_followups f JOIN s_leads l ON l.id=f.lead_id WHERE f.id=s_followup_sends.followup_id AND f.status='active' AND l.status='open' AND l.email<>'' AND EXISTS(SELECT 1 FROM s_lead_consents c WHERE c.lead_id=l.id AND c.channel='email' AND c.revoked_at IS NULL))`;
const underLimit=`(SELECT COUNT(*) FROM s_followup_sends x JOIN s_followups g ON g.id=x.followup_id WHERE g.lead_id=(SELECT lead_id FROM s_followups WHERE id=s_followup_sends.followup_id) AND x.status IN('sending','sent','uncertain') AND x.attempted_at>?)<?`;
async function outcome(db:D1Database,d:Data,claim:string,status:string,provider:string,providerId:string|null,detail:string){
 const [done]=await Promise.all([stmt(db,"UPDATE s_followup_sends SET status=?,provider=?,provider_id=?,detail=? WHERE id=? AND claim=? AND status='sending'",status,provider,providerId,detail,d.id,claim).run()]);
 await db.batch([audit(db,system,'followup.send_result',d.id,JSON.stringify({leadId:d.lead_id,kind:d.kind,step:d.step,status,provider,providerId,detail})),
  stmt(db,"UPDATE s_followups SET status='completed',next_action='Sequence finished without a reply: decide the next contact',human_owner=(SELECT assigned_email FROM s_leads WHERE id=lead_id) WHERE id=? AND status='active' AND NOT EXISTS(SELECT 1 FROM s_followup_sends WHERE followup_id=? AND status IN('queued','sending'))",d.followup_id,d.followup_id)]);
 return done;
}
async function message(env:Bindings,d:Data,firm:string){
 const context=JSON.parse(d.context),out=await optOutLink(env,d.followup_id),stop=`\n\nTo stop these messages, open ${out}`;
 if(d.kind==='consultation_reminder'){
  const c=await stmt(env.DB,"SELECT * FROM s_consultations WHERE id=? AND status='booked' AND start_at>?",context.consultationId,new Date().toISOString()).first<Data>();
  if(!c)return null;
  const when=new Intl.DateTimeFormat('en-US',{timeZone:c.prospect_timezone,dateStyle:'full',timeStyle:'short'}).format(new Date(c.start_at));
  return {subject:`Reminder: your consultation with ${firm}`,text:`This is a reminder of your consultation with ${firm}: ${when} (${c.prospect_timezone}).\n\nChange or cancel it: ${await manageLink(env,c.id)}${stop}`};
 }
 return d.kind==='unanswered_inquiry'
  ?{subject:`Following up on your inquiry to ${firm}`,text:`${firm} received your inquiry and has not yet been in touch. Reply to this message if you would still like to talk.${stop}`}
  :{subject:`Your engagement with ${firm}`,text:`${firm} is following up about next steps on your engagement. Reply to this message with any questions.${stop}`};
}
export async function runFollowups(env:Bindings,atMs:number){
 const db=env.DB,at=new Date(atMs).toISOString();
 await db.batch([stmt(db,"UPDATE s_followup_sends SET status='uncertain',detail='The worker stopped before the provider answered; check the provider before contacting again. No automatic resend.' WHERE status='sending' AND attempted_at<?",new Date(atMs-15*60000).toISOString())]);
 const due=await rows(db,"SELECT s.*,f.lead_id,f.kind,f.context,l.email,l.name FROM s_followup_sends s JOIN s_followups f ON f.id=s.followup_id JOIN s_leads l ON l.id=f.lead_id WHERE s.status='queued' AND s.due_at<=? ORDER BY s.due_at,s.step,s.id LIMIT 100",at);
 const settings=new Map((await rows(db,'SELECT * FROM s_followup_settings')).map(s=>[s.kind,s])),firm=(await stmt(db,'SELECT name FROM s_firm WHERE id=1').first<Data>())?.name??'the firm';
 let sent=0;
 for(const d of due){
  const setting=settings.get(d.kind);
  if(!setting?.enabled){await stmt(db,"UPDATE s_followup_sends SET status='cancelled',detail='The sequence is disabled' WHERE id=? AND status='queued'",d.id).run();continue;}
  if(isQuiet(atMs,setting.timezone,setting.quiet_start,setting.quiet_end))continue;
  const claim=id(),claimed=await stmt(db,`UPDATE s_followup_sends SET status='sending',claim=?,attempted_at=? WHERE id=? AND status='queued' AND ${eligible} AND ${underLimit}`,claim,at,d.id,new Date(atMs-week).toISOString(),setting.max_contacts).run();
  if(!claimed.meta.changes){
   const ok=await stmt(db,`SELECT 1 FROM s_followup_sends WHERE id=? AND ${eligible}`,d.id).first();
   if(!ok){const lead={id:d.lead_id};await db.batch([stmt(db,"UPDATE s_followup_sends SET status='cancelled',detail='Consent, lead status or sequence changed' WHERE id=? AND status='queued'",d.id),...stopStatements(db,lead,'consent_or_status_changed','Review the lead: its consent or status changed before the next message',null,system.email,at)]);}
   continue;
  }
  const mail=operatorMail(env),content=await message(env,d,firm);
  if(!content){await outcome(db,d,claim,'failed','none',null,'The consultation was cancelled or has passed; nothing was sent');continue;}
  try{await requireProviderReview(db,'mail');}catch{await outcome(db,d,claim,'failed',env.MAIL_PROVIDER??'unconfigured',null,'The firm has no recorded mail sending authority');continue;}
  if(!mail||!env.MAIL_FROM){await outcome(db,d,claim,'failed',env.MAIL_PROVIDER??'unconfigured',null,'Configure the firm mail provider and sender. No alternative delivery was attempted.');continue;}
  try{
   const result=await mail.send({deliveryId:d.id,from:env.MAIL_FROM,to:[d.email],subject:content.subject,text:content.text,html:'',headers:{}});
   const status=result.status==='accepted'?'sent':result.status==='development'?'sent':result.status==='uncertain'?'uncertain':'failed';
   await outcome(db,d,claim,status,result.provider,result.providerMessageId,result.code??(status==='sent'?'Provider accepted this message; mailbox delivery is unconfirmed.':`Provider result: ${result.status}`));if(status==='sent')sent++;
  }catch{await outcome(db,d,claim,'uncertain',env.MAIL_PROVIDER??'unconfigured',null,'The provider outcome is uncertain. Check the provider before contacting again; no automatic resend.');}
 }
 return {processed:due.length,sent};
}
