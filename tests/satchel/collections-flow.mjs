import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
import {foundation} from './trust-fixture.mjs';
import {scheme} from './invoice-numbering-fixture.mjs';
import {invoiceTemplate,setupInvoicePayers} from './invoice-delivery-fixture.mjs';
import {exemptTaxReview} from './tax-fixture.mjs';
import {collectionsBrowser} from './collections-browser.mjs';
export const address=name=>[name,'example.test'].join('@');
export async function collectionsFlow(options={}){
 let lost=false;const h=await harness({...options,mailResponse:(message,request)=>lost&&message.subject==='An invoice is available'?new Response('Provider acknowledgment unavailable',{status:503}):options.mailResponse?options.mailResponse(message,request):Response.json({id:'synthetic-satchel-'+crypto.randomUUID()})}),original=h.json;h.json=async(...args)=>{try{return await original(...args);}catch(error){throw new Error('Collection journey door '+args[0]+': '+error.message,{cause:error});}};try{
  const f=await foundation(h),m=f.m,base='/matters/'+m.id,client=address('client');
  const parties=await setupInvoicePayers(h,m),clientCookie=await h.login(client);
  await h.json('/providers/mail/review',{termsUrl:'https://www.twilio.com/en-us/legal/tos',confirmed:true},h.owner);
  await h.json(base+'/stage-profile',{revision:null,lawyerEmail:address('owner')},h.owner);
  const invoice=await h.json('/client-reminder-templates',{kind:'invoice',confirmed:true,reason:'Counsel approves the exact generic notice'},h.owner),appointment=await h.json('/client-reminder-templates',{kind:'appointment',confirmed:true,reason:'Counsel approves the exact generic notice'},h.owner);
  await h.json(base+'/client-reminders',{enabled:true,invoiceTemplate:invoice.id,appointmentTemplate:appointment.id,maxContacts:7,reason:'Explicit per-matter authority for consented reminders'},h.owner);
  await h.json('/invoice-numbering',scheme(),h.owner);
  const template=await h.json('/invoice-templates',invoiceTemplate(null,{dueDays:0}),h.owner);
  const bills=[];
  async function issued(title,cents=10000,entryIds){
   if(!entryIds){const entry=await h.json(base+'/entries',{kind:'time',date:'2026-10-01',description:title,minutes:60,rateCents:cents},h.owner);entryIds=[entry.id];}
   let b=await h.json(base+'/bills',{title,date:'2026-10-01',entryIds},h.owner);b=await h.json('/bills/'+b.id+'/approve',{revision:b.revision,reviewNote:'Counsel reviewed the exact earned services',taxReviewId:await exemptTaxReview(h,'/bills/'+b.id+'/approve')},h.owner);
   await h.json('/invoices/issue',{bills:[{id:b.id,revision:b.revision,templateId:template.id}]},h.owner);
   await h.json('/bills/'+b.id+'/deliveries',{recipient:client,payerName:m.client,templateId:template.id},h.owner);bills.push(b);return b;
  }
  const state=()=>h.json(base+'/collections',undefined,h.owner),get=async id=>(await state()).sequences.find(s=>s.id===id);
  const start=async source=>h.json(base+'/collections',{...source,recipient:client,firstDueAt:'2000-01-01T00:00:00.000Z',steps:[0,7,14],reason:'Counsel approves three consented reminder steps',confirmed:true},h.owner);
  const run=id=>h.json('/collections/'+id+'/run',{},h.owner),act=(id,kind)=>h.json('/collections/'+id+'/actions',{kind,note:'Counsel routes and resolves '+kind+' with the responsible person'},h.owner);
  const receipt=async(b,key,cents=10000)=>h.json('/offline-payments',{requestKey:key,payer:m.client,method:'check',reference:'synthetic-satchel-'+key,receivedDate:'2026-10-01',depositDate:'2026-10-02',operatingAccountId:f.operating.id,cents,purpose:'operating',allocations:[{billId:b.id,cents}]},h.owner);
  const bounce=async(p,key)=>h.json('/offline-payments/'+p.id+'/actions',{requestKey:key,kind:'bounce',reason:'Bank returned the recorded check'},h.owner);
  const first=await issued('Overdue counsel invoice'),s=await start({billId:first.id});
  assert.equal(s.owner_email,address('owner'));assert.equal(s.dueCents,10000);assert.ok(s.nextDueAt);assert.equal((await start({billId:first.id})).id,s.id,'Replay retains the one sequence');
  await h.json('/team',{email:address('assistant'),name:'Collection assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:address('assistant')},h.owner);const assistant=await h.login(address('assistant'));
  await h.json('/collections/'+s.id+'/run',{},assistant,403);assert.equal((await get(s.id)).attempts.length,0);
  assert.ok(Date.parse((await state()).invoices.find(i=>i.id===first.id).dueDate)<Date.parse('2030-01-01T12:00:00.000Z'));await h.scheduled('2030-01-01T12:00:00.000Z');let result=await get(s.id);assert.equal(result.step,1);assert.equal(result.attempts[0].due_cents,10000);assert.ok(['accepted','sandbox_validated'].includes(result.attempts[0].outcome));
  await run(s.id);assert.equal((await get(s.id)).step,1,'Replayed capture cannot contact again');
  await h.json('/mail-attempts/'+result.attempts[0].attempt_id+'/resend-review',{reason:'Cannot bypass the collection step'},h.owner,409);
  for(const kind of ['dispute','promise','hardship','representation']){assert.equal((await act(s.id,kind)).status,'paused');await h.scheduled('2030-01-08T12:00:00.000Z');assert.equal((await get(s.id)).step,1);assert.equal((await act(s.id,'clear')).status,'active');}
  const paid=await receipt(first,'paid');assert.equal((await get(s.id)).status,'resolved');await h.scheduled('2030-01-08T12:00:00.000Z');assert.equal((await get(s.id)).step,1);
  await bounce(paid,'returned');assert.equal((await get(s.id)).status,'active');await h.restart();await h.scheduled('2030-01-08T12:00:00.000Z');result=await get(s.id);assert.equal(result.step,2);assert.deepEqual(result.attempts.map(a=>a.collection_step),[0,1]);
  await bounce(paid,'returned');assert.equal((await get(s.id)).step,2);await act(s.id,'stop');

  const full=await issued('Trust pays in full'),part=await issued('Trust pays in part'),sf=await start({billId:full.id}),sp=await start({billId:part.id});
  const opening=await h.json('/trust/openings',{accountId:f.account.id,ledgerId:f.ledger.id,cents:20000,statementDate:'2026-10-01',documentId:f.source.id,note:'Reviewed client opening funds'},h.owner);await h.json('/trust/openings/'+opening.id+'/approve',{revision:opening.revision,reviewNote:'Officer checked original bank evidence'},h.owner);
  let policy=await h.json('/trust/transfer-policy',undefined,h.owner);await h.json('/trust/transfer-policy',{revision:policy.revision,dualAuthorization:false},h.owner);
  await h.json('/trust/ledgers/'+f.ledger.id+'/retainer-policy',{thresholdCents:10000,targetCents:20000,reason:'Principal-approved low retainer target',confirmed:true},h.owner);
  async function apply(b,cents,key){const t=await h.json('/trust/transfers',{billId:b.id,ledgerId:f.ledger.id,operatingAccountId:f.operating.id,requestKey:key,allocation:{earnedCents:cents,taxCents:0,reference:'Exact reviewed earned fees'}},h.owner);await h.json('/trust/transfers/'+t.id+'/decide',{revision:t.revision,decision:'approved',reviewNote:'Officer approves exact same-client application'},h.owner);const bank={revision:t.revision,bankDate:'2026-10-03',bankReference:'synthetic-satchel-'+key,documentId:f.source.id,evidence:'Bank confirmation and amount reconciled'};await h.json('/trust/transfers/'+t.id+'/bank-result',{...bank,outcome:'submitted'},h.owner);await h.json('/trust/transfers/'+t.id+'/bank-result',{...bank,outcome:'cleared'},h.owner);return t;}
  await apply(full,10000,'full');const partialTransfer=await apply(part,5000,'part');assert.equal((await get(sf.id)).status,'resolved');assert.equal((await get(sp.id)).dueCents,5000);assert.equal((await get(sp.id)).status,'active');
  result=await run(sp.id);assert.equal(result.attempts[0].due_cents,5000);assert.equal((await run(sf.id)).attempts.length,0);
  const alert=await h.json('/trust/ledgers/'+f.ledger.id+'/balance-alert',undefined,h.owner);assert.equal(alert.low,true);
  await h.json('/trust/ledgers/'+f.ledger.id+'/replenishments',{recipient:client,reason:'Principal approves exact replenishment after the trust application',confirmed:true,reviewDigest:alert.reviewDigest},h.owner);
  const retainer=await start({ledgerId:f.ledger.id});assert.equal(retainer.dueCents,15000);result=await run(retainer.id);assert.equal(result.step,1);assert.equal(result.attempts[0].due_cents,15000);
  const refill=await h.json('/trust/transactions',{requestKey:'synthetic-satchel-refill',accountId:f.account.id,ledgerId:f.ledger.id,direction:'receipt',kind:'retainer',cents:15000,receivedDate:'2026-10-04',depositDate:'2026-10-04',clearedDate:'2026-10-04',counterparty:m.client,bankReference:'synthetic-satchel-replenished',purpose:'Client replenished the reviewed target',documentId:f.source.id},h.owner);await h.json('/trust/transactions/'+refill.id+'/decide',{revision:refill.revision,decision:'approved',reviewNote:'Officer confirms the received funds'},h.owner);assert.equal((await get(retainer.id)).status,'resolved');
  const reversal=await h.json('/trust/transfers/'+partialTransfer.id+'/reversal',{reason:'Correct the mistaken partial application'},h.owner);await h.json('/trust/transfers/'+partialTransfer.id+'/reversal/action',{revision:reversal.revision,kind:'approved',note:'Principal trust officer approves this exact reversal'},h.owner);const reverseBank={revision:reversal.revision,note:'Bank confirms the exact returned allocation',bankReference:'synthetic-satchel-reversed',bankDate:'2026-10-05',documentId:f.source.id};for(const kind of ['submitted','cleared'])await h.json('/trust/transfers/'+partialTransfer.id+'/reversal/action',{...reverseBank,kind},h.owner);assert.equal((await get(sp.id)).dueCents,10000);assert.equal((await get(sp.id)).status,'active');await h.json('/trust/transfers/'+partialTransfer.id+'/reversal/action',{...reverseBank,kind:'cleared'},h.owner);assert.equal((await get(sp.id)).dueCents,10000);await act(sp.id,'stop');

  const old=await issued('Invoice to void'),sv=await start({billId:old.id});await run(sv.id);
  await h.json('/invoices/'+old.id+'/void',{revision:old.revision,reason:'Counsel corrects the source work and rebills'},h.owner);assert.equal((await get(sv.id)).status,'void');await h.json('/collections/'+sv.id+'/actions',{kind:'clear',note:'Cannot revive a void invoice'},h.owner,409);
  const replacement=await issued('Replacement invoice',10000,old.snapshot.lines.map(l=>l.sourceId));await h.json('/invoices/'+old.id+'/replacement',{replacementBillId:replacement.id,reason:'Reviewed replacement of the voided invoice'},h.owner);const sr=await start({billId:replacement.id});assert.equal(sr.step,0);assert.equal(sr.status,'active');assert.equal((await get(sv.id)).step,1);
  await h.scheduled('2030-02-01T12:00:00.000Z');assert.equal((await get(sr.id)).step,1);assert.equal((await get(sv.id)).step,1);
  const current=await get(sr.id);await parties.consent(parties.client.id,'denied');await h.scheduled('2030-02-08T12:00:00.000Z');assert.equal((await get(sr.id)).step,current.step,'Withdrawn consent prevents the next send');
  await parties.consent(parties.client.id,'allowed');
  const clientState=await h.json('/portal',undefined,clientCookie);assert.ok(clientState);
  // Current authority is checked through the real portal revocation door.
  if(!options.sendgridResponse){
   const uncertain=await issued('Uncertain notification'),su=await start({billId:uncertain.id});lost=true;await h.scheduled('2030-03-01T12:00:00.000Z');let u=await get(su.id);assert.equal(u.status,'review');assert.equal(u.step,1);await h.scheduled('2030-03-08T12:00:00.000Z');assert.equal((await get(su.id)).step,1,'Unknown acknowledgment never retries automatically');lost=false;await act(su.id,'decision');await h.scheduled('2030-03-08T12:00:00.000Z');u=await get(su.id);assert.equal(u.step,2);assert.deepEqual(u.attempts.map(a=>a.collection_step),[0,1]);await act(su.id,'stop');
  }
  await h.json(base+'/client-reminders',{enabled:true,invoiceTemplate:invoice.id,appointmentTemplate:appointment.id,maxContacts:1,reason:'Counsel limits collection contact across all sequences'},h.owner);
  const capA=await issued('Capped collection A'),capB=await issued('Capped collection B'),ca=await start({billId:capA.id}),cb=await start({billId:capB.id});await h.scheduled('2030-04-01T12:00:00.000Z');const capped=await Promise.all([get(ca.id),get(cb.id)]);assert.deepEqual(capped.map(c=>c.step).sort(),[0,1],'The shared cap permits exactly one recipient contact');
  const grants=await h.json(base+'/portal',undefined,h.owner);
  const portalGrant=(Array.isArray(grants)?grants:grants.grants).find(g=>g.email===client);await h.json('/portal-grants/'+portalGrant.id+'/revoke',{reason:'Client representation changed'},h.owner);
  const blocked=capped.find(c=>c.step===0),denial=await h.json('/collections/'+blocked.id+'/run',{},h.owner,409);assert.match(denial.error,/withdrawn|not authorized/);await h.scheduled('2030-04-08T12:00:00.000Z');assert.equal((await get(blocked.id)).step,0,'Revoked access never sends');
  assert.equal((await get(sf.id)).status,'resolved','A paid invoice remains resolved when reminder authority changes');const retainedStep=(await get(sr.id)).step;await h.restart();assert.equal((await get(sr.id)).step,retainedStep,'Restart retains every attempted step');
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),target=await harness();try{await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);const restored=await target.json(base+'/collections',undefined,target.owner);assert.equal(restored.sequences.find(c=>c.id===s.id).step,2);assert.equal(restored.sequences.find(c=>c.id===sv.id).status,'void');assert.equal(restored.sequences.find(c=>c.id===retainer.id).status,'review','Excluded replenishment authority cannot revive on restore');assert.equal(restored.sequences.find(c=>c.id===retainer.id).dueCents,null,'An unavailable source never claims a zero balance');}finally{await target.close();}
  if(options.browser!==false){for(const cappedSequence of [ca,cb])await act(cappedSequence.id,'stop');await h.json(base+'/portal',{email:client,kind:'client',reason:'Fresh explicit portal approval for the collection screen journey'},h.owner);const uiBill=await issued('Counsel collection screen');await collectionsBrowser(h,m,{...uiBill,number:(await state()).invoices.find(i=>i.id===uiBill.id).number});}
  const summary={outcomes:6,invoiceSteps:(await get(s.id)).step,trustRemainingCents:(await get(sp.id)).dueCents,retainerReplenishmentProved:true},mailCount=h.mails.length;assert.equal((await h.request('/auth/signout',{},h.owner)).status,204);await h.json(base+'/collections',undefined,h.owner,401);await h.json('/collections/'+sr.id+'/run',{},h.owner,401);assert.equal(h.mails.length,mailCount,'A revoked native session cannot expose collections or replay an outbound step');return summary;
 }finally{await h.close();}
}
