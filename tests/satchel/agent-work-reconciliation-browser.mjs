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
}
