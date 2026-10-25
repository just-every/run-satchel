import type {Bindings} from '../auth.server';
import {Fault,insist,type Data} from './model';
export type StripeEnv=Bindings&{STRIPE_SECRET_KEY?:string};
export async function stripeApi(env:StripeEnv,path:string,params?:URLSearchParams,key?:string):Promise<Data>{
 insist(env.STRIPE_SECRET_KEY,'The principal must configure Stripe test credentials',409);
 // This connector is released for sandbox use. A live key never reaches a network request.
 insist(!/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY),'Stripe test mode is required',409);
 let response:Response;
 try{response=await fetch('https://api.stripe.com/v1'+path,{method:params?'POST':'GET',headers:{authorization:'Bearer '+env.STRIPE_SECRET_KEY,...(params?{'content-type':'application/x-www-form-urlencoded'}:{}),...(key?{'idempotency-key':key}:{})},...(params?{body:params.toString()}:{}),redirect:'manual'});}catch{throw new Fault('Stripe acknowledgment is uncertain; reconcile this attempt before collecting again',502);}
 const result=await response.json() as Data;
 insist(response.ok,'Stripe refused the request; inspect the provider account configuration',502);
 insist(result.livemode!==true,'Live Stripe objects are refused',409);return result;
}
export const paymentPath=(billId:string)=>'/app/invoices/'+encodeURIComponent(billId)+'/pay';
