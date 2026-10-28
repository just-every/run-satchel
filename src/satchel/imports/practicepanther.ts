import {sha256} from '../../modules/import-kit/src/d1/index';
import {decode} from '../documents';
import {insist,text,type Data} from '../model';
import {parseCsv} from './csv';
import type {Kind,MovePackage} from './package';

export const practicePantherSchema='satchel-practicepanther-v1';
export const practicePantherGaps=()=>[
 'payments: native payment history and financial reconciliation remain required',
 'messages: source message history has no native mapping',
 'PDF reports: evidence, originals and source relationship matching remain required',
 'XLSX: native workbook reading remains required; this path accepts UTF-8 CSV',
 'Vendor-assisted extraction: authorized retrieval must close every missing dataset before source shutdown',
];
export type PracticePantherSource={account:string;exports:Record<string,{name:string;contentBase64:string}>;mapping:{revision:string;columns:Record<string,Record<string,string>>;matterType?:{id:string;version:number;practiceCode:string};fields?:Record<string,string>;custom?:Record<string,string>;statuses?:Record<string,string>}};
const allowed:Record<string,string[]>={contacts:['id','name','email','aliases'],matters:['id','display_number','description','client_id','adverse_party','status','opened_at','closed_at']};
const required:Record<string,string[]>={contacts:['id','name'],matters:['id','display_number','description','client_id','adverse_party','status','opened_at']};
const standard=['caseNumber','court','insuranceLimit','feeArrangement','feeTerms'];
const csv=(headers:string[],values:Data[])=>[headers,...values.map(v=>headers.map(h=>v[h]??''))].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';

// Only the reviewed columns become native data. The original UTF-8 bytes and
// every unmapped cell stay in private migration custody, never as authority.
export function practicePantherPackage(input:Data,columns:Record<Kind,string[]>):MovePackage{
 const source=input.practicePanther as PracticePantherSource;
 insist(source&&source.exports&&source.mapping,'Supply PracticePanther originals and explicit column mappings');
 const account=text(source.account,'PracticePanther source account',80);
 insist(!/[\x00-\x1f]/.test(account),'Use a non-secret source account reference');
 const mapping=source.mapping;
 text(mapping.revision,'Reviewed mapping revision',100);
 insist(mapping.columns&&typeof mapping.columns==='object','Supply explicit contact and matter column mappings');
 insist(Object.keys(mapping.columns).every(k=>k in allowed),'Only contacts and matters have native PracticePanther mappings');
 const exports=practicePantherExports(source),datasets={} as Record<Kind,string>,counts={} as Record<Kind,number>,coverage:Record<string,string>={};
 for(const kind of Object.keys(columns) as Kind[]){
  datasets[kind]=csv(columns[kind],[]);counts[kind]=input.counts?.[kind]??0;coverage[kind]='missing';
 }
 for(const kind of ['contacts','matters'] as const){
  const original=exports.find(e=>e.kind===kind);
  insist(original,`Supply the original PracticePanther ${kind} CSV, including its headers when empty`);
  const parsed=parseCsv(original.csv),map=mapping.columns[kind];
  insist(map&&typeof map==='object'&&!Array.isArray(map),`Review the ${kind} column mapping`);
  insist(Object.keys(map).every(k=>allowed[kind].includes(k)),`${kind}: unsupported native mapping target`);
  insist(required[kind].every(k=>typeof map[k]==='string'&&map[k]),`${kind}: map every required native column`);
  const fields=kind==='matters'?mapping.fields??{}:{},custom=kind==='matters'?mapping.custom??{}:{};
  insist(Object.keys(fields).every(k=>standard.includes(k)),'Map only supported standard matter fields');
  const assignments=[...Object.entries(map),...Object.entries(fields).map(([k,v])=>['fields.'+k,v]),...Object.entries(custom).map(([k,v])=>['custom.'+k,v])];
  insist(assignments.every(([,header])=>typeof header==='string'&&parsed.headers.includes(header)),`${kind}: each mapped source column must exist in its original header`);
  insist(new Set(assignments.map(([,header])=>header)).size===assignments.length,`${kind}: map each source column to only one native field`);
  const values=parsed.rows.map(({line,value})=>{
   const v:Data=Object.fromEntries(Object.entries(map).map(([key,header])=>[key,value[header]]));
   if(kind==='matters'){
    if(mapping.statuses){insist(Object.hasOwn(mapping.statuses,v.status),`Matter ${v.id}: map the source status explicitly`);v.status=mapping.statuses[v.status];}
    const type=mapping.matterType;
    if(type){text(type.id,'Native matter type',100);insist(Number.isSafeInteger(type.version)&&type.version>0,'Map an exact native type version');v.practice_code=text(type.practiceCode,'Native practice area',6);}
    v.fields=JSON.stringify({...Object.fromEntries(Object.entries(fields).map(([key,header])=>[key,value[header]])),...(type?{typeId:type.id,typeVersion:type.version}:{}),custom:Object.fromEntries(Object.entries(custom).map(([key,header])=>[key,value[header]]))});
   }
   v._source=JSON.stringify({provider:'practicepanther',account,filename:original.name,line,headers:parsed.headers,raw:value,mappingRevision:mapping.revision,mapping});
   return v;
  });
  datasets[kind]=csv([...new Set([...columns[kind],...values.flatMap(v=>Object.keys(v))])],values);
  counts[kind]=input.counts?.[kind]??values.length;coverage[kind]=input.coverage?.[kind]==='complete'?'complete':'missing';
 }
 // Unsupported history cannot be relabelled complete by a declaration or by
 // injecting normalized datasets. It still needs an authorized extraction.
 return {schema:practicePantherSchema,account:'practicepanther:'+account,phase:input.phase,...(input.previousFingerprint?{previousFingerprint:input.previousFingerprint}:{}),extractedAt:input.extractedAt,datasets,counts,coverage,balances:input.balances??{billedCents:0,unbilledCents:0,arCents:0,trustCents:0},files:[],staff:{},clientRepairs:input.clientRepairs??{},practicePanther:source};
}

export function practicePantherExports(source:PracticePantherSource){
 const entries=Object.entries(source.exports);
 insist(entries.length>=2&&entries.length<=20,'Supply at most 20 source export files');
 return entries.map(([kind,file])=>{
  insist(file&&typeof file==='object'&&!Array.isArray(file),'Supply a named original export with its bytes');
  text(file.name,'Source export filename',240);insist(!/[\x00-\x1f/\\]/.test(file.name),'Source export names cannot contain paths');
  const bytes=decode(file.contentBase64);let contents='';
  try{contents=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{insist(false,`${kind}: supply a UTF-8 CSV export`);}
  const supported=kind==='contacts'||kind==='matters';
  const headers=supported?parseCsv(contents).headers:[];
  const mapping=source.mapping,assigned=supported?[...Object.values(mapping.columns?.[kind]??{}),...(kind==='matters'?[...Object.values(mapping.fields??{}),...Object.values(mapping.custom??{})]:[])]:[];
  return {kind,name:file.name,sha256:sha256(bytes),size:bytes.length,headers,unsupportedFields:headers.filter(h=>!assigned.includes(h)),supported,csv:contents};
 });
}
