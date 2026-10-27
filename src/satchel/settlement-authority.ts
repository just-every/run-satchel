import {atomic,audit,authority,human,insist,matter,need,rows,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {trustOfficer,officerGuard} from './trust';
import {gateGrants} from './role-areas';
import {parseGrants} from './custom-roles';
import {currentSettlementPolicy,settlementPolicyGuard} from './settlement-policy';
export const settlementLiveGuard=(db:D1Database,m:string)=>guard(db,"NOT EXISTS(SELECT 1 FROM s_settlement_erasures WHERE matter_id=?) AND EXISTS(SELECT 1 FROM s_matters WHERE id=? AND lifecycle_status<>'closed')",m,m);
export const settlementVersionGuard=(db:D1Database,table:string,m:string,v:number)=>guard(db,`COALESCE((SELECT MAX(version) FROM ${table} WHERE matter_id=?),0)=?`,m,v);
export async function currentSettlement(db:D1Database,a:Actor,m:string,statementId:string){
 human(a);need(a,'owner','lawyer','trust_officer');const current=await matter(db,a,m);
 insist(current.lifecycle_status!=='closed','Reopen the matter before a settlement final action',409);
 insist(!await stmt(db,'SELECT 1 FROM s_settlement_erasures WHERE matter_id=?',m).first(),'Settlement evidence was erased',409);
 const s=await stmt(db,'SELECT * FROM s_settlement_statements WHERE matter_id=? ORDER BY version DESC LIMIT 1',m).first<Data>();
 insist(s&&s.id===statementId,'Review the current exact settlement revision',409);
 const terms=await stmt(db,'SELECT id,version FROM s_contingency_terms WHERE matter_id=? ORDER BY version DESC LIMIT 1',m).first<Data>();
 insist(terms&&terms.id===s.terms_id,'The contingency terms changed; prepare a new statement',409);
 return {statement:{...s,snapshot:JSON.parse(s.snapshot)} as Data,guards:[accessGuard(db,a,m),settlementLiveGuard(db,m),settlementVersionGuard(db,'s_settlement_statements',m,s.version),settlementVersionGuard(db,'s_contingency_terms',m,terms.version)]};
}
async function approver(db:D1Database,a:Actor,m:string,p:Data){
 const member=await stmt(db,`SELECT o.id,o.email,CASE WHEN o.role='owner' THEN 'owner' ELSE member.role END role,member.role designated_role,member.custom_role_id,r.permissions FROM oa_operators o LEFT JOIN s_members member ON member.email=o.email AND member.active=1 LEFT JOIN s_custom_roles r ON r.id=member.custom_role_id WHERE o.email=? AND o.status='active'`,p.actor).first<Data>();
 insist(member&&(p.capacity==='counsel'?['owner','lawyer'].includes(member.role):member.designated_role==='trust_officer'),'Current counsel and designated finance authority are required',409);
 const person:Actor={...a,id:member.id,email:member.email,role:member.role,channel:'person',grants:parseGrants(member.permissions)};
 gateGrants(person,'POST','/matters/'+m+'/settlements/approve');await matter(db,person,m);
 const auth=authority(person);
 return [guard(db,auth.sql,...auth.params),accessGuard(db,person,m),...(p.capacity==='finance'?[officerGuard(db,person)]:[]),guard(db,"EXISTS(SELECT 1 FROM oa_operators o LEFT JOIN s_members member ON member.email=o.email AND member.active=1 LEFT JOIN s_custom_roles r ON r.id=member.custom_role_id WHERE o.email=? AND o.status='active' AND (CASE WHEN o.role='owner' THEN 'owner' ELSE member.role END)=? AND member.custom_role_id IS ? AND r.permissions IS ?)",person.email,person.role,member.custom_role_id??null,member.permissions??null)];
}
export async function approvedSettlement(db:D1Database,a:Actor,m:string,statementId:string){
 const result=await currentSettlement(db,a,m,statementId),p=await currentSettlementPolicy(db);
 const approvals=await rows(db,'SELECT * FROM s_settlement_approvals WHERE statement_id=? AND authority_epoch=? AND policy_version=?',statementId,p.epoch,p.version);
 insist(approvals.length===2&&approvals.some(r=>r.capacity==='counsel')&&approvals.some(r=>r.capacity==='finance'),'Current counsel and authorized finance approvals are required',409);
 insist(p.solePractitionerEnabled||new Set(approvals.map(r=>r.actor)).size===2,'Separate counsel and finance people are required without the recorded sole-practitioner setting',409);
 for(const approval of approvals)result.guards.push(...await approver(db,a,m,approval));
 result.guards.push(settlementPolicyGuard(db,p.version,p.epoch));return result;
}
export async function approveSettlement(db:D1Database,a:Actor,m:string,b:Data){
 const {statement:s,guards}=await currentSettlement(db,a,m,text(b.statementId,'Exact settlement statement')),p=await currentSettlementPolicy(db);
 insist(['counsel','finance'].includes(b.capacity),'Choose counsel or finance approval');if(b.capacity==='counsel')need(a,'owner','lawyer');else await trustOfficer(db,a);
 const approvals=await rows(db,'SELECT * FROM s_settlement_approvals WHERE statement_id=? AND authority_epoch=? AND policy_version=?',s.id,p.epoch,p.version);
 insist(p.solePractitionerEnabled||!approvals.some(r=>r.actor===a.email&&r.capacity!==b.capacity),'Counsel and finance approvals require different people',403);
 const note=text(b.note,'Exact revision approval evidence',2000),existing=approvals.find(r=>r.capacity===b.capacity);
 if(existing){insist(existing.actor===a.email&&existing.note===note,'This capacity already approved this revision',409);return existing;}
 await atomic(db,a,[...guards,settlementPolicyGuard(db,p.version,p.epoch),...(b.capacity==='finance'?[officerGuard(db,a)]:[]),...(p.solePractitionerEnabled?[]:[guard(db,'NOT EXISTS(SELECT 1 FROM s_settlement_approvals WHERE statement_id=? AND actor=? AND capacity<>? AND authority_epoch=? AND policy_version=?)',s.id,a.email,b.capacity,p.epoch,p.version)]),stmt(db,'INSERT INTO s_settlement_approvals VALUES(?,?,?,?,?,?,?)',s.id,b.capacity,a.email,note,new Date().toISOString(),p.epoch,p.version),audit(db,a,'settlement.approved',s.id,'',{matterId:m,version:s.version,capacity:b.capacity,policyVersion:p.version})]);
 return {statementId:s.id,capacity:b.capacity};
}
