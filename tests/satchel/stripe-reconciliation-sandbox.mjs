import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {chromium} from '@playwright/test';
import {harness} from './harness.mjs';
import {paymentFixture} from './stripe-fixture.mjs';

const key=process.env.STRIPE_US_TEST_SECRET_KEY;
const directory=process.env.SATCHEL_SCREENSHOTS;
const started=Math.floor(Date.now()/1000),totalCents=37500,refundCents=5000;
const sessions=[],refunds=[],eventReads=new Map();
let checkoutPosts=0,refundPosts=0,loseAcknowledgment=true,h,browser,page,stage='setup';
const proof={
 testMode:false,lostRealAcknowledgment:false,duplicateCheckoutRefused:false,financeRecovered:false,
 hostedCardCompleted:false,authenticatedCallback:false,callbackReplayOnce:false,exactNativeReceipt:false,
 principalExactRefund:false,refundReplayOnce:false,invoiceReconciled:false,realBalanceTransactions:false,
 automaticPayoutReadbackAttempted:false,automaticPayoutObserved:false,automaticPayoutEvidencePending:true,
 bankSettlementUnconfirmed:false,restartReplayOnce:false,desktopCaptured:false,mobileCaptured:false,
 collectedCents:0,refundedCents:0,paidCents:0,dueCents:0,chargeFeeCents:0,processorNetCents:0,
};

async function stripe(path){
 const response=await fetch('https://api.stripe.com/v1'+path,{
  headers:{authorization:'Bearer '+key,'stripe-version':'2025-02-24.acacia'},signal:AbortSignal.timeout(30000),
 });
 assert.ok(response.ok,'Authenticated test provider readback must succeed');
 const object=await response.json();assert.notEqual(object.livemode,true);return object;
}

async function transport(request){
 const path=new URL(request.url).pathname;
 if(request.method==='POST'&&path==='/v1/checkout/sessions')checkoutPosts++;
 if(request.method==='POST'&&path==='/v1/refunds')refundPosts++;
 if(request.method==='GET'&&path.startsWith('/v1/events/'))eventReads.set(path,(eventReads.get(path)??0)+1);
 const response=await fetch(request.url,{
  method:request.method,redirect:'manual',signal:AbortSignal.timeout(30000),
  headers:Object.fromEntries([...request.headers].filter(([name])=>['authorization','content-type','idempotency-key','stripe-account','stripe-version'].includes(name))),
  ...(request.method==='GET'?{}:{body:await request.arrayBuffer()}),
 });
 const bytes=await response.arrayBuffer(),headers=new Headers(response.headers);
 headers.delete('content-encoding');headers.delete('content-length');
 if(response.ok&&request.method==='POST'){
  const object=JSON.parse(Buffer.from(bytes).toString());
  assert.equal(object.object,path==='/v1/refunds'?'refund':'checkout.session');
  if(path==='/v1/checkout/sessions'){
   assert.equal(object.livemode,false);sessions.push(object);
   if(loseAcknowledgment){loseAcknowledgment=false;throw new Error('Real checkout response deliberately lost');}
  }
  if(path==='/v1/refunds')refunds.push(object);
 }
 return new Response(bytes,{status:response.status,headers});
}

async function list(path){
 const objects=[];let after='';
 do{
  const result=await stripe(path+(path.includes('?')?'&':'?')+'limit=100'+(after?'&starting_after='+encodeURIComponent(after):''));
  assert.ok(Array.isArray(result.data));objects.push(...result.data);
  if(!result.has_more)return objects;
  assert.ok(result.data.length);after=result.data.at(-1).id;
 }while(true);
}

async function poll(read,ready,timeout=60000){
 const until=Date.now()+timeout;let value;
 do{value=await read();if(ready(value))return value;await new Promise(resolve=>setTimeout(resolve,1000));}while(Date.now()<until);
 assert.ok(ready(value),'Provider evidence must become available within the bounded readback window');return value;
}

