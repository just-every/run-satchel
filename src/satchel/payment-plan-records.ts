import {audit,human,id,insist,need,now,rows,stmt,type Actor,type Data} from './model';
import {paymentInvoice} from './invoice-payment';
import {guard} from './trust-guards';
import type {StripeEnv} from './stripe-api';

export function planStaff(actor:Actor){human(actor);need(actor,'owner');}
export async function planAccess(env:StripeEnv,actor:Actor,planId:string){
 const p=await stmt(env.DB,'SELECT p.*,b.matter_id FROM s_payment_plans p JOIN s_bills b ON b.id=p.bill_id WHERE p.id=?',planId).first<Data>();
 insist(p,'Payment plan not found',404);await paymentInvoice(env.DB,actor,p.bill_id);return p;
}
export const planCurrent=(db:D1Database,p:Data)=>guard(db,'EXISTS(SELECT 1 FROM s_payment_plans WHERE id=? AND revision=? AND status=?)',p.id,p.revision,p.status);
export function planEvent(db:D1Database,p:Data,kind:string,detail:string,actor:string,taskId:string|null=null){
 return stmt(db,'INSERT INTO s_payment_plan_events VALUES(?,?,?,?,?,?,?,?)',id(),p.id,p.revision,kind,detail,actor,now(),taskId);
}
export async function planView(env:StripeEnv,p:Data){
 const version=await stmt(env.DB,'SELECT * FROM s_payment_plan_versions WHERE id=?',p.revision).first<Data>();
 const installments=await rows(env.DB,`SELECT i.*,a.checkout_id,c.status,c.payment_intent_id FROM s_payment_plan_installments i LEFT JOIN s_payment_plan_attempts a ON a.installment_id=i.id LEFT JOIN s_stripe_checkouts c ON c.id=a.checkout_id WHERE i.plan_id=? AND i.revision=? ORDER BY i.position`,p.id,p.revision);
 const consent=await stmt(env.DB,'SELECT id,client_email,granted_at,revision FROM s_payment_plan_consents WHERE plan_id=? AND revision=?',p.id,p.revision).first<Data>();
 return {...p,version,installments,consent,events:await rows(env.DB,'SELECT * FROM s_payment_plan_events WHERE plan_id=? ORDER BY at,id',p.id),history:await rows(env.DB,'SELECT * FROM s_payment_plan_versions WHERE plan_id=? ORDER BY approved_at,id',p.id)};
}
export function stopPlanWrites(db:D1Database,p:Data,reason:string,actor:string){
 const taskId=id(),at=now();
 return [planCurrent(db,p),stmt(db,"UPDATE s_payment_plans SET status='stopped',stop_reason=? WHERE id=?",reason,p.id),
 stmt(db,"INSERT INTO s_tasks(id,matter_id,title,priority,owner_email,recurrence,series_id,status,revision,created_by,created_at) VALUES(?,?,?,'high',?,'none',?,'open',?,?,?)",taskId,p.matter_id,'Review stopped payment plan: '+reason,p.approved_by,taskId,id(),actor,at),
 planEvent(db,p,'stopped',reason,actor,taskId),audit(db,{id:actor,email:actor,role:'system',channel:'automation'},'payment_plan.stopped',p.id,reason,{matterId:p.matter_id})];
}
export async function stopPlan(env:StripeEnv,p:Data,reason:string,actor:string){
 if(p.status==='stopped')return;
 try{await env.DB.batch(stopPlanWrites(env.DB,p,reason,actor));}catch(error){const current=await stmt(env.DB,'SELECT status,revision FROM s_payment_plans WHERE id=?',p.id).first<Data>();if(current?.status==='stopped'||current?.revision!==p.revision)return;throw error;}
}
export async function syncPaymentPlanAttempt(env:StripeEnv,checkoutId:string){
 const p=await stmt(env.DB,`SELECT p.*,b.matter_id FROM s_payment_plans p JOIN s_bills b ON b.id=p.bill_id JOIN s_payment_plan_installments i ON i.plan_id=p.id JOIN s_payment_plan_attempts a ON a.installment_id=i.id WHERE a.checkout_id=?`,checkoutId).first<Data>();
 if(!p)return;
 const attempts=await rows(env.DB,`SELECT c.status,(SELECT COUNT(*) FROM s_stripe_adjustments x WHERE x.checkout_id=c.id) adjusted FROM s_payment_plan_attempts a JOIN s_payment_plan_installments i ON i.id=a.installment_id JOIN s_stripe_checkouts c ON c.id=a.checkout_id WHERE i.plan_id=? AND (i.revision=? OR c.status='returned')`,p.id,p.revision);
 if(attempts.some(a=>a.adjusted>0||['failed','returned','expired','uncertain'].includes(a.status))){await stopPlan(env,p,'A collection failed, was returned, disputed or needs reconciliation','payment-plan-scheduler');return;}
 if(p.status!=='active')return;
 const unpaid=await stmt(env.DB,`SELECT 1 FROM s_payment_plan_installments i LEFT JOIN s_payment_plan_attempts a ON a.installment_id=i.id LEFT JOIN s_stripe_checkouts c ON c.id=a.checkout_id WHERE i.plan_id=? AND i.revision=? AND (c.status IS NULL OR c.status<>'paid') LIMIT 1`,p.id,p.revision).first();
 if(!unpaid)await env.DB.batch([planCurrent(env.DB,p),stmt(env.DB,"UPDATE s_payment_plans SET status='completed' WHERE id=?",p.id),planEvent(env.DB,p,'completed','All current installments reconciled as paid','payment-plan-scheduler')]);
}
