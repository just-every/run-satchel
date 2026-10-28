import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {harness} from './harness.mjs';
import {paymentFixture} from './stripe-fixture.mjs';

const key=process.env.STRIPE_US_TEST_SECRET_KEY;
assert.ok(/^(sk|rk)_test_/.test(key??''),'Inject the held Stripe test credential');
const directory=process.env.SATCHEL_SCREENSHOTS;
const sessions=[],intents=[];
async function transport(request){
 const response=await fetch(request.url,{method:request.method,headers:Object.fromEntries([...request.headers].filter(([name])=>['authorization','content-type','idempotency-key','stripe-account','stripe-version'].includes(name))),...(request.method==='GET'?{}:{body:await request.arrayBuffer()}),redirect:'manual'});
 const bytes=await response.arrayBuffer(),headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');
 if(!response.ok){const error=JSON.parse(Buffer.from(bytes).toString()).error;console.error(JSON.stringify({providerStatus:response.status,code:error?.code,param:error?.param,message:String(error?.message??'').replace(/(?:sk|rk)_(?:test|live)_\w+/g,'[redacted]')}));}
 if(response.ok&&request.method==='POST'){
  const object=JSON.parse(Buffer.from(bytes).toString());
  if(new URL(request.url).pathname==='/v1/checkout/sessions')sessions.push(object);
  if(new URL(request.url).pathname==='/v1/payment_intents')intents.push(object);
 }
 return new Response(bytes,{status:response.status,headers});
}
const definition=bill=>({approve:true,billRevision:bill.revision,balanceCents:37500,startDate:'2026-11-01',reason:'Principal approves the exact three installment schedule',installments:[{dueDate:'2026-11-01',cents:12500},{dueDate:'2026-12-01',cents:12500},{dueDate:'2027-01-01',cents:12500}]});
const h=await harness({bindings:{STRIPE_SECRET_KEY:key},stripeResponse:transport});
let browser,page,stage='fixture';
try{
 const s=await paymentFixture(h);
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true});
 await context.addCookies(s.client.split('; ').map(c=>{const i=c.indexOf('=');return {name:c.slice(0,i),value:c.slice(i+1),url:h.origin,secure:true};}));
 page=await context.newPage();page.setDefaultTimeout(30000);
 const shot=async name=>{if(directory){await mkdir(directory,{recursive:true});await page.screenshot({path:directory+'/'+name+'.png',fullPage:true});}};
 async function authorize(plan,reference){
  stage='hosted-mandate-create';
  const setup=await h.json('/payment-plans/'+plan.id+'/mandate',{revision:plan.revision,agree:true,requestKey:reference},s.client);
  await page.goto(setup.url);stage='hosted-mandate-card';
  await page.locator('#email').waitFor({state:'visible'});await page.locator('#email').fill('synthetic-satchel'+'@'+'example.test');
  await page.getByText('Card',{exact:true}).click({force:true});
  await page.locator('#cardNumber').fill('4242424242424242');await page.locator('#cardExpiry').fill('1230');await page.locator('#cardCvc').fill('123');
  await page.locator('#billingCountry').selectOption('US');
  if(await page.locator('#billingName').isVisible())await page.locator('#billingName').fill('Synthetic Satchel Client');
  await page.locator('#billingPostalCode').fill('10001');
  const save=page.getByLabel(/Save my information with Link/);if(await save.count())await save.uncheck();
  stage='hosted-mandate-submit';await page.getByTestId('hosted-payment-submit-button').click();
  await page.waitForURL(h.origin+'/app/invoices/'+plan.bill_id+'/pay?planSetup='+setup.id,{timeout:90000});
  return h.json('/payment-plans/'+plan.id+'/mandate/confirm',{revision:plan.revision,agree:true,setupId:setup.id},s.client);
 }
 let plan=await h.json('/bills/'+s.card.id+'/payment-plans',definition(s.card),h.owner);
 stage='paused';await h.scheduled('2026-11-01T12:00:00Z');assert.equal(intents.length,0);
 plan=await authorize(plan,'synthetic-satchel-live-mandate');assert.equal(plan.status,'active');
 stage='first-installment';await h.scheduled('2026-11-01T12:00:00Z');await h.scheduled('2026-11-01T12:15:00Z');
 assert.equal(intents.length,1);assert.equal(intents[0].livemode,false);assert.equal(intents[0].status,'succeeded');assert.equal(intents[0].amount,12500);
 assert.equal((await h.json('/portal/invoices/'+s.card.id+'/payment',undefined,s.client)).paidCents,12500);
 for(const width of [1440,390]){await page.setViewportSize({width,height:width===1440?1000:844});await page.goto(h.origin+'/app/invoices/'+s.card.id+'/pay');await page.getByText('2026-11-01 · $125.00 · paid',{exact:true}).waitFor();await shot('live-plan-active-'+width);}
 stage='revoke';plan=await h.json('/payment-plans/'+plan.id+'/actions',{kind:'revoke',revision:plan.revision,reason:'Client withdraws future collection consent'},s.client);
 await h.restart();await h.scheduled('2027-01-02T12:00:00Z');assert.equal(intents.length,1);
 plan=await h.json('/payment-plans/'+plan.id,undefined,h.owner);assert.equal(plan.status,'stopped');
 const task=plan.events.find(e=>e.kind==='stopped')?.task_id;assert.ok((await h.json('/matters/'+s.m.id+'/tasks',undefined,h.owner)).some(t=>t.id===task&&t.status==='open'));
 for(const width of [1440,390]){await page.setViewportSize({width,height:width===1440?1000:844});await page.goto(h.origin+'/app/invoices/'+s.card.id+'/pay');await page.getByText('Installment plan · stopped',{exact:true}).waitFor();await shot('live-plan-stopped-'+width);}
 stage='import';let imported=await h.json('/bills/'+s.ach.id+'/payment-plans',{...definition(s.ach),sourceSystem:'Synthetic source practice',sourceReference:'synthetic-satchel-source-plan'},h.owner);
 assert.equal(imported.status,'paused');assert.equal(imported.consent,null);
 await h.restart();await h.scheduled('2027-01-02T12:00:00Z');assert.equal(intents.length,1);
 await page.goto(h.origin+'/app/invoices/'+s.ach.id+'/pay');await page.getByText('Imported Synthetic source practice plan · paused',{exact:true}).waitFor();await shot('live-import-paused-390');
 await page.setViewportSize({width:1440,height:1000});await shot('live-import-paused-1440');imported=await authorize(imported,'synthetic-satchel-live-import-consent');assert.equal(imported.status,'active');
 stage='import-collection';await h.scheduled('2026-11-01T12:00:00Z');await h.scheduled('2026-11-01T12:15:00Z');assert.equal(intents.length,2);assert.equal(intents[1].status,'succeeded');assert.equal(intents[1].amount,12500);
 assert.equal((await h.json('/portal/invoices/'+s.ach.id+'/payment',undefined,s.client)).paidCents,12500);
 for(const width of [1440,390]){await page.setViewportSize({width,height:width===1440?1000:844});await page.goto(h.origin+'/app/invoices/'+s.ach.id+'/pay');await page.getByText('Imported Synthetic source practice plan · active',{exact:true}).waitFor();await page.getByText('2026-11-01 · $125.00 · paid',{exact:true}).waitFor();await shot('live-import-active-'+width);}
 await h.json('/payment-plans/'+imported.id+'/actions',{kind:'revoke',revision:imported.revision,reason:'Sandbox journey complete; no future collection authorized'},s.client);
 console.log(JSON.stringify({testMode:true,hostedMandates:sessions.length,threeInstallments:true,oneChargeBeforeRevocation:true,stoppedAcrossRestart:true,humanTask:true,importPausedUntilFreshMandate:true,importChargedOnce:true,journeyPassed:true}));
}catch(error){
 if(page&&directory)await page.screenshot({path:directory+'/live-plan-failed.png',fullPage:true}).catch(()=>{});
 console.error(JSON.stringify({stage,journeyPassed:false,error:error?.code==='ERR_ASSERTION'?error.message:String(error).replace(/https:\/\/\S+/g,'[redacted address]')}));process.exitCode=1;
}finally{await browser?.close();await h.close();}
