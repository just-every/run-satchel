import {atomic,audit,human,id,insist,integer,now,stmt,text,type Actor,type Data} from './model';
import {accessGuard,guard} from './trust-guards';
import {operatingAttempt,reconciliationState} from './stripe-reconciliation';
import {stripeApi,type StripeEnv} from './stripe-api';
// Approval is persisted before the network call. Lost acknowledgments never cause
// an automatic retry; authenticated provider events reconcile the original charge.
export async function approveRefund(env:StripeEnv,actor:Actor,attemptId:string,b:Data){
 human(actor);const {attempt,bill}=await operatingAttempt(env,actor,attemptId);
 const requestKey=text(b.requestKey,'Refund decision identity',100),reason=text(b.reason,'Finance approval reason',1000),cents=integer(b.cents,'Refund in USD cents',1);
 insist(b.confirmed===true&&b.revision===bill.revision,'Approve the exact current invoice revision and refund',409);
 const prior=await stmt(env.DB,'SELECT * FROM s_stripe_refund_requests WHERE request_key=?',requestKey).first<Data>();
 if(prior){insist(prior.checkout_id===attemptId&&prior.cents===cents&&prior.reason===reason&&prior.bill_revision===b.revision,'This decision identity belongs to a different refund',409);return reconciliationState(env,actor,bill.id);}
 insist(attempt.status==='paid'&&attempt.payment_intent_id,'Only a confirmed operating collection can be refunded',409);
 const refundId=id(),at=now();
 await atomic(env.DB,actor,[accessGuard(env.DB,actor,bill.matter_id),guard(env.DB,"EXISTS(SELECT 1 FROM s_bills WHERE id=? AND revision=? AND status<>'void')",bill.id,b.revision),guard(env.DB,`EXISTS(SELECT 1 FROM s_stripe_checkouts c WHERE c.id=? AND c.status='paid' AND c.cents-MAX(COALESCE((SELECT SUM(a.cents) FROM s_stripe_adjustments a WHERE a.checkout_id=c.id),0),COALESCE((SELECT SUM(r.cents) FROM s_stripe_refund_requests r WHERE r.checkout_id=c.id),0))>=?)`,attemptId,cents),stmt(env.DB,'INSERT INTO s_stripe_refund_requests VALUES(?,?,?,?,?,?,?,?)',refundId,requestKey,attemptId,b.revision,cents,reason,actor.email,at),audit(env.DB,actor,'stripe.refund_approved',refundId,JSON.stringify({checkoutId:attemptId,billId:bill.id,revision:b.revision,cents,reason}),{matterId:bill.matter_id})]);
 let result:Data;
 try{result=await stripeApi(env,'/refunds',new URLSearchParams({payment_intent:attempt.payment_intent_id,amount:String(cents),'metadata[satchel_refund]':refundId}),'satchel-refund-'+refundId);insist(result.payment_intent===attempt.payment_intent_id&&result.amount===cents&&result.currency==='usd','Provider refund allocation mismatch',502);}
 catch{await env.DB.batch([stmt(env.DB,"INSERT INTO s_stripe_refund_outcomes VALUES(?,NULL,'uncertain',?)",refundId,now()),audit(env.DB,actor,'stripe.refund_uncertain',refundId,'Reconcile the provider before any further refund',{matterId:bill.matter_id})]);return reconciliationState(env,actor,bill.id);}
 await env.DB.batch([stmt(env.DB,'INSERT INTO s_stripe_refund_outcomes VALUES(?,?,?,?)',refundId,result.id,result.status,now()),audit(env.DB,actor,'stripe.refund_acknowledged',refundId,JSON.stringify({providerId:result.id,status:result.status}),{matterId:bill.matter_id})]);
 // A refund response alone does not rewrite the paid allocation. A verified
 // event or a separate charge readback appends the processor correction.
 return reconciliationState(env,actor,bill.id);
}
