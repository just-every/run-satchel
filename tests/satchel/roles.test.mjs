import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
import {periodFoundation,transaction} from './trust-period-fixture.mjs';
import {scheme} from './invoice-numbering-fixture.mjs';
const people=[['lawyer','Nora Woods'],['assistant','Morgan Assistant'],['trust_officer','Taylor Officer'],['billing','Blake Billing'],['accountant','Avery Accountant'],['client','Casey Client']];
export async function staffed(h,f){
 const cookies={};
 for(const [role,name] of people){const email=role+'@example.test';await h.json('/team',{email,name,role},h.owner);await h.json('/team/invite',{email},h.owner);cookies[role]=await h.login(email);if(role!=='client')for(const m of [f.m,f.other])await h.json('/matters/'+m.id+'/access',{email},h.owner);}
 return cookies;
}
const all=['lawyer','assistant','trust_officer','billing','accountant','client'];
async function denied(h,cookies,roles,path,body){for(const role of roles)await h.json(path,body,cookies[role],403);}
test('FIRM-002 each built-in role reaches only its own legal, billing, trust, reconciliation, access and portal doors',async()=>{
 const h=await harness();try{
  const f=await periodFoundation(h,'2026-09-01','Community Bank IOLTA, September 2026. Opening $1,000.00; closing $1,000.00.'),c=await staffed(h,f),base='/matters/'+f.m.id;
  // Clients see only explicit portal grants and no staff door.
  assert.deepEqual((await h.json('/portal',undefined,c.client)).grants,[]);
  await denied(h,{...c,owner:h.owner},['lawyer','assistant','trust_officer','billing','accountant'],'/portal',undefined);
  const shared=await h.json(base+'/portal',{email:'client@example.test',reason:'Client asked to follow the lease review'},h.owner);assert.equal(shared.grants.length,1);
  await h.json(base+'/portal',{email:'assistant@example.test',reason:'Not a client'},h.owner,404);await denied(h,c,all,base+'/portal',{email:'client@example.test',reason:'No authority'});
  const portal=await h.json('/portal',undefined,c.client);assert.equal(portal.grants.length,1);assert.equal(portal.grants[0].matterNumber,f.m.matter_number??portal.grants[0].matterNumber);assert.equal(portal.grants[0].title,f.m.title);assert.deepEqual(Object.keys(portal.grants[0]).sort(),['grantedAt','id','matterNumber','status','title']);
  for(const path of ['/state','/matters/'+f.m.id,base+'/billing','/trust','/time','/team','/audit','/reports','/matters/'+f.other.id])await h.json(path,undefined,c.client,403);
  await h.json('/matters/'+f.m.id+'/entries',{kind:'time',date:'2026-10-01',description:'Client write',minutes:6,rateCents:100},c.client,403);
  await h.json('/keys',{label:'client key'},c.client,403);
  // Legal approval: only the principal or a lawyer approves a drafted bill.
  const entry=await h.json(base+'/entries',{kind:'time',date:'2026-10-01',description:'Lease review',minutes:90,rateCents:25000},h.owner);
  const bill=await h.json(base+'/bills',{title:'Lease review',date:'2026-10-01',entryIds:[entry.id]},c.billing);assert.equal(bill.createdBy,'billing@example.test');
  await denied(h,c,['assistant','trust_officer','accountant','client'],base+'/bills',{title:'Denied',date:'2026-10-01',entryIds:[entry.id]});
  await denied(h,c,['assistant','trust_officer','billing','accountant','client'],'/bills/'+bill.id+'/approve',{revision:bill.revision,reviewNote:'Not counsel'});
  await h.json(base+'/billing',undefined,c.billing);for(const role of ['accountant','assistant','lawyer','trust_officer'])await h.json(base+'/billing',undefined,c[role]);
  const rule=await h.json(base+'/tax-rules',{state:'NY',jurisdiction:'New York fixture jurisdiction',rounding:'half_up',reference:'Synthetic reviewed exemption; not tax advice',reviewed:true,service:{eligibility:'exempt',ratePpm:0,reference:'Synthetic reviewed service exemption'},expense:{eligibility:'exempt',ratePpm:0,reference:'Synthetic reviewed expense exemption'}},c.lawyer);
  const review=await h.json('/bills/'+bill.id+'/tax-reviews',{revision:bill.revision,ruleId:rule.id},c.lawyer);
  const approved=await h.json('/bills/'+bill.id+'/approve',{revision:bill.revision,taxReviewId:review.id,reviewNote:'Counsel reviewed the exact bill'},c.lawyer);assert.equal(approved.approvedBy,'lawyer@example.test');
  // Invoice delivery: billing staff (and counsel) issue and export; nobody else.
  await h.json('/invoice-numbering',scheme(),c.billing,403);await h.json('/invoice-numbering',scheme(),h.owner);
  await denied(h,c,['assistant','trust_officer','accountant','client'],'/invoices/issue',{bills:[{id:bill.id,revision:approved.revision}]});
  for(const role of ['assistant','trust_officer','accountant','client']){assert.equal((await h.request('/api/satchel/bills/'+bill.id+'/export',undefined,c[role])).status,403);assert.equal((await h.request('/api/satchel/bills/'+bill.id+'/invoice.pdf',undefined,c[role])).status,403);}
  const issued=await h.json('/invoices/issue',{bills:[{id:bill.id,revision:approved.revision}]},c.billing);assert.equal(issued.issues.length,1);
  assert.equal((await h.request('/api/satchel/bills/'+bill.id+'/invoice.pdf',undefined,c.billing)).status,200);assert.equal((await h.request('/api/satchel/bills/'+bill.id+'/export',undefined,c.billing)).status,200);
  // Billing staff cannot reach trust, legal, membership or access doors.
  for(const path of ['/trust','/trust/transactions','/trust/transfers','/trust/periods?accountId='+f.account.id])await h.json(path,undefined,c.billing,403);
  await denied(h,c,['billing'],'/conflicts',{client:'A',adverse:'B'});await denied(h,c,['billing'],'/trust/periods',{accountId:f.account.id});
  // Trust authorization stays with the designated trust officer.
  const request={accountId:f.account.id,ledgerId:f.ledger.id,direction:'receipt',kind:'receipt',cents:5000,counterparty:'Barton Workshop LLC',bankReference:'retainer-5000',requestKey:'retainer-5000',receivedDate:'2026-09-21',depositDate:'2026-09-21',documentId:f.source.id,purpose:'Retainer receipt'};
  await denied(h,c,['lawyer','assistant','billing','accountant','client'],'/trust/transactions',request);
  const tx=await h.json('/trust/transactions',request,c.trust_officer);
  await denied(h,c,['lawyer','assistant','billing','accountant','client'],'/trust/transactions/'+tx.id+'/decide',{revision:tx.revision,decision:'approved',reviewNote:'Not an officer'});
  await denied(h,c,['lawyer','assistant','billing','accountant','client'],'/trust/transfers/none/decide',{revision:'x',decision:'approved',reviewNote:'Not an officer'});
  await h.json('/trust/transfers/none/decide',{revision:'x',decision:'approved',reviewNote:'Reviewed'},c.trust_officer,404);
  await h.json('/trust/transactions/'+tx.id+'/decide',{revision:tx.revision,decision:'approved',reviewNote:'Bank original, client ownership and amount reviewed'},c.trust_officer);
  // Reconciliation: the accountant reads trust records and reconciles; nothing else.
  const register=await h.json('/trust',undefined,c.accountant);assert.ok(register.entries.some(e=>e.source_id===tx.id));
  for(const path of ['/trust/transactions','/trust/transfers','/trust/checks','/trust/matter-transfers'])await h.json(path,undefined,c.accountant);
  for(const role of ['lawyer','assistant','billing','client'])await h.json('/trust',undefined,c[role],403);
  const period=await h.json('/trust/periods',{accountId:f.account.id,startDate:'2026-09-01',endDate:'2026-09-30',closingBalanceCents:105000,documentId:f.source.id},c.accountant);assert.equal(period.created_by,'accountant@example.test');
  const report=await h.json('/trust/periods/'+period.id,undefined,c.accountant);
  await denied(h,c,['lawyer','assistant','billing','client'],'/trust/periods',{accountId:f.account.id,startDate:'2026-08-01',endDate:'2026-08-31',closingBalanceCents:100000,documentId:f.source.id});
  await h.json('/trust/periods/'+period.id+'/sign',{reportDigest:report.reportDigest,correctionNote:'Accountant cannot sign'},c.accountant,403);
  await h.json('/trust/periods/'+period.id+'/reopen',{reason:'Accountant cannot reopen',documentId:f.source.id},c.accountant,403);
  const cleared=await transaction(h,f,{cleared:false,reference:'clearance-subject',day:'2026-09-22'});
  await h.json('/trust/entries/'+cleared.id+'/clear',{documentId:f.source.id,clearedDate:'2026-09-23',bankReference:'BANK-ACCOUNTANT'},c.accountant);
  await denied(h,c,['lawyer','assistant','billing','client'],'/trust/entries/'+cleared.id+'/clear',{documentId:f.source.id,clearedDate:'2026-09-23',bankReference:'BANK-DENIED'});
  const signed=await h.json('/trust/periods/'+period.id+'/sign',{reportDigest:(await h.json('/trust/periods/'+period.id,undefined,c.trust_officer)).reportDigest,correctionNote:'Differences recorded for correction'},c.trust_officer);assert.ok(signed.id);
  // Accountants read matter context and change nothing outside reconciliation.
  assert.equal((await h.json('/matters/'+f.m.id,undefined,c.accountant)).matter.id,f.m.id);
  for(const [path,body] of [[base+'/entries',{kind:'time',date:'2026-10-02',description:'Denied',minutes:6,rateCents:100}],[base+'/bills',{title:'Denied',date:'2026-10-01',entryIds:[entry.id]}],[base+'/documents',{name:'Denied.txt',mime:'text/plain',contentBase64:Buffer.from('x').toString('base64'),visibility:'matter'}],[base+'/access',{email:'accountant@example.test'}],['/team',{email:'x@example.test',name:'X',role:'lawyer'}],['/trust/transactions',request],['/firm',{settings:{}}],['/keys',{label:'denied'}]])await h.json(path,body,c.accountant,403);
  // Access changes and membership belong to the principal alone.
  await denied(h,c,all,base+'/access',{email:'assistant@example.test'});await denied(h,c,all,'/team',{email:'x@example.test',name:'X',role:'lawyer'});await denied(h,c,all,'/team/invite',{email:'assistant@example.test'});
  // Withdrawn sharing closes the client view; every action is audited with the actor's role.
  await h.json('/portal-grants/'+shared.grants[0].id+'/revoke',{reason:'Engagement ended'},h.owner);assert.deepEqual((await h.json('/portal',undefined,c.client)).grants,[]);
  const audit=(await h.json('/audit?limit=200',undefined,h.owner)).records;
  for(const [action,role] of [['portal.granted','owner'],['portal.revoked','owner'],['bill.prepared','billing'],['invoice.issued','billing'],['trust.statement_imported','accountant'],['trust.clearance_recorded','accountant'],['bill.approved','lawyer']])assert.ok(audit.some(r=>r.action===action&&r.actor.role===role),action+' by '+role);
  // The roles and the portal history survive an archive restore.
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),target=await harness();
  try{await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);const restored=await target.json(base+'/portal',undefined,target.owner);assert.equal(restored.grants.length,1);assert.ok(restored.grants[0].revokedAt);assert.deepEqual((await target.json('/state',undefined,target.owner)).members.filter(m=>['billing','accountant','client'].includes(m.role)).map(m=>m.role).sort(),['accountant','billing','client']);}finally{await target.close();}
  // A stale agent key cannot outlive its sponsor's lawyer role.
  const key=await h.json('/keys',{label:'lawyer preparation'},c.lawyer);const agent=(path)=>h.request('/api/satchel'+path,undefined,'',{authorization:'Bearer '+key.key});
  assert.equal((await agent('/agent/context')).status,200);await h.json('/team',{email:'lawyer@example.test',name:'Nora Woods',role:'billing'},h.owner);assert.equal((await agent('/agent/context')).status,403);
 }finally{await h.close();}
});
