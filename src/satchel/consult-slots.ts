import {localInstant} from './reminder-time';
import {insist} from './model';
// INTAKE-003: bookable starts from a lawyer's approved weekly windows. Windows and the grid are in the offer's own
// IANA timezone (so daylight saving moves the UTC instant); buffers pad each booking and a start is offered only
// when its padded interval is free, so back-to-back grid points can never both be booked.
export type Window={day:number;start:string;end:string};
export type Busy={start:number;end:number};
const minutes=(clock:string)=>Number(clock.slice(0,2))*60+Number(clock.slice(3));
const clock=(total:number)=>`${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
export function localToday(nowMs:number,zone:string){return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(nowMs));}
export function busyOf(offer:Record<string,any>,startMs:number,durationMinutes:number):Busy{return {start:startMs-offer.buffer_before*60000,end:startMs+(durationMinutes+offer.buffer_after)*60000};}
export function offerSlots(offer:Record<string,any>,nowMs:number,busy:Busy[]):number[]{
 const windows=JSON.parse(offer.windows) as Window[],step=offer.duration_minutes+offer.buffer_before+offer.buffer_after,earliest=nowMs+offer.notice_hours*3600000,out=new Set<number>();
 const today=new Date(localToday(nowMs,offer.timezone)+'T00:00:00Z');
 for(let d=0;d<=offer.horizon_days;d++){
  const day=new Date(today.getTime()+d*86400000),date=day.toISOString().slice(0,10),weekday=day.getUTCDay()||7;
  for(const w of windows.filter(x=>x.day===weekday))for(let m=minutes(w.start);m+offer.duration_minutes<=minutes(w.end);m+=step){
   let start:number;try{start=localInstant(date,clock(m),offer.timezone);}catch{continue;}
   const slot=busyOf(offer,start,offer.duration_minutes);
   if(start>=earliest&&start<=nowMs+offer.horizon_days*86400000&&!busy.some(b=>b.start<slot.end&&b.end>slot.start))out.add(start);
  }
 }
 return [...out].sort((a,b)=>a-b);
}
export function windows(value:unknown):Window[]{
 insist(Array.isArray(value)&&value.length>=1&&value.length<=21,'Approve one to 21 weekly availability windows');
 return value.map(w=>{
  insist(w&&Number.isInteger(w.day)&&w.day>=1&&w.day<=7&&/^([01]\d|2[0-3]):[0-5]\d$/.test(w.start)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(w.end)&&w.start<w.end,'Each window needs a weekday (1 Monday to 7 Sunday) and an earlier start than end as HH:mm');
  return {day:w.day,start:w.start,end:w.end};
 });
}
