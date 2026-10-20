// REPORT-001: dashboards and drills project exactly the same permitted source rows.
import {type Actor,type Data} from './model';
import {readReportData} from './report-data';
import {outcomeLabels} from './matter-outcomes';
import {stageDurations} from './report-stage-clock';
export const reportTitles:Record<string,string>={status:'Case status',stages:'Stage duration',outcomes:'Legal outcomes',conversion:'Lead conversion',evidence:'Evidence gaps',deadlines:'Deadlines',workload:'Workload'};
const outcomes:Record<string,string>=outcomeLabels;
const same=(filter:string|undefined,value:unknown)=>!filter||(filter==='__none__'?!value:filter===value);
export async function reportState(db:D1Database,actor:Actor,input:Data={}){
 const {filters,asOf,timezone,today,cohort,allowed,leads,practices,people,stages,transitions,lifecycle,legalOutcomes,documents,tasks,deadlines,permitted,inDates,localDay}=await readReportData(db,actor,input);
 const base=(m:Data)=>({matterId:m.id,matterNumber:m.matter_number,title:m.title,ownerEmail:m.lawyer_email??null,practiceCode:m.practice_code||null});
 const status=cohort.map(m=>({...base(m),id:m.id,status:m.lifecycle_status,date:localDay(m.opened_at),detail:'Matter opened',value:1}));
 const stageRows:Data[]=cohort.flatMap<Data>(m=>{const intervals=stageDurations(m,transitions.filter(t=>t.matter_id===m.id),lifecycle.filter(e=>e.matter_id===m.id),asOf);return intervals.length?intervals.map(s=>({...base(m),id:m.id+':'+s.stageId,status:m.lifecycle_status,date:s.date,detail:s.name,durationMs:s.durationMs,value:Math.round(s.durationMs/864000)/100})):[{...base(m),id:m.id+':unrecorded',status:m.lifecycle_status,date:localDay(m.opened_at),detail:m.stage_id?'Stage duration not recorded':'No stage assigned',durationMs:null,value:null}];});
 const outcomeRows=cohort.filter(m=>m.lifecycle_status==='closed').map(m=>{const close=lifecycle.find(e=>e.matter_id===m.id&&e.revision===m.lifecycle_revision),o=legalOutcomes.find(o=>o.event_id===close?.id);return {...base(m),id:m.id,status:o?.outcome??'not_recorded',date:o?localDay(o.at):null,detail:o?outcomes[o.outcome]:'Outcome not recorded',value:1};});
 // Unknown practice remains explicit in conversion denominators, even with a named practice filter.
 const countedLeads=leads.filter(l=>(!l.matter_id||permitted.has(l.matter_id))&&(!filters.practice||same(filters.practice,l.practice_code)||!l.practice_code)&&same(filters.owner,l.assigned_email)&&inDates(l.created_at));
 const conversion=countedLeads.map(l=>({id:l.id,leadId:l.id,matterId:l.matter_id??null,matterNumber:allowed.find(m=>m.id===l.matter_id)?.matter_number??null,title:l.name,ownerEmail:l.assigned_email,practiceCode:l.practice_code??null,status:l.status,date:localDay(l.created_at),detail:l.practice_code?'Received lead':'No practice',value:1}));
 const evidence=cohort.flatMap(m=>{const stage=stages.find(s=>s.id===m.stage_id),required:string[]=stage?JSON.parse(stage.required_types):[];return required.filter(type=>!documents.some(d=>d.matter_id===m.id&&d.document_type===type)).map(type=>({...base(m),id:m.id+':'+type,status:'missing',date:null,detail:type,value:1}));});
 const deadlineRows=deadlines.map(t=>{const m=cohort.find(m=>m.id===t.matter_id)!;return {...base(m),id:t.id,title:t.title,ownerEmail:t.owner_email??m.lawyer_email??null,status:t.status,date:t.date,detail:t.date<today?'Overdue':'Upcoming',value:1};});
 const work=tasks.map(t=>{const m=cohort.find(m=>m.id===t.matter_id)!,superseded=t.deadline_id&&t.deadline_status==='superseded',due=t.deadline_id?(superseded?null:t.deadline_date):t.due_date;return {...base(m),id:t.id,title:t.title,ownerEmail:t.owner_email??null,status:'open',date:due,detail:superseded?'Task · linked date superseded':`Task · ${due&&due<today?'Overdue':'Open'}`,value:1};}).concat(deadlineRows.map(r=>({...r,detail:'Deadline · '+r.detail})));
 const dashboard=(id:string,unit:string,list:Data[],total?:number)=>({id,title:reportTitles[id],unit,rows:list,count:list.length,...(total===undefined?{}:{total})});
 const visibleLeads=leads.filter(l=>!l.matter_id||permitted.has(l.matter_id));
 const ownerEmails=new Set([...allowed.map(m=>m.lawyer_email),...visibleLeads.map(l=>l.assigned_email)].filter(Boolean));
 return {asOf,timezone,today,filters,cohortCount:cohort.length,options:{practices,owners:[...ownerEmails].sort().map(email=>({email,name:people.find(p=>p.email===email)?.name??email}))},dashboards:[dashboard('status','matters',status),dashboard('stages','days',stageRows,Math.round(stageRows.reduce((n,s)=>n+(s.durationMs??0),0)/864000)/100),dashboard('outcomes','matters',outcomeRows),dashboard('conversion','leads',conversion,conversion.filter(l=>l.status==='converted').length),dashboard('evidence','missing types',evidence),dashboard('deadlines','deadlines',deadlineRows),dashboard('workload','work items',work)]};
}
