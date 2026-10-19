import type {Row} from './common';
// One step per line: key | kind | title | days after approval | detail
// (detail: HH:MM/minutes for an appointment, priority for a task, text for a draft).
export const stepHelp='One step per line: key | task, appointment, document_request or draft_document | title | days after approval | detail (task priority, appointment HH:MM/minutes, or draft text using {{client}}, {{matter}}, {{number}})';
export function parseSteps(text:string):Row[] {
 return text.split('\n').map(l=>l.trim()).filter(Boolean).map(line=>{
  const [key,kind,title,days,...rest]=line.split('|').map(p=>p.trim()),detail=rest.join('|').trim(),step:Row={key,kind,title,offsetDays:Number(days||0)};
  if(kind==='task'&&detail)step.priority=detail;
  if(kind==='appointment'){const [time,minutes]=detail.split('/');step.time=time;step.durationMinutes=Number(minutes);}
  if(kind==='draft_document')step.body=detail;
  return step;
 });
}
export const formatSteps=(steps:Row[])=>steps.map(s=>[s.key,s.kind,s.title,s.offsetDays,s.kind==='task'?s.priority??'':s.kind==='appointment'?`${s.time}/${s.durationMinutes}`:s.kind==='draft_document'?s.body:''].join(' | ').replace(/ \| $/,'')).join('\n');