async function cookies(context,cookie){
 await context.addCookies(cookie.split('; ').map(value=>{const i=value.indexOf('=');return {name:value.slice(0,i),value:value.slice(i+1),url:h.origin,secure:true};}));
}

async function callback(event){
 const path='/v1/events/'+encodeURIComponent(event.id),before=eventReads.get(path)??0;
 assert.equal((await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify({id:event.id})})).status,200);
 assert.equal(eventReads.get(path),before+1,'Every callback identity requires authenticated provider readback');
}

function exactReceipt(state,attemptId,chargeId){
 assert.equal(state.attempts.length,1);const attempt=state.attempts[0];
 assert.equal(attempt.id,attemptId);assert.equal(attempt.cents,totalCents);
 assert.equal(attempt.receipt.checkout_id,attemptId);assert.equal(attempt.receipt.charge_id,chargeId);
 assert.equal(attempt.receipt.cents,totalCents);return attempt;
}

function balanceTransaction(transaction,cents,sourceId){
 assert.ok(transaction&&typeof transaction==='object');assert.equal(transaction.currency,'usd');
 assert.equal(transaction.amount,cents);assert.ok(Number.isSafeInteger(transaction.fee));
 assert.equal(transaction.net,transaction.amount-transaction.fee);
 assert.equal(typeof transaction.source==='string'?transaction.source:transaction.source?.id,sourceId);
}

async function inspectAutomaticPayouts(path,intentId,chargeTransaction,refundTransaction){
 proof.automaticPayoutReadbackAttempted=true;
 const payouts=await list('/payouts?created[gte]='+Math.max(0,started-3600));
 const observedTransactions=new Set();
 for(const payout of payouts){
  assert.equal(payout.livemode,false);
  if(payout.automatic!==true||payout.status!=='paid'||payout.reconciliation_status!=='completed'||payout.currency!=='usd')continue;
  const transactions=await list('/balance_transactions?payout='+encodeURIComponent(payout.id)+'&expand[]=data.source');
  const own=transactions.filter(t=>[chargeTransaction.id,refundTransaction.id].includes(t.id));
  if(!own.length)continue;
  for(const transaction of own){
   const expected=transaction.id===chargeTransaction.id?chargeTransaction:refundTransaction;
   balanceTransaction(transaction,expected.amount,typeof expected.source==='string'?expected.source:expected.source.id);
   assert.equal(transaction.fee,expected.fee);assert.equal(transaction.net,expected.net);assert.equal(transaction.status,'available');
   const source=typeof transaction.source==='string'?await stripe((transaction.id===chargeTransaction.id?'/charges/':'/refunds/')+encodeURIComponent(transaction.source)):transaction.source;
   assert.equal(typeof source.payment_intent==='string'?source.payment_intent:source.payment_intent?.id,intentId);
  }
  const state=await h.json(path+'/settlement',{payoutId:payout.id},h.owner);
  const observation=state.settlements.filter(s=>s.payout_id===payout.id).at(-1);assert.ok(observation);
  assert.equal(observation.snapshot.status,'paid');assert.equal(observation.snapshot.reconciliationStatus,'completed');
  assert.equal(observation.snapshot.amountCents,payout.amount);
  for(const [field,providerField] of [['grossCents','amount'],['feeCents','fee'],['netCents','net']]){
   assert.equal(observation.snapshot[field],transactions.reduce((sum,t)=>sum+t[providerField],0));
  }
  assert.equal(observation.snapshot.netCents,payout.amount);
  for(const transaction of own){
   const posting=state.processorPostings.find(p=>p.id===transaction.id);assert.ok(posting);
   assert.equal(posting.payment_intent_id,intentId);assert.equal(posting.gross_cents,transaction.amount);
   assert.equal(posting.fee_cents,transaction.fee);assert.equal(posting.net_cents,transaction.net);
   observedTransactions.add(transaction.id);
  }
  assert.equal(state.bankStatus,'unconfirmed');assert.equal(state.bankHistory.length,0);
  proof.automaticPayoutObserved=true;
 }
 proof.automaticPayoutEvidencePending=observedTransactions.size!==2;
}

