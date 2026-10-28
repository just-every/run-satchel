import {sha256} from '../../modules/import-kit/src/d1/index';
import {insist,text,type Data} from '../model';
import {parseCsv} from './csv';

type SourceFile={name:string;contentBase64:string;sha256:string};
type Mapping={file:string;columns:Record<string,string>;values?:Record<string,Record<string,string>>};
type ProjectType={typeId:string;typeVersion:number;practiceCode:string;custom:Record<string,string>};
type Section={key:string;file:string;projectType:string;projectId:string;rowId?:string;fields:Record<string,string>};
export type FilevineSource={sourceAccount:string;csvFiles:SourceFile[];mappingRevision:string;mappings:Record<string,Mapping>;projectTypes:Record<string,ProjectType>;sections:Section[];roleMappings:Record<string,string>};
const required:Record<string,string[]>={contacts:['id','name'],projects:['id','display_number','description','client_id','adverse_party','status','opened_at','project_type'],relationships:['id','matter_id','contact_id','relation'],roles:['matter_id','source_person','source_role']};
const optional:Record<string,string[]>={contacts:['aliases','email'],projects:['case_number','court','insuranceLimit','feeArrangement','feeTerms','closed_at'],relationships:[],roles:[]};
const unsupported=['Doc Zipping originals and file reconciliation','activity','calendar','finance','tasks','billing and invoice number preservation','complete source totals and cutover'];
const csv=(headers:string[],records:Data[]=[])=>[headers,...records.map(r=>headers.map(h=>r[h]??''))].map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
const sensitive=/(?:password|credential|secret|authorization|access.?token|refresh.?token|api.?key|session.?cookie)/i;

