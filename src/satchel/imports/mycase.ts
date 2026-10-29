import {unzipSync} from 'fflate';
import {sha256} from '../../modules/import-kit/src/d1/index';
import {insist,text,type Data} from '../model';
import {mycaseOriginals} from './mycase-originals';
import {parseCsv} from './csv';

type SourceFile={name:string;contentBase64:string;sha256:string};
type Mapping={file:string;columns:Record<string,string>;values?:Record<string,Record<string,string>>};
export type MyCaseSource={sourceAccount:string;backup?:SourceFile;csvFiles?:SourceFile[];supplements?:{file:SourceFile;sourceReference:string}[];mappings:Record<string,Mapping>;mappingRevision:string;caseRepairs:Record<string,string>};
const required={contacts:['id','name'],cases:['id','display_number','description','client_id','adverse_party','status','opened_at','closed_at'],documents:['id','matter_id','file_id','date','visibility']} as const;
const extended:Record<string,string[]>={relationships:['id','matter_id','contact_id','relation'],notes:['id','matter_id','title','body','occurred_at','visibility'],calls:['id','matter_id','title','body','occurred_at','visibility'],emails:['id','matter_id','title','body','occurred_at','visibility'],calendar:['id','matter_id','title','date','time','timezone','duration_minutes'],tasks:['id','matter_id','title','due_date','status'],time:['id','matter_id','date','description','minutes','rate_cents','amount_cents','invoice_id','staff_id','billable'],expenses:['id','matter_id','date','description','amount_cents','invoice_id','staff_id','billable','category','vendor','vendor_reference','accounting_code'],invoices:['id','matter_id','number','ordinal','date','total_cents','ar_cents','pdf_file_id'],trust:['id','matter_id','client_id','balance_cents','statement_date','source_reference','document_id'],fees:['id','matter_id','date','description','amount_cents','invoice_id','terms'],financial:['id','matter_id','client_id','ledger','kind','date','amount_cents','invoice_id','document_id','source_reference'],portal:['id','matter_id','title','body','occurred_at','visibility','thread_id','author','recipient'],sms:['id','matter_id','title','body','occurred_at','visibility','thread_id','author','recipient']};
const optional:Record<string,string[]>={contacts:['aliases','email','profile'],cases:['case_number','practice_code','fields'],documents:['document_type','staff_id'],relationships:['other_contact_id'],notes:['staff_id'],calls:['staff_id'],emails:['staff_id'],calendar:['staff_id','location','video_url','frequency','repeat_interval','occurrences'],tasks:['staff_id'],time:['utbms_task','utbms_activity','currency'],expenses:['utbms_expense','currency'],invoices:['tax_cents','currency','due_date'],trust:['currency'],fees:['currency','fee_type'],financial:['currency','related_id'],portal:['staff_id'],sms:['staff_id']};
const unsupported=['tasks','calendars','time','fees','expenses','financial activity','portal history','email history','SMS history','historic invoice PDFs and invoice associations','AR and trust activity and reconciliation'];
const csv=(headers:string[],rows:Data[]=[])=>[headers,...rows.map(r=>headers.map(h=>r[h]??''))].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
function sourceBytes(f:SourceFile,max:number){
 text(f.name,'MyCase source filename',240);
 insist(typeof f.contentBase64==='string'&&f.contentBase64.length<=Math.ceil(max/3)*4&&!/[^A-Za-z0-9+/=]/.test(f.contentBase64),'MyCase source file exceeds its supported size or is not base64');
 let binary='';try{binary=atob(f.contentBase64);}catch{insist(false,'Invalid MyCase source base64');}
 insist(binary.length>0&&binary.length<=max&&btoa(binary)===f.contentBase64,'Use canonical base64 within the MyCase source size limit');
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 insist(/^[a-f0-9]{64}$/.test(f.sha256)&&sha256(bytes)===f.sha256,'MyCase source hash does not match its bytes');return bytes;
}
// CSV source envelopes stay in durable package chunks. Binary members and
// their archive use the separate erasure-aware original store.
export function prepareMyCase(input:Data,emptyColumns:Record<string,string[]>){
 const source=(input.mycase??{sourceAccount:input.account,backup:input.backup,csvFiles:input.csvFiles,mappings:input.mappings,mappingRevision:input.mappingRevision,caseRepairs:input.caseRepairs??{},supplements:input.supplements}) as MyCaseSource;
 text(source.sourceAccount,'MyCase account reference',100);text(source.mappingRevision,'Reviewed mapping revision',100);
 insist(source.mappings&&source.caseRepairs&&typeof source.caseRepairs==='object','Supply explicit MyCase mappings and case repairs');
 const entries=new Map<string,Uint8Array>();let sourceSize=0;
 const add=(name:string,bytes:Uint8Array)=>{insist(name.length<=240&&!name.startsWith('/')&&!name.split(/[\\/]/).some(p=>p==='..')&&!/[\x00-\x1f]/.test(name),'Use relative MyCase export filenames');insist(!entries.has(name),'MyCase export filenames must be unique');insist(name.toLowerCase().endsWith('.csv'),'The MyCase data ZIP must contain CSV datasets only; supply binary originals separately');insist(entries.size<100&&(sourceSize+=bytes.length)<=6*1024*1024,'Split source datasets above 100 files or 6 MiB');entries.set(name,bytes);};
 insist(Boolean(source.backup)!==Boolean(source.csvFiles),'Supply either a MyCase Full Backup data ZIP or CSV files');
 if(source.backup){
  const bytes=sourceBytes(source.backup,4*1024*1024);let total=0,count=0;
  const unpacked=unzipSync(bytes,{filter:f=>{if(f.name.endsWith('/'))return false;insist(++count<=100&&f.originalSize<=1024*1024&&(total+=f.originalSize)<=6*1024*1024,'Split MyCase data exports above 100 files or 6 MiB expanded');return true;}});
  for(const [name,value] of Object.entries(unpacked))add(name,value);
 }else{
  insist(Array.isArray(source.csvFiles)&&source.csvFiles.length>0&&source.csvFiles.length<=100,'Supply 1–100 MyCase CSV files');
  let total=0;for(const f of source.csvFiles){const bytes=sourceBytes(f,1024*1024);insist((total+=bytes.length)<=6*1024*1024,'Split MyCase data exports above 6 MiB');add(f.name,bytes);}
 }
 if(source.supplements){
  insist(Array.isArray(source.supplements)&&source.supplements.length<=20,'Supply at most twenty authorized supplemental CSV files');
  for(const supplemental of source.supplements){text(supplemental.sourceReference,'Supplemental source reference',1000);add(supplemental.file.name,sourceBytes(supplemental.file,1024*1024));}
 }
 const datasets=Object.fromEntries(Object.entries(emptyColumns).map(([kind,headers])=>[kind,csv(headers)])),warnings:string[]=[],errors:string[]=[],sourceFiles:Data[]=[],mappedFiles=new Set<string>(),coverage:Record<string,string>={};
 const supportedNames:Record<string,string>={tasks:'tasks',calendar:'calendars',time:'time',expenses:'expenses',emails:'email history',invoices:'historic invoice PDFs and invoice associations',financial:'financial activity',fees:'fees',portal:'portal history',sms:'SMS history'};
 for(const name of unsupported)if(!(name==='AR and trust activity and reconciliation'&&source.mappings.financial&&source.mappings.trust&&source.mappings.invoices)&&!Object.entries(supportedNames).some(([kind,label])=>label===name&&source.mappings[kind]))warnings.push(`MyCase unsupported: ${name}; retained source data is not imported or reconciled`);
 warnings.push('MyCase cutover: authorized supplemental extraction from the source account, complete client ledgers and QuickBooks number-preservation proof remain unproved');
 const parsed=new Map<string,ReturnType<typeof parseCsv>>();
 for(const [name,bytes] of entries){let contents='';try{contents=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{insist(false,`MyCase ${name}: export CSV as UTF-8 without changing source identities`);}parsed.set(name,parseCsv(contents));sourceFiles.push({name,sha256:sha256(bytes),size:bytes.length});}
 const mappedRows:Record<string,Data[]>={};
 for(const kind of Object.keys(source.mappings))insist(kind in required||kind in extended,`MyCase unsupported mapping ${kind}; retain it as an uncovered dataset`);
 for(const [kind,requiredColumns] of Object.entries({...required,...extended})){
  if(!source.mappings[kind]&&kind in extended){coverage[kind]='incomplete';continue;}
  const mapping=source.mappings[kind];insist(mapping&&typeof mapping.file==='string'&&mapping.columns,`Supply the explicit MyCase ${kind} column mapping`);
  const file=parsed.get(mapping.file);insist(file,`MyCase ${kind}: missing source file ${mapping.file}`);insist(!mappedFiles.has(mapping.file),'Map each MyCase dataset only once');mappedFiles.add(mapping.file);
  const allowed=[...requiredColumns,...(optional[kind]??[])];
  for(const key of requiredColumns)insist(typeof mapping.columns[key]==='string',`MyCase ${kind}: map ${key} explicitly`);
  for(const [key,header] of Object.entries(mapping.columns))insist(allowed.includes(key)&&file.headers.includes(header),`MyCase ${kind}: unsupported target ${key} or missing source header ${header}`);
  const unmapped=file.headers.filter(h=>!Object.values(mapping.columns).includes(h));coverage[kind==='cases'?'matters':kind]=input.coverage?.[kind==='cases'?'matters':kind]==='complete'&&!unmapped.length?'complete':'incomplete';if(unmapped.length)warnings.push(`MyCase ${mapping.file}: unmapped columns retained only: ${unmapped.join(', ')}`);
  mappedRows[kind]=file.rows.map(({value,line})=>{
   const row:Data=Object.fromEntries(Object.entries(mapping.columns).map(([key,header])=>[key,value[header]]));
   const enums:Record<string,string[]>={...(kind==='cases'?{status:['open','closed']}:kind==='tasks'?{status:['open','done']}:{}),...(kind==='documents'?{visibility:['private','matter']}:['notes','calls','emails','portal','sms'].includes(kind)?{visibility:['private','team']}:{})};
   for(const [key,allowedValues] of Object.entries(enums)){
    const original=row[key],mapped=mapping.values?.[key]?.[original];
    if(!mapped||!allowedValues.includes(mapped))errors.push(`MyCase ${kind} row ${line}: explicitly map source ${key} ${original}`);
    row['source_'+key]=original;row[key]=mapped??original;
   }
   for(const [key,values] of Object.entries(mapping.values??{}))if(!(key in enums)){
    insist(key in mapping.columns,`MyCase ${kind}: value mapping ${key} needs a source column`);
    const original=row[key],mapped=values[original];
    if(mapped===undefined)errors.push(`MyCase ${kind} row ${line}: explicitly map source ${key} ${original}`);
    row['source_'+key]=original;row[key]=mapped??original;
   }
   if(row.matter_id)row.matter_id=source.caseRepairs[row.matter_id]??row.matter_id;
   if(['time','expenses'].includes(kind)&&!['true','false'].includes(row.billable))errors.push(`MyCase ${kind} row ${line}: explicitly map source billable true or false`);
   return {...row,source_file:mapping.file,source_line:String(line),source_mapping_revision:source.mappingRevision,source_row:JSON.stringify(value)};
  });
  const target=kind==='cases'?'matters':kind,headers=[...new Set([...emptyColumns[target],...mappedRows[kind].flatMap(r=>Object.keys(r))])];datasets[target]=csv(headers,mappedRows[kind]);
 }
 for(const [name,file] of parsed)if(!mappedFiles.has(name))warnings.push(`MyCase unsupported dataset ${name}: ${file.rows.length} rows retained only; not imported or reconciled`);
 const originals=mycaseOriginals(input);warnings.push(...originals.warnings);errors.push(...originals.errors);if(originals.sourceFile)sourceFiles.push(originals.sourceFile);
 const counts=Object.fromEntries(Object.keys(emptyColumns).map(k=>[k,input.counts?.[k]??parseCsv(datasets[k]).rows.length]));
 coverage.grow='complete';
 return JSON.parse(JSON.stringify({...input,files:originals.files,binaryArchive:originals.archive,schema:'satchel-mycase-v1',account:'mycase:'+sha256(source.sourceAccount),mycase:source,backup:undefined,csvFiles:undefined,mappings:undefined,mappingRevision:undefined,caseRepairs:undefined,supplements:undefined,datasets,counts,staff:input.staff??{},coverage:Object.fromEntries(Object.keys(emptyColumns).map(k=>[k,coverage[k]??'incomplete'])),balances:input.balances??{billedCents:0,unbilledCents:0,arCents:0,trustCents:0},mycaseReview:{errors,warnings,sourceFiles,archiveContents:originals.archiveContents,mappings:source.mappings,mappingRevision:source.mappingRevision,caseCounts:{active:mappedRows.cases.filter(r=>r.status==='open').length,archived:mappedRows.cases.filter(r=>r.status==='closed').length}}}));
}
