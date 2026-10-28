import {unzipSync} from 'fflate';
import {canonicalJson,sha256} from '../../modules/import-kit/src/d1/index';
import {decode} from '../documents';
import {insist,text,type Data} from '../model';
import {parseCsv} from './csv';
import type {Kind,MovePackage} from './package';

const supported=['contacts','matters','time','expenses'] as const;
const encode=(bytes:Uint8Array)=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);};
const csv=(headers:string[],values:Data[])=>[headers,...values.map(v=>headers.map(h=>String(v[h]??'')))].map(row=>row.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';

// Explicit reviewed mappings adapt real export headers; raw exports are never
// replaced by the normalized CSVs and source roles never grant native authority.
export function smokeballPackage(input:Data,columns:Record<Kind,string[]>):MovePackage{
 const account=text(input.sourceAccount,'Smokeball account reference',70),revision=text(input.mappingRevision,'Reviewed mapping revision',100);
 insist(Array.isArray(input.sourceExports)&&input.sourceExports.length>0&&input.sourceExports.length<=20,'Supply the original Smokeball CSV files or Data Import Export ZIP');
 insist(input.mappings&&input.staff&&input.staffFile,'Supply reviewed column mappings, a staff CSV and native staff mappings');
 const exports:Data[]=[],files=new Map<string,Uint8Array>();let total=0;
 const add=(name:string,bytes:Uint8Array)=>{
  insist(name.length<=240&&!name.split(/[\\/]/).includes('..')&&!/[\x00-\x1f]/.test(name),'Use safe export filenames');
  insist(!files.has(name),'Export filenames must be unique');total+=bytes.length;
  insist(bytes.length<=1_048_576&&total<=4_194_304&&files.size<100,'Split large exports into reviewed deltas');files.set(name,bytes);
 };
 for(const source of input.sourceExports){
  const name=text(source.name,'Source export filename',240),bytes=decode(source.contentBase64);
  insist(sha256(bytes)===source.sha256,'Source export hash does not match its uploaded bytes');
  exports.push({name,sha256:source.sha256,contentBase64:encode(bytes)});
  if(/\.zip$/i.test(name)){
   let expanded=0,entries=0;
   const extracted=unzipSync(bytes,{filter:file=>{expanded+=file.originalSize;entries++;insist(file.originalSize<=1_048_576&&expanded<=4_194_304&&entries<=100,'Split large ZIP exports into reviewed deltas');return !file.name.endsWith('/');}});
   for(const [path,body] of Object.entries(extracted))add(path,body);
  }else{insist(/\.csv$/i.test(name),'Supply CSV or ZIP source exports');add(name,bytes);}
 }
 const read=(name:string)=>{const body=files.get(name);insist(body,`Supply source export ${name}`);return parseCsv(new TextDecoder('utf-8',{fatal:true}).decode(body));};
 const staffMap=input.staffFile,staffCsv=read(text(staffMap.file,'Staff CSV filename',240));
 insist(staffCsv.headers.includes(staffMap.id)&&staffCsv.headers.includes(staffMap.name),'Map the staff source ID and name columns');
 const sourceStaff=new Map<string,Data>();
 for(const row of staffCsv.rows){const sid=text(row.value[staffMap.id],'Source staff identity',100);insist(!sourceStaff.has(sid),'Duplicate source staff identity');sourceStaff.set(sid,row.value);}
 for(const sid of Object.keys(input.staff))insist(sourceStaff.has(sid),`Staff mapping ${sid} is absent from the source staff export`);
 const datasets={} as Record<Kind,string>,counts={} as Record<Kind,number>,coverage={} as Record<Kind,string>,warnings:string[]=[],used=new Set([staffMap.file]);
 for(const kind of Object.keys(columns) as Kind[]){datasets[kind]=csv(columns[kind],[]);counts[kind]=input.counts?.[kind]??0;coverage[kind]='missing';}
 for(const kind of supported){
  const mapping=input.mappings[kind];if(!mapping){warnings.push(`${kind}: no source dataset mapped`);continue;}
  const parsed=read(text(mapping.file,'Mapped source CSV',240));used.add(mapping.file);
  insist(mapping.columns&&typeof mapping.columns==='object','Supply explicit native column mappings');
  for(const [key,header] of Object.entries(mapping.columns))insist(typeof header==='string'&&parsed.headers.includes(header),`${kind}: mapped column ${key} is absent from the source`);
  for(const [key,header] of Object.entries(mapping.custom??{}))insist(typeof header==='string'&&parsed.headers.includes(header),`${kind}: custom field ${key} is absent from the source`);
  const mapped=new Set([...Object.values(mapping.columns),...Object.values(mapping.custom??{})]);
  const omitted=parsed.headers.filter(h=>!mapped.has(h));
  if(omitted.length)warnings.push(`${kind}: omitted fields retained in source history: ${omitted.join(', ')}`);
  const values=parsed.rows.map(row=>{
   const v:Data=Object.fromEntries(Object.entries(mapping.columns).map(([key,header])=>[key,row.value[String(header)]]));
   if(kind==='matters'&&mapping.typeId){v.fields=JSON.stringify({...(v.fields?JSON.parse(v.fields):{}),typeId:mapping.typeId,typeVersion:mapping.typeVersion,custom:Object.fromEntries(Object.entries(mapping.custom??{}).map(([key,header])=>[key,row.value[String(header)]]))});}
   if(kind==='time'||kind==='expenses'){
    insist(v.staff_id&&sourceStaff.has(v.staff_id),`${kind} row ${row.line}: map an exported source staff identity`);
    insist(input.staff[v.staff_id],`${kind} row ${row.line}: map source staff to an existing eligible native member`);
    insist(v.billable==='true'||v.billable==='false',`${kind} row ${row.line}: explicitly map billable true or false`);
    insist(!v.invoice_id,`${kind} row ${row.line}: only unbilled work is supported by this mapping`);
    v.invoice_id='';v.source_staff=JSON.stringify(sourceStaff.get(v.staff_id));
    if(kind==='time')insist(v.autotime==='true'||v.autotime==='false',`Time row ${row.line}: preserve whether work is AutoTime-derived`);
   }
   v.source_system='smokeball';v.source_mapping_revision=revision;v.source_fields=JSON.stringify(row.value);
   return v;
  });
  const headers=[...new Set([...columns[kind],...values.flatMap(v=>Object.keys(v))])];datasets[kind]=csv(headers,values);
  counts[kind]=input.counts?.[kind]??values.length;coverage[kind]=input.coverage?.[kind]==='complete'&&!omitted.length?'complete':'missing';
 }
 for(const name of files.keys())if(!used.has(name))warnings.push(`Unsupported source file retained: ${name}`);
 // Missing finance, originals and history cannot be certified by a coverage flag.
 warnings.push('Paid and unpaid invoices, memos, tasks, Word and email originals, calendar and trust history, authorized supplemental retrieval and complete source totals remain required before cutover.');
 return {...input,schema:'satchel-smokeball-v1',phase:input.phase,extractedAt:input.extractedAt,balances:input.balances,account:'smokeball:'+account,datasets,counts,coverage,files:[],clientRepairs:input.clientRepairs??{},sourceExports:exports,sourceWarnings:warnings,sourceFiles:[...files].map(([name,bytes])=>({name,sha256:sha256(bytes),size:bytes.length})),staff:input.staff} as MovePackage;
}
