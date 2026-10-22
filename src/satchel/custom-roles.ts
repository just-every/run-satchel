import {atomic,audit,human,id,insist,need,now,rows,stmt,text,type Actor,type Data} from './model';
// FIRM-008: per-area ceilings the principal assigns to a member beside their built-in role.
export const areaLevels={rates:['none','own','all'],bank:['none','balances','full'],reports:['none','own','firm'],contacts:['none','read','write'],documents:['none','read','write'],billing:['none','read','write'],settings:['none','read','write']} as const;
export type Area=keyof typeof areaLevels;
export type Grants={[K in Area]:(typeof areaLevels)[K][number]};
export const areaNames=Object.keys(areaLevels) as Area[];
export function parseGrants(raw:string|null|undefined):Grants|undefined{return raw?JSON.parse(raw) as Grants:undefined;}
// Legal approval and trust authorization stay with lawyers and trust officers: a role may mention them only to refuse them.
const forbidden=['trustAuthorization','legalApproval'];
export function validPermissions(value:unknown):Grants{
 insist(value&&typeof value==='object'&&!Array.isArray(value),'Choose a level for every area');
 const input=value as Data;
 for(const key of forbidden)insist(input[key]===undefined||input[key]===false,'A custom role cannot grant trust authorization or legal approval; they stay with trust officers and lawyers',422);
 for(const key of Object.keys(input))insist(areaNames.includes(key as Area)||forbidden.includes(key),'Unknown permission area: '+key.slice(0,40));
 const grants={} as Data;
 for(const area of areaNames){insist((areaLevels[area] as readonly string[]).includes(input[area]),`Choose ${areaLevels[area].join(', ')} for ${area}`);grants[area]=input[area];}
 return grants as Grants;
}
const roleJson=(r:Data,members:string[])=>({id:r.id,name:r.name,permissions:JSON.parse(r.permissions),revision:r.revision,updatedBy:r.updated_by,updatedAt:r.updated_at,members});
export async function rolesState(db:D1Database,actor:Actor){
 human(actor);need(actor,'owner');
 const [roles,members]=await Promise.all([rows(db,'SELECT * FROM s_custom_roles ORDER BY name,id'),rows(db,'SELECT email,custom_role_id FROM s_members WHERE custom_role_id IS NOT NULL AND active=1')]);
 return {areas:areaLevels,roles:roles.map(r=>roleJson(r,members.filter(m=>m.custom_role_id===r.id).map(m=>m.email)))};
}
export async function saveRole(db:D1Database,actor:Actor,body:Data){
 human(actor);need(actor,'owner');
 const name=text(body.name,'Role name',60),permissions=validPermissions(body.permissions),reason=text(body.reason,'Reason for this role',1000);
 const prior=body.id===undefined?null:await stmt(db,'SELECT * FROM s_custom_roles WHERE id=?',text(body.id,'Role',100)).first<Data>();
 insist(body.id===undefined||prior,'Custom role not found',404);
 const roleId=prior?.id??id(),at=now();
 if(prior)insist(body.revision===prior.revision,'The role changed. Review its current permissions first.',409);
 const detail=JSON.stringify({name,permissions,reason,previous:prior?{name:prior.name,permissions:JSON.parse(prior.permissions),revision:prior.revision}:null});
 await atomic(db,actor,[
  ...(prior?[stmt(db,'UPDATE s_custom_roles SET name=?,permissions=?,revision=revision+1,updated_by=?,updated_at=? WHERE id=? AND revision=?',name,JSON.stringify(permissions),actor.email,at,prior.id,prior.revision),stmt(db,'INSERT INTO s_guard(id,ok) SELECT ?,0 WHERE NOT EXISTS(SELECT 1 FROM s_custom_roles WHERE id=? AND revision=?)',id(),prior.id,prior.revision+1)]
   :[stmt(db,'INSERT INTO s_custom_roles(id,name,permissions,revision,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,1,?,?,?,?)',roleId,name,JSON.stringify(permissions),actor.email,at,actor.email,at)]),
  audit(db,actor,'role.saved',roleId,detail)]);
 return (await rolesState(db,actor)).roles.find(r=>r.id===roleId);
}
