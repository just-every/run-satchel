// INTAKE-002 read models: the pipeline, each person's due queue and the conversion report.
import {rows,type Actor,type Data} from './model';
import {duplicateOf,leadCalendar,leadJson,leadStages,staff,visibleLeadSql} from './leads';

async function visible(db:D1Database,actor:Actor) {
 staff(actor);
 return rows(db,`SELECT * FROM s_leads l WHERE ${visibleLeadSql} ORDER BY l.created_at,l.id`,actor.role,actor.role,actor.email);
}
// The pipeline lists open leads by stage with duplicates flagged. The due queue holds the
// person's own open leads whose next action falls on or before the firm-local today.
export async function leadPipeline(db:D1Database,actor:Actor) {
 const [all,stages,{today,timezone}]=await Promise.all([visible(db,actor),leadStages(db),leadCalendar(db)]);
 const open=all.filter(l=>l.status==='open');
 const leads=open.map(l=>({...leadJson(l,stages,today,timezone),duplicates:open.map(o=>({id:o.id,name:o.name,reason:duplicateOf(l,o)})).filter(o=>o.reason)}));
 return {today,stages,leads,closed:all.filter(l=>l.status!=='open').map(l=>leadJson(l,stages,today,timezone)),
  dueQueue:leads.filter(l=>l.assignedEmail===actor.email&&l.nextActionDate&&l.nextActionDate<=today).sort((a,b)=>a.nextActionDate!.localeCompare(b.nextActionDate!))};
}
// Merged duplicates are excluded from every count. Conversion is converted ÷ counted
// leads; stalled leads are open leads with an overdue next action or no
// activity for 14 days; lost leads carry their recorded reasons.
export async function leadReport(db:D1Database,actor:Actor) {
 const [all,stages,{today,timezone}]=await Promise.all([visible(db,actor),leadStages(db),leadCalendar(db)]);
 const allowed=new Set((await rows(db,"SELECT m.id FROM s_matters m WHERE ?='owner' OR EXISTS(SELECT 1 FROM s_matter_access a WHERE a.matter_id=m.id AND a.email=?)",actor.role,actor.email)).map(m=>m.id));
 const counted=all.filter(l=>l.status!=='merged'&&(!l.matter_id||allowed.has(l.matter_id))).map(l=>leadJson(l,stages,today,timezone));
 const group=(key:(l:Data)=>string)=>[...new Set(counted.map(key))].sort().map(name=>{const g=counted.filter(l=>key(l)===name);return {name,leads:g.length,open:g.filter(l=>l.status==='open').length,converted:g.filter(l=>l.status==='converted').length,lost:g.filter(l=>l.status==='lost').length};});
 return {today,total:counted.length,converted:counted.filter(l=>l.status==='converted').length,lost:counted.filter(l=>l.status==='lost').length,
  bySource:group(l=>l.referralSource),byStage:group(l=>l.stageName??'No stage'),byPractice:group(l=>l.practiceCode??'No practice'),
  stalled:counted.filter(l=>l.stalled.length).map(l=>({id:l.id,name:l.name,assignedEmail:l.assignedEmail,reasons:l.stalled})),
  lostReasons:counted.filter(l=>l.status==='lost').map(l=>({id:l.id,name:l.name,reason:l.lostReason}))};
}
