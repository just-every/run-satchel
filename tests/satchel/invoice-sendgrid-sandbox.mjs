import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
import {scheme,draft,reviewed} from './invoice-numbering-fixture.mjs';
import {invoiceTemplate,setupInvoicePayers} from './invoice-delivery-fixture.mjs';
async function providerTransport(request){const r=await fetch(request.url,{method:request.method,headers:Object.fromEntries([...request.headers].filter(([name])=>['authorization','content-type','idempotency-key','stripe-account'].includes(name))),...(request.method==='GET'?{}:{body:await request.arrayBuffer()}),redirect:'manual'}),headers=new Headers(r.headers);headers.delete('content-encoding');headers.delete('content-length');return new Response(await r.arrayBuffer(),{status:r.status,headers});}
assert.ok(process.env.TWILIO_SENDGRID_API_KEY&&process.env.TWILIO_SENDGRID_FROM_EMAIL,'Inject the held SendGrid sandbox credentials');
let h,actualRequests=0;
try{
 h=await harness({bindings:{MAIL_PROVIDER:'sendgrid',MAIL_API_KEY:process.env.TWILIO_SENDGRID_API_KEY,MAIL_FROM:process.env.TWILIO_SENDGRID_FROM_EMAIL,SENDGRID_SANDBOX:'1'},sendgridResponse:async request=>{
  const wire=await request.clone().json();
  if(wire.subject==='A secure portal update'){
   assert.equal(wire.mail_settings.sandbox_mode.enable,true);actualRequests++;return providerTransport(request);
  }
  return new Response(null,{status:202,headers:{'x-message-id':'synthetic-satchel-auth'}});
 }});
 const m=await open(h,'Sandbox invoice delivery','Synthetic Satchel Client','Synthetic Satchel Adverse');await setupInvoicePayers(h,m);
 await h.json('/providers/mail/review',{termsUrl:'https://www.twilio.com/en-us/legal/tos',confirmed:true},h.owner);await h.json('/invoice-numbering',scheme(),h.owner);
 const bill=await reviewed(h,m,await draft(h,m)),template=await h.json('/invoice-templates',invoiceTemplate(),h.owner),notice=await h.json('/invoice-notification-templates',{confirmed:true,reason:'Counsel approves the exact sandbox sign-in notification'},h.owner);
 await h.json('/invoices/issue',{bills:[{id:bill.id,revision:bill.revision,templateId:template.id}]},h.owner);
 const delivery=await h.json('/bills/'+bill.id+'/deliveries',{recipient:'client@example.test',payerName:'Synthetic Satchel Client',templateId:template.id},h.owner),attempt=await h.json('/invoice-deliveries/'+delivery.id+'/authorize',{confirmed:true,notificationTemplateId:notice.id,reason:'One explicitly authorized SendGrid sandbox validation; no mailbox send'},h.owner);
 const result=await h.json('/invoice-notification-attempts/'+attempt.attemptId+'/send',{},h.owner),outcome=result.deliveries.find(d=>d.id===delivery.id).attempts.find(a=>a.id===attempt.attemptId);
 assert.equal(outcome.status,'sandbox_validated');assert.equal(actualRequests,1);
 await h.json('/invoice-notification-attempts/'+attempt.attemptId+'/send',{},h.owner);assert.equal(actualRequests,1);
 console.log(JSON.stringify({injector_credentials_present:true,sandbox_mode_required:true,real_sendgrid_validation:true,mailbox_delivery_claimed:false,repeat_did_not_send:true,journey_passed:true}));
}catch{console.log(JSON.stringify({sandbox_mode_required:true,real_sendgrid_validation:false,mailbox_delivery_claimed:false,journey_passed:false}));process.exitCode=1;}
finally{await h?.close();}
