import assert from 'node:assert/strict';
import {authorizeAgent} from './agent-fixture.mjs';
import {capturePanel} from './browser-shots.mjs';

export async function exerciseWorkReconciliation(page,h,width){
 const m=(await h.json('/state',undefined,h.owner)).matters.find(m=>m.client==='Harper Bakery LLC'),base='/matters/'+m.id;
 const entry=await h.json(base+'/entries',{kind:'time',date:'2026-10-15',description:'Confirmed source for reconciliation review',minutes:30,rateCents:10000},h.owner);
 const key=await h.json('/keys',{label:'Native reconciliation review'},h.owner),{auth}=await authorizeAgent(h,key,m.id);
 const r=(await h.json('/agent/matters/'+m.id,undefined,'',200,auth)).billing.workReconciliation;
 const proposal=await h.json('/agent/prepare-bill',{matterId:m.id,title:'Reconciled source review',date:'2026-10-17',entryIds:[entry.id],reconciliationId:r.id},'',200,auth);
 await page.reload();await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Preparations',exact:true}).click();
 const card=page.locator('article.record').filter({hasText:'Reconciled source review'});
 await card.getByRole('heading',{name:'Confirmed work reconciliation'}).waitFor();
 await card.getByText('Recommendation provenance',{exact:true}).click();
 await card.getByText('Source history',{exact:true}).click();
 if(width===1440){
  assert.ok((await card.innerText()).includes('Confirmed source for reconciliation review'));
  assert.ok((await card.innerText()).includes(entry.revision));
  assert.ok((await card.innerText()).includes('Omitted from live invoices'));
  assert.ok((await card.innerText()).includes('creates a draft for counsel review'));
  assert.ok((await card.innerText()).includes(r.id));
  assert.ok((await card.innerText()).includes('$50.00'));
 }
 if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,card,process.env.SATCHEL_SCREENSHOTS,`agent-work-reconciliation-${width}`);
 await card.getByRole('button',{name:'Accept preparation',exact:true}).click();await page.getByRole('status').getByText('Preparation accepted and decision recorded',{exact:true}).waitFor();
 const accepted=(await h.json('/state',undefined,h.owner)).proposals.find(p=>p.id===proposal.id),draft=(await h.json(base+'/billing',undefined,h.owner)).bills.find(b=>b.id===accepted.result_id);
 await card.getByText('approved',{exact:true}).waitFor();
 if(width===1440){
  assert.equal(draft.status,'draft');assert.equal(draft.snapshot.totalCents,5000);
  assert.equal(await card.getByRole('button',{name:'Accept preparation',exact:true}).count(),0);
  assert.ok((await card.innerText()).includes(entry.revision),'Original source provenance stays visible after the decision');
  assert.deepEqual(await card.evaluate(root=>[...root.querySelectorAll('p,strong,summary,li,button,small,pre')].filter(e=>e.getClientRects().length&&parseFloat(getComputedStyle(e).fontSize)<13).map(e=>e.tagName)),[]);
 }
 if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,card,process.env.SATCHEL_SCREENSHOTS,`agent-work-decision-${width}`);
 await exerciseBillingConfidentiality(page,h,width,m);
}

async function exerciseBillingConfidentiality(page,h,width,m){
 const email='billing-sponsor@example.test',permissions={rates:'all',bank:'full',reports:'firm',contacts:'write',documents:'write',billing:'write',settings:'write'};
 let role=await h.json('/roles',{name:'Preparation billing access',permissions,reason:'Review current sponsor billing access'},h.owner);
 await h.json('/team',{email,name:'Billing sponsor',role:'lawyer',customRoleId:role.id},h.owner);
 await h.json('/team/invite',{email},h.owner);const sponsor=await h.login(email);
 await h.json('/matters/'+m.id+'/access',{email},h.owner);
 const source=await h.json('/matters/'+m.id+'/entries',{kind:'time',date:'2026-10-15',description:'Confidential sponsor source narrative',minutes:30,rateCents:14200},h.owner);
 const key=await h.json('/keys',{label:'Sponsor billing review'},sponsor),{auth}=await authorizeAgent(h,key,m.id,{sponsorCookie:sponsor});
 const r=(await h.json('/agent/matters/'+m.id,undefined,'',200,auth)).billing.workReconciliation;
 const proposal=await h.json('/agent/prepare-bill',{matterId:m.id,title:'Sponsor preparation review',date:'2026-10-17',entryIds:[source.id],reconciliationId:r.id},'',200,auth);
 const context=await page.context().browser().newContext({viewport:page.viewportSize(),ignoreHTTPSErrors:true});
 try{
  await context.addCookies(sponsor.split('; ').map(pair=>{const i=pair.indexOf('=');return {name:pair.slice(0,i),value:pair.slice(i+1),url:h.origin,secure:true};}));
  const review=await context.newPage();await review.goto(h.origin+'/app');
  await review.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Preparations',exact:true}).click();
  const card=review.locator('article.record').filter({hasText:'Sponsor preparation review'});
  await card.getByText(source.description,{exact:true}).waitFor();
  if(width===1440){assert.ok((await card.innerText()).includes('$71.00'));assert.equal((await h.json('/state',undefined,sponsor)).proposals.find(p=>p.id===proposal.id).workReconciliation.sources[0].amountCents,7100);}
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(review,card,process.env.SATCHEL_SCREENSHOTS,`agent-billing-allowed-${width}`);
  role=await h.json('/roles',{id:role.id,revision:role.revision,name:role.name,permissions:{...permissions,billing:'none'},reason:'Withdraw billing access before opening Preparations'},h.owner);
  await review.reload();await review.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Preparations',exact:true}).click();
  await card.getByText('bill · Sponsor preparation review',{exact:true}).waitFor();
  if(width===1440){
   assert.equal(await card.getByRole('heading',{name:'Confirmed work reconciliation'}).count(),0);
   assert.ok(!(await card.innerText()).includes(source.description));assert.ok(!(await card.innerText()).includes('$71.00'));
   const state=await review.evaluate(()=>fetch('/api/satchel/state').then(r=>r.json())),withheld=state.proposals.find(p=>p.id===proposal.id);
   assert.equal(withheld.workReconciliation,null);assert.ok(!JSON.stringify(withheld).includes(source.description));assert.ok(!JSON.stringify(withheld).includes('amountCents'));
  }
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(review,card,process.env.SATCHEL_SCREENSHOTS,`agent-billing-withheld-${width}`);
  await h.json('/roles',{id:role.id,revision:role.revision,name:role.name,permissions,reason:'Restore billing access for sponsor review'},h.owner);
  await review.reload();await review.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Preparations',exact:true}).click();await card.getByText(source.description,{exact:true}).waitFor();
  if(width===1440)assert.ok((await card.innerText()).includes('$71.00'));
 }finally{await context.close();}
}
