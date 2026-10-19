// TIME-007: the firm's UTBMS task/activity/expense code sets and LEDES timekeeper IDs.
// With no configured code of a kind, TIME-001's format check is the whole rule; once a
// kind has codes, every entry, draft and bill coding must use an active one.
import {atomic,audit,human,insist,need,now,rows,stmt,text,type Actor,type Data} from './model';

const shapes:Record<string,[RegExp,string]>={task:[/^[A-Z]\d{3}$/,'L110'],activity:[/^A\d{3}$/,'A101'],expense:[/^E\d{3}$/,'E101']};
const labels:Record<string,string>={task:'UTBMS task code',activity:'UTBMS activity code',expense:'UTBMS expense code'};
export const classifications=['PT','AS','OC','PL','LA','OT'];
export type Coding={task:string|null;activity:string|null;expense:string|null};

export function codeFormat(kind:string,value:unknown) {
 if(value===undefined||value===null||value==='')return null;
 const [pattern,example]=shapes[kind],v=text(value,labels[kind],8).toUpperCase();
 insist(pattern.test(v),`${labels[kind]} must look like ${example}`);return v;
}
export const utbmsTask=(v:unknown)=>codeFormat('task',v),utbmsActivity=(v:unknown)=>codeFormat('activity',v),utbmsExpense=(v:unknown)=>codeFormat('expense',v);

// Returns the reason each present code is not in the firm's active set (empty when all conform).
export async function codeProblems(db:D1Database,coding:Coding) {
 const configured=await rows(db,'SELECT kind,code,active FROM s_utbms_codes');
 return (['task','activity','expense'] as const).flatMap(kind=>{
  const value=coding[kind],set=configured.filter(c=>c.kind===kind);
  return value&&set.length&&!set.some(c=>c.code===value&&c.active===1)?[`${labels[kind]} ${value} is not in the firm's active code set`]:[];
 });
}
export async function checkCodes(db:D1Database,coding:Coding) {
 const problems=await codeProblems(db,coding);insist(!problems.length,problems.join('; '));
}

export async function ledesSettings(db:D1Database) {
 const [codes,timekeepers]=await Promise.all([rows(db,'SELECT * FROM s_utbms_codes ORDER BY kind,code'),rows(db,'SELECT * FROM s_ledes_timekeepers ORDER BY timekeeper_id')]);
 return {codes:codes.map(c=>({kind:c.kind,code:c.code,label:c.label,active:c.active===1,updatedBy:c.updated_by,updatedAt:c.updated_at})),
  timekeepers:timekeepers.map(t=>({email:t.email,timekeeperId:t.timekeeper_id,name:t.name,classification:t.classification}))};
}

// Until FIRM-002 adds billing staff, the principal configures code sets and timekeeper IDs.
export async function saveCode(db:D1Database,actor:Actor,body:Data) {
 human(actor);need(actor,'owner');
 insist(['task','activity','expense'].includes(body.kind),'Choose a task, activity or expense code');
 insist(body.active===undefined||typeof body.active==='boolean','Say whether the code is active');
 const code=codeFormat(body.kind,body.code)!,label=text(body.label,'Code label',200),active=body.active===false?0:1,at=now();
 await atomic(db,actor,[stmt(db,'INSERT INTO s_utbms_codes(kind,code,label,active,updated_by,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(kind,code) DO UPDATE SET label=excluded.label,active=excluded.active,updated_by=excluded.updated_by,updated_at=excluded.updated_at',body.kind,code,label,active,actor.email,at),
  audit(db,actor,active?'utbms.code.saved':'utbms.code.retired',`${body.kind}:${code}`,label)]);
 return ledesSettings(db);
}

export async function saveTimekeeper(db:D1Database,actor:Actor,body:Data) {
 human(actor);need(actor,'owner');
 const email=text(body.email,'Timekeeper email',320).toLowerCase(),timekeeperId=text(body.timekeeperId,'LEDES timekeeper ID',20);
 insist(/^[A-Za-z0-9._-]+$/.test(timekeeperId),'LEDES timekeeper ID may use letters, digits, dot, dash and underscore');
 insist(classifications.includes(body.classification),`Choose a LEDES classification (${classifications.join(', ')})`);
 const name=text(body.name,'Timekeeper name',100);insist(!/[|]|\[\]/.test(name),'LEDES fields cannot contain | or []');
 insist(await stmt(db,"SELECT 1 FROM s_members WHERE email=? UNION SELECT 1 FROM oa_operators WHERE lower(email)=? AND role='owner'",email,email).first(),'Choose a timekeeper on the firm team');
 await atomic(db,actor,[stmt(db,'INSERT INTO s_ledes_timekeepers(email,timekeeper_id,name,classification,updated_by,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET timekeeper_id=excluded.timekeeper_id,name=excluded.name,classification=excluded.classification,updated_by=excluded.updated_by,updated_at=excluded.updated_at',email,timekeeperId,name,body.classification,actor.email,now()),
  audit(db,actor,'ledes.timekeeper.saved',email,JSON.stringify({timekeeperId,classification:body.classification}))]);
 return ledesSettings(db);
}
