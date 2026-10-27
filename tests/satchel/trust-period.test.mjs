import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
import {periodFoundation,transaction,correction,createPeriod,sign} from './trust-period-fixture.mjs';
import {principalTrustChanges,nativePrincipalChanges,accountAccessChanges,assertTrustAudit} from './trust-publication-flow.mjs';
test('TRUST-005: import original statements, drill $12.50 suspense and outstanding check, correct by journal, sign exact consecutive monthly packets',async()=>{
 const h=await harness();try{
 const f=await periodFoundation(h,'2026-08-01','Community Bank IOLTA, August 1–31, 2026. Opening $1,000.00; August 10 Barton receipt $12.50; closing $1,012.50. Check 1042 for $200.00 remains outstanding.'),suspense=await transaction(h,f,{ledgerId:null,reference:'unallocated-1250',day:'2026-08-10'}),check=await transaction(h,f,{cents:20000,direction:'disbursement',day:'2026-08-15',cleared:false,reference:'CHECK-1042'});
 const p=await createPeriod(h,f,'2026-08-01','2026-08-31');let r=await h.json('/trust/periods/'+p.id,undefined,h.owner);
 assert.equal(r.registerCents,81250);assert.equal(r.subsidiaryCents,80000);assert.equal(r.adjustedBankCents,81250);assert.equal(r.balanced,false);
 assert.equal(r.outstandingChecksCents,20000);assert.equal(r.outstandingChecks[0].id,check.id);assert.equal(r.outstandingChecks[0].sources[0].bank_reference,'CHECK-1042');assert.equal(r.suspense[0].id,suspense.id);assert.ok(r.differences.some(d=>Math.abs(d.cents)===1250&&d.entryIds.includes(suspense.id)));
 assert.equal(r.sourceDocument.id,f.source.id);assert.equal((await h.request('/api/satchel/documents/'+f.source.id+'/file?version='+r.sourceDocument.version,undefined,h.owner)).status,200);
 await h.json('/trust/periods/'+p.id+'/sign',{reportDigest:r.reportDigest},h.owner,409);
 await correction(h,f,suspense,'2026-08-20');await transaction(h,f,{day:'2026-08-20',reference:'correct-client-1250'});
 r=await h.json('/trust/periods/'+p.id,undefined,h.owner);assert.deepEqual([r.adjustedBankCents,r.registerCents,r.subsidiaryCents],[81250,81250,81250]);assert.equal(r.balanced,true);
 const packet=await sign(h,p),download=await h.request('/api/satchel/trust/packets/'+packet.id,undefined,h.owner);assert.equal(download.status,200);const original=await download.text();assert.ok(download.headers.get('content-disposition').includes('attachment'));
 f.source=await h.json('/matters/'+f.m.id+'/documents',{name:'September 2026 bank statement.txt',mime:'text/plain',contentBase64:Buffer.from('Community Bank IOLTA, September 1–30, 2026. Opening $1,012.50; September 2 Barton deposit $50.00; closing $1,062.50. Check 1042 for $200.00 remains outstanding.').toString('base64'),visibility:'matter'},h.owner);await transaction(h,f,{day:'2026-09-02',cents:5000,reference:'september-deposit'});const september=await createPeriod(h,f,'2026-09-01','2026-09-30',106250),sep=await h.json('/trust/periods/'+september.id,undefined,h.owner);assert.deepEqual([sep.adjustedBankCents,sep.registerCents,sep.subsidiaryCents],[86250,86250,86250]);await sign(h,september);
 assert.equal(await(await h.request('/api/satchel/trust/packets/'+packet.id,undefined,h.owner)).text(),original);
 const ca=await h.json('/trust/packets/'+packet.id+'/records?state=CA',undefined,h.owner),ny=await h.json('/trust/packets/'+packet.id+'/records?state=NY',undefined,h.owner);
 assert.equal(ca.packetDigest,packet.digest);assert.equal(ca.complete,false);assert.equal(ca.reviewRequired,true);assert.equal(ny.requiredRetentionYears,7);assert.equal(ny.complete,false);
 assert.deepEqual(ca.fields.map(f=>[f.name,f.value]),[['periodStart','2026-08-01'],['periodEnd','2026-08-31'],['bankStatementClosingCents',101250],['bankRegisterCents',81250],['clientLedgerTotalCents',81250],['outstandingDepositCents',0],['outstandingCheckCents',20000],['adjustedBankCents',81250]]);
 const sourceRows=(await h.json('/trust',undefined,h.owner)).entries.filter(e=>e.account_id===f.account.id&&e.effective_date<='2026-08-31'),sourceEntryIds=sourceRows.map(e=>e.id).sort();
 const expectedSources={
  periodStart:[p.id],periodEnd:[p.id],bankStatementClosingCents:[p.id],bankRegisterCents:sourceEntryIds,clientLedgerTotalCents:sourceRows.filter(e=>e.ledger_id!==null).map(e=>e.id).sort(),
  outstandingDepositCents:[],outstandingCheckCents:[check.id],adjustedBankCents:[p.id,check.id].sort()
 };
 for(const preview of [ca,ny])assert.deepEqual(Object.fromEntries(preview.fields.map(field=>[field.name,field.sources.map(source=>source.id).sort()])),expectedSources,'Every current preview field retains its complete source cohort');
 assert.equal(ca.fields.find(f=>f.name==='outstandingCheckCents').sources[0].id,check.id);assert.equal(ca.statementOriginal.id,packet.snapshot.sourceDocument.id);
 const nyCheck=ny.journal.find(e=>e.entryId===check.id);assert.deepEqual([nyCheck.cents,nyCheck.transaction.counterparty,nyCheck.transaction.bankReference,nyCheck.transaction.receivedDate],[-20000,'County filing office','CHECK-1042','2026-08-15']);assert.equal(nyCheck.transaction.sourceDocumentId,packet.snapshot.entries.find(e=>e.id===check.id).transaction.sourceDocumentId);
 assert.deepEqual(ny.ledgers.map(l=>[l.ledgerId,l.balanceCents]),[[f.ledger.id,81250],[f.otherLedger.id,0]]);assert.equal(ny.recordIndex.bankStatement.id,packet.snapshot.sourceDocument.id);assert.ok(ny.missing.length>0&&ca.missing.length>0);
 await h.json('/trust/packets/'+packet.id+'/records?state=XX',undefined,h.owner,400);
 const cutoff=await h.json('/trust/ledgers/'+f.ledger.id+'/statement?cutoffDate=2026-08-31',undefined,h.owner);assert.equal(cutoff.closingBalanceCents,81250);assert.ok(cutoff.entries.every(e=>e.effective_date<='2026-08-31'));
 await h.json('/team',{email:'assistant@example.test',name:'Case assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');await h.json('/trust/periods/'+p.id,undefined,assistant,403);await h.json('/trust/periods/'+p.id+'/sign',{reportDigest:r.reportDigest},assistant,403);
 const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),target=await harness();try{await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);assert.equal(await(await target.request('/api/satchel/trust/packets/'+packet.id,undefined,target.owner)).text(),original);}finally{await target.close();}
 }finally{await h.close();}
});

