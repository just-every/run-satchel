import {generateKeyPairSync,sign} from 'node:crypto';
import assert from 'node:assert/strict';

// Only the paid provider boundary is synthetic; all durable outcomes use the signed public callback.
export function invoiceMailEdge(){
 const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});let sequence=0,lost=false;
 return {
  bindings:{MAIL_PROVIDER:'sendgrid',SENDGRID_EVENT_PUBLIC_KEY:keys.publicKey.export({type:'spki',format:'der'}).toString('base64')},
  sendgridResponse:async()=>lost?new Response('',{status:503}):new Response(null,{status:202,headers:{'x-message-id':'synthetic-satchel-'+(++sequence)}}),
  uncertain(value){lost=value;},
  async bounce(h,attempt){
   const timestamp=String(Math.floor(Date.now()/1000)),payload=JSON.stringify([{event:'bounce',sg_event_id:'synthetic-satchel-bounce-'+sequence,rer_delivery_id:attempt.id,sg_message_id:attempt.provider_id,email:'client@example.test',timestamp:Number(timestamp)}]);
   const response=await h.raw('/api/satchel/providers/sendgrid/events',{method:'POST',headers:{'content-type':'application/json','X-Twilio-Email-Event-Webhook-Timestamp':timestamp,'X-Twilio-Email-Event-Webhook-Signature':sign('sha256',Buffer.from(timestamp+payload),keys.privateKey).toString('base64')},body:payload});assert.equal(response.status,200);
  }
 };
}
