import {date,Fault,insist,rows,text,type Actor,type Data} from './model';
import {documentText,normalizeText} from './document-text-index';
import {matterScope} from './matter-scope';
import {gateRole} from './role-doors';
import {gateGrants} from './role-areas';
import {contactState} from './contact-read';
import {trustReconciler} from './trust';
import {listDocuments} from './documents';
import {documentReview} from './document-review';
import {listTasks} from './tasks';
import {matterCalendar} from './appointments';
import {listBilling} from './billing';
import {noteJson,readableNotes} from './matter-notes';

// Search is a read door, never a new grant. Each source must be readable through
// its own current door before any matching, snippet, count or record ID is made.
export function permitted(actor:Actor,path:string){
 try{gateRole(actor,'GET',path);gateGrants(actor,'GET',path);return true;}
 catch(e){if(e instanceof Fault&&e.status===403)return false;throw e;}
}
const normalize=normalizeText;
export async function searchFirm(db:D1Database,actor:Actor,query:string,filters:Data={}){
 const q=text(query,'Search',200),tokens=normalize(q).split(/\s+/).filter(Boolean);
 const matches=(...values:unknown[])=>tokens.every(t=>normalize(values.join(' ')).includes(t));
 const matterId=filters.matterId?text(filters.matterId,'Matter',100):'',from=filters.from?date(filters.from):'',to=filters.to?date(filters.to):'',documentType=filters.documentType?text(filters.documentType,'Document type',100):'';
 insist(!from||!to||from<=to,'The date range must end on or after it starts');
 const documentsOnly=Boolean(matterId||from||to||documentType),freshness:Data[]=[];
 const kinds=['Matters','Contacts','Notes','Tasks','Events','Documents','Email','Invoices','Payments'];
 const groups=new Map<string,Data[]>(kinds.map(k=>[k,[]]));
 const add=(kind:string,id:string,title:string,snippet:string,path:string,matterId:string|null,tab:string,extra:Data={})=>groups.get(kind)!.push({id,title,snippet:snippet.slice(0,300),path,matterId,tab,...extra});
 const matters=await rows(db,`SELECT m.*,f.case_number,f.court,f.custom FROM s_matters m LEFT JOIN s_matter_fields f ON f.matter_id=m.id WHERE ${matterScope('m.id')} ORDER BY m.matter_number,m.id`,actor.role,actor.email);
 if(!documentsOnly&&permitted(actor,'/contacts')){
  const state=await contactState(db,actor,q);
  for(const c of state.contacts){
   // contactState already applies ordinary assignment, private walls and merges.
   // Use only the fields returned by that door, including its safe aliases.
   add('Contacts',c.id,c.name,[...c.aliases,...c.formerNames].join(' · '),'/contacts/'+c.id,c.matterRoles[0]?.matter_id??null,'Matters');
  }
 }
 for(const m of matters){
  if(matterId&&m.id!==matterId)continue;
  const base='/matters/'+m.id,fields=permitted(actor,base+'/fields')?m:{},context=[m.title,m.client,m.matter_number,fields.case_number??''].join(' · ');
  if(!documentsOnly&&permitted(actor,base)&&matches(context,fields.court,fields.custom))add('Matters',m.id,m.matter_number+' · '+m.title,[m.client,fields.case_number].filter(Boolean).join(' · '),base,m.id,'Matters');
  if(!documentsOnly&&permitted(actor,base+'/notes'))for(const n of (await rows(db,`SELECT n.* FROM s_matter_notes n WHERE n.matter_id=? AND ${readableNotes()} ORDER BY n.occurred_at DESC,n.id`,m.id,actor.email)).map(noteJson))if(matches(context,n.title,n.body))add('Notes',n.id,n.title,n.body,base+'/timeline',m.id,'Matters');
  if(!documentsOnly&&permitted(actor,base+'/tasks'))for(const t of await listTasks(db,actor,m.id))if(matches(context,t.title,t.evidence))add('Tasks',t.id,t.title,context+' · '+t.status,base+'/tasks',m.id,'Tasks');
  if(!documentsOnly&&permitted(actor,base+'/calendar')){
   const calendar=await matterCalendar(db,actor,m.id);
   for(const e of [...calendar.appointments,...calendar.deadlines] as Data[])if(matches(context,e.title,e.location))add('Events',e.id,e.title,context+' · '+(e.date??e.occurrences?.[0]?.date??'')+(e.status==='proposed'?' · unconfirmed':''),base+'/calendar',m.id,'Calendar');
  }
  if(permitted(actor,base+'/documents'))for(const d of await listDocuments(db,actor,m.id)){
   if(d.erasedAt)continue;
   const version=d.versions.find((v:Data)=>v.version===d.currentVersion),day=version?.createdAt.slice(0,10);
   if((from&&day<from)||(to&&day>to)||(documentType&&d.documentType!==documentType))continue;
   const email=/\.eml$/i.test(d.title)||d.versions.some((v:Data)=>v.declaredMime==='message/rfc822');
   const readable=permitted(actor,'/documents/'+d.id+'/file');
   const extracted=readable?await documentText(db,actor,d.id):null;
   if(extracted)freshness.push({documentId:d.id,title:d.title,...extracted.index});
   if(matches(context,d.title,d.documentType,d.tags.join(' ')))add(email?'Email':'Documents',d.id,d.title,context+' · version '+d.currentVersion,'/documents/'+d.id+'/file?version='+d.currentVersion,m.id,'Documents',{freshness:extracted?.index});
   if(extracted)for(const p of extracted.pages)if(matches(p.body)){
    const offset=Math.max(0,normalize(p.body).indexOf(tokens[0])-60),snippet=p.body.slice(offset,offset+300);
    const citation={documentId:d.id,version:extracted.index.version,sha256:extracted.index.sha256,page:p.page};
    add(email?'Email':'Documents',d.id+':page:'+p.page,d.title,snippet,'/documents/'+d.id+'/text?version='+citation.version+'&sha256='+citation.sha256+'&page='+p.page,m.id,'Documents',{citation,freshness:extracted.index});
   }
   if(!documentsOnly&&permitted(actor,'/documents/'+d.id+'/review'))for(const n of (await documentReview(db,actor,d.id)).annotations)if(n.note&&matches(context,d.title,n.note))add('Notes',n.id,d.title+' · note',n.note,'/documents/'+d.id+'/review',m.id,'Documents');
  }
  if(!documentsOnly&&permitted(actor,base+'/billing')){
   for(const b of (await listBilling(db,actor,m.id)).bills)if(matches(context,b.snapshot.title,b.issue?.number))add('Invoices',b.id,b.issue?.number??b.snapshot.title,context+' · '+b.snapshot.title+' · '+b.status,base+'/billing',m.id,'Time & bills');
  }
 }
 // Current operating payments are trust applications. Their door requires full
 // bank visibility; no account reference, amount or private source is indexed.
 let bank=false;
 if(!documentsOnly&&permitted(actor,'/trust/transfers'))try{await trustReconciler(db,actor);bank=true;}catch(e){if(!(e instanceof Fault)||e.status!==403)throw e;}
 if(bank)for(const p of await rows(db,`SELECT p.id,p.bill_id,p.bank_date,m.id matter_id,m.client,m.title,m.matter_number FROM s_operating_payments p JOIN s_bills b ON b.id=p.bill_id JOIN s_matters m ON m.id=b.matter_id WHERE ${matterScope('m.id')} ORDER BY p.at,p.id`,actor.role,actor.email))if(matches(p.client,p.title,p.matter_number,p.bank_date))add('Payments',p.id,'Payment · '+p.bank_date,p.matter_number+' · '+p.client,'/trust/transfers',p.matter_id,'Trust');
 return {query:q,documentIndex:freshness,filters:{matterId,from,to,documentType},groups:[...groups].filter(([,items])=>items.length).map(([type,items])=>({type,count:items.length,items})),total:[...groups.values()].reduce((n,v)=>n+v.length,0)};
}
