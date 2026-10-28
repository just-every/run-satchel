// MATTER-001: practice matter types are firm configuration. Each save writes an
// immutable version; matters are validated against the version they adopted.
import {atomic,audit,human,id,insist,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {guard} from './trust-guards';

export const builtinFields={caseNumber:'Case number',court:'Court',insuranceLimit:'Insurance limit (USD)',feeArrangement:'Fee arrangement'} as const;
export type Builtin=keyof typeof builtinFields;
export const feeArrangements=['hourly','flat_fee','contingency','hybrid','pro_bono'];
export const fieldTypes=['text','number','date','money','choice','yesno'];
export type FieldDefinition={key:string;label:string;type:string;required:boolean;options?:string[]};
export type TypeDefinition={required:Builtin[];fields:FieldDefinition[];records:string[]};

const control=/[\u0000-\u001f\u007f]/;
export function plain(value:unknown,label:string,max:number) {
 const v=text(value,label,max);insist(!control.test(v),`${label} cannot contain control characters`);return v;
}
// Exact US dollars to integer cents: at most two decimals, never rounded.
export function cents(value:unknown,label:string) {
 const v=typeof value==='number'?String(value):typeof value==='string'?value.trim():'';
 insist(/^\d{1,13}(\.\d{1,2})?$/.test(v),`${label} must be US dollars such as 250000.00 (at most two decimals)`);
 const [whole,fraction='']=v.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));
}
export const blank=(value:unknown)=>value===undefined||value===null||(typeof value==='string'&&value.trim()==='');

export function definition(body:unknown):TypeDefinition {
 insist(body&&typeof body==='object'&&!Array.isArray(body),'Supply a matter type definition');
 const d=body as Data;
 insist(Array.isArray(d.required)&&d.required.every((k:unknown)=>typeof k==='string'&&Object.hasOwn(builtinFields,k)),'Required standard fields are case number, court, insurance limit and fee arrangement');
 insist(Array.isArray(d.fields)&&d.fields.length<=40,'Define at most 40 custom fields');
 insist(Array.isArray(d.records)&&d.records.length<=30,'Name at most 30 required record types');
 const keys=new Set<string>();
 const fields=(d.fields as Data[]).map((f,i)=>{
  insist(f&&typeof f==='object','Supply valid custom fields');
  const label=plain(f.label,`Custom field ${i+1} label`,80);
  const key=typeof f.key==='string'&&f.key?f.key:label.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  insist(/^[a-z][a-z0-9_]{0,39}$/.test(key),`${label} needs a key of lowercase letters, digits and _ starting with a letter`);
  insist(!keys.has(key),`Custom field keys must be unique (${key})`);keys.add(key);
  insist(fieldTypes.includes(f.type),`${label} type must be text, number, date, money, choice or yesno`);
  insist(typeof f.required==='boolean',`Say whether ${label} is required`);
  const field:FieldDefinition={key,label,type:f.type,required:f.required};
  if(f.type==='choice'){insist(Array.isArray(f.options)&&f.options.length>0&&f.options.length<=30,`${label} needs 1–30 choices`);field.options=[...new Set((f.options as unknown[]).map(o=>plain(o,`${label} choice`,80)))];}
  else insist(f.options===undefined,`Only choice fields have options (${label})`);
  return field;
 });
 return {required:[...new Set(d.required as Builtin[])].sort(),fields,records:[...new Set((d.records as unknown[]).map(r=>plain(r,'Required record type',80)))].sort()};
}

// One typed value. Empty input is absent; required presence is checked separately.
export function typedValue(field:FieldDefinition,raw:unknown) {
 if(blank(raw))return undefined;
 const label=field.label;
 switch(field.type) {
  case 'text':return plain(raw,label,1000);
  case 'number':{const v=typeof raw==='number'?String(raw):String(raw).trim();insist(/^-?\d{1,15}(\.\d{1,6})?$/.test(v),`${label} must be a number such as 12 or 12.5`);return v;}
  case 'date':{const v=String(raw).trim(),parsed=new Date(v);insist(/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===v,`${label} must be a valid YYYY-MM-DD date`);return v;}
  case 'money':return cents(raw,label);
  case 'choice':{const v=plain(raw,label,80);insist(field.options!.includes(v),`${label} must be one of: ${field.options!.join(', ')}`);return v;}
  default:insist(raw===true||raw===false||raw==='yes'||raw==='no',`${label} must be yes or no`);return raw===true||raw==='yes';
 }
}

