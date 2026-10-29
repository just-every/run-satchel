import assert from 'node:assert/strict';
import {earnedBill} from './trust-fixture.mjs';

// Extends the existing move sanity journey, through the built HTTP application.
export async function proveMyCaseLedger(h,job,active,archived){
 const ledger=async(asOf='2020-04-03')=>h.json('/migration/ledger',{id:job.job.id,asOf},h.owner);
 const issued=await ledger('2020-04-01');
 assert.deepEqual([issued.totals.billedCents,issued.totals.paidCents,issued.totals.creditedCents,issued.totals.dueCents,issued.totals.trustHeldCents],[15000,0,0,15000,150001]);
 const paid=await ledger('2020-04-02');assert.deepEqual([paid.totals.paidCents,paid.totals.dueCents],[2000,13000]);
 const source=await ledger();
 assert.deepEqual([source.totals.billedCents,source.totals.paidCents,source.totals.creditedCents,source.totals.dueCents,source.totals.unbilledCents,source.totals.trustHeldCents],[15000,1750,250,13000,10000,150001]);
 assert.equal(source.invoices[0].number,'MYCASE-2020-81');assert.equal(source.invoices[0].dueDate,'2020-04-15');assert.equal(source.totals.overdueCents,0);
 assert.ok(source.transactions.filter(t=>t.kind.startsWith('source_')).every(t=>t.source.documentId&&t.source.version===1&&/^[a-f0-9]{64}$/.test(t.source.sha256)));
 assert.ok(source.coverageGaps.some(g=>g.includes('authorized supplemental')));
 const overdue=await ledger('2020-05-20');assert.equal(overdue.totals.overdueCents,13000);assert.equal(overdue.aging.payer[0].days31to60Cents,13000);
 for(const group of ['payer','matter','lawyer']){
  const csv=await h.request('/api/satchel/migration/ledger.csv',{id:job.job.id,asOf:'2020-05-20',group},h.owner);assert.equal(csv.status,200);assert.match(csv.headers.get('content-type'),/text\/csv/);const contents=await csv.text();assert.ok(contents.includes('"13000"'));assert.ok(contents.includes(group==='matter'?active.matter_number:group==='payer'?active.client:'Unassigned'));
 }
 await h.json('/migration/ledger',{id:job.job.id,asOf:'2020-02-30'},h.owner,400);
 await h.json('/migration/ledger.csv',{id:job.job.id,asOf:'2020-05-20',group:'secret'},h.owner,400);
 const bill=await earnedBill(h,active,10000,'Native advice following MyCase cutover preparation');
 const operating=await h.json('/trust/accounts',{name:'Synthetic Satchel move operating',kind:'operating',bankReference:'Synthetic Satchel operating statement'},h.owner);
 const receipt=await h.json('/offline-payments',{requestKey:'synthetic-satchel-move-ledger-check',payer:active.client,method:'check',reference:'Synthetic Satchel check statement',receivedDate:'2026-10-01',depositDate:'2026-10-02',operatingAccountId:operating.id,cents:2500,purpose:'operating',allocations:[{billId:bill.id,cents:1000}]},h.owner);
 const today='2099-12-31',current=await ledger(today);
 assert.equal(current.totals.paidCents,2750);assert.equal(current.totals.unappliedCreditCents,1500);assert.equal(current.invoices.find(b=>b.id===bill.id).dueCents,9000);
 assert.equal(current.transactions.filter(t=>t.kind==='offline_receipt'&&t.id===receipt.id).length,1);
 await h.json('/offline-payments/'+receipt.id+'/actions',{requestKey:'synthetic-satchel-move-ledger-bounce',kind:'bounce',reason:'Returned check confirmed in the source operating statement.'},h.owner);
 const bounced=await ledger(today);assert.equal(bounced.totals.paidCents,1750);assert.equal(bounced.totals.unappliedCreditCents,0);assert.equal(bounced.invoices.find(b=>b.id===bill.id).dueCents,10000);
 assert.deepEqual((await ledger('2020-04-03')).totals,source.totals,'A later check and its reversal do not change the source-date statement');
 const billNow=(await h.json('/matters/'+active.id+'/billing',undefined,h.owner)).bills.find(b=>b.id===bill.id);
 await h.json('/invoices/'+bill.id+'/void',{revision:billNow.revision,reason:'Reviewed released work is to be rebilled separately.'},h.owner);
 const voided=await ledger(today);assert.equal(voided.invoices.find(b=>b.id===bill.id).dueCents,0);assert.equal(voided.invoices.find(b=>b.id===bill.id).voided,true);assert.equal(voided.transactions.filter(t=>t.kind==='invoice_void'&&t.billId===bill.id).length,1);
 const entries=(await h.json('/matters/'+active.id+'/billing',undefined,h.owner)).entries.filter(e=>!e.reservedBy&&e.description==='Native advice following MyCase cutover preparation');assert.equal(entries.length,1);
 const replacement=await h.json('/matters/'+active.id+'/bills',{title:'Reviewed replacement after returned source-era check',date:'2026-10-01',entryIds:[entries[0].id]},h.owner);
 const {exemptTaxReview}=await import('./tax-fixture.mjs');
 await h.json('/bills/'+replacement.id+'/approve',{revision:replacement.revision,reviewNote:'Exact released source work reviewed for replacement.',taxReviewId:await exemptTaxReview(h,'/bills/'+replacement.id+'/approve')},h.owner);
 const afterRebill=await ledger(today);assert.equal(afterRebill.invoices.find(b=>b.id===replacement.id).dueCents,10000);assert.ok(afterRebill.transactions.find(t=>t.kind==='invoice_void'&&t.billId===bill.id).replacements.some(b=>b.id===replacement.id));
 assert.deepEqual((await ledger('2020-04-03')).totals,source.totals);

 const trustBill=await earnedBill(h,active,5000,'Native trust-supported advice after source import');
 const trust=(await h.json('/trust',undefined,h.owner)).ledgers.find(l=>l.matter_id===active.id),document=(await h.json('/matters/'+active.id+'/documents',undefined,h.owner))[0];
 let policy=await h.json('/trust/transfer-policy',undefined,h.owner);await h.json('/trust/transfer-policy',{revision:policy.revision,dualAuthorization:false},h.owner);
 const application=await h.json('/trust/transfers',{billId:trustBill.id,ledgerId:trust.id,operatingAccountId:operating.id,requestKey:'synthetic-satchel-move-ledger-trust',allocation:{earnedCents:2500,taxCents:0,reference:'Reviewed partial earned amount and explicit zero tax.'}},h.owner);
 await h.json('/trust/transfers/'+application.id+'/decide',{revision:application.revision,decision:'approved',reviewNote:'Designated officer approves this exact partial application.'},h.owner);
 const bank={revision:application.revision,bankDate:'2026-10-03',bankReference:'Synthetic Satchel source-era trust transfer',documentId:document.id,evidence:'Exact bank application and source statement reviewed.'};
 await h.json('/trust/transfers/'+application.id+'/bank-result',{...bank,outcome:'submitted'},h.owner);await h.json('/trust/transfers/'+application.id+'/bank-result',{...bank,outcome:'cleared'},h.owner);
 const applied=await ledger(today),linked=applied.transactions.filter(t=>t.kind==='trust_application'&&t.billId===trustBill.id);assert.equal(linked.length,1);assert.ok(linked[0].source.trustEntryId&&linked[0].source.operatingEntryId);assert.equal(applied.transactions.filter(t=>t.id===linked[0].source.trustEntryId).length,0,'Paired trust debit is shown beside its application, without counting it twice');assert.equal(applied.totals.trustHeldCents,147501);assert.equal(applied.invoices.find(b=>b.id===trustBill.id).dueCents,2500);
 const reversal=await h.json('/trust/transfers/'+application.id+'/reversal',{reason:'Reviewed exact return to client trust.'},h.owner);
 const action='/trust/transfers/'+application.id+'/reversal/action';
 await h.json(action,{revision:reversal.revision,kind:'approved',note:'Exact original application reversal approved.'},h.owner);
 const reversedBank={revision:reversal.revision,note:'Exact bank return and retained source statement reconciled.',bankReference:'Synthetic Satchel source-era trust reversal',bankDate:'2026-10-04',documentId:document.id};
 await h.json(action,{...reversedBank,kind:'submitted'},h.owner);await h.json(action,{...reversedBank,kind:'cleared'},h.owner);
 const reversed=await ledger(today);assert.equal(reversed.transactions.filter(t=>t.kind==='trust_application_reversal'&&t.billId===trustBill.id).length,1);assert.equal(reversed.totals.trustHeldCents,150001);assert.equal(reversed.invoices.find(b=>b.id===trustBill.id).dueCents,5000);
 const edge=h.migrationStripeEdge;
 await h.json('/providers/stripe/review',{termsUrl:'https://stripe.com/legal/ssa',confirmed:true},h.owner);await h.json('/stripe/settings',{kind:'operating',confirmed:true},h.owner);
 const collection=await h.json('/portal/invoices/'+trustBill.id+'/checkout',{requestKey:'synthetic-satchel-move-ledger-ach'},h.owner),session=[...edge.sessions.values()].find(s=>s.client_reference_id===collection.id);
 const notify=async(type,status,extra)=>{const event=edge.event(session,type,status,extra);const response=await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(event)});assert.equal(response.status,200);return event;};
 await notify('checkout.session.completed','pending');let processor=await ledger(today);assert.equal(processor.totals.pendingCents,5000);assert.equal(processor.invoices.find(b=>b.id===trustBill.id).dueCents,5000,'Pending ACH never settles the invoice');
 const paidEvent=await notify('checkout.session.async_payment_succeeded','paid');await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(paidEvent)});processor=await ledger(today);assert.equal(processor.totals.pendingCents,0);assert.equal(processor.invoices.find(b=>b.id===trustBill.id).dueCents,0);assert.equal(processor.transactions.filter(t=>t.kind==='processor_payment'&&t.billId===trustBill.id).length,1);
 await notify('charge.failed','returned',{status:'failed',amount_refunded:0});processor=await ledger(today);assert.equal(processor.invoices.find(b=>b.id===trustBill.id).dueCents,5000);assert.equal(processor.transactions.filter(t=>t.kind==='processor_return'&&t.billId===trustBill.id).length,1);
 assert.deepEqual((await ledger('2020-04-03')).totals,source.totals);
 await h.restart();assert.deepEqual((await ledger(today)).totals,processor.totals);
 const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),{harness}=await import('./harness.mjs'),restored=await harness(edge);
 try{await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);const recovered=await restored.json('/migration/ledger',{id:job.job.id,asOf:today},restored.owner);assert.deepEqual(recovered.totals,processor.totals);assert.deepEqual(recovered.transactions.map(t=>t.id),processor.transactions.map(t=>t.id));}finally{await restored.close();}

 const readerEmail=['synthetic-satchel-ledger-reader','example.test'].join('@');await h.json('/team',{email:readerEmail,name:'Synthetic Satchel statement reader',role:'lawyer'},h.owner);await h.json('/team/invite',{email:readerEmail},h.owner);const reader=await h.login(readerEmail);await h.json('/matters/'+active.id+'/access',{email:readerEmail},h.owner);
 await h.json('/migration/ledger',{id:job.job.id,asOf:today},reader,403);await h.json('/migration/ledger.csv',{id:job.job.id,asOf:today,group:'payer'},reader,403);
 await h.json('/matters/'+active.id+'/access',{email:readerEmail,remove:true},h.owner);await h.json('/migration/ledger',{id:job.job.id,asOf:today},reader,403);
}
