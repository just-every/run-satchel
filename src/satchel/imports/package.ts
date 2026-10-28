import {canonicalJson,sha256} from '../../modules/import-kit/src/d1/index';
import {decode,mediaType} from '../documents';
import {date,insist,text,type Data} from '../model';
import {contactProfile} from '../contact-data';
import {calendarIcs} from './ics';
import {parseCsv} from './csv';

export const kinds=['contacts','matters','relationships','documents','notes','calls','emails','calendar','tasks','time','expenses','invoices','trust','grow'] as const;
export type Kind=typeof kinds[number];
export type MoveRow={kind:Kind;id:string;identity:string;hash:string;value:Data;line:number};
export type MoveFile={id:string;name:string;sha256:string;contentBase64:string;modifiedAt:string;mime:string;size:number};
export type MovePackage={schema:string;account:string;phase:string;previousFingerprint?:string;extractedAt:string;datasets:Record<Kind,string>;files:MoveFile[];staff:Record<string,string>;clientRepairs:Record<string,string>;coverage:Record<string,string>;counts:Record<Kind,number>;balances:Data;trustAccountId?:string;calendarMatters?:Record<string,string>};
const columns:Record<Kind,string[]>={
 contacts:['id','name'],matters:['id','display_number','description','client_id','adverse_party','status','opened_at'],
 relationships:['id','matter_id','contact_id','relation'],documents:['id','matter_id','file_id','date','visibility'],
 notes:['id','matter_id','title','body','occurred_at','visibility'],calls:['id','matter_id','title','body','occurred_at','visibility'],emails:['id','matter_id','title','body','occurred_at','visibility'],
 calendar:['id','matter_id','title','date','time','timezone','duration_minutes'],tasks:['id','matter_id','title','due_date','status'],
 time:['id','matter_id','date','description','minutes','rate_cents','amount_cents','invoice_id'],expenses:['id','matter_id','date','description','amount_cents','invoice_id'],
 invoices:['id','matter_id','number','ordinal','date','total_cents','ar_cents','pdf_file_id'],trust:['id','matter_id','client_id','balance_cents','statement_date','source_reference','document_id'],
 grow:['id','name','summary','created_at'],
};
export const money=(v:unknown,label:string)=>{const s=String(v);insist(/^\d{1,12}$/.test(s)&&Number.isSafeInteger(Number(s)),`${label} must be exact nonnegative USD cents`);return Number(s);};
export function timestamp(v:unknown,label:string){const s=text(v,label,40);insist(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===(s.includes('.')?s:s.slice(0,-1)+'.000Z'),`${label} must be a UTC timestamp`);return s;}
export function parsePackage(input:unknown){
 insist(input&&typeof input==='object'&&!Array.isArray(input),'Supply a prepared Clio package');
 const p=input as MovePackage;
 insist(p.schema==='satchel-clio-v1','Use the satchel-clio-v1 prepared export schema');
 text(p.account,'Source account reference',100);timestamp(p.extractedAt,'Extraction time');
 insist(p.phase==='snapshot'||p.phase==='delta','Choose snapshot or delta');
 if(p.phase==='delta')insist(typeof p.previousFingerprint==='string'&&/^[a-f0-9]{64}$/.test(p.previousFingerprint),'A delta must name its preceding completed package');
 insist(p.datasets&&p.counts&&p.coverage&&p.balances&&p.staff&&p.clientRepairs,'Supply datasets, counts, coverage, balances and explicit staff and client mappings');
 insist(Array.isArray(p.files)&&p.files.length<=500,'Supply at most 500 small originals per package');
 insist(JSON.stringify(p).length<=12_000_000,'Split packages larger than 12 MB into reviewed deltas');
 const errors:string[]=[],warnings:string[]=[],records:MoveRow[]=[];
 const fail=(message:string)=>errors.push(message);
 const files=new Map<string,MoveFile>();
 for(const f of p.files){
  text(f.id,'Original identity',100);text(f.name,'Original filename',240);insist(!/[\x00-\x1f/\\]/.test(f.name),'Original filenames cannot contain paths');
  const bytes=decode(f.contentBase64);timestamp(f.modifiedAt,'Original modification time');
  insist(/^[a-f0-9]{64}$/.test(f.sha256)&&sha256(bytes)===f.sha256,'Original hash does not match its bytes');
  insist(!files.has(f.id),'Original file identities must be unique');
  files.set(f.id,{...f,mime:mediaType(bytes),size:bytes.length});
 }
 for(const kind of kinds){
  if(typeof p.datasets[kind]!=='string'){fail(`Missing ${kind} dataset; provide its header even when empty`);continue;}
  const parsed=kind==='calendar'&&p.datasets[kind].startsWith('BEGIN:VCALENDAR')?calendarIcs(p.datasets[kind],p.calendarMatters):parseCsv(p.datasets[kind]),missing=columns[kind].filter(c=>!parsed.headers.includes(c));
  insist(!missing.length,`${kind}: missing required columns ${missing.join(', ')}`);
  const ids=new Set<string>();
  for(const {line,value} of parsed.rows){
   const v:Data={...value};const sid=value.id?.trim();
   if(!sid||sid.length>300||ids.has(sid)){fail(`${kind} row ${line}: missing or duplicate source identity`);continue;}ids.add(sid);
   for(const key of columns[kind])if(v[key]===undefined)fail(`${kind} row ${line}: missing ${key}`);
   if(v.staff_id&&!p.staff[v.staff_id])fail(`${kind} ${sid}: map source staff ${v.staff_id} to an active firm member`);
   try{
    insist(!v.currency||v.currency==='USD','Only source USD records are supported; do not silently convert currency');
    for(const key of Object.keys(v)){
     if(key.endsWith('_cents')||key==='ordinal')money(v[key],`${kind} ${sid} ${key}`);
     if((key==='date'||key.endsWith('_date'))&&v[key])date(v[key]);
     if((key.endsWith('_at'))&&v[key])timestamp(v[key],`${kind} ${sid} ${key}`);
    }
    if(kind==='contacts'&&v.profile)contactProfile(JSON.parse(v.profile));
    if(kind==='contacts'||kind==='grow'){text(v.name,'Contact name',300);if(v.email)insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email),'Supply a valid contact email');}
    if(kind==='calendar'){insist(/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time),'Use a 24-hour calendar time');new Intl.DateTimeFormat('en-US',{timeZone:v.timezone});insist(/^\d+$/.test(v.duration_minutes)&&Number(v.duration_minutes)>=5&&Number(v.duration_minutes)<=1440,'Calendar duration must be 5–1440 minutes');insist(!v.frequency||['once','daily','weekly'].includes(v.frequency),'Map a supported calendar frequency');for(const [key,max] of [['repeat_interval',12],['occurrences',104]] as const)if(v[key])insist(/^\d+$/.test(v[key])&&Number(v[key])>=1&&Number(v[key])<=max,'Map a finite supported calendar recurrence');}
    if(kind==='tasks')insist(['open','done'].includes(v.status),'Task status must be open or done');
    if(kind==='matters'){
     text(v.display_number,'Matter number',200);text(v.description,'Matter title',200);text(v.adverse_party,'Adverse party',200);
     insist(['open','closed'].includes(v.status),'Matter status must be open or closed');
     if(v.status==='closed')timestamp(v.closed_at,'Closed time');
     if(v.fields)insist(JSON.parse(v.fields)&&typeof JSON.parse(v.fields)==='object','Matter fields must be a JSON object');
    }
    if(['time','expenses'].includes(kind)){text(v.description,'Work description',2000);if(kind==='time')insist(/^\d+$/.test(v.minutes)&&Number(v.minutes)>=1&&Number(v.minutes)<=1440,'Time must contain 1–1440 minutes');}
    if(kind==='invoices')insist(Number(v.ar_cents)<=Number(v.total_cents)&&Number(v.ordinal)>0,'Invoice AR cannot exceed total; ordinal must be positive');
    if(kind==='documents')insist(['private','matter'].includes(v.visibility),'Map source document visibility explicitly');
    if(['notes','calls','emails'].includes(kind)){text(v.title,'History title',200);text(v.body,'History text',20000);}
    if(['notes','calls','emails'].includes(kind))insist(['private','team'].includes(v.visibility),'Map source history visibility explicitly');
    if(kind==='relationships'){if(v.other_contact_id){text(v.relation,'Contact relationship',200);insist(v.other_contact_id!==v.contact_id,'A contact relationship needs two different contacts');}else insist(['client','adverse','insurer','witness','expert','counsel'].includes(v.relation),'Map a supported native matter role');}
    if(['documents','invoices'].includes(kind)){
     const file=files.get(kind==='documents'?v.file_id:v.pdf_file_id);
     if(!file)fail(`${kind} ${sid}: missing original ${kind==='documents'?v.file_id:v.pdf_file_id}; supply it before apply`);
     if(kind==='invoices'&&file&&file.mime!=='application/pdf')fail(`Invoice ${sid}: supply the original PDF`);
    }
   }catch(e){fail(`${kind} ${sid}: ${(e as Error).message}`);}
   const file=['documents','invoices'].includes(kind)?files.get(kind==='documents'?v.file_id:v.pdf_file_id):undefined;
   records.push({kind,id:sid,identity:sha256(canonicalJson([p.account,kind,sid])),hash:sha256(canonicalJson({value:v,mapping:{...(kind==='matters'?{clientId:p.clientRepairs[v.client_id]??v.client_id??null}:{}),...(v.staff_id?{staff:p.staff[v.staff_id]??null}:{}),...(kind==='trust'?{trustAccountId:p.trustAccountId??null}:{})},...(file?{file:{id:file.id,sha256:file.sha256,modifiedAt:file.modifiedAt,name:file.name}}:{})})),value:v,line});
  }
  if(!Number.isSafeInteger(p.counts[kind])||p.counts[kind]<ids.size)fail(`${kind}: cumulative source count cannot be below package count`);
  if(p.coverage[kind]!=='complete')warnings.push(`${kind}: source history is not complete; retrieve an authorized supplemental export before cutover`);
 }
 insist(records.length>0&&records.length<=1000,'Supply 1–1,000 records per package');
 const byKind=(kind:Kind)=>records.filter(r=>r.kind===kind),contactIds=new Set(byKind('contacts').map(r=>r.id)),matterIds=new Set(byKind('matters').map(r=>r.id));
 const references=records.flatMap(r=>r.kind==='matters'?[{row:r,kind:'contacts' as Kind,id:p.clientRepairs[r.value.client_id]??r.value.client_id}]:r.value.matter_id?[{row:r,kind:'matters' as Kind,id:r.value.matter_id}]:[]);
 for(const r of byKind('relationships')){references.push({row:r,kind:'contacts',id:r.value.contact_id});if(r.value.other_contact_id)references.push({row:r,kind:'contacts',id:r.value.other_contact_id});}
 for(const r of byKind('trust')){references.push({row:r,kind:'documents',id:r.value.document_id});references.push({row:r,kind:'contacts',id:p.clientRepairs[r.value.client_id]??r.value.client_id});}
 for(const r of [...byKind('time'),...byKind('expenses')])if(r.value.invoice_id)references.push({row:r,kind:'invoices',id:r.value.invoice_id});
 for(const k of ['billedCents','unbilledCents','arCents','trustCents'])money(p.balances[k],k);
 return {package:p,records,files,references,errors,warnings,fingerprint:sha256(canonicalJson(p)),mappingVersion:p.schema,columns,contactIds,matterIds};
}
