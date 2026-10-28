import {unzipSync} from 'fflate';
import {sha256} from '../../modules/import-kit/src/d1/index';
import {insist,text,type Data} from '../model';
import {parseCsv} from './csv';

type SourceFile={name:string;contentBase64:string;sha256:string};
type Mapping={file:string;columns:Record<string,string>;values?:Record<string,Record<string,string>>};
export type MyCaseSource={sourceAccount:string;backup?:SourceFile;csvFiles?:SourceFile[];mappings:Record<string,Mapping>;mappingRevision:string;caseRepairs:Record<string,string>};
const required={contacts:['id','name'],cases:['id','display_number','description','client_id','adverse_party','status','opened_at','closed_at'],documents:['id','matter_id','file_id','date','visibility']} as const;
const optional={contacts:['aliases','email'],cases:['case_number'],documents:['document_type']} as const;
const unsupported=['tasks','calendars','time','fees','expenses','financial activity','portal history','email history','SMS history','historic invoice PDFs and invoice associations','AR and trust activity and reconciliation','authorized supplemental extraction and complete cutover'];
const csv=(headers:string[],rows:Data[]=[])=>[headers,...rows.map(r=>headers.map(h=>r[h]??''))].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
function sourceBytes(f:SourceFile,max:number){
 text(f.name,'MyCase source filename',240);
 insist(typeof f.contentBase64==='string'&&f.contentBase64.length<=Math.ceil(max/3)*4&&!/[^A-Za-z0-9+/=]/.test(f.contentBase64),'MyCase source file exceeds its supported size or is not base64');
 let binary='';try{binary=atob(f.contentBase64);}catch{insist(false,'Invalid MyCase source base64');}
 insist(binary.length>0&&binary.length<=max&&btoa(binary)===f.contentBase64,'Use canonical base64 within the MyCase source size limit');
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 insist(/^[a-f0-9]{64}$/.test(f.sha256)&&sha256(bytes)===f.sha256,'MyCase source hash does not match its bytes');return bytes;
}
// The source envelope stays in the durable package chunks. Document originals
// remain exclusively in files, so the native erasure trigger can destroy them.
export function prepareMyCase(input:Data,emptyColumns:Record<string,string[]>){
 const source=(input.mycase??{sourceAccount:input.account,backup:input.backup,csvFiles:input.csvFiles,mappings:input.mappings,mappingRevision:input.mappingRevision,caseRepairs:input.caseRepairs??{}}) as MyCaseSource;
 text(source.sourceAccount,'MyCase account reference',100);text(source.mappingRevision,'Reviewed mapping revision',100);
 insist(source.mappings&&source.caseRepairs&&typeof source.caseRepairs==='object','Supply explicit MyCase mappings and case repairs');
 const entries=new Map<string,Uint8Array>();
 const add=(name:string,bytes:Uint8Array)=>{insist(name.length<=240&&!name.startsWith('/')&&!name.split(/[\\/]/).some(p=>p==='..')&&!/[\x00-\x1f]/.test(name),'Use relative MyCase export filenames');insist(!entries.has(name),'MyCase export filenames must be unique');insist(name.toLowerCase().endsWith('.csv'),'The MyCase data ZIP must contain CSV datasets only; supply binary originals separately');entries.set(name,bytes);};
 insist(Boolean(source.backup)!==Boolean(source.csvFiles),'Supply either a MyCase Full Backup data ZIP or CSV files');
 if(source.backup){
  const bytes=sourceBytes(source.backup,4*1024*1024);let total=0,count=0;
  const unpacked=unzipSync(bytes,{filter:f=>{if(f.name.endsWith('/'))return false;insist(++count<=100&&f.originalSize<=1024*1024&&(total+=f.originalSize)<=6*1024*1024,'Split MyCase data exports above 100 files or 6 MiB expanded');return true;}});
  for(const [name,value] of Object.entries(unpacked))add(name,value);
 }else{
  insist(Array.isArray(source.csvFiles)&&source.csvFiles.length>0&&source.csvFiles.length<=100,'Supply 1–100 MyCase CSV files');
  let total=0;for(const f of source.csvFiles){const bytes=sourceBytes(f,1024*1024);insist((total+=bytes.length)<=6*1024*1024,'Split MyCase data exports above 6 MiB');add(f.name,bytes);}
 }
 const datasets=Object.fromEntries(Object.entries(emptyColumns).map(([kind,headers])=>[kind,csv(headers)])),warnings=unsupported.map(name=>`MyCase unsupported: ${name}; retained source data is not imported or reconciled`),errors:string[]=[],sourceFiles:Data[]=[],mappedFiles=new Set<string>();
 const parsed=new Map<string,ReturnType<typeof parseCsv>>();
 for(const [name,bytes] of entries){let contents='';try{contents=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{insist(false,`MyCase ${name}: export CSV as UTF-8 without changing source identities`);}parsed.set(name,parseCsv(contents));sourceFiles.push({name,sha256:sha256(bytes),size:bytes.length});}
 const mappedRows:Record<string,Data[]>={};
 for(const kind of Object.keys(required) as (keyof typeof required)[]){
  const mapping=source.mappings[kind];insist(mapping&&typeof mapping.file==='string'&&mapping.columns,`Supply the explicit MyCase ${kind} column mapping`);
  const file=parsed.get(mapping.file);insist(file,`MyCase ${kind}: missing source file ${mapping.file}`);insist(!mappedFiles.has(mapping.file),'Map each MyCase dataset only once');mappedFiles.add(mapping.file);
  const allowed=[...required[kind],...optional[kind]] as string[];
  for(const key of required[kind])insist(typeof mapping.columns[key]==='string',`MyCase ${kind}: map ${key} explicitly`);
  for(const [key,header] of Object.entries(mapping.columns))insist(allowed.includes(key)&&file.headers.includes(header),`MyCase ${kind}: unsupported target ${key} or missing source header ${header}`);
  const unmapped=file.headers.filter(h=>!Object.values(mapping.columns).includes(h));if(unmapped.length)warnings.push(`MyCase ${mapping.file}: unmapped columns retained only: ${unmapped.join(', ')}`);
  mappedRows[kind]=file.rows.map(({value,line})=>{
   const row:Data=Object.fromEntries(Object.entries(mapping.columns).map(([key,header])=>[key,value[header]]));
   for(const key of kind==='cases'?['status']:kind==='documents'?['visibility']:[]){
    const original=row[key],mapped=mapping.values?.[key]?.[original];
    if(!mapped||(key==='status'?!['open','closed'].includes(mapped):!['private','matter'].includes(mapped)))errors.push(`MyCase ${kind} row ${line}: explicitly map source ${key} ${original}`);
    row['source_'+key]=original;row[key]=mapped??original;
   }
   if(kind==='documents')row.matter_id=source.caseRepairs[row.matter_id]??row.matter_id;
   return {...row,source_file:mapping.file,source_line:String(line),source_mapping_revision:source.mappingRevision,source_row:JSON.stringify(value)};
  });
  const target=kind==='cases'?'matters':kind,headers=[...new Set([...emptyColumns[target],...mappedRows[kind].flatMap(r=>Object.keys(r))])];datasets[target]=csv(headers,mappedRows[kind]);
 }
 for(const [name,file] of parsed)if(!mappedFiles.has(name))warnings.push(`MyCase unsupported dataset ${name}: ${file.rows.length} rows retained only; not imported or reconciled`);
 const counts=Object.fromEntries(Object.keys(emptyColumns).map(k=>[k,parseCsv(datasets[k]).rows.length]));
 return JSON.parse(JSON.stringify({...input,schema:'satchel-mycase-v1',account:'mycase:'+sha256(source.sourceAccount),mycase:source,backup:undefined,csvFiles:undefined,mappings:undefined,mappingRevision:undefined,caseRepairs:undefined,datasets,counts,staff:{},coverage:Object.fromEntries(Object.keys(emptyColumns).map(k=>[k,'incomplete'])),balances:{billedCents:0,unbilledCents:0,arCents:0,trustCents:0},mycaseReview:{errors,warnings,sourceFiles,mappings:source.mappings,mappingRevision:source.mappingRevision,caseCounts:{active:mappedRows.cases.filter(r=>r.status==='open').length,archived:mappedRows.cases.filter(r=>r.status==='closed').length}}}));
}
