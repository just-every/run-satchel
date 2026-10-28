import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
import {paymentFixture} from './stripe-fixture.mjs';
import {paymentPlanEdge} from './payment-plan-edge.mjs';

const definition=bill=>({approve:true,billRevision:bill.revision,balanceCents:37500,startDate:'2026-11-01',reason:'Principal approves the exact balance and three installments',installments:[{dueDate:'2026-11-01',cents:12500},{dueDate:'2026-12-01',cents:12500},{dueDate:'2027-01-01',cents:12500}]});
const planPath=id=>'/payment-plans/'+id;
const billPath=id=>'/bills/'+id+'/payment-plans';
async function authorize(h,edge,p,client,key){
 const b={revision:p.revision,agree:true,requestKey:key},setup=await h.json(planPath(p.id)+'/mandate',b,client);
 await h.json(planPath(p.id)+'/mandate',b,client);assert.ok(setup.id);
 edge.completeSetup(setup.id);
 return h.json(planPath(p.id)+'/mandate/confirm',{revision:p.revision,agree:true,setupId:setup.id},client);
}
export async function provePaymentPlans(){
 const edge=paymentPlanEdge(),h=await harness(edge);
 try{
  const s=await paymentFixture(h),d=definition(s.card);
  await h.json('/team',{email:'billing@example.test',name:'Billing colleague',role:'billing'},h.owner);await h.json('/team/invite',{email:'billing@example.test'},h.owner);const billing=await h.login('billing@example.test');await h.json('/matters/'+s.m.id+'/access',{email:'billing@example.test'},h.owner);
  await h.json(billPath(s.card.id),d,billing,403);await h.json(billPath(s.card.id),{...d,balanceCents:37501},h.owner,409);
  let p=await h.json(billPath(s.card.id),d,h.owner);assert.equal(p.status,'paused');assert.deepEqual(p.installments.map(i=>i.cents),[12500,12500,12500]);
  await h.scheduled('2026-11-01T12:00:00Z');assert.equal(edge.chargeCalls,0,'Principal approval alone cannot collect');
  await h.json(planPath(p.id)+'/mandate',{revision:p.revision,agree:true,requestKey:'synthetic-satchel-staff-consent'},h.owner,403);
  await h.json(planPath(p.id)+'/mandate',{revision:p.revision,agree:false,requestKey:'synthetic-satchel-denied-consent'},s.client,400);
  p=await authorize(h,edge,p,s.client,'synthetic-satchel-client-plan');assert.equal(p.status,'active');assert.equal(p.consent.client_email,'client@example.test');assert.ok(!JSON.stringify(p).includes(d.reason),'Internal finance approval reasons are withheld from the client');assert.equal((await h.json(planPath(p.id),undefined,h.owner)).version.reason,d.reason);
  await h.scheduled('2026-11-01T12:00:00Z');await h.scheduled('2026-11-01T12:15:00Z');assert.equal(edge.chargeCalls,1);
  let invoice=await h.json('/portal/invoices/'+s.card.id+'/payment',undefined,s.client);assert.equal(invoice.paidCents,12500);assert.equal(invoice.dueCents,25000);
  p=await h.json(planPath(p.id)+'/actions',{kind:'revoke',revision:p.revision,reason:'Client withdraws future collection authorization'},s.client);assert.equal(p.status,'stopped');p=await h.json(planPath(p.id),undefined,h.owner);
  const stoppedTask=p.events.find(e=>e.kind==='stopped')?.task_id;assert.ok(stoppedTask);const tasks=await h.json('/matters/'+s.m.id+'/tasks',undefined,h.owner);assert.equal(tasks.find(t=>t.id===stoppedTask)?.status,'open');
  await h.restart();await h.scheduled('2027-01-02T12:00:00Z');assert.equal(edge.chargeCalls,1,'Consent revocation survives restart without a second charge');
  await h.json(billPath(s.ach.id),{...definition(s.ach),sourceSystem:'Source practice',sourceReference:'source-plan-1',paymentMethodId:'copied-source-credential'},h.owner,400);
  const beforeImportMail=h.mails.length;
  let imported=await h.json(billPath(s.ach.id),{...definition(s.ach),sourceSystem:'Source practice',sourceReference:'source-plan-1'},h.owner);assert.equal(imported.status,'paused');assert.equal(imported.consent,null);
  const importedTask=imported.events.find(e=>e.kind==='imported_paused')?.task_id;assert.ok(importedTask);const importTasks=await h.json('/matters/'+s.m.id+'/tasks',undefined,h.owner);assert.ok(importTasks.find(t=>t.id===importedTask)?.dueDate<'2026-11-01');
  await h.restart();await h.scheduled('2027-01-02T12:00:00Z');assert.equal(edge.chargeCalls,1,'Imported source schedule never carries collection authority');assert.equal(h.mails.length,beforeImportMail,'Import prepares a human task without outbound contact');
  imported=await authorize(h,edge,imported,s.client,'synthetic-satchel-import-reauthorize');await h.scheduled('2026-11-01T12:00:00Z');assert.equal(edge.chargeCalls,2);
  assert.equal((await h.json('/portal/invoices/'+s.ach.id+'/payment',undefined,s.client)).paidCents,12500);
  // A hardship change replaces only future terms and always asks the client again.
  const changed={...definition(s.ach),planId:imported.id,revision:imported.revision,balanceCents:25000,startDate:'2027-02-01',reason:'Principal approves client requested hardship dates',installments:[{dueDate:'2027-02-01',cents:10000},{dueDate:'2027-03-01',cents:15000}]};
  const hardship=await h.json(billPath(s.ach.id),changed,h.owner);assert.equal(hardship.status,'paused');assert.equal(hardship.history.length,2);assert.equal(hardship.consent,null);await h.scheduled('2027-03-02T12:00:00Z');assert.equal(edge.chargeCalls,2);
  await h.json(planPath(hardship.id)+'/mandate',{revision:imported.revision,agree:true,requestKey:'synthetic-satchel-stale-plan'},s.client,409);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),restored=await harness(edge);
  try{await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);await restored.scheduled('2027-03-02T12:00:00Z');assert.equal(edge.chargeCalls,2);const retained=await restored.json(planPath(p.id),undefined,restored.owner);assert.equal(retained.status,'stopped');assert.equal(retained.events.filter(e=>e.kind==='stopped').length,1);assert.equal((await restored.json('/portal/invoices/'+s.card.id+'/payment',undefined,restored.owner)).paidCents,12500);}finally{await restored.close();}
  const renewed=await authorize(h,edge,hardship,s.client,'synthetic-satchel-hardship-consent');assert.equal(renewed.status,'active');
  await h.scheduled('2027-02-01T12:00:00Z');await h.scheduled('2027-02-01T12:15:00Z');assert.equal(edge.chargeCalls,3);assert.equal((await h.json('/portal/invoices/'+s.ach.id+'/payment',undefined,s.client)).paidCents,22500);
  await proveStoppedProviderPlans(h,edge,s);
 }finally{await h.close();}
}
async function proveStoppedProviderPlans(h,edge,s){
 for(const kind of ['failure','dispute','uncertain']){
  const bill=await s.issue('Plan '+kind),d=definition(bill);let p=await h.json(billPath(bill.id),d,h.owner);p=await authorize(h,edge,p,s.client,'synthetic-satchel-plan-'+kind);
  edge.setOutcome(kind==='failure'?'requires_payment_method':'succeeded');if(kind==='uncertain')edge.losePlanResponse();
  const before=edge.chargeCalls;await h.scheduled('2026-11-01T12:00:00Z');assert.equal(edge.chargeCalls,before+1);
  if(kind==='dispute'){
   const intent=[...edge.intents.values()].at(-1),event=edge.dispute(intent);assert.equal((await h.raw('/api/satchel/stripe/events',{method:'POST',body:JSON.stringify(event)})).status,200);
  }
  p=await h.json(planPath(p.id),undefined,h.owner);assert.equal(p.status,'stopped',kind+' stops future installments');assert.ok(p.events.find(e=>e.kind==='stopped')?.task_id);
  await h.restart();await h.scheduled('2027-01-02T12:00:00Z');assert.equal(edge.chargeCalls,before+1,kind+' cannot automatically retry');
  const invoice=await h.json('/portal/invoices/'+bill.id+'/payment',undefined,s.client);assert.equal(invoice.paidCents,0);assert.equal(invoice.dueCents,37500);
 }
}
