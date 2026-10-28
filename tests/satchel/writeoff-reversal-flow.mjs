import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
import {stripeEdge,paymentFixture} from './stripe-fixture.mjs';
import {designate} from './trust-fixture.mjs';

export async function proveWriteoffReversal(){
 const edge=stripeEdge(),h=await harness(edge);let restored;
 try{
  const s=await paymentFixture(h),bill=s.card,path='/invoices/'+bill.id+'/writeoff-reversals',payment='/portal/invoices/'+bill.id+'/payment';
  const before=await h.json(payment,undefined,s.client),amount=12000;
  const original=await h.json('/invoices/'+bill.id+'/writeoff',{requestKey:'concession-for-billing-review',revision:bill.revision,cents:amount,reason:'Principal approved a concession pending review of duplicated services',approve:true},h.owner);
  assert.equal((await h.json(payment,undefined,s.client)).dueCents,before.dueCents-amount);
  const voidDecision={revision:bill.revision,reason:'Principal reviews replacing this invoice'};
  await h.json('/invoices/'+bill.id+'/void',voidDecision,h.owner,409);
  const artifact=await(await h.request('/api/satchel/bills/'+bill.id+'/export',undefined,h.owner)).text();
  await designate(h);const account=await h.json('/trust/accounts',{name:'Operating finance corrections',kind:'operating',bankReference:'synthetic-satchel-writeoff-bank'},h.owner);
  const check=await h.json('/offline-payments',{requestKey:'synthetic-satchel-writeoff-check',payer:s.m.client,method:'check',reference:'synthetic-satchel-writeoff-check',purpose:'operating',receivedDate:'2026-10-01',depositDate:'2026-10-01',operatingAccountId:account.id,cents:30000,allocations:[{billId:bill.id,cents:25500}]},h.owner);
  assert.equal(check.creditCents,4500);assert.equal((await h.json(payment,undefined,s.client)).dueCents,0);
  const returned={requestKey:'synthetic-satchel-writeoff-bounce',kind:'bounce',reason:'Bank returned the original check'};
  await h.json('/offline-payments/'+check.id+'/actions',returned,h.owner);await h.json('/offline-payments/'+check.id+'/actions',returned,h.owner);
  assert.equal((await h.json(payment,undefined,s.client)).dueCents,before.dueCents-amount,'A returned receipt leaves the independent approved write-off intact');
  const reversal={requestKey:'restore-reviewed-concession',writeoffId:original.id,revision:bill.revision,cents:5000,reason:'Finance reviewed the source work and approved restoring this part of the receivable',approve:true};
  await h.json(path,reversal,s.client,403);
  const clientMember=(await h.json('/state',undefined,h.owner)).members.find(m=>m.role==='client');assert.ok(clientMember);
  for(const role of ['assistant','lawyer','accountant','trust_officer']){
   await h.json('/team',{email:clientMember.email,name:clientMember.name,role},h.owner);
   await h.json(path,reversal,s.client,403);
  }
  await h.json('/team',{email:clientMember.email,name:clientMember.name,role:'billing'},h.owner);
  await h.json('/matters/'+s.m.id+'/access',{email:clientMember.email},h.owner);
  await h.json(path,reversal,s.client,403);
  await h.json('/team',{email:clientMember.email,name:clientMember.name,role:'client'},h.owner);
  await h.json(path,{...reversal,approve:false},h.owner,403);
  await h.json(path,{...reversal,revision:'superseded-revision'},h.owner,409);
  await h.json(path,{...reversal,cents:amount+1},h.owner,409);
  const first=await h.json(path,reversal,h.owner),replay=await h.json(path,reversal,h.owner);
  assert.equal(replay.reversalId,first.reversalId);assert.equal(replay.reversals.length,1);
  assert.equal(first.writeoffs.find(w=>w.id===original.id).remainingCents,7000);
  assert.equal(first.funds.due_cents,before.dueCents-7000);
  for(const changed of [{cents:5001},{reason:'Different finance decision'},{writeoffId:crypto.randomUUID()}])await h.json(path,{...reversal,...changed},h.owner,409);
  await h.json(path,{...reversal,requestKey:'excess-restoration',cents:7001},h.owner,409);
  const final=await h.json(path,{...reversal,requestKey:'restore-remaining-concession',cents:7000,reason:'Principal completed review and approved restoring the remainder'},h.owner);
  assert.equal(final.writeoffs.find(w=>w.id===original.id).remainingCents,0);
  assert.equal(final.funds.written_off_cents,0);assert.equal(final.funds.paid_cents,0);assert.equal(final.funds.due_cents,before.dueCents);
  assert.equal((await h.json(payment,undefined,s.client)).dueCents,before.dueCents);
  await h.restart();const retained=await h.json(path,undefined,h.owner);
  assert.equal(retained.reversals.length,2);assert.equal(retained.writeoffs[0].id,original.id);
  assert.ok(retained.reversals.every(r=>r.approved_by===original.actor&&r.approved_operator_id&&r.at&&r.bill_revision===bill.revision));
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();restored=await harness(edge);
  await restored.json('/restore',{archive,confirm:'RESTORE'},restored.owner);
  const recovered=await restored.json(path,undefined,restored.owner);assert.deepEqual(recovered.reversals,retained.reversals);assert.deepEqual(recovered.writeoffs,retained.writeoffs);assert.equal(recovered.funds.due_cents,before.dueCents);
  assert.equal((await restored.json(path,reversal,restored.owner)).reversals.length,2);
  await h.json('/invoices/'+bill.id+'/void',voidDecision,h.owner);
  assert.equal(await(await h.request('/api/satchel/bills/'+bill.id+'/export',undefined,h.owner)).text(),artifact,'Finance corrections preserve the original issued artifact');
  const wallOwner=['synthetic-satchel-custodian','example.test'].join('@');
  await h.json('/team',{email:wallOwner,name:'Finance wall custodian',role:'lawyer'},h.owner);await h.json('/team/invite',{email:wallOwner},h.owner);await h.login(wallOwner);
  await h.json('/matters/'+s.m.id+'/wall',{revision:null,custodianEmail:wallOwner,members:[wallOwner],reason:'Finance access withdrawn after the retained decisions'},h.owner);
  await h.json(path,reversal,h.owner,404);await h.json(path,undefined,h.owner,404);
 }finally{await restored?.close();await h.close();}
}