// A stored value in its canonical form (money in cents, yes/no as a boolean)
// still conforms to a field; adoption re-checks values against the new version.
export function storedValue(field:FieldDefinition,value:unknown) {
 const ok=field.type==='money'?Number.isSafeInteger(value)&&Number(value)>=0:field.type==='yesno'?typeof value==='boolean':typeof value==='string'&&(()=>{try{return typedValue(field,value)===value;}catch{return false;}})();
 insist(ok,`${field.label} holds a value that is not a valid ${field.type}; enter it again`);
 return value;
}
function versionJson(v:Data) {return {version:v.version,name:v.name,practiceCode:v.practice_code,definition:JSON.parse(v.definition) as TypeDefinition,createdBy:v.created_by,createdAt:v.created_at};}
export async function typeVersion(db:D1Database,typeId:string,version:number) {
 const v=await stmt(db,'SELECT * FROM s_matter_type_versions WHERE type_id=? AND version=?',typeId,version).first<Data>();
 return v?versionJson(v):null;
}
export async function matterTypes(db:D1Database) {
 const [types,versions]=await Promise.all([rows(db,'SELECT * FROM s_matter_types ORDER BY practice_code,lower(name),id'),rows(db,'SELECT * FROM s_matter_type_versions ORDER BY type_id,version')]);
 return {types:types.map(t=>{const own=versions.filter(v=>v.type_id===t.id).map(versionJson);return {id:t.id,name:t.name,practiceCode:t.practice_code,version:t.version,revision:t.revision,updatedBy:t.updated_by,updatedAt:t.updated_at,definition:own.find(v=>v.version===t.version)!.definition,versions:own};})};
}

// Until FIRM-008 custom roles exist, the principal acts for the firm administrator.
export async function saveMatterType(db:D1Database,actor:Actor,body:Data) {
 human(actor);need(actor,'owner');
 const existing=body.id?await stmt(db,'SELECT * FROM s_matter_types WHERE id=?',text(body.id,'Matter type',100)).first<Data>():null;
 insist(!body.id||existing,'Matter type not found',404);
 if(existing)insist(body.revision===existing.revision,'The matter type changed. Refresh before saving.',409);
 const name=plain(body.name,'Matter type name',120),practiceCode=text(body.practiceCode,'Practice area',6).toUpperCase();
 insist(await stmt(db,'SELECT 1 FROM s_practice_areas WHERE code=?',practiceCode).first(),'Choose a configured practice area');
 const def=definition(body.definition);
 insist(!(await stmt(db,'SELECT 1 FROM s_matter_types WHERE lower(name)=lower(?) AND id<>?',name,existing?.id??'').first()),'Another matter type has this name',409);
 const typeId=existing?.id??id(),version=(existing?.version??0)+1,revision=id(),at=now();
 await atomic(db,actor,[...(existing?[guard(db,'EXISTS(SELECT 1 FROM s_matter_types WHERE id=? AND revision=?)',typeId,existing.revision)]:[]),
  stmt(db,'INSERT INTO s_matter_types(id,practice_code,name,version,revision,updated_by,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET practice_code=excluded.practice_code,name=excluded.name,version=excluded.version,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at',typeId,practiceCode,name,version,revision,actor.email,at),
  stmt(db,'INSERT INTO s_matter_type_versions(type_id,version,practice_code,name,definition,created_by,created_at) VALUES(?,?,?,?,?,?,?)',typeId,version,practiceCode,name,JSON.stringify(def),actor.email,at),
  audit(db,actor,'matter.type_versioned',typeId,JSON.stringify({name,practiceCode,version,definition:def,previousVersion:existing?.version??null}))]);
 return matterTypes(db);
}
