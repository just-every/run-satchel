import assert from 'node:assert/strict';
import {open} from './harness.mjs';
import {scheme,draft,reviewed} from './invoice-numbering-fixture.mjs';
export function stripeEdge(){
 const sessions=new Map(),events=new Map();let calls=0;
 return {bindings:{STRIPE_SECRET_KEY:'synthetic-satchel-2'},sessions,events,get calls(){return calls;},stripeResponse:async request=>{
  const url=new URL(request.url),path=url.pathname;
  if(path==='/v1/account')return Response.json({id:request.headers.get('stripe-account')??'synthetic-satchel-3',country:'US',controller:{fees:{payer:'application'},losses:{payments:'application'}},settings:{payouts:{debit_negative_balances:false}}});
  if(path.includes('/external_accounts/'))return Response.json({id:'synthetic-satchel-trust-bank',object:'bank_account',status:'verified',currency:'usd',default_for_currency:true});
  if(path==='/v1/checkout/sessions'&&request.method==='POST'){
   calls++;const b=new URLSearchParams(await request.text()),n='synthetic-satchel-'+(10+calls),id=b.get('client_reference_id'),amount=Number(b.get('line_items[0][price_data][unit_amount]'));
   const session={processorAccount:request.headers.get('stripe-account'),id:n,object:'checkout.session',livemode:false,status:'open',payment_status:'unpaid',currency:'usd',amount_total:amount,client_reference_id:id,metadata:{satchel_checkout:id},payment_method_types:['card','us_bank_account'],url:'https://checkout.stripe.com/c/pay/'+n,payment_intent:{id:'synthetic-satchel-intent-'+calls,livemode:false,status:'requires_payment_method',amount,currency:'usd',metadata:{satchel_checkout:id},latest_charge:null}};
   sessions.set(n,session);return Response.json(session);
  }
  if(path.startsWith('/v1/checkout/sessions/')){const s=sessions.get(decodeURIComponent(path.split('/').at(-1)));assert.ok(s);return Response.json(s);}
  if(path.startsWith('/v1/events/')){const e=events.get(decodeURIComponent(path.split('/').at(-1)));return e?Response.json(e):Response.json({error:'Unknown event'},{status:404});}
  throw new Error('Unexpected Stripe boundary '+request.method+' '+path);
 },event(session,type,status,extra={}){
  session.status=status==='expired'?'expired':status==='open'?'open':'complete';session.payment_status=status==='paid'||status==='returned'?'paid':'unpaid';session.payment_intent.status=status==='paid'||status==='returned'?'succeeded':status==='pending'?'processing':'requires_payment_method';
  session.payment_intent.latest_charge={id:'synthetic-satchel-charge-'+session.id,status:'succeeded',amount_refunded:status==='returned'?session.amount_total:0,...extra};
  const id='synthetic-satchel-event-'+(events.size+1),event={id,...(session.processorAccount?{account:session.processorAccount}:{}),livemode:false,type,data:{object:{id:session.id,object:'checkout.session'}}};events.set(id,event);return {id,...(event.account?{account:event.account}:{})};
 }};
}
export async function paymentFixture(h){
 await h.json('/providers/stripe/review',{termsUrl:'https://stripe.com/legal/ssa',confirmed:true},h.owner);
 await h.json('/stripe/settings',{kind:'operating',confirmed:true},h.owner);
 await h.json('/invoice-numbering',scheme(),h.owner);
 const m=await open(h,'Barton operating invoice','Barton Workshop LLC','Riverbend Holdings LLC');
 await h.json('/team',{email:'client@example.test',name:'Casey Client',role:'client'},h.owner);
 await h.json('/matters/'+m.id+'/portal',{email:'client@example.test',kind:'client',reason:'Invoice payer authorization verified'},h.owner);
 await h.json('/team/invite',{email:'client@example.test'},h.owner);
 const client=await h.login('client@example.test');
 async function issue(title){const bill=await reviewed(h,m,await draft(h,m,title));const r=await h.json('/invoices/issue',{bills:[{id:bill.id,revision:bill.revision}]},h.owner);return {...bill,number:r.issues[0].number};}
 return {m,client,card:await issue('Card operating services'),ach:await issue('ACH operating services'),issue};
}
