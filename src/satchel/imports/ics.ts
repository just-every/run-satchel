import {insist,type Data} from '../model';

const unescape=(value:string)=>value.replace(/\\[nN]/g,'\n').replace(/\\([,;\\])/g,'$1');
// Clio's separate calendar export is retained verbatim in the package. Mapping
// supplies the matter for each UID; an unsupported recurrence is a rejection,
// never a silently dropped event or an inferred legal deadline.
export function calendarIcs(source:string,matters:Record<string,string>={}){
 insist(source.startsWith('BEGIN:VCALENDAR')&&source.trimEnd().endsWith('END:VCALENDAR'),'Supply a complete calendar ICS export');
 const lines=source.replace(/\r\n/g,'\n').replace(/\n[ \t]/g,'').split('\n'),events:{line:number;lines:string[]}[]=[];
 let event:{line:number;lines:string[]}|null=null;
 for(let index=0;index<lines.length;index++){
  if(lines[index]==='BEGIN:VEVENT'){insist(!event,'Nested calendar events are invalid');event={line:index+1,lines:[]};}
  else if(lines[index]==='END:VEVENT'){insist(event,'Unexpected calendar event end');events.push(event);event=null;}
  else if(event)event.lines.push(lines[index]);
 }
 insist(!event,'Calendar event is incomplete');
 const calendarZone=lines.find(l=>l.startsWith('X-WR-TIMEZONE:'))?.slice(16);
 const rows=events.map(event=>{
  const fields=new Map<string,{params:string;value:string}>();
  for(const line of event.lines){const colon=line.indexOf(':');insist(colon>0,'Calendar property is invalid');const [name,...params]=line.slice(0,colon).split(';');insist(!fields.has(name),'Expand repeated calendar properties to prepared CSV without losing any occurrence');fields.set(name,{params:params.join(';'),value:line.slice(colon+1)});}
  const uid=fields.get('UID')?.value;insist(uid,'Calendar UID is required');
  const start=fields.get('DTSTART'),end=fields.get('DTEND');insist(start&&end,'Calendar events need both DTSTART and DTEND');
  const parse=(v:string)=>{const m=/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(00)(Z)?)?$/.exec(v);insist(m,'Calendar dates must retain minute precision; expand other times to reviewed CSV');return {date:`${m[1]}-${m[2]}-${m[3]}`,time:m[4]?`${m[4]}:${m[5]}`:'00:00',utc:Boolean(m[7]),day:!m[4]};};
  const a=parse(start.value),b=parse(end.value),timezone=a.utc?'UTC':/TZID=([^;]+)/.exec(start.params)?.[1]??calendarZone??(a.day?'UTC':null);
  insist(timezone,'Map the calendar timezone explicitly');
  const duration=(Date.parse(`${b.date}T${b.time}:00Z`)-Date.parse(`${a.date}T${a.time}:00Z`))/60000;
  const rule=fields.get('RRULE')?.value,parts=rule?Object.fromEntries(rule.split(';').map(p=>p.split('='))):{};
  insist(!fields.has('EXDATE')&&!fields.has('RDATE')&&!fields.has('RECURRENCE-ID'),'Expand calendar exceptions to a complete reviewed CSV');
  insist(!rule||Object.keys(parts).every(k=>['FREQ','INTERVAL','COUNT'].includes(k)),'Expand complex recurrence to a complete reviewed CSV');
  insist(!rule||['DAILY','WEEKLY'].includes(parts.FREQ),'Calendar recurrence must be daily or weekly');
  insist(!rule||/^\d+$/.test(parts.COUNT??''),'A calendar recurrence needs its finite occurrence count');
  const value:Data={id:uid,matter_id:matters[uid]??fields.get('X-SATCHEL-MATTER-ID')?.value??'',title:unescape(fields.get('SUMMARY')?.value??''),date:a.date,time:a.time,timezone,duration_minutes:String(duration),frequency:rule?parts.FREQ.toLowerCase():'once',repeat_interval:parts.INTERVAL??'1',occurrences:parts.COUNT??'1',location:unescape(fields.get('LOCATION')?.value??''),source_ics:event.lines.join('\r\n')};
  insist(!(a.day&&duration!==1440),'Expand multi-day calendar events to reviewed daily records');
  return {line:event.line,value:value as Record<string,string>};
 });
 return {headers:['id','matter_id','title','date','time','timezone','duration_minutes'],rows};
}
