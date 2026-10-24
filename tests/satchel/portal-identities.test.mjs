import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
import {scheme,draft,reviewed} from './invoice-numbering-fixture.mjs';
test('CLIENT-001 two co-clients, a payer and a delegate each reach only their own portal doors, direct file URLs obey every identity, and staff preview what each sees',async()=>{
 const h=await harness();
 try{
  const m=await open(h),base='/matters/'+m.id,people={};
  const roster=[['lawyer@example.test','lawyer'],['assistant@example.test','assistant'],['client@example.test','client'],['cocl@example.test','client'],['payer@example.test','client'],['deleg@example.test','client'],['stranger@example.test','client'],['second@example.test','client']];
  for(const [email,role] of roster){await h.json('/team',{email,name:email.split('@')[0],role},h.owner);await h.json('/team/invite',{email},h.owner);people[email]=await h.login(email);}
  const [lawyer,assistant,client,coclient,payer,delegate,stranger,second]=roster.map(([e])=>people[e]);
  await h.json(base+'/access',{email:'lawyer@example.test'},h.owner);
  // Identities: only the principal grants; a delegate needs a client to act for; kinds are checked.
  const grant=(body,cookie=h.owner,expected=200)=>h.json(base+'/portal',{reason:'Follows the lease review',...body},cookie,expected);
  await grant({email:'client@example.test'},lawyer,403);await grant({email:'payer@example.test',kind:'owner'},h.owner,400);await grant({email:'deleg@example.test',kind:'delegate',delegateOf:'client@example.test'},h.owner,404);
  await grant({email:'client@example.test'});await grant({email:'cocl@example.test',kind:'co_client'});await grant({email:'second@example.test',kind:'co_client'});await grant({email:'payer@example.test',kind:'payer'});
  await grant({email:'deleg@example.test',kind:'delegate',delegateOf:'deleg@example.test'},h.owner,400);await grant({email:'deleg@example.test',kind:'delegate',delegateOf:'payer@example.test'},h.owner,404);await grant({email:'stranger@example.test',kind:'client',delegateOf:'client@example.test'},h.owner,400);
  const delegated=await grant({email:'deleg@example.test',kind:'delegate',delegateOf:'client@example.test'});assert.deepEqual(delegated.grants.map(g=>g.kind).sort(),['client','co_client','co_client','delegate','payer']);
  for(const [cookie,kind] of [[client,'client'],[coclient,'co_client'],[second,'co_client'],[payer,'payer'],[delegate,'delegate']])assert.deepEqual((await h.json('/portal',undefined,cookie)).grants.map(g=>g.kind),[kind]);
  assert.deepEqual((await h.json('/portal',undefined,stranger)).grants,[]);
  // One release is shared; an internal document and a private one are not.
  const release=await h.json(base+'/documents',{name:'Settlement release.txt',mime:'text/plain',visibility:'matter',contentBase64:Buffer.from('Release of all claims, v1.').toString('base64')},h.owner);
  const privateDoc=await h.json(base+'/documents',{name:'Privileged draft.txt',mime:'text/plain',visibility:'private',contentBase64:Buffer.from('Privileged').toString('base64')},h.owner);
  await h.json(base+'/client-shares',{kind:'document',recordId:privateDoc.id,instructions:'x'},lawyer,404);await h.json(base+'/client-shares',{kind:'document',recordId:release.id,instructions:'Review and tell us if you agree.'},assistant,403);
  await h.json(base+'/client-shares',{kind:'document',recordId:release.id,instructions:'Review and tell us if you agree.'},lawyer);
  const shareId=(await h.json('/portal/matters/'+m.id+'/shares',undefined,client)).items.find(i=>i.kind==='document').id,file=(cookie)=>h.request('/api/satchel/portal/shares/'+shareId+'/file',undefined,cookie);
  // Direct file URLs: clients and a live delegate read the exact original; the payer, a stranger and staff are refused.
  for(const cookie of [client,coclient,second,delegate]){const r=await file(cookie);assert.equal(r.status,200);assert.equal(await r.text(),'Release of all claims, v1.');assert.equal(r.headers.get('cache-control'),'no-store');}
  for(const cookie of [payer,stranger,lawyer,'']){assert.ok([401,403,404].includes((await file(cookie)).status),'refused');}
  assert.equal((await file(payer)).status,404);assert.equal((await file(stranger)).status,404);
  await h.json('/portal/matters/'+m.id+'/shares',undefined,payer,404);await h.json('/portal/matters/'+m.id+'/timeline',undefined,payer,404);await h.json('/portal/matters/'+m.id+'/shares',undefined,stranger,404);
  // The payer reads issued invoices and their PDFs, and nothing else; co-clients and delegates do not.
  await h.json('/invoice-numbering',scheme(),h.owner);const bill=await draft(h,m),approved=await reviewed(h,m,bill),issued=await h.json('/invoices/issue',{bills:[{id:approved.id,revision:approved.revision}]},h.owner);
  const invoices=await h.json('/portal/matters/'+m.id+'/invoices',undefined,payer);assert.equal(invoices.invoices.length,1);assert.equal(invoices.invoices[0].number,issued.issues[0].number);assert.equal(invoices.invoices[0].totalCents,37500);
  const pdf=await h.request('/api/satchel'+invoices.invoices[0].pdfUrl.replace('/api/satchel',''),undefined,payer);assert.equal(pdf.status,200);assert.equal(pdf.headers.get('content-type'),'application/pdf');assert.match(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),/%PDF-/);
  assert.equal((await h.json('/portal/matters/'+m.id+'/invoices',undefined,client)).invoices.length,1);await h.json('/portal/matters/'+m.id+'/invoices',undefined,coclient,404);await h.json('/portal/matters/'+m.id+'/invoices',undefined,second,404);await h.json('/portal/matters/'+m.id+'/invoices',undefined,delegate,404);await h.json('/portal/matters/'+m.id+'/invoices',undefined,stranger,404);
  assert.equal((await h.request('/api/satchel/portal/invoices/'+approved.id+'/pdf',undefined,stranger)).status,404);assert.equal((await h.request('/api/satchel/portal/invoices/'+approved.id+'/pdf',undefined,coclient)).status,404);
  const thread=(await h.json(base+'/threads',{subject:'Release discussion',body:'Please review the shared release.',assignedTo:'lawyer@example.test'},lawyer)).threads[0];
  // Staff preview each identity through that identity's own doors; the preview is audited and staff-only.
  const seen=async email=>h.json(base+'/portal-preview?email='+email,undefined,lawyer);
  const pClient=await seen('client@example.test'),pPayer=await seen('payer@example.test'),pDelegate=await seen('deleg@example.test');
  assert.equal(pClient.shares.items.some(i=>i.title==='Settlement release.txt'),true);assert.equal(pClient.invoices.invoices.length,1);assert.equal(pPayer.shares,null);assert.equal(pPayer.timeline,null);assert.equal(pPayer.invoices.invoices.length,1);assert.equal(pDelegate.invoices,null);assert.equal(pDelegate.identity.delegateOf,'client@example.test');
  for(const [email,cookie] of [['client@example.test',client],['cocl@example.test',coclient],['second@example.test',second],['deleg@example.test',delegate]]){const preview=await seen(email);assert.deepEqual(preview.threads,await h.json('/portal/matters/'+m.id+'/threads',undefined,cookie));assert.deepEqual(preview.requests,await h.json('/portal/matters/'+m.id+'/requests',undefined,cookie));assert.equal(preview.threads.threads.find(t=>t.id===thread.id).unread,1,'Preview does not mark client messages read');}
  assert.equal(pPayer.threads,null);assert.equal(pPayer.requests,null);
  assert.ok(!JSON.stringify([pClient,pPayer,pDelegate]).includes('Privileged'));await h.json(base+'/portal-preview?email=stranger@example.test',undefined,lawyer,404);await h.json(base+'/portal-preview?email=client@example.test',undefined,assistant,403);await h.json(base+'/portal-preview?email=client@example.test',undefined,client,403);
  assert.ok((await h.json('/audit?action=portal.previewed',undefined,h.owner)).records.length>=3);
  for(const cookie of [client,coclient,second,payer,delegate])await h.json('/search?q=Privileged',undefined,cookie,403);
  // Deactivating the represented client closes the delegate too, including the audited preview.
  await h.json('/team',{email:'client@example.test',name:'client',role:'client',active:false},h.owner);
  assert.equal((await file(delegate)).status,404);assert.deepEqual((await h.json('/portal',undefined,delegate)).grants,[]);assert.equal((await seen('deleg@example.test')).shares,null);
  await h.json('/team',{email:'client@example.test',name:'client',role:'client',active:true},h.owner);
  assert.equal((await file(delegate)).status,200);
  // Revoking the delegate closes their URLs at once and leaves the client; revoking the client also closes any delegate.
  const grants=(await h.json(base+'/portal',undefined,h.owner)).grants,byEmail=e=>grants.find(g=>g.email===e&&!g.revokedAt);
  await h.json('/portal-grants/'+byEmail('deleg@example.test').id+'/revoke',{reason:'Delegate no longer acts for the client'},h.owner);
  assert.equal((await file(delegate)).status,404);assert.equal((await file(client)).status,200);assert.deepEqual((await h.json('/portal',undefined,delegate)).grants,[]);
  await grant({email:'deleg@example.test',kind:'delegate',delegateOf:'client@example.test'});assert.equal((await file(delegate)).status,200);
  await h.json('/portal-grants/'+byEmail('client@example.test').id+'/revoke',{reason:'Engagement ended'},h.owner);
  assert.equal((await file(client)).status,404);assert.equal((await file(delegate)).status,404,'A delegate has no access once the client’s grant is withdrawn');assert.equal((await file(coclient)).status,200,'A co-client keeps their own grant');
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text();assert.ok(archive.includes('co_client'));
  // An ethical wall closes every portal read door even when the person retains a grant.
  await h.json(base+'/wall',{custodianEmail:'lawyer@example.test',members:[],reason:'Separate conflicting representation',revision:null},h.owner);
  for(const cookie of [client,coclient,second,payer,delegate]){
   assert.deepEqual((await h.json('/portal',undefined,cookie)).grants,[],'A wall hides the matter itself from every portal identity');
   for(const door of ['shares','timeline','threads','requests','invoices'])await h.json('/portal/matters/'+m.id+'/'+door,undefined,cookie,404);
  }
  assert.equal((await file(coclient)).status,404,'A wall closes a previously authorized shared-file URL');
  assert.equal((await h.request('/api/satchel/portal/invoices/'+approved.id+'/pdf',undefined,payer)).status,404,'A wall closes an issued-invoice PDF URL');
  for(const email of ['cocl@example.test','second@example.test','payer@example.test']){
   const preview=await seen(email);
   for(const door of ['shares','timeline','threads','requests','invoices'])assert.equal(preview[door],null,'The custodian preview obeys the same wall as the portal identity');
  }
  await h.json(base+'/portal-preview?email=cocl@example.test',undefined,h.owner,404);
 }finally{await h.close();}
});
