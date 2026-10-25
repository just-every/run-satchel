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
 const email=page.locator('#email');if(await email.isVisible())await email.fill('satchel+testing@example.com');
 const cardTab=page.getByText('Card',{exact:true});if(await cardTab.count())await cardTab.first().click();
 await page.locator('#cardNumber').fill('4242424242424242');await page.locator('#cardExpiry').fill('1230');await page.locator('#cardCvc').fill('123');
 if(await page.locator('#billingName').isVisible())await page.locator('#billingName').fill('Casey Sandbox');
 if(await page.locator('#billingPostalCode').isVisible())await page.locator('#billingPostalCode').fill('10001');
 await shot('card-ready');stage='card-confirm';await page.getByTestId('hosted-payment-submit-button').click();await page.waitForURL(h.origin+'/app/invoices/'+s.card.id+'/pay',{timeout:60000});
 const card=await stripe('/checkout/sessions/'+sessions[0].id);assert.equal(card.payment_status,'paid');proof.card_collected=true;
 const events=await stripe('/events?type=checkout.session.completed&limit=20'),event=events.data.find(e=>e.data.object.id===card.id);assert.ok(event);
 for(let i=0;i<2;i++)assert.equal((await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify({id:event.id})})).status,200);
 const state=await h.json('/portal/invoices/'+s.card.id+'/payment',undefined,s.client);assert.equal(state.paidCents,37500);assert.equal(state.dueCents,0);assert.equal(state.attempts.length,1);proof.card_exact_allocation=true;proof.replayed_once=true;
 await page.reload();await page.getByRole('status').getByText('Paid',{exact:true}).waitFor();await shot('card-paid');
 stage='ach-page';await page.goto(h.origin+'/app/invoices/'+s.ach.id+'/pay');await page.getByRole('button',{name:'Pay by card or ACH'}).click();await page.waitForURL(/checkout\.stripe\.com/);proof.hosted_ach=true;await shot('ach-hosted');
 // The hosted bank verification is completed interactively by this journey's
 // documented selectors; raw bank credentials never enter Satchel.
 stage='ach-input';if(await page.locator('#email').isVisible())await page.locator('#email').fill('satchel+testing@example.com');
 await page.getByText('US bank account',{exact:true}).first().click();await shot('ach-bank-choice');
 console.log(JSON.stringify({...proof,journey_passed:Object.values(proof).every(Boolean)}));
 process.exitCode=Object.values(proof).every(Boolean)?0:1;
 if(process.env.SATCHEL_SANDBOX_PAUSE==='1')await new Promise(resolve=>setTimeout(resolve,45000));
}catch(error){
 if(page&&directory){await mkdir(directory,{recursive:true});await page.screenshot({path:directory+'/sandbox-'+stage+'-failed.png',fullPage:true}).catch(()=>{});}
 console.log(JSON.stringify({...proof,setup_reached:Boolean(h),browser_reached:Boolean(browser),provider_refused:/Stripe refused/.test(String(error)),acknowledgment_uncertain:/acknowledgment is uncertain/.test(String(error)),assertion_failed:error?.code==='ERR_ASSERTION',journey_passed:false}));process.exitCode=1;
}finally{await browser?.close();await h?.close();}
