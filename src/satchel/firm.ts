// FIRM-001: firm, offices, US contact details, practice areas, timezone, USD billing and fiscal settings.
import { atomic, audit, digest, Fault, human, id, insist, integer, need, now, rows, stmt, text, type Actor, type Data } from './model';
const format='satchel-firm-settings/1';
const states=new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP'.split(' '));
function zone(value:unknown,label:string){const v=text(value,label,64);let ok=v.includes('/');try{new Intl.DateTimeFormat('en-US',{timeZone:v});}catch{ok=false;}insist(ok,`${label} must be an IANA timezone such as America/New_York`);return v;}
function phone(value:unknown,label:string){const digits=text(value,label,40).replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');insist(/^[2-9]\d{2}[2-9]\d{6}$/.test(digits),`${label} must be a US phone number`);return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;}
function address(v:Data,label:string){
 const state=text(v?.state,label+' state',2).toUpperCase(),zip=text(v?.zip,label+' ZIP code',10);
 insist(states.has(state),`${label} state must be a US state or territory code`);insist(/^\d{5}(-\d{4})?$/.test(zip),`${label} ZIP code must be 12345 or 12345-6789`);
 return {line1:text(v?.line1,label+' street address',200),line2:typeof v?.line2==='string'?v.line2.trim().slice(0,200):'',city:text(v?.city,label+' city',100),state,zip};
}
function settings(body:Data){
 insist(body.currency===undefined||body.currency==='USD','Satchel bills in USD');
 const email=text(body.email,'Firm email',254).toLowerCase();insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Enter a valid firm email');
 const b=body.billing??{},f=body.fiscal??{};
 insist(f.basis==='cash'||f.basis==='accrual','Choose cash or accrual accounting');
 insist(Array.isArray(body.offices)&&body.offices.length>0&&body.offices.length<=50,'Add at least one office');
 insist(Array.isArray(body.practiceAreas)&&body.practiceAreas.length>0&&body.practiceAreas.length<=100,'Add at least one practice area');
 const offices=body.offices.map((o:Data,i:number)=>({name:text(o?.name,`Office ${i+1} name`,100),phone:phone(o?.phone,`Office ${i+1} phone`),timezone:zone(o?.timezone,`Office ${i+1} timezone`),address:address(o?.address,`Office ${i+1}`)}));
 const practiceAreas=body.practiceAreas.map((p:Data,i:number)=>{const code=text(p?.code,`Practice area ${i+1} code`,6).toUpperCase();insist(/^[A-Z0-9]{2,6}$/.test(code),'Practice area codes are 2–6 letters or digits');return {code,name:text(p?.name,`Practice area ${i+1} name`,100)};});
 insist(new Set(practiceAreas.map((p:Data)=>p.code)).size===practiceAreas.length,'Practice area codes must be unique');
 return {name:text(body.name,'Firm name',200),email,phone:phone(body.phone,'Firm phone'),address:address(body.address,'Firm'),timezone:zone(body.timezone,'Firm timezone'),currency:'USD',
  billing:{defaultRateCents:integer(b.defaultRateCents,'Default hourly rate (cents)',0,10000000),incrementMinutes:integer(b.incrementMinutes,'Billing increment (minutes)',1,60),paymentTermsDays:integer(b.paymentTermsDays,'Payment terms (days)',0,365)},
  fiscal:{yearStartMonth:integer(f.yearStartMonth,'Fiscal year start month',1,12),basis:f.basis},offices,practiceAreas};
}
export async function firmSettings(db:D1Database) {
 const [firm,offices,areas]=(await db.batch([stmt(db,'SELECT * FROM s_firm WHERE id=1'),stmt(db,'SELECT * FROM s_offices ORDER BY position'),stmt(db,'SELECT * FROM s_practice_areas ORDER BY position')])).map(r=>r.results as Data[]);
 const f=firm[0];if(!f)return {settings:null,revision:null};
 const place=(r:Data)=>({line1:r.line1,line2:r.line2,city:r.city,state:r.state,zip:r.zip});
 return {settings:{name:f.name,email:f.email,phone:f.phone,address:place(f),timezone:f.timezone,currency:f.currency,billing:{defaultRateCents:f.default_rate_cents,incrementMinutes:f.billing_increment_minutes,paymentTermsDays:f.payment_terms_days},fiscal:{yearStartMonth:f.fiscal_year_start_month,basis:f.accounting_basis},offices:offices.map(o=>({name:o.name,phone:o.phone,timezone:o.timezone,address:place(o)})),practiceAreas:areas.map(p=>({code:p.code,name:p.name}))},
  revision:f.revision,provenance:{source:f.source,name:f.source_name,digest:f.source_digest,by:f.updated_by,at:f.updated_at}};
}
async function write(db:D1Database,actor:Actor,body:Data,source:{source:'principal'|'import',name:string,digest:string}) {
 human(actor);need(actor,'owner');
 const s=settings(body.settings??{}),guard=id(),revision=id(),at=now(),expected=typeof body.revision==='string'?body.revision:null;
 await atomic(db,actor,[
  stmt(db,'INSERT INTO s_guard(id,ok) VALUES(?,CASE WHEN (SELECT revision FROM s_firm WHERE id=1) IS ? THEN 1 ELSE 0 END)',guard,expected),
  stmt(db,`INSERT INTO s_firm(id,name,email,phone,line1,line2,city,state,zip,timezone,currency,default_rate_cents,billing_increment_minutes,payment_terms_days,fiscal_year_start_month,accounting_basis,source,source_name,source_digest,revision,updated_by,updated_at) VALUES(1,?,?,?,?,?,?,?,?,?,'USD',?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,phone=excluded.phone,line1=excluded.line1,line2=excluded.line2,city=excluded.city,state=excluded.state,zip=excluded.zip,timezone=excluded.timezone,default_rate_cents=excluded.default_rate_cents,billing_increment_minutes=excluded.billing_increment_minutes,payment_terms_days=excluded.payment_terms_days,fiscal_year_start_month=excluded.fiscal_year_start_month,accounting_basis=excluded.accounting_basis,source=excluded.source,source_name=excluded.source_name,source_digest=excluded.source_digest,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
   s.name,s.email,s.phone,s.address.line1,s.address.line2,s.address.city,s.address.state,s.address.zip,s.timezone,s.billing.defaultRateCents,s.billing.incrementMinutes,s.billing.paymentTermsDays,s.fiscal.yearStartMonth,s.fiscal.basis,source.source,source.name,source.digest,revision,actor.email,at),
  stmt(db,'DELETE FROM s_offices'),stmt(db,'DELETE FROM s_practice_areas'),
  ...s.offices.map((o:Data,i:number)=>stmt(db,'INSERT INTO s_offices VALUES(?,?,?,?,?,?,?,?,?,?)',id(),i,o.name,o.phone,o.address.line1,o.address.line2,o.address.city,o.address.state,o.address.zip,o.timezone)),
  ...s.practiceAreas.map((p:Data,i:number)=>stmt(db,'INSERT INTO s_practice_areas VALUES(?,?,?)',p.code,i,p.name)),
  stmt(db,'DELETE FROM s_guard WHERE id=?',guard),
  audit(db,actor,source.source==='import'?'firm.settings_imported':'firm.settings_saved','firm',source.source==='import'?`${source.name} sha256 ${source.digest}`:revision),
 ]);
 return firmSettings(db);
}
export const saveFirm=(db:D1Database,actor:Actor,body:Data)=>write(db,actor,body,{source:'principal',name:'',digest:''});
export async function importFirm(db:D1Database,actor:Actor,body:Data) {
 const name=text(body.name,'Settings file name',200),content=text(body.content,'Settings file',200000);
 let file:Data;try{file=JSON.parse(content);}catch{throw new Fault('The settings file is not valid JSON');}
 insist(file?.format===format,`Choose a ${format} file exported from Satchel`);
 return write(db,actor,{revision:body.revision,settings:file.settings},{source:'import',name,digest:await digest(content)});
}
export async function exportFirm(db:D1Database,actor:Actor) {
 human(actor);need(actor,'owner');const current=await firmSettings(db);insist(current.settings,'Enter firm settings first',404);
 const artifact=JSON.stringify({format,exportedAt:now(),settings:current.settings},null,1),fence=id();await atomic(db,actor,[stmt(db,'INSERT INTO s_guard(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM s_firm WHERE revision=?) THEN 1 ELSE 0 END',fence,current.revision),audit(db,actor,'firm.settings_exported','firm',JSON.stringify({revision:current.revision,sha256:await digest(artifact)})),stmt(db,'DELETE FROM s_guard WHERE id=?',fence)]);
 return new Response(artifact,{headers:{'content-type':'application/json','content-disposition':'attachment; filename="satchel-firm-settings.json"','cache-control':'no-store'}});
}