async function captureRefund(s){
 const finance=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true});
 await cookies(finance,h.owner);const ownerPage=await finance.newPage();ownerPage.setDefaultTimeout(30000);
 try{
  for(const width of [1440,390]){
   const viewport={width,height:width===1440?1000:844};
   await page.setViewportSize(viewport);await page.goto(h.origin+'/app/invoices/'+s.card.id+'/pay');
   const payment=page.getByRole('region',{name:'Invoice payment'});
   await payment.getByRole('heading',{name:'Invoice '+s.card.number,exact:true}).waitFor();
   assert.deepEqual(await payment.locator('dl dd').allTextContents(),['$375.00','$325.00','$50.00']);
   await ownerPage.setViewportSize(viewport);await ownerPage.goto(h.origin+'/app');
   if(new URL(ownerPage.url()).pathname==='/setup'){await ownerPage.getByLabel('Your name').fill('Synthetic principal');await ownerPage.getByRole('checkbox').check();await ownerPage.getByRole('button',{name:'Finish setup',exact:true}).click();await ownerPage.waitForURL(/\/app/);}
   await ownerPage.getByRole('button',{name:'Time & bills',exact:true}).click();
   await ownerPage.getByLabel('Current matter',{exact:true}).selectOption(s.m.id);
   const bill=ownerPage.locator('.bill-packages > article').filter({hasText:s.card.snapshot.title});
   await bill.locator('summary').filter({hasText:'Payment reconciliation'}).click();
   const reconciliation=bill.getByRole('region',{name:'Payment reconciliation'});
   await reconciliation.getByText('Bank settlement: Unconfirmed',{exact:true}).waitFor();
   await reconciliation.getByText(/Refund \$50\.00 · succeeded/).waitFor();
   if(directory){
    await mkdir(directory,{recursive:true});
    await page.screenshot({path:directory+'/reconciliation-client-refund-'+width+'.png',fullPage:true});
    await ownerPage.screenshot({path:directory+'/reconciliation-finance-refund-'+width+'.png',fullPage:true});
    proof[width===1440?'desktopCaptured':'mobileCaptured']=true;
   }
  }
 }finally{await finance.close();}
}

