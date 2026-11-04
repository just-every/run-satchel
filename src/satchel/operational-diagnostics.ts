import {human,need,now,rows,stmt,type Actor,type Data} from './model';
import {requireWholeFirmWallAccess} from './wall-doors';
import {microsoftState} from './microsoft-connector';
import {providers,reviewOf} from './providers';
import {recoveryState} from './recovery-authority';
import type {MicrosoftBindings} from './microsoft-authority';

const scalar=async(db:D1Database,sql:string)=>(await stmt(db,sql).first<Data>())?.value??0;
// A row is counted from the native queue, not from an inferred provider outcome.
const queues=[
 {id:'microsoft',name:'Microsoft directory reads',sql:"SELECT status,created_at due_at FROM s_microsoft_jobs"},
 {id:'correspondence',name:'Reviewed email',sql:"SELECT CASE status WHEN 'ready' THEN 'queued' ELSE status END status,decision_at due_at FROM s_correspondence_attempts"},
 {id:'client-reminders',name:'Client reminders',sql:"SELECT CASE status WHEN 'prepared' THEN 'queued' ELSE status END status,due_at FROM s_client_reminder_jobs"},
 {id:'matter-updates',name:'Matter updates',sql:"SELECT status,due_at FROM s_matter_update_jobs"},
 {id:'followups',name:'Lead follow-ups',sql:"SELECT status,due_at FROM s_followup_sends"},
 {id:'requests',name:'Request reminders',sql:"SELECT status,due_at FROM s_request_reminder_sends"},
 {id:'deadlines',name:'Deadline reminders',sql:"SELECT status,strftime('%Y-%m-%dT%H:%M:%fZ',scheduled_for/1000.0,'unixepoch') due_at FROM s_reminder_deliveries"},
 {id:'reports',name:'Scheduled reports',sql:"SELECT status,at due_at FROM s_report_deliveries"},
 {id:'payments',name:'Processor collections',sql:"SELECT CASE status WHEN 'creating' THEN 'sending' WHEN 'open' THEN 'queued' ELSE status END status,created_at due_at FROM s_stripe_checkouts"},
 {id:'payment-plans',name:'Unattempted plan installments',sql:"SELECT CASE p.status WHEN 'active' THEN 'queued' ELSE p.status END status,i.due_date||'T00:00:00.000Z' due_at FROM s_payment_plan_installments i JOIN s_payment_plans p ON p.id=i.plan_id AND p.revision=i.revision WHERE NOT EXISTS(SELECT 1 FROM s_payment_plan_attempts a WHERE a.installment_id=i.id)"},
 {id:'webhooks',name:'Integration deliveries',sql:"SELECT d.status,e.at due_at FROM s_webhook_deliveries d JOIN s_integration_events e ON e.id=d.event_id"}
];
export async function operationalDiagnostics(env:MicrosoftBindings&{ORIGINALS:R2Bucket},actor:Actor){
 human(actor);need(actor,'owner');await requireWholeFirmWallAccess(env.DB,actor);
 const db=env.DB,observedAt=now(),microsoft=await microsoftState(env,actor),recovery=await recoveryState(db);
 const jobs=[];
 for(const q of queues){
  const records=await rows(db,q.sql),count=(statuses:string[])=>records.filter(r=>statuses.includes(r.status)).length;
  const due=records.filter(r=>r.status==='queued'&&r.due_at&&r.due_at<=observedAt).map(r=>r.due_at).sort();
  const paused=q.id==='payment-plans'?recovery.some(r=>r.channel==='charging'&&!r.authorized_at):!['microsoft','payments'].includes(q.id)&&recovery.some(r=>r.channel==='sending'&&!r.authorized_at);
  jobs.push({id:q.id,name:q.name,total:records.length,queued:count(['queued']),failed:count(['failed','refused','returned','stopped']),uncertain:count(['uncertain','sending']),paused:count(['paused']),restorePaused:paused,oldestDueAt:due[0]??null,lagSeconds:due.length?Math.max(0,Math.floor((Date.parse(observedAt)-Date.parse(due[0]))/1000)):0,nextAction:paused?'Review restored schedules and fresh provider authority in Recovery settings.':q.id==='microsoft'?'Open Microsoft directory connection; reconcile uncertain reads before requesting another.':'Open the source schedule or attempt; reconcile failures and uncertainty before any new attempt.'});
 }
 let bucketBytes=0,bucketObjects=0,cursor:string|undefined;
 do{const page=await env.ORIGINALS.list({cursor});for(const object of page.objects){bucketBytes+=object.size;bucketObjects++;}cursor=page.truncated?page.cursor:undefined;}while(cursor);
 const documentBytes=await scalar(db,'SELECT COALESCE(SUM(size),0) value FROM s_document_versions WHERE content_base64 IS NOT NULL'),conflictBytes=await scalar(db,'SELECT COALESCE(SUM(size),0) value FROM s_document_conflicts WHERE content_base64 IS NOT NULL');
 const receipts=await rows(db,'SELECT * FROM s_recovery_receipts ORDER BY verified_at DESC,id DESC'),scheduler=await stmt(db,'SELECT * FROM s_scheduler_observation WHERE id=1').first<Data>();
 const periods=await rows(db,`SELECT p.id,p.account_id,p.start_date,p.end_date,COALESCE((SELECT kind FROM s_trust_period_events WHERE period_id=p.id ORDER BY sequence DESC LIMIT 1),'draft') status,(SELECT balanced FROM s_trust_packets WHERE period_id=p.id ORDER BY version DESC LIMIT 1) balanced FROM s_trust_periods p WHERE COALESCE((SELECT kind FROM s_trust_period_events WHERE period_id=p.id ORDER BY sequence DESC LIMIT 1),'draft')<>'signed' OR COALESCE((SELECT balanced FROM s_trust_packets WHERE period_id=p.id ORDER BY version DESC LIMIT 1),0)=0 ORDER BY p.end_date,p.id`);
 const connectors=[];
 for(const provider of providers){const review=await reviewOf(db,provider.id);connectors.push({id:provider.id,name:provider.name,authorization:provider.id==='microsoft'?microsoft.status:'unknown',tokenExpiresAt:provider.id==='microsoft'?microsoft.tokenExpiresAt??microsoft.observedTokenExpiresAt:null,lastSuccessfulReadAt:provider.id==='microsoft'?microsoft.lastSuccessfulReadAt:null,reviewedAt:review?.reviewedAt??null,costCents:null,nextAction:provider.id==='microsoft'?'Review Microsoft directory connection; explicitly reconnect after expiry or revocation.':'Inspect the provider account for current authorization, expiry and charges. A terms review does not verify provider health.'});}
 return {observedAt,connectors,jobs,storage:{documentBytes,conflictBytes,bucketBytes,bucketObjects,measuredOriginalBytes:documentBytes+conflictBytes+bucketBytes,quotaBytes:null,databaseBytes:null,scope:'Retained matter versions and conflict originals plus actual bucket objects. Database metadata and other embedded artifacts are not included.',nextAction:'Check database size, total usage, quota and current costs in the installation’s hosting account.'},backup:{lastVerified:receipts.find(r=>r.kind==='backup')??null,nextAction:'Download and privately retain an archive; test it in an empty installation. A completed export does not prove off-site custody.'},restore:{lastVerified:receipts.find(r=>r.kind==='restore')??null,nextAction:'Inspect the restore receipt, reconcile originals and trust totals, then review Recovery settings.'},recovery,scheduler:{...scheduler,lagSeconds:scheduler?Math.max(0,Math.floor((Date.parse(scheduler.started_at)-Date.parse(scheduler.scheduled_at))/1000)):null,nextAction:scheduler?.outcome==='succeeded'?'Check the next scheduled run and overdue source work.':'Inspect the installation scheduler and its logs; no successful completion is assumed.'},bankFeed:{authorization:'unknown',lastSuccessfulReadAt:null,staleSeconds:null,nextAction:'Inspect the bank provider directly. No live bank-feed observation is available in this installation.'},trust:{unreconciledPeriods:periods,nextAction:'Open each trust statement period; reconcile and sign it, or resolve its recorded correction.'}};
}
