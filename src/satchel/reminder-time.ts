import {insist,text} from './model';
export function clock(value:unknown,label:string){const s=text(value,label,5);insist(/^([01]\d|2[0-3]):[0-5]\d$/.test(s),`${label} must use HH:mm`);return s;}
function parts(at:number,zone:string){
 const values=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at));
 const p=Object.fromEntries(values.map(v=>[v.type,v.value]));return {day:`${p.year}-${p.month}-${p.day}`,clock:`${p.hour}:${p.minute}`};
}
// Probe both sides of a timezone transition, then retain exact local matches.
// Ambiguous times use the earlier instant; nonexistent local times are refused.
export function localInstant(day:string,time:string,zone:string,gap='This local reminder time does not exist because of a timezone transition; choose another send time'){
 const target=Date.parse(`${day}T${time}:00Z`),offsets=new Set<number>();
 for(const probe of [target-86400000,target,target+86400000]){const p=parts(probe,zone);offsets.add(Date.parse(`${p.day}T${p.clock}:00Z`)-probe);}
 const matches=[...offsets].map(offset=>target-offset).filter(at=>{const p=parts(at,zone);return p.day===day&&p.clock===time;});
 insist(matches.length,gap);
 return Math.min(...matches);
}
export function reminderDue(day:string,advance:number,time:string,zone:string){const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-advance);return localInstant(d.toISOString().slice(0,10),time,zone);}
export function isQuiet(at:number,zone:string,start:string,end:string){
 if(!start)return false;const t=parts(at,zone).clock;return start<end?t>=start&&t<end:t>=start||t<end;
}
