// MATTER-001: typed matter fields validated against the matter's adopted type
// version. A type change never rewrites a matter; a closed matter keeps its version.
import {atomic,audit,human,id,insist,integer,matter,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {listDocuments,matterGuard} from './documents';
import {listDeadlines} from './deadlines';
import {guard} from './trust-guards';
import {blank,builtinFields,cents,feeArrangements,plain,storedValue,typeVersion,typedValue,type Builtin,type TypeDefinition} from './matter-types';

type Profile={typeId:string|null;typeVersion:number|null;caseNumber:string|null;court:string|null;insuranceLimitCents:number|null;feeArrangement:string|null;feeTerms:string|null;custom:Data;revision:string|null};
function profileJson(p:Data|null):Profile {
 return {typeId:p?.type_id??null,typeVersion:p?.type_version??null,caseNumber:p?.case_number??null,court:p?.court??null,insuranceLimitCents:p?.insurance_limit_cents??null,feeArrangement:p?.fee_arrangement??null,feeTerms:p?.fee_terms??null,custom:JSON.parse(p?.custom??'{}'),revision:p?.revision??null};
}
export const readProfile=async(db:D1Database,matterId:string)=>profileJson(await stmt(db,'SELECT * FROM s_matter_fields WHERE matter_id=?',matterId).first<Data>());
export const readCollections=async(db:D1Database,matterId:string)=>JSON.parse((await stmt(db,'SELECT collections_json FROM s_matter_fields WHERE matter_id=?',matterId).first<Data>())?.collections_json??'[]');
export const caseNumber=(value:unknown)=>plain(value,'Case number',100);

const builtinValue:Record<Builtin,(p:Profile)=>unknown>={caseNumber:p=>p.caseNumber,court:p=>p.court,insuranceLimit:p=>p.insuranceLimitCents,feeArrangement:p=>p.feeArrangement};
// Every required standard and custom field of the version must be present and
// every custom value must parse as its declared type. Values for keys the
// version does not define are reported, so adoption names what it drops.
function validate(p:Profile,submitted:Data,def:TypeDefinition|null,label:string) {
 const custom:Data={},dropped:string[]=[];
 if(!def){insist(!Object.keys(p.custom).length&&!Object.keys(submitted).length,'Choose a matter type before entering custom fields');return {custom,dropped};}
 for(const key of def.required){insist(Object.hasOwn(builtinValue,key),'Required standard fields are case number, court, insurance limit and fee arrangement');insist(!blank(builtinValue[key](p)),`${builtinFields[key]} is required for ${label}`);}
 for(const field of def.fields) {
  const value=field.key in submitted?typedValue(field,submitted[field.key]):p.custom[field.key]===undefined?undefined:storedValue(field,p.custom[field.key]);
  insist(!field.required||value!==undefined,`${field.label} is required for ${label}`);
  if(value!==undefined)custom[field.key]=value;
 }
 for(const key of Object.keys(p.custom))if(!def.fields.some(f=>f.key===key))dropped.push(key);
 return {custom,dropped};
}

export async function matterFields(db:D1Database,actor:Actor,matterId:string) {
 const m=await matter(db,actor,matterId),profile=await readProfile(db,matterId);
 const [pinned,current,documents,deadlines,opponents,history]=await Promise.all([
  profile.typeId?typeVersion(db,profile.typeId,profile.typeVersion!):null,
  profile.typeId?stmt(db,'SELECT version FROM s_matter_types WHERE id=?',profile.typeId).first<{version:number}>():null,
  listDocuments(db,actor,matterId),listDeadlines(db,actor,matterId),
  rows(db,"SELECT p.name FROM s_matter_parties mp JOIN s_parties p ON p.id=mp.party_id WHERE mp.matter_id=? AND mp.relation='adverse' ORDER BY p.name",matterId),
  rows(db,'SELECT * FROM s_matter_field_events WHERE matter_id=? ORDER BY at,id',matterId)]);
 const available=documents.filter(d=>!d.erasedAt),titles=new Map(documents.map(d=>[d.id,d.title]));
 return {matterId,matterNumber:m.matter_number,practiceCode:m.practice_code,lifecycleStatus:m.lifecycle_status,profile,collections:await readCollections(db,matterId),type:pinned,latestVersion:current?.version??null,
  opponents:opponents.map(o=>o.name),
  records:(pinned?.definition.records??[]).map(type=>{const onFile=available.filter(d=>d.documentType===type);return {type,status:onFile.length?'on file':'missing',documents:onFile.map(d=>({id:d.id,title:d.title,version:d.currentVersion}))};}),
  // The docket reuses deadline visibility: only dates and sources this viewer may see.
  docket:deadlines.map(d=>({id:d.id,title:d.title,kind:d.kind,status:d.status==='proposed'?'unconfirmed':d.status,date:d.date,timezone:d.timezone,citation:d.source,documentId:d.documentId,documentTitle:d.documentId?titles.get(d.documentId)??null:null,version:d.version})),
  history:history.map(e=>({id:e.id,kind:e.kind,actor:e.actor,at:e.at,detail:JSON.parse(e.detail)}))};
}

function event(db:D1Database,actor:Actor,matterId:string,kind:string,detail:Data,at:string) {
 const eventId=id();
 return [stmt(db,'INSERT INTO s_matter_field_events(id,matter_id,kind,detail,actor,at) VALUES(?,?,?,?,?,?)',eventId,matterId,kind,JSON.stringify(detail),actor.email,at),audit(db,actor,`matter.fields_${kind}`,eventId,JSON.stringify({matterId,...detail}),{matterId})];
}
function write(db:D1Database,actor:Actor,matterId:string,p:Profile,revision:string,at:string) {
 return stmt(db,`INSERT INTO s_matter_fields(matter_id,type_id,type_version,case_number,court,insurance_limit_cents,fee_arrangement,fee_terms,custom,revision,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(matter_id) DO UPDATE SET type_id=excluded.type_id,type_version=excluded.type_version,case_number=excluded.case_number,court=excluded.court,insurance_limit_cents=excluded.insurance_limit_cents,fee_arrangement=excluded.fee_arrangement,fee_terms=excluded.fee_terms,custom=excluded.custom,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,matterId,p.typeId,p.typeVersion,p.caseNumber,p.court,p.insuranceLimitCents,p.feeArrangement,p.feeTerms,JSON.stringify(p.custom),revision,actor.email,at);
}

// The principal or a lawyer who sees the matter records values; assistants read.
export async function saveMatterFields(db:D1Database,actor:Actor,matterId:string,body:Data) {
 human(actor);need(actor,'owner','lawyer');
 const m=await matter(db,actor,matterId),previous=await readProfile(db,matterId);
 insist(body.revision===previous.revision,'The matter fields changed. Refresh before saving.',409);
 const p:Profile={...previous,custom:{...previous.custom}};
 if(body.caseNumber!==undefined)p.caseNumber=blank(body.caseNumber)?null:caseNumber(body.caseNumber);
 if(body.court!==undefined)p.court=blank(body.court)?null:plain(body.court,'Court',200);
 if(body.insuranceLimit!==undefined)p.insuranceLimitCents=blank(body.insuranceLimit)?null:cents(body.insuranceLimit,'Insurance limit');
 if(body.feeArrangement!==undefined){insist(blank(body.feeArrangement)||feeArrangements.includes(body.feeArrangement),'Fee arrangement must be hourly, flat_fee, contingency, hybrid or pro_bono');p.feeArrangement=blank(body.feeArrangement)?null:body.feeArrangement;}
 if(body.feeTerms!==undefined)p.feeTerms=blank(body.feeTerms)?null:plain(body.feeTerms,'Fee terms',2000);
 insist(body.custom===undefined||(body.custom&&typeof body.custom==='object'&&!Array.isArray(body.custom)),'Supply custom field values as an object');
 const submitted:Data=body.custom??{};
 const writes=[...matterGuard(db,actor,matterId),guard(db,'(? IS NULL AND NOT EXISTS(SELECT 1 FROM s_matter_fields WHERE matter_id=?)) OR EXISTS(SELECT 1 FROM s_matter_fields WHERE matter_id=? AND revision=?)',previous.revision,matterId,matterId,previous.revision)];
 let kind='saved',def:TypeDefinition|null=null,label='this matter';
 if(body.typeId!==undefined&&(body.typeId!==previous.typeId||body.typeVersion!==previous.typeVersion)) {
  // Adoption: an explicit move to a type's current version, validated in full.
  insist(m.lifecycle_status==='open','Closed matters keep their recorded type version. Reopen the matter to adopt another.',409);
  const typeId=text(body.typeId,'Matter type',100),version=integer(body.typeVersion,'Matter type version',1);
  const t=await stmt(db,'SELECT * FROM s_matter_types WHERE id=?',typeId).first<Data>();
  insist(t,'Matter type not found',404);
  insist(t.version===version,'The matter type has a newer version. Review it before adopting.',409);
  insist(!m.practice_code||m.practice_code===t.practice_code,`Choose a ${m.practice_code} matter type for this matter`);
  p.typeId=typeId;p.typeVersion=version;kind='adopted';
  writes.push(guard(db,"EXISTS(SELECT 1 FROM s_matter_types WHERE id=? AND version=?) AND EXISTS(SELECT 1 FROM s_matters WHERE id=? AND lifecycle_status='open')",typeId,version,matterId));
 }
 if(p.typeId){const v=(await typeVersion(db,p.typeId,p.typeVersion!))!;def=v.definition;label=`${v.name} version ${v.version}`;}
 // Submitted keys must exist in the version; adoption may drop only stored values.
 const unknown=Object.keys(submitted).filter(k=>!def?.fields.some(f=>f.key===k));
 insist(!unknown.length,`Unknown custom fields for ${label}: ${unknown.join(', ')}`);
 const {custom,dropped}=validate(p,submitted,def,label);
 p.custom=custom;
 const revision=id(),at=now();
 writes.push(write(db,actor,matterId,p,revision,at),...event(db,actor,matterId,kind,{previous,profile:{...p,revision},dropped},at));
 await atomic(db,actor,writes);
 return matterFields(db,actor,matterId);
}

// Clio import: the source case number is recorded with its provenance in the
// same transaction as the reviewed native matter.
export function importedCaseNumber(db:D1Database,actor:Actor,matterId:string,value:string,source:Data) {
 const revision=id(),at=now(),p:Profile={...profileJson(null),caseNumber:value,revision};
 return [write(db,actor,matterId,p,revision,at),...event(db,actor,matterId,'imported',{previous:null,profile:p,source},at)];
}

// A reviewed migration adopts an explicitly mapped native type version. Source
// values pass the same required and typed-value checks as an ordinary save.
export async function mappedMatterProfile(db:D1Database,practice:string,input:Data){
 const p:Profile={...profileJson(null),caseNumber:blank(input.caseNumber)?null:caseNumber(input.caseNumber),court:blank(input.court)?null:plain(input.court,'Court',200),insuranceLimitCents:blank(input.insuranceLimit)?null:cents(input.insuranceLimit,'Insurance limit'),feeArrangement:blank(input.feeArrangement)?null:input.feeArrangement,feeTerms:blank(input.feeTerms)?null:plain(input.feeTerms,'Fee terms',2000),custom:{}};
 insist(!p.feeArrangement||feeArrangements.includes(p.feeArrangement),'Choose a supported fee arrangement');
 let def:TypeDefinition|null=null;
 if(input.typeId){
  const version=integer(input.typeVersion,'Mapped matter type version',1),t=await typeVersion(db,text(input.typeId,'Mapped matter type',100),version);
  insist(t&&(!practice||t.practiceCode===practice),'Map a matter type in the same practice area');
  p.typeId=input.typeId;p.typeVersion=version;def=t.definition;
 }
 const submitted=input.custom??{};insist(submitted&&typeof submitted==='object'&&!Array.isArray(submitted),'Supply mapped custom values');
 insist(Object.keys(submitted).every(k=>def?.fields.some(f=>f.key===k)),'Map every custom field to the adopted matter type');
 p.custom=validate(p,submitted,def,'the mapped source matter').custom;
 return p;
}
export async function importedMatterProfile(db:D1Database,actor:Actor,matterId:string,practice:string,input:Data,source:Data){
 const p=await mappedMatterProfile(db,practice,input),collections=await mappedMatterCollections(db,input),revision=id(),at=now();return [write(db,actor,matterId,p,revision,at),stmt(db,'UPDATE s_matter_fields SET collections_json=? WHERE matter_id=?',JSON.stringify(collections),matterId),...event(db,actor,matterId,'imported',{previous:null,profile:p,collections,source},at)];
}

// Collection cells use the mapped matter type's field definitions. Row identity
// and source location are independent of position and of repeated cell values.
export async function mappedMatterCollections(db:D1Database,input:Data){
 const incoming=input.collections??[];insist(Array.isArray(incoming)&&incoming.length<=1000,'Supply at most 1,000 collection rows per matter');
 if(!incoming.length)return [];
 const type=await typeVersion(db,input.typeId,input.typeVersion);insist(type,'Map a native matter type before importing collections');
 const ids=new Set<string>();
 return incoming.map((row:Data)=>{
  const section=text(row.section,'Collection section',100),sourceId=text(row.sourceId,'Collection source identity',300),identity=JSON.stringify([section,sourceId]);
  insist(!ids.has(identity),'Collection row identities must be unique within their section');ids.add(identity);
  insist(row.values&&typeof row.values==='object'&&!Array.isArray(row.values),'Map collection fields explicitly');
  insist(row.source&&typeof row.source==='object'&&!Array.isArray(row.source),'Retain the collection source location');
  text(row.source.file,'Collection source filename',240);integer(row.source.line,'Collection source line',1);text(row.source.mappingRevision,'Collection mapping revision',100);
  const values:Data={},fields:Data[]=[];
  for(const [key,value] of Object.entries(row.values)){
   const field=type.definition.fields.find(f=>f.key===key);insist(field,`Map collection field ${key} to the adopted matter type`);
   const parsed=typedValue(field,value);insist(!field.required||parsed!==undefined,`${field.label} is required in each mapped collection row`);
   if(parsed!==undefined)values[key]=parsed;fields.push({key,label:field.label,type:field.type});
  }
  return {section,sourceId,typeId:input.typeId,typeVersion:input.typeVersion,fields,values,source:row.source};
 });
}
