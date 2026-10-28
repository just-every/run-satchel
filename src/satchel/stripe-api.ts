import type {Bindings} from '../auth.server';
import {Fault,insist,type Data} from './model';
export type StripeEnv=Bindings&{STRIPE_SECRET_KEY?:string;STRIPE_MODE?:'test'|'live'};
export async function stripeApi(env:StripeEnv,path:string,params?:URLSearchParams,key?:string,accountId?:string):Promise<Data>{
 insist(env.STRIPE_SECRET_KEY,'The principal must configure Stripe test credentials',409);
 const live=env.STRIPE_MODE==='live';
 insist(live?!/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY):!/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY),'Stripe credential mode must match the configured environment',409);
 let response:Response;
 try{response=await fetch('https://api.stripe.com/v1'+path,{method:params?'POST':'GET',headers:{authorization:'Bearer '+env.STRIPE_SECRET_KEY,'stripe-version':'2025-02-24.acacia',...(params?{'content-type':'application/x-www-form-urlencoded'}:{}),...(key?{'idempotency-key':key}:{}),...(accountId?{'stripe-account':accountId}:{})},...(params?{body:params.toString()}:{}),redirect:'manual'});}catch{throw new Fault('Stripe acknowledgment is uncertain; reconcile this attempt before collecting again',502);}
 let result:Data;try{result=await response.json() as Data;}catch{throw new Fault('Stripe acknowledgment is unreadable; reconcile this attempt before collecting again',502);}
 insist(response.ok,'Stripe refused the request; inspect the provider account configuration',502);
 insist(result.livemode===undefined||result.livemode===live,'Stripe object mode does not match the configured environment',409);return result;
}
export const paymentPath=(billId:string)=>'/app/invoices/'+encodeURIComponent(billId)+'/pay';