// Data Connector reports have buyer-selected columns. No source header or role
// is inferred, and the exact reviewed files remain in the durable envelope.
export function prepareFilevine(input:Data,emptyColumns:Record<string,string[]>){
 const source=(input.filevine??{sourceAccount:input.account,csvFiles:input.csvFiles,mappingRevision:input.mappingRevision,mappings:input.mappings,projectTypes:input.projectTypes,sections:input.sections,roleMappings:input.roleMappings}) as FilevineSource;
 text(source.sourceAccount,'Filevine account reference',100);text(source.mappingRevision,'Reviewed mapping revision',100);
 insist(source.mappings&&source.projectTypes&&Array.isArray(source.sections)&&source.roleMappings,'Supply Filevine column, project type, section and proposed role mappings');
 insist(Array.isArray(source.csvFiles)&&source.csvFiles.length>0&&source.csvFiles.length<=100,'Supply 1–100 Filevine CSV reports');
 insist(!input.files?.length,'Filevine document originals are not supported by this CSV path');
 insist(Object.keys(source).every(k=>['sourceAccount','csvFiles','mappingRevision','mappings','projectTypes','sections','roleMappings'].includes(k)),'Filevine envelopes contain report data and mappings only; remove credentials and execution settings');
 const parsed=new Map<string,ReturnType<typeof parseCsv>>(),sourceFiles:Data[]=[],usedHeaders=new Map<string,Set<string>>(),errors:string[]=[],warnings=unsupported.map(name=>`Filevine unsupported: ${name}; obtain and reconcile authorized source exports before cutover`);
 let total=0;
 for(const f of source.csvFiles){
  text(f.name,'Filevine report filename',240);insist(!/[\x00-\x1f\\/]/.test(f.name)&&f.name.toLowerCase().endsWith('.csv')&&!parsed.has(f.name),'Use unique Filevine CSV filenames without paths');
  insist(typeof f.contentBase64==='string'&&f.contentBase64.length<=1_400_000,'Split Filevine reports above 1 MiB');
  let binary='';try{binary=atob(f.contentBase64);}catch{insist(false,'Invalid Filevine source base64');}
  insist(binary.length>0&&binary.length<=1024*1024&&btoa(binary)===f.contentBase64&&(total+=binary.length)<=6*1024*1024,'Use canonical Filevine source base64 within the 6 MiB package limit');
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));insist(sha256(bytes)===f.sha256,'Filevine source hash does not match its bytes');
  let contents='';try{contents=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{insist(false,'Export Filevine reports as UTF-8');}
  const report=parseCsv(contents);insist(report.headers.every(h=>!sensitive.test(h)),'Remove source credentials from Filevine reports before upload');
  parsed.set(f.name,report);sourceFiles.push({name:f.name,sha256:f.sha256,size:bytes.length,headers:report.headers});
 }
 const headers=(file:string,names:string[])=>{
  const report=parsed.get(file);insist(report,`Missing Filevine source report ${file}`);
  insist(names.every(h=>typeof h==='string'&&report.headers.includes(h)),`Filevine ${file}: map existing source headers explicitly`);
  const used=usedHeaders.get(file)??new Set<string>();for(const name of names)used.add(name);usedHeaders.set(file,used);return report;
 };
 const mapped=(kind:string,mandatory=false):Data[]=>{
  const m=source.mappings[kind];if(!m){insist(!mandatory,`Supply the Filevine ${kind} mapping`);return [];}
  insist(m.columns&&required[kind]&&required[kind].every(k=>typeof m.columns[k]==='string'),`Map every Filevine ${kind} identity and required column`);
  insist(Object.keys(m.columns).every(k=>[...required[kind],...optional[kind]].includes(k)),`Unsupported Filevine ${kind} target column`);
  const report=headers(m.file,Object.values(m.columns));
  return report.rows.map(({value,line})=>{
   const row:Data=Object.fromEntries(Object.entries(m.columns).map(([k,h])=>[k,value[h]]));
   for(const key of kind==='projects'?['status']:kind==='relationships'?['relation']:[]){
    const original=row[key],target=m.values?.[key]?.[original];
    if(!target)errors.push(`Filevine ${kind} row ${line}: explicitly map source ${key} ${original}`);
    row['source_'+key]=original;row[key]=target??original;
   }
   return {...row,source_file:m.file,source_line:String(line),source_mapping_revision:source.mappingRevision,source_row:JSON.stringify(value)};
  });
 };
 const contacts=mapped('contacts',true),projects=mapped('projects',true),relationships=mapped('relationships'),roles=mapped('roles');
 insist(Object.keys(source.mappings).every(k=>Object.hasOwn(required,k)),'Unsupported Filevine dataset mapping');
 const projectIds=new Set(projects.map(p=>p.id)),sectionKeys=new Set<string>(),collectionIds=new Set<string>(),usedSectionRows=new Set<string>();
 for(const p of projects){
  const type=source.projectTypes[p.project_type];insist(type&&type.typeId&&Number.isSafeInteger(type.typeVersion)&&type.custom&&type.practiceCode,`Explicitly map Filevine project type ${p.project_type} to a native type version`);
  headers(p.source_file,Object.values(type.custom));const raw=JSON.parse(p.source_row);
  const custom=Object.fromEntries(Object.entries(type.custom).map(([key,header])=>[key,raw[header]]));
  p.practice_code=type.practiceCode;p.fields=JSON.stringify({typeId:type.typeId,typeVersion:type.typeVersion,caseNumber:p.case_number,court:p.court,insuranceLimit:p.insuranceLimit,feeArrangement:p.feeArrangement,feeTerms:p.feeTerms,custom,collections:[]});
 }
 for(const section of source.sections){
  text(section.key,'Filevine section identity',100);insist(source.projectTypes[section.projectType]&&section.fields&&Object.keys(section.fields).length>0,'Map each section to an explicit project type and typed native fields');
  const key=JSON.stringify([section.projectType,section.key]);insist(!sectionKeys.has(key),'Map each Filevine section once per project type');sectionKeys.add(key);
  const report=headers(section.file,[section.projectId,...(section.rowId?[section.rowId]:[]),...Object.values(section.fields)]),single=new Set<string>();
  for(const {value,line} of report.rows){
   const p=projects.find(p=>p.id===value[section.projectId]);
   if(!p){errors.push(`Filevine ${section.file} row ${line}: unmatched project ${value[section.projectId]}`);continue;}
   if(p.project_type!==section.projectType)continue;
   usedSectionRows.add(JSON.stringify([section.file,line]));
   const profile=JSON.parse(p.fields),fields=Object.fromEntries(Object.entries(section.fields).map(([key,header])=>[key,value[header]]));
   if(section.rowId){
    const rowId=text(value[section.rowId],'Filevine collection row identity',300),identity=JSON.stringify([p.id,section.key,rowId]);
    if(collectionIds.has(identity)){errors.push(`Filevine collection ${section.key}: duplicate source row ${rowId}`);continue;}collectionIds.add(identity);
    profile.collections.push({section:section.key,sourceId:rowId,values:fields,source:{file:section.file,line,row:value,mappingRevision:source.mappingRevision}});
   }else{
    if(single.has(p.id))errors.push(`Filevine section ${section.key}: repeated rows need an explicit collection row identity`);single.add(p.id);
    for(const [key,value] of Object.entries(fields)){if(Object.hasOwn(profile.custom,key))errors.push(`Filevine section ${section.key}: field ${key} is mapped twice`);profile.custom[key]=value;}
   }
   p.fields=JSON.stringify(profile);
  }
 }
 for(const name of new Set(source.sections.map(s=>s.file)))for(const {line} of parsed.get(name)!.rows)if(!usedSectionRows.has(JSON.stringify([name,line])))warnings.push(`Filevine ${name} row ${line}: no matching section and project type; retained only`);
 const proposedRoles=roles.map(r=>{
  if(!projectIds.has(r.matter_id))errors.push(`Filevine role: unmatched project ${r.matter_id}`);
  const proposedRole=source.roleMappings[r.source_role]??null;
  insist(!proposedRole||['owner','lawyer','assistant','billing','accountant','trust_officer','client'].includes(proposedRole),'Choose a supported proposed native role');
  return {projectId:r.matter_id,sourcePerson:r.source_person,sourceRole:r.source_role,proposedRole,applied:false};
 });
 for(const [name,report] of parsed){
  const used=usedHeaders.get(name);
  if(!used)warnings.push(`Filevine unsupported dataset ${name}: ${report.rows.length} rows retained only`);
  else {const unmapped=report.headers.filter(h=>!used.has(h));if(unmapped.length)warnings.push(`Filevine ${name}: unmapped columns retained only: ${unmapped.join(', ')}`);}
 }
 const datasets=Object.fromEntries(Object.entries(emptyColumns).map(([kind,names])=>[kind,csv(names)]));
 for(const [kind,records] of Object.entries({contacts,matters:projects,relationships}))datasets[kind]=csv([...new Set([...emptyColumns[kind],...records.flatMap(r=>Object.keys(r))])],records);
 const counts=Object.fromEntries(Object.keys(emptyColumns).map(k=>[k,parseCsv(datasets[k]).rows.length]));
 return JSON.parse(JSON.stringify({phase:input.phase,extractedAt:input.extractedAt,previousFingerprint:input.previousFingerprint,schema:'satchel-filevine-v1',account:'filevine:'+sha256(source.sourceAccount),filevine:source,csvFiles:undefined,mappingRevision:undefined,mappings:undefined,projectTypes:undefined,sections:undefined,roleMappings:undefined,datasets,counts,files:[],staff:{},clientRepairs:input.clientRepairs??{},coverage:Object.fromEntries(Object.keys(emptyColumns).map(k=>[k,'incomplete'])),balances:{billedCents:0,unbilledCents:0,arCents:0,trustCents:0},filevineReview:{errors,warnings,sourceFiles,mappings:source.mappings,projectTypes:source.projectTypes,sections:source.sections,proposedRoles,mappingRevision:source.mappingRevision}}));
}
