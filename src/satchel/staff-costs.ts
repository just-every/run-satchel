import {atomic,audit,date,human,id,insist,integer,need,now,rows,stmt,text,type Actor,type Data} from './model';
import {guard} from './trust-guards';
import {requireArea} from './role-areas';

export function economicsPrincipal(actor:Actor){human(actor);need(actor,'owner');requireArea(actor,'reports','firm');requireArea(actor,'rates','all');requireArea(actor,'bank','full');}
const staff="EXISTS(SELECT 1 FROM oa_operators o WHERE o.email=? AND o.status='active' AND (o.role='owner' OR EXISTS(SELECT 1 FROM s_members m WHERE m.email=o.email AND m.active=1 AND m.role<>'client')))";
const activeSlot="NOT EXISTS(SELECT 1 FROM s_approved_staff_cost_rates WHERE email=? AND effective_from=? AND id<>COALESCE(?,''))";
function value(actor:Actor,b:Data){return {id:id(),email:text(b.email,'Staff email',254).toLowerCase(),effective_from:date(b.effectiveFrom),hourly_cents:integer(b.hourlyCents,'Hourly staff cost in USD cents',0,100000000),reason:text(b.reason,'Cost basis and approval reason',2000),supersedes_id:b.supersedesId==null?null:text(b.supersedesId,'Superseded approved revision',100),created_by:actor.email,created_at:now()};}
function insert(db:D1Database,r:Data){return stmt(db,'INSERT INTO s_staff_cost_revisions VALUES(?,?,?,?,?,?,?,?)',r.id,r.email,r.effective_from,r.hourly_cents,r.reason,r.supersedes_id,r.created_by,r.created_at);}
async function approvalGuards(db:D1Database,r:Data){
 insist((await stmt(db,'SELECT '+staff+' ok',r.email).first<Data>())?.ok,'Choose active staff');
 const predecessor="EXISTS(SELECT 1 FROM s_approved_staff_cost_rates WHERE id=? AND email=? AND effective_from=?)";
 if(r.supersedes_id)insist((await stmt(db,'SELECT '+predecessor+' ok',r.supersedes_id,r.email,r.effective_from).first<Data>())?.ok,'Supersede the current approved revision for the same staff member and effective date',409);
 insist((await stmt(db,'SELECT '+activeSlot+' ok',r.email,r.effective_from,r.supersedes_id).first<Data>())?.ok,'An approved cost already covers this effective date; name its exact revision to supersede it',409);
 return [guard(db,staff,r.email),guard(db,activeSlot,r.email,r.effective_from,r.supersedes_id),...(r.supersedes_id?[guard(db,predecessor,r.supersedes_id,r.email,r.effective_from)]:[])];
}
function result(r:Data,a?:Data){return {id:r.id,revision:r.id,email:r.email,effectiveFrom:r.effective_from,hourlyCents:r.hourly_cents,reason:r.reason,supersedesId:r.supersedes_id??null,createdBy:r.created_by,createdAt:r.created_at,approvedBy:a?.approved_by??null,approvedAt:a?.approved_at??null};}
export async function saveStaffCost(db:D1Database,actor:Actor,b:Data){
 economicsPrincipal(actor);const r=value(actor,b);
 insist((await stmt(db,'SELECT '+staff+' ok',r.email).first<Data>())?.ok,'Choose active staff');
 await atomic(db,actor,[guard(db,staff,r.email),insert(db,r),audit(db,actor,'report.staff_cost_saved',r.id,'Saved exact cost revision',{revision:r.id})]);return result(r);
}
export async function approveSavedStaffCost(db:D1Database,actor:Actor,costId:string,b:Data){
 economicsPrincipal(actor);insist(b.confirmed===true,'Approve this exact staff cost rate');
 const r=await stmt(db,'SELECT * FROM s_staff_cost_revisions WHERE id=?',costId).first<Data>();insist(r,'Cost revision not found',404);
 insist(b.revision===r.id,'Review the exact saved cost revision',409);
 const previous=await stmt(db,'SELECT * FROM s_staff_cost_approvals WHERE revision_id=?',r.id).first<Data>();if(previous)return result(r,previous);
 const guards=await approvalGuards(db,r),a={approved_by:actor.email,approved_at:now()};
 await atomic(db,actor,[...guards,stmt(db,'INSERT INTO s_staff_cost_approvals VALUES(?,?,?)',r.id,a.approved_by,a.approved_at),audit(db,actor,'report.staff_cost_approved',r.id,'Approved exact saved cost revision',{revision:r.id,supersedesId:r.supersedes_id})]);return result(r,a);
}
// The existing one-request door explicitly saves and approves the submitted revision atomically.
export async function approveStaffCost(db:D1Database,actor:Actor,b:Data){
 economicsPrincipal(actor);insist(b.confirmed===true,'Approve this exact staff cost rate');const r=value(actor,b),guards=await approvalGuards(db,r),a={approved_by:actor.email,approved_at:now()};
 await atomic(db,actor,[...guards,insert(db,r),audit(db,actor,'report.staff_cost_saved',r.id,'Saved exact cost revision',{revision:r.id}),stmt(db,'INSERT INTO s_staff_cost_approvals VALUES(?,?,?)',r.id,a.approved_by,a.approved_at),audit(db,actor,'report.staff_cost_approved',r.id,'Approved exact submitted cost revision',{revision:r.id,supersedesId:r.supersedes_id})]);return result(r,a);
}
export async function staffCosts(db:D1Database,actor:Actor){
 economicsPrincipal(actor);return {approved:await rows(db,'SELECT * FROM s_approved_staff_cost_rates ORDER BY email,effective_from,id'),revisions:await rows(db,'SELECT r.*,a.approved_by,a.approved_at FROM s_staff_cost_revisions r LEFT JOIN s_staff_cost_approvals a ON a.revision_id=r.id ORDER BY r.created_at,r.id')};
}
