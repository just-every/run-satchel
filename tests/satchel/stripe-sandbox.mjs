import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {harness} from './harness.mjs';
import {paymentFixture} from './stripe-fixture.mjs';
const key=process.env.STRIPE_US_TEST_SECRET_KEY;
async function providerTransport(request){const r=await fetch(request.url,{method:request.method,headers:Object.fromEntries([...request.headers].filter(([name])=>['authorization','content-type','idempotency-key','stripe-account'].includes(name))),...(request.method==='GET'?{}:{body:await request.arrayBuffer()}),redirect:'manual'}),headers=new Headers(r.headers);headers.delete('content-encoding');headers.delete('content-length');return new Response(await r.arrayBuffer(),{status:r.status,headers});}
assert.ok(/^(sk|rk)_test_/.test(key??''),'An injected Stripe test credential is required');
const directory=process.env.SATCHEL_SCREENSHOTS;
let h,browser,page,stage='setup';
const proof={test_mode:true,hosted_card:false,card_collected:false,card_exact_allocation:false,hosted_ach:false,ach_pending:false,ach_collected:false,replayed_once:false};
const stripe=async path=>{const r=await fetch('https://api.stripe.com/v1'+path,{headers:{authorization:'Bearer '+key}});assert.ok(r.ok);const b=await r.json();assert.notEqual(b.livemode,true);return b;};
async function bankButton(name){
 const end=Date.now()+45000;
 while(Date.now()<end){for(const frame of page.frames()){const button=frame.getByRole('button',{name,exact:true});if(await button.count()){await button.click({force:true});return;}}await page.waitForTimeout(200);}
 assert.fail('The hosted bank verification step did not appear');
}
try{
 const sessions=[];
 h=await harness({bindings:{STRIPE_SECRET_KEY:key},stripeResponse:async request=>{const r=await providerTransport(request);if(request.method==='POST'&&new URL(request.url).pathname==='/v1/checkout/sessions'&&r.ok)sessions.push(await r.clone().json());return r;}});
 const s=await paymentFixture(h);
 browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true});
 await context.addCookies(s.client.split('; ').map(c=>{const i=c.indexOf('=');return {name:c.slice(0,i),value:c.slice(i+1),url:h.origin,secure:true};}));
 page=await context.newPage();page.setDefaultTimeout(20000);
 const shot=async name=>{if(directory){await mkdir(directory,{recursive:true});await page.screenshot({path:directory+'/sandbox-'+name+'.png',fullPage:true});}};
 stage='card-page';await page.goto(h.origin+'/app/invoices/'+s.card.id+'/pay');await page.getByRole('button',{name:'Pay by card or ACH'}).click();await page.waitForURL(/checkout\.stripe\.com/);proof.hosted_card=true;await shot('card-hosted');
 stage='card-input';
 await page.locator('#email').waitFor({state:'visible'});await page.locator('#email').fill('satchel+testing@example.com');
 const cardTab=page.getByText('Card',{exact:true});if(await cardTab.count())await cardTab.first().click({force:true});
 await page.locator('#cardNumber').fill('4242424242424242');await page.locator('#cardExpiry').fill('1230');await page.locator('#cardCvc').fill('123');
 await page.locator('#billingCountry').selectOption('US');
 if(await page.locator('#billingName').isVisible())await page.locator('#billingName').fill('Casey Sandbox');
 await page.locator('#billingPostalCode').fill('10001');
 const save=page.getByLabel(/Save my information with Link/);if(await save.count())await save.uncheck();
 await shot('card-ready');stage='card-confirm';await page.getByTestId('hosted-payment-submit-button').click();await page.waitForURL(h.origin+'/app/invoices/'+s.card.id+'/pay',{timeout:60000});
 const card=await stripe('/checkout/sessions/'+sessions[0].id);assert.equal(card.payment_status,'paid');proof.card_collected=true;
 const events=await stripe('/events?type=checkout.session.completed&limit=20'),event=events.data.find(e=>e.data.object.id===card.id);assert.ok(event);
 for(let i=0;i<2;i++)assert.equal((await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify({id:event.id})})).status,200);
 const state=await h.json('/portal/invoices/'+s.card.id+'/payment',undefined,s.client);assert.equal(state.paidCents,37500);assert.equal(state.dueCents,0);assert.equal(state.attempts.length,1);proof.card_exact_allocation=true;proof.replayed_once=true;
 await page.reload();await page.getByRole('status').getByText('Paid',{exact:true}).waitFor();await shot('card-paid');
 stage='ach-page';await page.goto(h.origin+'/app/invoices/'+s.ach.id+'/pay');await page.getByRole('button',{name:'Pay by card or ACH'}).click();await page.waitForURL(/checkout\.stripe\.com/);proof.hosted_ach=true;await shot('ach-hosted');
 stage='ach-input';await page.locator('#email').waitFor({state:'visible'});await page.locator('#email').fill('satchel+testing@example.com');
 await page.getByText('US bank account',{exact:true}).first().click({force:true});await page.getByLabel('Full name',{exact:true}).fill('Casey Sandbox');await page.getByText('Test (Non-OAuth)',{exact:true}).click({force:true});
 await bankButton('Agree and continue');await bankButton('Continue as guest');
 const end=Date.now()+45000;let selected=false;
 while(Date.now()<end&&!selected){for(const frame of page.frames()){const account=frame.getByText('Success',{exact:true});if(await account.count()){await account.click({force:true});selected=true;break;}}if(!selected)await page.waitForTimeout(200);}
 assert.ok(selected);await bankButton('Connect account');await bankButton('Continue to RunEditRun US test sandbox');
 await page.getByText('US bank account',{exact:true}).first().waitFor({state:'visible'});await shot('ach-ready');
 stage='ach-confirm';await page.getByTestId('hosted-payment-submit-button').click();await page.waitForURL(h.origin+'/app/invoices/'+s.ach.id+'/pay',{timeout:60000});
 let ach=await stripe('/checkout/sessions/'+sessions[1].id+'?expand[]=payment_intent.latest_charge');assert.equal(ach.status,'complete');assert.equal(ach.payment_intent.latest_charge.payment_method_details.type,'us_bank_account');
 const completed=await stripe('/events?type=checkout.session.completed&limit=30'),achEvent=completed.data.find(e=>e.data.object.id===ach.id);assert.ok(achEvent);assert.equal(achEvent.data.object.payment_status,'unpaid');proof.ach_pending=true;
 for(let i=0;i<2;i++)assert.equal((await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify({id:achEvent.id})})).status,200);
 const pending=await h.json('/portal/invoices/'+s.ach.id+'/payment',undefined,s.client);assert.equal(pending.attempts.length,1);assert.ok(['pending','paid'].includes(pending.status));await page.reload();await shot('ach-pending');
 stage='ach-settlement';const settleBy=Date.now()+240000;
 while(ach.payment_status!=='paid'&&Date.now()<settleBy){await page.waitForTimeout(3000);ach=await stripe('/checkout/sessions/'+ach.id+'?expand[]=payment_intent.latest_charge');}
 assert.equal(ach.payment_status,'paid');proof.ach_collected=true;
 const settled=await stripe('/events?type=checkout.session.async_payment_succeeded&limit=30'),settledEvent=settled.data.find(e=>e.data.object.id===ach.id);assert.ok(settledEvent);
 for(let i=0;i<2;i++)assert.equal((await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify({id:settledEvent.id})})).status,200);
 const paid=await h.json('/portal/invoices/'+s.ach.id+'/payment',undefined,s.client);assert.equal(paid.paidCents,37500);assert.equal(paid.dueCents,0);assert.equal(paid.attempts.length,1);await page.reload();await page.getByRole('status').getByText('Paid',{exact:true}).waitFor();await shot('ach-paid');
 console.log(JSON.stringify({...proof,journey_passed:Object.values(proof).every(Boolean)}));
 process.exitCode=Object.values(proof).every(Boolean)?0:1;
}catch(error){
 if(page&&directory){await mkdir(directory,{recursive:true});await page.screenshot({path:directory+'/sandbox-'+stage+'-failed.png',fullPage:true}).catch(()=>{});}
 console.log(JSON.stringify({...proof,setup_reached:Boolean(h),browser_reached:Boolean(browser),provider_refused:/Stripe refused/.test(String(error)),acknowledgment_uncertain:/acknowledgment is uncertain/.test(String(error)),assertion_failed:error?.code==='ERR_ASSERTION',journey_passed:false}));process.exitCode=1;
}finally{await browser?.close();await h?.close();}