try{
 assert.ok(/^(sk|rk)_test_/.test(key??''),'An injected Stripe test credential is required');proof.testMode=true;
 h=await harness({bindings:{STRIPE_SECRET_KEY:key,STRIPE_MODE:'test'},stripeResponse:transport});
 const s=await paymentFixture(h),base='/portal/invoices/'+s.card.id,principal=(await h.json('/state',undefined,h.owner)).actor;
 assert.equal(principal.role,'owner');
 await h.json(base+'/checkout',{purpose:'trust',cents:totalCents,ledgerId:'synthetic-satchel-unprotected-trust',requestKey:'synthetic-satchel-trust-refused'},h.owner,409);assert.equal(checkoutPosts,0);
 stage='lostAcknowledgment';
 await h.json(base+'/checkout',{requestKey:'synthetic-satchel-reconciliation-lost'},s.client,502);
 assert.equal(sessions.length,1);assert.equal(checkoutPosts,1);assert.equal(sessions[0].status,'open');
 let invoice=await h.json(base+'/payment',undefined,s.client);
 assert.equal(invoice.paidCents,0);assert.equal(invoice.reservedCents,totalCents);assert.equal(invoice.status,'pending');
 assert.equal(invoice.attempts.length,1);assert.equal(invoice.attempts[0].status,'uncertain');
 proof.lostRealAcknowledgment=true;
 await h.json(base+'/checkout',{requestKey:'synthetic-satchel-reconciliation-repeat'},s.client,409);
 assert.equal(checkoutPosts,1);proof.duplicateCheckoutRefused=true;
 const attemptId=invoice.attempts[0].id,path='/stripe/collections/'+attemptId;
 stage='financeRecovery';
 await h.json(path+'/reconcile',{},s.client,403);
 let state=await h.json(path+'/reconcile',{},h.owner);
 assert.equal(state.attempts[0].session_id,sessions[0].id);assert.equal(state.attempts[0].status,'open');
 assert.equal(state.bankStatus,'unconfirmed');assert.equal(checkoutPosts,1);proof.financeRecovered=true;

 stage='hostedCheckout';
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true});await cookies(context,s.client);
 page=await context.newPage();page.setDefaultTimeout(30000);
 await page.goto(h.origin+'/app/invoices/'+s.card.id+'/pay');
 await page.getByRole('button',{name:'Continue existing checkout',exact:true}).click();
 await page.waitForURL(url=>url.hostname==='checkout.stripe.com');assert.equal(checkoutPosts,1);
 await page.locator('#email').waitFor({state:'visible'});
 await page.locator('#email').fill(['synthetic-satchel-reconciliation','example.test'].join('@'));
 const card=page.getByText('Card',{exact:true});if(await card.count())await card.first().click({force:true});
 await page.locator('#cardNumber').fill('4242424242424242');await page.locator('#cardExpiry').fill('1230');await page.locator('#cardCvc').fill('123');
 await page.locator('#billingCountry').selectOption('US');
 if(await page.locator('#billingName').isVisible())await page.locator('#billingName').fill('Synthetic Satchel Client');
 await page.locator('#billingPostalCode').fill('10001');
 const save=page.getByLabel(/Save my information with Link/);if(await save.count())await save.uncheck();
 await page.getByTestId('hosted-payment-submit-button').click();
 await page.waitForURL(h.origin+'/app/invoices/'+s.card.id+'/pay',{timeout:90000});
 const session=await stripe('/checkout/sessions/'+encodeURIComponent(sessions[0].id)+'?expand[]=payment_intent.latest_charge');
 assert.equal(session.status,'complete');assert.equal(session.payment_status,'paid');assert.equal(session.amount_total,totalCents);
 assert.equal(session.client_reference_id,attemptId);assert.equal(session.metadata.satchel_checkout,attemptId);
 const intent=session.payment_intent,charge=intent.latest_charge;
 assert.equal(intent.livemode,false);assert.equal(intent.currency,'usd');assert.equal(intent.amount,totalCents);assert.equal(intent.status,'succeeded');
 assert.equal(intent.metadata.satchel_checkout,attemptId);assert.equal(charge.paid,true);assert.equal(charge.amount,totalCents);
 assert.equal(charge.livemode,false);assert.equal(charge.currency,'usd');assert.equal(charge.payment_method_details.type,'card');proof.hostedCardCompleted=true;proof.collectedCents=charge.amount;

 stage='verifiedCallback';
 await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify({id:'synthetic-satchel-unverified-callback'})}).then(r=>assert.equal(r.status,502));
 const events=await poll(()=>list('/events?type=checkout.session.completed&created[gte]='+Math.max(0,started-30)),events=>events.some(e=>e.data.object.id===session.id));
 const event=events.find(e=>e.data.object.id===session.id);assert.equal(event.livemode,false);
 await callback(event);await callback(event);proof.authenticatedCallback=true;
 state=await h.json('/bills/'+s.card.id+'/reconciliation',undefined,h.owner);
 let attempt=exactReceipt(state,attemptId,charge.id);assert.equal(attempt.events.filter(e=>e.id===event.id).length,1);
 assert.equal(attempt.adjustments.length,0);proof.callbackReplayOnce=true;proof.exactNativeReceipt=true;
 invoice=await h.json(base+'/payment',undefined,s.client);assert.equal(invoice.paidCents,totalCents);assert.equal(invoice.dueCents,0);
 await h.json(base+'/checkout',{requestKey:'synthetic-satchel-reconciliation-paid-repeat'},s.client,409);assert.equal(checkoutPosts,1);

 stage='principalRefund';
 const email=['synthetic-satchel-finance','example.test'].join('@');
 await h.json('/team',{email,name:'Synthetic billing staff',role:'billing'},h.owner);await h.json('/team/invite',{email},h.owner);
 const billing=await h.login(email);await h.json('/matters/'+s.m.id+'/access',{email},h.owner);
 const decision={requestKey:'synthetic-satchel-reconciliation-refund',revision:state.revision,cents:refundCents,reason:'Principal approves the exact partial refund for duplicate work',confirmed:true};
 await h.json(path+'/refund',decision,billing,403);await h.json(path+'/refund',decision,s.client,403);
 await h.json(path+'/refund',{...decision,revision:'stale'},h.owner,409);
 await h.json(path+'/refund',{...decision,confirmed:false},h.owner,409);assert.equal(refundPosts,0);
 state=await h.json(path+'/refund',decision,h.owner);
 assert.equal(refunds.length,1);assert.equal(refundPosts,1);const refund=refunds[0];
 assert.equal(refund.payment_intent,intent.id);assert.equal(refund.charge,charge.id);assert.equal(refund.currency,'usd');assert.equal(refund.amount,refundCents);assert.equal(refund.status,'succeeded');
 attempt=exactReceipt(state,attemptId,charge.id);assert.equal(attempt.refunds.length,1);
 const approval=attempt.refunds[0];assert.equal(approval.approved_by,principal.email);assert.equal(approval.bill_revision,state.revision);
 assert.equal(approval.cents,refundCents);assert.equal(approval.reason,decision.reason);assert.equal(approval.provider_id,refund.id);
 proof.principalExactRefund=true;proof.refundedCents=refund.amount;
 await h.json(path+'/refund',decision,h.owner);
 await h.json(path+'/refund',{...decision,cents:refundCents+1},h.owner,409);
 await h.json(path+'/refund',{...decision,reason:'Different approval'},h.owner,409);
 assert.equal(refundPosts,1);proof.refundReplayOnce=true;

 stage='refundReadback';
 state=await h.json(path+'/reconcile',{},h.owner);await callback(event);
 attempt=exactReceipt(state,attemptId,charge.id);
 assert.equal(attempt.adjustments.length,1);assert.equal(attempt.adjustments[0].kind,'refund');assert.equal(attempt.adjustments[0].cents,refundCents);
 invoice=await h.json(base+'/payment',undefined,s.client);
 assert.equal(invoice.paidCents,totalCents-refundCents);assert.equal(invoice.dueCents,refundCents);assert.equal(invoice.attempts.length,1);
 proof.paidCents=invoice.paidCents;proof.dueCents=invoice.dueCents;proof.invoiceReconciled=true;
 const readCharge=await poll(()=>stripe('/charges/'+encodeURIComponent(charge.id)+'?expand[]=balance_transaction'),c=>c.balance_transaction&&typeof c.balance_transaction==='object');
 const readRefund=await poll(()=>stripe('/refunds/'+encodeURIComponent(refund.id)+'?expand[]=balance_transaction'),r=>r.balance_transaction&&typeof r.balance_transaction==='object');
 assert.equal(readCharge.payment_intent,intent.id);assert.equal(readCharge.amount_refunded,refundCents);
 assert.equal(readRefund.payment_intent,intent.id);assert.equal(readRefund.charge,charge.id);assert.equal(readRefund.status,'succeeded');
 balanceTransaction(readCharge.balance_transaction,totalCents,charge.id);balanceTransaction(readRefund.balance_transaction,-refundCents,refund.id);
 proof.chargeFeeCents=readCharge.balance_transaction.fee;
 proof.processorNetCents=readCharge.balance_transaction.net+readRefund.balance_transaction.net;proof.realBalanceTransactions=true;
 proof.chargeSettlementStatus=readCharge.balance_transaction.status;
 proof.chargeAvailableAt=new Date(readCharge.balance_transaction.available_on*1000).toISOString();
 proof.refundSettlementStatus=readRefund.balance_transaction.status;
 if(process.env.SATCHEL_RECONCILIATION_ARCHIVE){
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();
  assert.ok(!archive.includes(key),'The native archive must exclude the injected provider credential');
  await mkdir(dirname(process.env.SATCHEL_RECONCILIATION_ARCHIVE),{recursive:true});
  await writeFile(process.env.SATCHEL_RECONCILIATION_ARCHIVE,archive,{mode:0o600});proof.resumeArchiveSaved=true;
 }

 stage='automaticPayoutReadback';
 await inspectAutomaticPayouts(path,intent.id,readCharge.balance_transaction,readRefund.balance_transaction);
 state=await h.json('/bills/'+s.card.id+'/reconciliation',undefined,h.owner);
 assert.equal(state.bankStatus,'unconfirmed');assert.equal(state.bankHistory.length,0);proof.bankSettlementUnconfirmed=true;

 stage='restartReplay';
 await h.restart();await callback(event);await callback(event);await h.json(path+'/refund',decision,h.owner);
 await h.json(base+'/checkout',{requestKey:'synthetic-satchel-reconciliation-lost'},s.client,409);
 state=await h.json(path+'/reconcile',{},h.owner);attempt=exactReceipt(state,attemptId,charge.id);
 assert.equal(attempt.refunds.length,1);assert.equal(attempt.adjustments.length,1);assert.equal(attempt.adjustments[0].cents,refundCents);
 assert.equal(attempt.events.filter(e=>e.id===event.id).length,1);assert.equal(checkoutPosts,1);assert.equal(refundPosts,1);
 assert.equal(state.bankStatus,'unconfirmed');assert.equal(state.bankHistory.length,0);
 const providerRefunds=await list('/refunds?payment_intent='+encodeURIComponent(intent.id));
 assert.equal(providerRefunds.length,1);assert.equal(providerRefunds[0].id,refund.id);
 const finalIntent=await stripe('/payment_intents/'+encodeURIComponent(intent.id)+'?expand[]=latest_charge');
 assert.equal(finalIntent.latest_charge.id,charge.id);assert.equal(finalIntent.latest_charge.amount_refunded,refundCents);
 invoice=await h.json(base+'/payment',undefined,s.client);assert.equal(invoice.paidCents,totalCents-refundCents);assert.equal(invoice.dueCents,refundCents);
 proof.restartReplayOnce=true;
 stage='refundScreenshots';await captureRefund(s);
 console.log(JSON.stringify({...proof,checkoutPosts,refundPosts,journeyPassed:true}));
}catch(error){
 console.error(JSON.stringify({stage,error:String(error.message).replace(/https?:\/\/\S+/g,'[redacted address]').replace(/(?:sk|rk)_(?:test|live)_\w+/g,'[redacted]').slice(0,800),location:error.stack?.split('\n').find(line=>line.includes('stripe-reconciliation-sandbox.mjs:'))}));
 if(page&&directory){await mkdir(directory,{recursive:true});await page.screenshot({path:directory+'/reconciliation-failed.png',fullPage:true}).catch(()=>{});}
 console.log(JSON.stringify({...proof,checkoutPosts,refundPosts,assertionFailed:error?.code==='ERR_ASSERTION',
  ...Object.fromEntries(['setup','lostAcknowledgment','financeRecovery','hostedCheckout','verifiedCallback','principalRefund','refundReadback','automaticPayoutReadback','restartReplay','refundScreenshots'].map(name=>['failedAt'+name[0].toUpperCase()+name.slice(1),stage===name])),journeyPassed:false}));
 process.exitCode=1;
}finally{
 await browser?.close();await h?.close();
}
