import {atomic,audit,human,id,insist,now,stmt,text,type Actor,type Data} from './model';
import {paymentAccess} from './invoice-payment';
import {guard} from './trust-guards';
import {requireProviderReview} from './providers';
import {paymentPath,stripeApi,type StripeEnv} from './stripe-api';
import {planAccess,planCurrent,planEvent,planView} from './payment-plan-records';

function clientConsent(actor:Actor,b:Data){human(actor);insist(actor.role==='client','The client must authorize the mandate in their own session',403);insist(b.agree===true,'Explicit agreement to these exact installments and future collections is required');}
export async function planStripeConfig(env:StripeEnv){
 await requireProviderReview(env.DB,'stripe');
 insist(env.STRIPE_MODE!=='live','Payment plans are available only in the Stripe test environment',409);
 const config=await stmt(env.DB,"SELECT * FROM s_stripe_config WHERE kind='operating' ORDER BY approved_at DESC,id DESC LIMIT 1").first<Data>();
 insist(config?.mode==='test','The principal must approve Stripe operating collection in the test environment',409);
 const account=await stripeApi(env,'/account');insist(account.id===config.account_id,'Stripe account changed; obtain a new collection approval',409);return config;
}
export async function startPlanMandate(env:StripeEnv,actor:Actor,planId:string,b:Data){
 clientConsent(actor,b);const p=await planAccess(env,actor,planId);
 insist(p.status==='paused'&&b.revision===p.revision,'The principal must approve the current paused plan before client authorization',409);
 const key=text(b.requestKey,'Authorization request reference',100),request=JSON.stringify({planId,revision:p.revision,client:actor.email,agree:true});
 const prior=await stmt(env.DB,'SELECT * FROM s_payment_plan_setups WHERE request_key=?',key).first<Data>();
 if(prior){insist(prior.request_json===request,'This authorization reference belongs to a different decision',409);return setupResult(env,prior);}
 const config=await planStripeConfig(env),setupId=id(),at=now();
 await atomic(env.DB,actor,[paymentAccess(env.DB,actor,p.matter_id),planCurrent(env.DB,p),stmt(env.DB,"INSERT INTO s_payment_plan_setups VALUES(?,?,?,?,?,?,?,NULL,'creating',?)",setupId,key,request,p.id,p.revision,actor.email,config.id,at),planEvent(env.DB,p,'mandate_requested','The client explicitly agreed to this exact schedule and started hosted authorization',actor.email)]);
 const params=new URLSearchParams({mode:'setup',currency:'usd',customer_creation:'always',success_url:env.AUTH_ORIGIN+paymentPath(p.bill_id)+'?planSetup='+encodeURIComponent(setupId),cancel_url:env.AUTH_ORIGIN+paymentPath(p.bill_id),client_reference_id:setupId,'metadata[satchel_plan]':p.id,'metadata[satchel_revision]':p.revision,'metadata[satchel_setup]':setupId,'setup_intent_data[metadata][satchel_plan]':p.id,'setup_intent_data[metadata][satchel_revision]':p.revision,'setup_intent_data[metadata][satchel_setup]':setupId,'payment_method_types[0]':'card','payment_method_types[1]':'us_bank_account'});
 try{
  const session=await stripeApi(env,'/checkout/sessions',params,'satchel-plan-setup-'+setupId);
  insist(session.mode==='setup'&&session.client_reference_id===setupId&&session.metadata?.satchel_plan===p.id&&session.metadata?.satchel_revision===p.revision&&session.livemode===false,'Hosted authorization does not match the approved plan',502);
  await stmt(env.DB,"UPDATE s_payment_plan_setups SET session_id=?,status='open' WHERE id=? AND status='creating'",session.id,setupId).run();
  return setupResult(env,{id:setupId,session_id:session.id,status:'open'},session);
 }catch(error){await stmt(env.DB,"UPDATE s_payment_plan_setups SET status='uncertain' WHERE id=? AND status='creating'",setupId).run();throw error;}
}
async function setupResult(env:StripeEnv,setup:Data,known?:Data){
 insist(setup.session_id&&setup.status==='open','This mandate attempt needs reconciliation before another authorization',409);
 const session=known??await stripeApi(env,'/checkout/sessions/'+encodeURIComponent(setup.session_id));
 insist(session.mode==='setup'&&session.status==='open','Hosted authorization is already complete; confirm it from the plan',409);
 const url=new URL(session.url);insist(url.protocol==='https:'&&url.hostname==='checkout.stripe.com','Invalid hosted authorization destination',502);
 return {id:setup.id,url:url.href,status:setup.status};
}
export async function verifiedPlanMethod(env:StripeEnv,setup:Data,p:Data){
 const session=await stripeApi(env,'/checkout/sessions/'+encodeURIComponent(setup.session_id)+'?expand[]=setup_intent.payment_method');
 const si=session.setup_intent,pm=si?.payment_method,customer=typeof session.customer==='string'?session.customer:session.customer?.id;
 insist(session.id===setup.session_id&&session.mode==='setup'&&session.status==='complete'&&session.livemode===false&&session.client_reference_id===setup.id&&session.metadata?.satchel_plan===p.id&&session.metadata?.satchel_revision===p.revision,'Hosted mandate does not match this exact current plan',409);
 insist(si&&typeof si==='object'&&si.status==='succeeded'&&si.livemode===false&&si.usage==='off_session'&&si.metadata?.satchel_plan===p.id&&si.metadata?.satchel_revision===p.revision&&si.metadata?.satchel_setup===setup.id,'Stripe has not confirmed the exact mandate for future installments',409);
 insist(customer&&si.customer===customer&&pm&&typeof pm==='object'&&pm.customer===customer&&['card','us_bank_account'].includes(pm.type),'Stripe mandate customer and payment method do not match',409);
 const mandateId=typeof si.mandate==='string'?si.mandate:si.mandate?.id??null;
 if(pm.type==='us_bank_account'){
  insist(mandateId,'Stripe has not supplied the bank mandate',409);
  const mandate=await stripeApi(env,'/mandates/'+encodeURIComponent(mandateId));insist(mandate.status==='active'&&mandate.payment_method===pm.id,'Stripe bank mandate is not active',409);
 }
 return {customerId:customer,paymentMethodId:pm.id,mandateId};
}
export async function confirmPlanMandate(env:StripeEnv,actor:Actor,planId:string,b:Data){
 clientConsent(actor,b);const p=await planAccess(env,actor,planId);
 insist(b.revision===p.revision,'Review and agree to the exact current plan revision',409);
 const setup=await stmt(env.DB,'SELECT * FROM s_payment_plan_setups WHERE id=? AND plan_id=? AND revision=? AND client_email=?',text(b.setupId,'Hosted authorization',100),p.id,p.revision,actor.email).first<Data>();
 insist(setup,'Hosted authorization not found',404);
 if(setup.status==='consumed'){insist(p.status==='active','This consent is no longer active',409);return planView(env,p,actor);}
 insist(p.status==='paused'&&setup.status==='open'&&setup.session_id,'This plan requires a new principal review and client authorization',409);
 const config=await planStripeConfig(env);insist(config.id===setup.config_id,'The approved processor arrangement changed; authorize a new plan revision',409);
 const method=await verifiedPlanMethod(env,setup,p),at=now(),consentId=id();
 await atomic(env.DB,actor,[paymentAccess(env.DB,actor,p.matter_id),planCurrent(env.DB,p),guard(env.DB,"EXISTS(SELECT 1 FROM s_payment_plan_setups WHERE id=? AND status='open')",setup.id),
 stmt(env.DB,'INSERT INTO s_payment_plan_consents VALUES(?,?,?,?,?,?,?,?,?,?)',consentId,p.id,p.revision,setup.id,actor.email,config.id,method.customerId,method.paymentMethodId,method.mandateId,at),
 stmt(env.DB,"UPDATE s_payment_plan_setups SET status='consumed' WHERE id=?",setup.id),stmt(env.DB,"UPDATE s_payment_plans SET status='active',stop_reason=NULL WHERE id=?",p.id),planEvent(env.DB,p,'consented',JSON.stringify({consentId,setupId:setup.id,client:actor.email}),actor.email),audit(env.DB,actor,'payment_plan.consented',p.id,JSON.stringify({consentId,revision:p.revision}),{matterId:p.matter_id})]);
 return planView(env,{...p,status:'active',stop_reason:null},actor);
}