test('TRUST-008: exact signed statements require principal release and current named client grants; withdrawal, walls and restore never revive access',async()=>{
 const h=await harness();try{
 const f=await periodFoundation(h);await transaction(h,f,{day:'2026-09-20',reference:'statement-client-receipt'});
 const p=await createPeriod(h,f),packet=await sign(h,p),base='/matters/'+f.m.id,door='/portal/matters/'+f.m.id+'/trust-statements';
 const people={};
 for(const [email,role] of [['client@example.test','client'],['co@example.test','client'],['payer@example.test','client'],['delegate@example.test','client'],['stranger@example.test','client'],['officer@example.test','trust_officer'],['lawyer@example.test','lawyer'],['assistant@example.test','assistant'],['billing@example.test','billing'],['accountant@example.test','accountant']]){
  await h.json('/team',{email,name:email,role},h.owner);await h.json('/team/invite',{email},h.owner);people[email]=await h.login(email);
 }
 const [client,co,payer,delegate,stranger,officer,lawyer]=['client','co','payer','delegate','stranger','officer','lawyer'].map(n=>people[n+'@example.test']);
 for(const [name,kind] of [['client','client'],['co','co_client'],['payer','payer'],['delegate','delegate']])await h.json(base+'/portal',{email:name+'@example.test',kind,delegateOf:kind==='delegate'?'client@example.test':undefined,reason:'Named current portal recipient'},h.owner);
 const releaseBody={packetId:packet.id,packetDigest:packet.digest,confirmed:true,recipient:'client@example.test',reason:'Reviewed exact monthly client statement for authenticated delivery'};
 const release=(body=releaseBody,cookie=h.owner,expected=200,ledger=f.ledger.id)=>h.json('/trust/ledgers/'+ledger+'/releases',body,cookie,expected);
 const view=async(cookie=client)=>h.json(door,undefined,cookie);
 assert.deepEqual((await view()).statements,[],'A matter grant does not publish a statement');
 for(const name of ['officer','lawyer','client','assistant','billing','accountant'])await release(releaseBody,people[name+'@example.test'],403);
 const key=await h.json('/keys',{label:'Financial preparation only'},h.owner);await h.json('/trust/ledgers/'+f.ledger.id+'/releases',releaseBody,'',401,{authorization:'Bearer '+key.key});
 await h.json(door,undefined,'',401,{authorization:'Bearer '+key.key});
 await release({...releaseBody,confirmed:false},h.owner,409);await release({...releaseBody,packetDigest:'unreviewed'},h.owner,409);
 for(const recipient of ['payer','delegate','stranger'])await release({...releaseBody,recipient:recipient+'@example.test'},h.owner,409);
 await release(releaseBody,h.owner,404,'missing-ledger');
 await release({...releaseBody,packetId:p.id},h.owner,404);
 const callsBefore=h.outboundRequests.length;
 const published=await release();assert.equal(h.outboundRequests.length,callsBefore,'Statement publication calls no outbound provider');assert.deepEqual((await h.json('/trust/ledgers/'+f.ledger.id+'/releases',undefined,h.owner)).releases.map(r=>r.id),[published.id]);await h.json('/trust/ledgers/'+f.ledger.id+'/releases',undefined,officer,403);let statements=(await view()).statements;
 assert.equal(statements.length,1);assert.deepEqual(statements.map(s=>[s.ledgerId,s.openingBalanceCents,s.closingBalanceCents]),[[f.ledger.id,0,101250]]);
 assert.deepEqual(statements[0].entries.map(e=>[e.date,e.cents,e.runningBalanceCents]),[['2026-09-01',100000,100000],['2026-09-20',1250,101250]]);
 assert.deepEqual(Object.keys(statements[0].entries[0]).sort(),['cents','date','id','kind','runningBalanceCents']);
 const payload=JSON.stringify(statements);for(const secret of [f.other.id,f.otherLedger.id,f.otherSource.id,f.account.id,f.source.id,'4821','source_document_id','approved_by','bankReference'])assert.ok(!payload.includes(secret),'Client receives no account, source document or other client data');
 for(const cookie of [co,payer,delegate,stranger])assert.deepEqual((await view(cookie)).statements,[]);
 await principalTrustChanges(h,async()=>(await view()).statements,status=>release({...releaseBody,recipient:'co@example.test'},h.owner,status));
 await nativePrincipalChanges(h,async()=>(await view()).statements,status=>release({...releaseBody,recipient:'co@example.test'},h.owner,status));
 await accountAccessChanges(h,f,async()=>(await view()).statements,status=>release({...releaseBody,recipient:'co@example.test'},h.owner,status));
 const operators=await(await h.request('/auth/operators',undefined,h.owner)).json(),auditContext={actorId:operators.find(o=>o.email==='owner@example.test').id,matterId:f.m.id};
 const clientGrant=(await h.json(base+'/portal',undefined,h.owner)).grants.find(g=>g.email==='client@example.test');
 const releaseAudit=await assertTrustAudit(h,'trust.statement_released',published.id,packet.id,{id:published.id,ledger_id:f.ledger.id,packet_id:packet.id,grant_id:clientGrant.id,revoked_by:null,revoked_at:null,revoke_reason:null,recipient:'client@example.test',created_by:'owner@example.test',created_at:published.releasedAt,reason:releaseBody.reason},auditContext);
 assert.deepEqual(releaseAudit.detail,{ledgerId:f.ledger.id,packetId:packet.id,packetDigest:packet.digest,grantId:clientGrant.id,recipient:'client@example.test',reason:releaseBody.reason});
 await release({...releaseBody,recipient:'co@example.test'});assert.equal((await view(co)).statements[0].closingBalanceCents,101250);
 await h.json('/trust/packets/'+packet.id,undefined,client,403);await h.json('/trust/packets/'+packet.id+'/records?state=CA',undefined,client,403);await h.json('/trust/ledgers/'+f.ledger.id+'/statement?cutoffDate=2026-09-30',undefined,client,403);
 await h.json(door,undefined,h.owner,403);await h.json(door,undefined,'',401);
 await transaction(h,f,{day:'2026-10-01',cents:5000,reference:'later-receipt'});assert.deepEqual((await view()).statements,statements,'Published view stays at the frozen signed cutoff');
 await h.restart();assert.deepEqual((await view()).statements,statements);
 const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),target=await harness();try{
  await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);
  assert.equal((await target.request('/api/satchel/trust/packets/'+packet.id,undefined,target.owner)).status,200);
  const originalHistory=await h.json('/audit?action=trust.statement_released',undefined,h.owner),restoredHistory=await target.json('/audit?action=trust.statement_released',undefined,target.owner);assert.deepEqual(restoredHistory.records,originalHistory.records,'Restore retains all statement release attribution without restoring its authority');
  await target.json('/team/invite',{email:'client@example.test'},target.owner);
  const restored=await target.login('client@example.test');assert.deepEqual((await target.json(door,undefined,restored)).statements,[],'Restore retains signed records but never imports release authority');
 }finally{await target.close();}
 await h.json('/trust/statement-releases/'+published.id+'/revoke',{reason:'Principal withdraws exact release'},officer,403);
 await h.json('/trust/statement-releases/'+published.id+'/revoke',{reason:'Principal withdraws exact release'},h.owner);assert.deepEqual((await view()).statements,[]);assert.equal((await view(co)).statements.length,1);
 const withdrawal=await assertTrustAudit(h,'trust.statement_withdrawn',published.id,packet.id,{id:published.id,packet_id:packet.id,revoked_by:'owner@example.test',revoke_reason:'Principal withdraws exact release'},auditContext);assert.ok(Number.isFinite(Date.parse(withdrawal.evidence.record.revoked_at)));
 const grant=(await h.json(base+'/portal',undefined,h.owner)).grants.find(g=>g.email==='co@example.test');
 await h.json('/portal-grants/'+grant.id+'/revoke',{reason:'Client authority withdrawn'},h.owner);
 assert.deepEqual((await view(co)).statements,[]);
 await h.json(base+'/portal',{email:'co@example.test',kind:'co_client',reason:'Fresh grant needs a fresh release'},h.owner);
 assert.deepEqual((await view(co)).statements,[],'A new grant never revives a release tied to the old grant');
 await h.json('/trust/periods/'+p.id+'/reopen',{packetId:packet.id,documentId:f.source.id,reason:'Review exact signed version before a fresh release'},h.owner);
 await release({...releaseBody,recipient:'co@example.test'},h.owner,409);
 assert.deepEqual((await view()).statements,[],'Withdrawal retains its effect after reopening');
 const corrected=await sign(h,p);assert.equal(corrected.version,2);
 await release({...releaseBody,recipient:'co@example.test'},h.owner,409);
 await release({...releaseBody,packetId:corrected.id,packetDigest:corrected.digest,recipient:'co@example.test'});assert.equal((await view(co)).statements.length,1);
 releaseBody.packetId=corrected.id;releaseBody.packetDigest=corrected.digest;
 await h.json('/matters/'+f.other.id+'/portal',{email:'co@example.test',kind:'co_client',reason:'Unrelated current grant cannot bypass a wall'},h.owner);
 await h.json(base+'/portal',{email:'stranger@example.test',kind:'client',reason:'A fresh recipient will still be refused behind a wall'},h.owner);await h.json('/matters/'+f.other.id+'/portal',{email:'stranger@example.test',kind:'client',reason:'Another permitted matter does not authorize this one'},h.owner);
 const wall=await h.json(base+'/wall',{custodianEmail:'owner@example.test',members:['lawyer@example.test'],reason:'Principal can review while clients remain walled',revision:null},h.owner);
 assert.deepEqual((await view(co)).statements,[]);const walled=await release({...releaseBody,recipient:'stranger@example.test'},h.owner,409);assert.match(walled.error,/without an ethical wall/);
 await h.json(base+'/access',{email:'lawyer@example.test'},h.owner);await h.json(base+'/wall',{custodianEmail:'lawyer@example.test',members:[],reason:'Separate representation blocks all portal records',revision:wall.revision},h.owner);
 assert.deepEqual((await view(co)).statements,[]);await release({...releaseBody,recipient:'co@example.test'},h.owner,404);
 }finally{await h.close();}
});

