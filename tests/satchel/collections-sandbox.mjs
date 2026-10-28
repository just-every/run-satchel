import assert from 'node:assert/strict';
import {collectionsFlow} from './collections-flow.mjs';
assert.ok(process.env.TWILIO_SENDGRID_API_KEY&&process.env.TWILIO_SENDGRID_FROM_EMAIL,'Inject the held sandbox credentials');
let validations=0;
const result=await collectionsFlow({browser:false,bindings:{MAIL_PROVIDER:'sendgrid',MAIL_API_KEY:process.env.TWILIO_SENDGRID_API_KEY,MAIL_FROM:process.env.TWILIO_SENDGRID_FROM_EMAIL,SENDGRID_SANDBOX:'1'},sendgridResponse:async request=>{
 const wire=await request.clone().json();
 if(['An invoice is available','A secure portal update'].includes(wire.subject)){
  assert.equal(wire.mail_settings.sandbox_mode.enable,true);
  const response=await fetch(request.url,{method:request.method,headers:{authorization:request.headers.get('authorization'),'content-type':'application/json'},body:JSON.stringify(wire),redirect:'manual'});
  assert.equal(response.status,200,'SendGrid sandbox validates the exact authorized reminder');validations++;return new Response(null,{status:200});
 }
 return new Response(null,{status:202,headers:{'x-message-id':'synthetic-satchel-auth'}});
}});
assert.ok(validations>=6);
console.log(JSON.stringify({journey:'collectionsFlow',...result,realSendgridSandboxValidations:validations,sandboxMode:true,mailboxDeliveryClaimed:false,passed:true}));
