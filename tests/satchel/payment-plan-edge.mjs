import assert from 'node:assert/strict';
import {stripeEdge} from './stripe-fixture.mjs';

export function paymentPlanEdge(){
 const base=stripeEdge(),setups=new Map(),methods=new Map(),intents=new Map();let chargeCalls=0,outcome='succeeded',lost=false;
 return {...base,setups,methods,intents,get chargeCalls(){return chargeCalls;},setOutcome(value){outcome=value;},losePlanResponse(){lost=true;},
 completeSetup(setupId){
  const session=[...setups.values()].find(s=>s.client_reference_id===setupId);assert.ok(session);
  const customer='synthetic-satchel-customer-'+setups.size,pm={id:'synthetic-satchel-method-'+setups.size,type:'card',customer};methods.set(pm.id,pm);
  Object.assign(session,{status:'complete',customer,setup_intent:{id:'synthetic-satchel-setup-intent-'+setups.size,livemode:false,status:'succeeded',usage:'off_session',customer,payment_method:pm,mandate:null,metadata:{...session.metadata}}});return session;
 },
 dispute(intent){intent.latest_charge.disputed=true;const id='synthetic-satchel-plan-event-'+(base.events.size+1);base.events.set(id,{id,type:'charge.dispute.created',livemode:false,data:{object:{id:'synthetic-satchel-dispute',object:'dispute',payment_intent:intent.id}}});return {id};},
 stripeResponse:async request=>{
  const url=new URL(request.url),path=url.pathname;
  if(path==='/v1/checkout/sessions'&&request.method==='POST'){
   const b=new URLSearchParams(await request.clone().text());
   if(b.get('mode')==='setup'){
    const id='synthetic-satchel-setup-session-'+(setups.size+1),session={id,mode:'setup',livemode:false,status:'open',client_reference_id:b.get('client_reference_id'),metadata:{satchel_plan:b.get('metadata[satchel_plan]'),satchel_revision:b.get('metadata[satchel_revision]'),satchel_setup:b.get('metadata[satchel_setup]')},url:'https://checkout.stripe.com/c/pay/'+id};setups.set(id,session);return Response.json(session);
   }
  }
  if(path.startsWith('/v1/checkout/sessions/')){const s=setups.get(decodeURIComponent(path.split('/').at(-1)));if(s)return Response.json(s);}
  if(path.startsWith('/v1/payment_methods/')){const pm=methods.get(decodeURIComponent(path.split('/').at(-1)));assert.ok(pm);return Response.json(pm);}
  if(path==='/v1/payment_intents'&&request.method==='POST'){
   const b=new URLSearchParams(await request.text());chargeCalls++;assert.equal(b.get('confirm'),'true');assert.equal(b.get('off_session'),'true');assert.equal(methods.get(b.get('payment_method'))?.customer,b.get('customer'));
   const id='synthetic-satchel-plan-intent-'+chargeCalls,intent={id,object:'payment_intent',livemode:false,status:outcome,amount:Number(b.get('amount')),currency:b.get('currency'),customer:b.get('customer'),payment_method:b.get('payment_method'),metadata:{satchel_checkout:b.get('metadata[satchel_checkout]'),satchel_plan:b.get('metadata[satchel_plan]')},latest_charge:{id:'synthetic-satchel-plan-charge-'+chargeCalls,status:outcome==='requires_payment_method'?'failed':'succeeded',amount_refunded:0,disputed:false},...(outcome==='requires_payment_method'?{last_payment_error:{code:'card_declined'}}:{})};
   intents.set(id,intent);if(lost){lost=false;return new Response('Provider response lost',{status:503});}return Response.json(intent);
  }
  if(path.startsWith('/v1/payment_intents/')){const pi=intents.get(decodeURIComponent(path.split('/').at(-1)));assert.ok(pi);return Response.json(pi);}
  return base.stripeResponse(request);
 }};
}
