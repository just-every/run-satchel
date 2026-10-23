// MATTER-005: one filterable chronology per matter. Every source is read through its own current door, so a person sees
// an entry only if they could open its record; each entry links to that record. The client timeline is a separate door
// that returns only entries the principal or a lawyer explicitly shared with the client.
import {human,insist,matter,need,rows,stmt,type Actor,type Data} from './model';
import {permitted} from './search';
import {portalAccess,readerKinds} from './portal';
import {noteJson,readableNotes} from './matter-notes';
import {listTasks} from './tasks';
import {listDocuments} from './documents';
import {matterCalendar} from './appointments';
import {listBilling} from './billing';
export const timelineKinds=['note','call','commitment','email','document','task','deadline','appointment','bill','payment'] as const;
type Entry={id:string;kind:string;at:string;title:string;summary:string;by:string|null;visibility:string;mentions:string[];source:{type:string;id:string;tab:string}};
const entry=(kind:string,id:string,at:string,title:string,summary:string,by:string|null,tab:string,extra:Partial<Entry>={}):Entry=>({id:kind+':'+id,kind,at,title,summary,by,visibility:'team',mentions:[],source:{type:kind,id,tab},...extra});
const moment=(value:unknown)=>{const t=Date.parse(String(value));return Number.isFinite(t)?new Date(t).toISOString():String(value);};
export async function matterTimeline(db:D1Database,actor:Actor,matterId:string,query:Data) {
 human(actor);need(actor,'owner','lawyer','assistant','trust_officer','billing','accountant');
 const m=await matter(db,actor,matterId),base='/matters/'+m.id,out:Entry[]=[];
 const wanted=query.kind?String(query.kind).split(',').filter(Boolean):[...timelineKinds];insist(wanted.every(k=>(timelineKinds as readonly string[]).includes(k)),'Choose known entry kinds');
 const from=query.from?moment(query.from):'',to=query.to?moment(query.to):'',mine=query.mentions==='me';
 if(permitted(actor,base+'/notes'))for(const n of (await rows(db,`SELECT n.* FROM s_matter_notes n WHERE n.matter_id=? AND ${readableNotes()}`,m.id,actor.email)).map(noteJson))
  out.push(entry(n.kind,n.id,n.occurredAt,n.title,n.body.slice(0,300),n.author,'Matters',{visibility:n.visibility+(n.clientVisible?' · client-visible':''),mentions:n.mentions}));
 if(permitted(actor,base+'/tasks'))for(const t of await listTasks(db,actor,m.id)){out.push(entry('task',t.id,moment(t.history[0]?.at??t.dueDate),t.title,'Task · '+t.status+(t.dueDate?' · due '+t.dueDate:''),t.history[0]?.actor??null,'Tasks'));if(t.completedAt)out.push(entry('task',t.id+':done',moment(t.completedAt),t.title+' completed',t.evidence??'','completed by '+t.completedBy,'Tasks'));}
 if(permitted(actor,base+'/calendar')){const c=await matterCalendar(db,actor,m.id);
  for(const a of c.appointments as Data[])out.push(entry('appointment',a.id,moment(a.occurrences[0]?.start??a.createdAt),a.title,'Appointment · '+(a.occurrences[0]?.date??''),a.createdBy,'Calendar'));
  for(const d of c.deadlines as Data[])out.push(entry('deadline',d.id,moment(d.date+'T00:00:00Z'),d.title,'Deadline · '+d.status+' · '+d.source,d.confirmedBy??null,'Deadlines'));}
 if(permitted(actor,base+'/documents'))for(const d of await listDocuments(db,actor,m.id)){if(d.erasedAt)continue;const email=/\.eml$/i.test(d.title)||d.versions.some((v:Data)=>v.declaredMime==='message/rfc822');out.push(entry(email?'email':'document',d.id,moment(d.createdAt),d.title,(email?'Filed email':'Document')+' · version '+d.currentVersion,d.createdBy,'Documents'));}
 if(permitted(actor,base+'/billing'))for(const b of (await listBilling(db,actor,m.id)).bills)out.push(entry('bill',b.id,moment(b.issue?.issuedAt??b.snapshot.date+'T00:00:00Z'),b.issue?.number??b.snapshot.title,'Bill · '+b.status,null,'Time & bills'));
 if(permitted(actor,'/trust/transfers'))for(const p of await rows(db,`SELECT p.id,p.bank_date FROM s_operating_payments p JOIN s_bills b ON b.id=p.bill_id WHERE b.matter_id=?`,m.id))out.push(entry('payment',p.id,moment(p.bank_date+'T00:00:00Z'),'Payment · '+p.bank_date,'Operating payment applied to a bill',null,'Trust'));
 const q=query.q?String(query.q).toLowerCase():'';
 const entries=out.filter(e=>wanted.includes(e.kind)&&(!from||e.at>=from)&&(!to||e.at<=to)&&(!mine||e.mentions.includes(actor.email))&&(!q||(e.title+' '+e.summary).toLowerCase().includes(q))).sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id));
 return {matterId:m.id,kinds:timelineKinds,entries};
}
// The client's view: explicit grant, then only entries marked for the client. Nothing else about the matter is read.
export async function clientTimeline(db:D1Database,actor:Actor,matterId:string) {
 human(actor);need(actor,'client');
 insist(await stmt(db,`SELECT ${portalAccess('?',readerKinds)} ok`,actor.email,matterId).first<Data>().then(r=>r?.ok),'Matter not found',404);
 const list=await rows(db,"SELECT * FROM s_matter_notes WHERE matter_id=? AND visibility='team' AND client_visible=1 ORDER BY occurred_at DESC,id",matterId);
 return {matterId,entries:list.map(n=>({id:n.id,kind:n.kind,at:n.occurred_at,title:n.title,body:n.body}))};
}
