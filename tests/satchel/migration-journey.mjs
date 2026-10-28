import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setupMove,csvRows} from './migration-fixture.mjs';
import {designate} from './trust-fixture.mjs';
import {invoiceTemplate,setupInvoicePayers} from './invoice-delivery-fixture.mjs';
const form=(scope,name)=>scope.locator('form',{has:(typeof scope.page==='function'?scope.page():scope).getByRole('button',{name,exact:true})});
const tab=async(page,name)=>{await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name,exact:true}).click();await page.getByRole('heading',{level:1,name,exact:true}).waitFor();};
export async function proveWholeFirmMoveInUi(h,page,shot){
 const p=await setupMove(h),original=structuredClone(p.files.find(f=>f.id==='original-2'));p.files=p.files.filter(f=>f.id!=='original-2');await designate(h);
 await tab(page,'Move in');
 const panel=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Whole firm move',exact:true})});
 const preview=async()=>{await panel.getByRole('button',{name:'Preview whole firm move',exact:true}).click();await panel.getByRole('heading',{name:'Review package',exact:true}).waitFor();};
 await panel.getByLabel('Prepared migration package',{exact:true}).setInputFiles({name:'synthetic-satchel-package.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
 await preview();const initialErrors=await panel.getByRole('alert').allTextContents();assert.ok(initialErrors.some(e=>e.includes('unmatched contacts identity missing-client')));assert.ok(initialErrors.some(e=>e.includes('missing original original-2')));assert.equal(await panel.getByRole('button',{name:'Commit reviewed package',exact:true}).isDisabled(),true);
 await shot('migration-repair');
 await panel.getByLabel('Repair client for 2020-C1',{exact:true}).selectOption('client-1');await preview();
 await panel.getByLabel('Supply missing original original-2',{exact:true}).setInputFiles({name:original.name,mimeType:'text/plain',buffer:Buffer.from(original.contentBase64,'base64')});await preview();
 assert.equal(await panel.getByRole('alert').count(),0);assert.equal(await panel.getByRole('row').filter({has:page.getByRole('rowheader',{name:'matters',exact:true})}).count(),1);
 const repaired=JSON.parse(await panel.getByLabel('Package contents',{exact:true}).inputValue());
 await panel.getByRole('button',{name:'Commit reviewed package',exact:true}).click();await panel.getByRole('heading',{name:'Package checkpoint',exact:true}).waitFor();
 async function apply(records){
  for(let index=0;index<records;index++){
   const search=panel.getByRole('button',{name:'Search conflicts for next matter',exact:true}),trust=panel.getByRole('button',{name:'Approve source trust opening',exact:true});
   if(await search.count()){
    await search.click();const review=form(panel,'Import reviewed source matter');await review.getByLabel('Conflict conclusion and clearance',{exact:true}).fill('Principal reviewed all source relationships and every conflict match.');await review.getByLabel('I reviewed the source matter, every match and my authority to open it.',{exact:true}).check();await review.getByRole('button',{name:'Import reviewed source matter',exact:true}).click();
   }else if(await trust.count()){
    const review=form(panel,'Approve source trust opening');await review.getByLabel('Trust source reconciliation approval',{exact:true}).fill('Designated officer checked the exact statement and client allocation.');await review.getByLabel('I approve the exact source-backed client trust opening.',{exact:true}).check();await trust.click();
   }else await panel.getByRole('button',{name:'Apply next source record',exact:true}).click();
   await panel.getByText(new RegExp('^(applying|completed) · '+(index+1)+' of '+records+' records$')).waitFor();
  }
 }
 await apply(21);
 await panel.getByRole('button',{name:'Reconcile whole firm move',exact:true}).click();await panel.getByRole('heading',{name:'Source and native balances',exact:true}).waitFor();assert.equal(await panel.getByRole('alert').count(),0);await panel.getByText('Apply and reconcile a final delta before signing cutover.',{exact:true}).waitFor();
 const job=(await h.json('/migration',undefined,h.owner)).jobs.find(j=>j.account===p.account);
 const delta=structuredClone(repaired);delta.phase='delta';delta.previousFingerprint=job.fingerprint;delta.files=[];delta.counts.notes=2;
 for(const kind of Object.keys(delta.datasets))delta.datasets[kind]=delta.datasets[kind].split('\r\n')[0]+'\r\n';
 delta.datasets.notes=csvRows(['id','matter_id','title','body','occurred_at','visibility','staff_id'],[['note-2','matter-2','Final delta note','Last source change','2020-04-03T12:00:00.000Z','team','staff-1']]);
 await panel.getByLabel('Package contents',{exact:true}).fill(JSON.stringify(delta));await preview();await panel.getByRole('button',{name:'Commit reviewed package',exact:true}).click();await panel.getByText('applying · 0 of 1 records',{exact:true}).waitFor();await apply(1);
 await panel.getByRole('button',{name:'Reconcile whole firm move',exact:true}).click();
 const reconciliation=panel.getByRole('region',{name:'Move reconciliation'});await reconciliation.getByRole('cell',{name:'$4,500.04',exact:true}).first().waitFor();
 assert.equal(await reconciliation.getByRole('alert').count(),0);
 const sign=form(panel,'Sign reconciled cutover');await sign.getByLabel('Signed reconciliation declaration',{exact:true}).fill('Principal signs the reviewed final source inventory, originals and cent balances.');await sign.getByLabel('Source counts, originals and balances match after the final delta.',{exact:true}).check();await sign.getByRole('button',{name:'Sign reconciled cutover',exact:true}).click();await panel.getByText(/^Cutover signed ·/).waitFor();await shot('migration-cutover');
 await tab(page,'Matters');await page.getByLabel('Find a matter').fill('2020-C1');await page.getByRole('button',{name:/2020-C1 · Source active advice/}).click();
 const history=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Imported source history',exact:true})});await history.getByText('Historic invoice CLIO-2020-81 · $120.00',{exact:true}).waitFor();
 const [download]=await Promise.all([page.waitForEvent('download'),history.getByRole('link',{name:'Open original Clio invoice PDF',exact:true}).click()]);assert.equal((await readFile(await download.path())).toString('base64'),p.files.find(f=>f.id==='pdf-1').contentBase64);await shot('migration-matter-history');
 const m=(await h.json('/state',undefined,h.owner)).matters.find(m=>m.matter_number==='2020-C1');await setupInvoicePayers(h,m);
 const templates=await h.json('/invoice-templates',undefined,h.owner);await h.json('/invoice-templates',invoiceTemplate(templates.templates.at(-1)?.id??null,{includeTrustBalance:false}),h.owner);
 const recipient=(await h.json('/contacts',undefined,h.owner)).contacts.find(c=>c.name===m.client).emails[0];
 await tab(page,'Time & bills');await page.getByText('Clio invoice CLIO-2020-81 · $120.00',{exact:true}).waitFor();
 const bill=page.locator('section.bill-packages article.record').filter({has:page.getByText('Clio invoice CLIO-2020-81 · $120.00',{exact:true})});await bill.getByText('Invoice delivery',{exact:true}).click();
 const deliver=form(bill,'Deliver invoice to portal');await deliver.getByLabel('Payer portal email',{exact:true}).fill(recipient);await deliver.getByLabel('Invoice payer name',{exact:true}).fill(m.client);await deliver.getByRole('button',{name:'Deliver invoice to portal',exact:true}).click();await page.getByRole('status').getByText('Branded invoice delivered inside the authenticated portal',{exact:true}).waitFor();const deliveryDetails=bill.locator('details').filter({has:page.getByText('Invoice delivery',{exact:true})});await deliveryDetails.waitFor();if(await deliveryDetails.getAttribute('open')===null)await bill.getByText('Invoice delivery',{exact:true}).click();await bill.getByRole('link',{name:'Download delivered PDF',exact:true}).waitFor();
 const [delivered]=await Promise.all([page.waitForEvent('download'),bill.getByRole('link',{name:'Download delivered PDF',exact:true}).click()]);assert.equal((await readFile(await delivered.path())).toString('base64'),p.files.find(f=>f.id==='pdf-1').contentBase64);await shot('migration-original-delivery');
}

export async function proveMyCaseMoveInUi(h,page,shot){
 const {mycasePackage}=await import('./mycase-migration-flow.mjs'),p=mycasePackage(),original=p.files.pop();
 await tab(page,'Move in');const panel=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Whole firm move',exact:true})});
 const preview=async()=>{await panel.getByRole('button',{name:'Preview whole firm move',exact:true}).click();await page.getByRole('status').getByText('Package preview complete; no records changed',{exact:true}).waitFor();};
 await panel.getByLabel('Prepared migration package',{exact:true}).setInputFiles({name:'synthetic-satchel-mycase.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
 await panel.getByLabel('MyCase Full Backup data ZIP',{exact:true}).setInputFiles({name:p.backup.name,mimeType:'application/zip',buffer:Buffer.from(p.backup.contentBase64,'base64')});await preview();
 await panel.getByText('Source: MyCase',{exact:true}).waitFor();await panel.getByText('Active cases: 1 · Archived cases: 1',{exact:true}).waitFor();assert.equal(await panel.getByRole('button',{name:'Commit reviewed package',exact:true}).isDisabled(),true);await shot('mycase-preview-gaps');
 await panel.getByLabel('Repair client for MC-2020-1',{exact:true}).selectOption('client-1');
 const repaired=JSON.parse(await panel.getByLabel('Package contents',{exact:true}).inputValue());repaired.caseRepairs['missing-case']='matter-1';await panel.getByLabel('Package contents',{exact:true}).fill(JSON.stringify(repaired));await preview();
 await panel.getByLabel('Supply missing original original-2',{exact:true}).setInputFiles({name:original.name,mimeType:'text/plain',buffer:Buffer.from(original.contentBase64,'base64')});await preview();assert.equal(await panel.getByRole('alert').count(),0);
 await panel.getByRole('button',{name:'Commit reviewed package',exact:true}).click();await panel.getByText('applying · 0 of 5 records',{exact:true}).waitFor();await panel.getByRole('button',{name:'Apply next source record',exact:true}).click();await panel.getByText('applying · 1 of 5 records',{exact:true}).waitFor();
 await page.reload();await tab(page,'Move in');const item=panel.locator('article.record').filter({has:page.getByText(/^mycase · synthetic-satchel-1/)});await item.getByRole('button',{name:'Open move checkpoint',exact:true}).click();await panel.getByText('applying · 1 of 5 records',{exact:true}).waitFor();
 for(let index=1;index<5;index++){
  const search=panel.getByRole('button',{name:'Search conflicts for next matter',exact:true});
  if(await search.count()){
   await search.click();const review=form(panel,'Import reviewed source matter');await review.getByLabel('Conflict conclusion and clearance',{exact:true}).fill('Principal reviewed the MyCase source case and every conflict match.');await review.getByLabel('I reviewed the source matter, every match and my authority to open it.',{exact:true}).check();await review.getByRole('button',{name:'Import reviewed source matter',exact:true}).click();
  }else await panel.getByRole('button',{name:'Apply next source record',exact:true}).click();
  await panel.getByText(new RegExp('^(applying|completed) · '+(index+1)+' of 5 records$')).waitFor();
 }
 await panel.getByRole('button',{name:'Reconcile whole firm move',exact:true}).click();await panel.getByRole('alert').filter({hasText:'MyCase unsupported: financial activity'}).waitFor();assert.equal(await panel.getByRole('button',{name:'Sign reconciled cutover',exact:true}).count(),0);await shot('mycase-incomplete-reconciliation');
 await tab(page,'Matters');await page.getByLabel('Find a matter').fill('MC-2020-1');await page.getByRole('button',{name:/MC-2020-1 · MyCase active advice/}).click();const history=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Imported source history',exact:true})});await history.getByText('matters · matter-1 · imported',{exact:true}).waitFor();await shot('mycase-case-provenance');
 await tab(page,'Documents');await page.getByText('MyCase-advice.txt',{exact:true}).first().waitFor();await shot('mycase-original');
}
