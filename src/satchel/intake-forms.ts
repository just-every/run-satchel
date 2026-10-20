import {atomic,audit,human,id,insist,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {guard} from './trust-guards';
import {leadPractice} from './leads';

export type IntakeQuestion={key:string;label:string;type:'text'|'select'|'date'|'yesno';required:boolean;options?:string[];when?:{key:string;equals:string}};
export const activeIntakeAssigneeSql="(EXISTS(SELECT 1 FROM s_members WHERE email=? AND active=1 AND role IN('lawyer','assistant')) OR EXISTS(SELECT 1 FROM oa_operators WHERE lower(email)=? AND role='owner' AND status='active'))";
function questions(value:unknown):IntakeQuestion[] {
 insist(Array.isArray(value)&&value.length<=30,'Use at most 30 questions');
 const out:IntakeQuestion[]=[];
 for(const raw of value){
  insist(raw&&typeof raw==='object'&&!Array.isArray(raw),'Use valid questions');
  const key=text(raw.key,'Question key',60),label=text(raw.label,'Question label',300);
  insist(/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)&&!out.some(q=>q.key===key),'Question keys must be unique identifiers');
  insist(['text','select','date','yesno'].includes(raw.type)&&typeof raw.required==='boolean','Choose a question type and required setting');
  const q:IntakeQuestion={key,label,type:raw.type,required:raw.required};
  if(q.type==='select'){
   insist(Array.isArray(raw.options)&&raw.options.length>=1&&raw.options.length<=30,'A select needs 1–30 options');
   q.options=raw.options.map((o:unknown)=>text(o,'Option',200));
   insist(new Set(q.options).size===q.options!.length,'Select options must be unique');
  }else insist(raw.options===undefined,'Only select questions have options');
  if(raw.when!==undefined){
   insist(raw.when&&typeof raw.when==='object'&&!Array.isArray(raw.when),'Use one visibility condition');
   const dependency=out.find(p=>p.key===raw.when.key),equals=text(raw.when.equals,'Condition value',200);
   insist(dependency&&['select','yesno'].includes(dependency.type),'Conditions must refer to an earlier select or yes/no question');
   insist((dependency.type==='yesno'?['yes','no']:dependency.options!).includes(equals),'Condition must match an available answer');
   q.when={key:dependency.key,equals};
  }
  out.push(q);
 }
 return out;
}
export function intakeFormJson(row:Data){return {...JSON.parse(row.snapshot),id:row.id,revision:row.revision,version:row.version,published:Boolean(row.published),updatedAt:row.updated_at};}
export async function listIntakeForms(db:D1Database,actor:Actor){
 human(actor);need(actor,'owner','lawyer');
 return {forms:(await rows(db,'SELECT * FROM s_intake_forms ORDER BY updated_at DESC,id')).map(intakeFormJson)};
}
export async function saveIntakeForm(db:D1Database,actor:Actor,body:Data){
 human(actor);need(actor,'owner','lawyer');
 const previous=body.id?await stmt(db,'SELECT * FROM s_intake_forms WHERE id=?',text(body.id,'Form',100)).first<Data>():null;
 insist(!body.id||previous,'Form not found',404);
 if(previous)insist(body.revision===previous.revision,'The form changed. Refresh before saving.',409);
 insist(typeof body.published==='boolean','Choose whether the form is published');
 const assignedEmail=text(body.assignedEmail,'Publication assignee',254).toLowerCase();
 insist(await stmt(db,`SELECT 1 WHERE ${activeIntakeAssigneeSql}`,assignedEmail,assignedEmail).first(),'Choose an active lawyer, assistant or principal');
 const snapshot={title:text(body.title,'Form title',160),practice:text(body.practice,'Practice',160),practiceCode:await leadPractice(db,body.practiceCode),firmName:text(body.firmName,'Firm name',160),logoDataUrl:body.logoDataUrl??'',assignedEmail,consentText:text(body.consentText,'Review consent',2000),questions:questions(body.questions)};
 insist(typeof snapshot.logoDataUrl==='string'&&snapshot.logoDataUrl.length<=300000&&(!snapshot.logoDataUrl||/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(snapshot.logoDataUrl)),'Use a PNG or JPEG logo up to 300,000 encoded characters');
 const formId=previous?.id??id(),revision=id(),version=(previous?.version??0)+1,at=now(),encoded=JSON.stringify(snapshot);
 await atomic(db,actor,[guard(db,activeIntakeAssigneeSql,assignedEmail,assignedEmail),...(previous?[guard(db,'EXISTS(SELECT 1 FROM s_intake_forms WHERE id=? AND revision=?)',formId,previous.revision)]:[]),
  stmt(db,'INSERT INTO s_intake_forms(id,revision,version,published,assigned_email,snapshot,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,version=excluded.version,published=excluded.published,assigned_email=excluded.assigned_email,snapshot=excluded.snapshot,updated_by=excluded.updated_by,updated_at=excluded.updated_at',formId,revision,version,body.published?1:0,assignedEmail,encoded,actor.email,at),
  stmt(db,'INSERT INTO s_intake_form_versions(form_id,version,revision,snapshot,created_by,created_at) VALUES(?,?,?,?,?,?)',formId,version,revision,encoded,actor.email,at),
  audit(db,actor,'intake.form_saved',formId,JSON.stringify({revision,version,published:body.published,snapshot,previousRevision:previous?.revision??null}))]);
 return {...snapshot,id:formId,revision,version,published:body.published,updatedAt:at};
}