test('TRUST-008: a posted threshold crossing produces an exact approved portal replenishment request and never a debit',async()=>{
 const h=await harness();try{
 const f=await periodFoundation(h),base='/trust/ledgers/'+f.ledger.id,portal='/portal/matters/'+f.m.id+'/replenishments';
 for(const [email,role] of [['client@example.test','client'],['co@example.test','client'],['payer@example.test','client'],['delegate@example.test','client'],['stranger@example.test','client'],['officer@example.test','trust_officer'],['accountant@example.test','accountant'],['assistant@example.test','assistant'],['billing@example.test','billing'],['lawyer@example.test','lawyer']]){await h.json('/team',{email,name:email,role},h.owner);await h.json('/team/invite',{email},h.owner);}
 const client=await h.login('client@example.test'),co=await h.login('co@example.test'),officer=await h.login('officer@example.test'),accountant=await h.login('accountant@example.test'),others={};
 for(const name of ['payer','delegate','stranger','assistant','billing','lawyer'])others[name]=await h.login(name+'@example.test');
 for(const [email,kind] of [['client@example.test','client'],['co@example.test','co_client']])await h.json('/matters/'+f.m.id+'/portal',{email,kind,reason:'Current recipient'},h.owner);
 const policy={thresholdCents:90000,targetCents:150000,reason:'Reviewed retainer terms; no collection authority',confirmed:true};
 await h.json(base+'/retainer-policy',policy,officer,403);await h.json(base+'/retainer-policy',policy,client,403);
 await h.json(base+'/retainer-policy',{...policy,targetCents:50000},h.owner,400);await h.json(base+'/retainer-policy',policy,h.owner);
 const normal=await h.json(base+'/balance-alert',undefined,h.owner);assert.deepEqual([normal.low,normal.balanceCents,normal.requestedCents,normal.crossingEntryId],[false,100000,50000,null]);
 const approval={recipient:'client@example.test',confirmed:true,reviewDigest:normal.reviewDigest,reason:'Approve exact replenishment request'};
 await h.json(base+'/replenishments',approval,h.owner,409);assert.deepEqual((await h.json(portal,undefined,client)).requests,[]);
 await transaction(h,f,{direction:'disbursement',cents:10000,day:'2026-09-15',reference:'boundary-payment'});
 assert.equal((await h.json(base+'/balance-alert',undefined,h.owner)).low,false,'Exactly at threshold is not low');
 const crossing=await transaction(h,f,{direction:'disbursement',cents:2500,day:'2026-09-16',reference:'crossing-payment'});
 const alert=await h.json(base+'/balance-alert',undefined,h.owner);assert.deepEqual([alert.low,alert.balanceCents,alert.requestedCents,alert.crossingEntryId],[true,87500,62500,crossing.id]);assert.ok(alert.entryIds.includes(crossing.id));
 await h.json('/matters/'+f.m.id+'/access',{email:'officer@example.test'},h.owner);await h.json('/matters/'+f.m.id+'/access',{email:'accountant@example.test'},h.owner);
 assert.equal((await h.json(base+'/balance-alert',undefined,officer)).balanceCents,87500);assert.equal((await h.json(base+'/balance-alert',undefined,accountant)).balanceCents,87500);
 await h.json(base+'/balance-alert',undefined,client,403);await h.json(base+'/replenishments',{...approval,reviewDigest:alert.reviewDigest},officer,403);await h.json(base+'/replenishments',{...approval,reviewDigest:alert.reviewDigest},accountant,403);
 await h.json(base+'/replenishments',approval,h.owner,409);await h.json(base+'/replenishments',{...approval,reviewDigest:alert.reviewDigest,confirmed:false},h.owner,409);
 for(const name of ['assistant','billing','lawyer'])await h.json(base+'/replenishments',{...approval,reviewDigest:alert.reviewDigest},others[name],403);
 const key=await h.json('/keys',{label:'No delegated financial publication'},h.owner);await h.json(base+'/replenishments',{...approval,reviewDigest:alert.reviewDigest},'',401,{authorization:'Bearer '+key.key});await h.json(portal,undefined,'',401,{authorization:'Bearer '+key.key});

 for(const [email,kind] of [['payer@example.test','payer'],['delegate@example.test','delegate']])await h.json('/matters/'+f.m.id+'/portal',{email,kind,delegateOf:kind==='delegate'?'client@example.test':undefined,reason:'Financial release eligibility check'},h.owner);
 for(const recipient of ['payer','delegate','stranger'])await h.json(base+'/replenishments',{...approval,reviewDigest:alert.reviewDigest,recipient:recipient+'@example.test'},h.owner,409);
 const before=await h.json('/trust',undefined,h.owner),mailCount=h.mails.length,providerCount=h.outboundRequests.length;
 const delivered=await h.json(base+'/replenishments',{...approval,reviewDigest:alert.reviewDigest},h.owner);
 assert.equal(delivered.requestedCents,62500);assert.equal(h.outboundRequests.length,providerCount,'Replenishment publication calls no outbound provider');assert.equal(h.mails.length,mailCount,'Publication sends no email or provider request');
 assert.deepEqual((await h.json('/trust',undefined,h.owner)).entries,before.entries,'Approval creates neither a bank entry nor a debit');
 const requests=(await h.json(portal,undefined,client)).requests;assert.deepEqual(requests,[{id:delivered.id,deliveredAt:delivered.deliveredAt,balanceCents:87500,targetCents:150000,requestedCents:62500,moneyMovement:false}]);assert.deepEqual((await h.json(portal,undefined,co)).requests,[]);
 await h.json(base+'/replenishments',{...approval,reviewDigest:alert.reviewDigest},h.owner,409);
 await h.restart();assert.deepEqual((await h.json(portal,undefined,client)).requests,requests);
 const read=async()=>(await h.json(portal,undefined,client)).requests,publish=status=>h.json(base+'/replenishments',{...approval,reviewDigest:alert.reviewDigest,recipient:'co@example.test'},h.owner,status);
 await principalTrustChanges(h,read,publish,{officerOnly:true});await nativePrincipalChanges(h,read,publish);await accountAccessChanges(h,f,read,publish);
 for(const name of ['payer','delegate','stranger'])assert.deepEqual((await h.json(portal,undefined,others[name])).requests,[]);
 const operators=await(await h.request('/auth/operators',undefined,h.owner)).json(),auditContext={actorId:operators.find(o=>o.email==='owner@example.test').id,matterId:f.m.id};
 const clientGrant=(await h.json('/matters/'+f.m.id+'/portal',undefined,h.owner)).grants.find(g=>g.email==='client@example.test');
 const publication=await assertTrustAudit(h,'trust.replenishment_delivered',delivered.id,alert.policyId,{id:delivered.id,ledger_id:f.ledger.id,policy_id:alert.policyId,crossing_entry_id:crossing.id,grant_id:clientGrant.id,recipient:'client@example.test',snapshot:JSON.stringify(alert),created_by:'owner@example.test',created_at:delivered.deliveredAt,reason:approval.reason},auditContext);
 assert.equal(publication.detail.reviewDigest,alert.reviewDigest);assert.equal(publication.detail.requestedCents,62500);
 await assertTrustAudit(h,'trust.retainer_policy_approved',alert.policyId,alert.policyId,{id:alert.policyId,ledger_id:f.ledger.id,threshold_cents:90000,target_cents:150000,approved_by:'owner@example.test',reason:policy.reason},auditContext);
 const revisedPolicy=await h.json(base+'/retainer-policy',{...policy,targetCents:160000,reason:'Approve a revised target without changing earlier delivered requests'},h.owner),archiveAlert=await h.json(base+'/balance-alert',undefined,h.owner);
 assert.equal(archiveAlert.policyId,revisedPolicy.id);assert.equal(archiveAlert.requestedCents,72500);assert.deepEqual((await h.json(portal,undefined,client)).requests,requests,'A new policy cannot rewrite the earlier published request');
 await h.json(base+'/replenishments',{...approval,reviewDigest:alert.reviewDigest,recipient:'co@example.test'},h.owner,409);
 const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),target=await harness();try{
  await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);await target.json('/team/invite',{email:'client@example.test'},target.owner);const restored=await target.login('client@example.test');
  assert.deepEqual((await target.json(portal,undefined,restored)).requests,[],'Restored history never recreates delivery authority');
  const history=await target.json('/audit?action=trust.replenishment_delivered',undefined,target.owner);assert.deepEqual(history.records,[publication],'Restore retains the complete immutable publication attribution and exact reviewed snapshot');
  const restoredAlert=await target.json(base+'/balance-alert',undefined,target.owner);assert.deepEqual(restoredAlert,archiveAlert,'Restore retains exact policy revision, thresholds, crossing and balance basis');
  const restoredPolicy=await target.json('/audit?action=trust.retainer_policy_approved',undefined,target.owner),originalPolicy=await h.json('/audit?action=trust.retainer_policy_approved',undefined,h.owner);assert.deepEqual(restoredPolicy.records,originalPolicy.records);
 }finally{await target.close();}

 const publishedCo=await h.json(base+'/replenishments',{...approval,reviewDigest:(await h.json(base+'/balance-alert',undefined,h.owner)).reviewDigest,recipient:'co@example.test'},h.owner);assert.equal((await h.json(portal,undefined,co)).requests[0].id,publishedCo.id);
 await transaction(h,f,{cents:5000,day:'2026-09-17',reference:'restored-above-threshold'});assert.equal((await h.json(base+'/balance-alert',undefined,h.owner)).low,false);await h.json(base+'/replenishments',{...approval,reviewDigest:alert.reviewDigest},h.owner,409);
 const grant=(await h.json('/matters/'+f.m.id+'/portal',undefined,h.owner)).grants.find(g=>g.email==='client@example.test');await h.json('/portal-grants/'+grant.id+'/revoke',{reason:'Authority ended'},h.owner);assert.deepEqual((await h.json(portal,undefined,client)).requests,[]);
 await h.json('/matters/'+f.m.id+'/portal',{email:'client@example.test',kind:'client',reason:'Replacement grant conveys no old financial release'},h.owner);
 assert.deepEqual((await h.json(portal,undefined,client)).requests,[]);

 const wall=await h.json('/matters/'+f.m.id+'/wall',{custodianEmail:'owner@example.test',members:[],reason:'No portal financial disclosure behind a wall',revision:null},h.owner);
 assert.deepEqual((await h.json(portal,undefined,co)).requests,[],'A wall hides an already published replenishment request');
 assert.deepEqual((await h.json(portal,undefined,client)).requests,[]);
 await transaction(h,f,{direction:'disbursement',cents:5000,day:'2026-09-18',reference:'next-low-crossing'});
 const walledAlert=await h.json(base+'/balance-alert',undefined,h.owner);assert.equal(walledAlert.low,true);
 await h.json(base+'/replenishments',{...approval,recipient:'co@example.test',reviewDigest:walledAlert.reviewDigest},h.owner,409);
 await h.json('/ethical-walls/'+wall.id+'/dissolve',{reason:'Review complete',revision:wall.revision},h.owner);
 const coRequest=await h.json(base+'/replenishments',{...approval,recipient:'co@example.test',reviewDigest:walledAlert.reviewDigest},h.owner);assert.ok((await h.json(portal,undefined,co)).requests.some(r=>r.id===coRequest.id));
 const audit=await h.json('/audit?action=trust.replenishment_delivered',undefined,h.owner);assert.ok(audit.records.some(r=>r.action==='trust.replenishment_delivered'&&r.objectId===delivered.id));
 }finally{await h.close();}
});
