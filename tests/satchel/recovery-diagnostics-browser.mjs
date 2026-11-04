import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
import {capturePanel} from './browser-shots.mjs';

export async function exerciseRecoveryDiagnostics(browser,source,width,height){
 const archive=await(await source.request('/api/satchel/backup',undefined,source.owner)).text(),target=await harness();let context;
 try{
  await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);
  const data=await target.json('/diagnostics',undefined,target.owner);
  context=await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true});const page=await context.newPage();page.setDefaultTimeout(15000);
  const owner=(await target.json('/state',undefined,target.owner)).actor.email;
  await page.goto(target.origin+'/signin');await page.getByLabel('Email',{exact:true}).fill(owner);await page.getByRole('button',{name:'Email a sign-in link',exact:true}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=target.mails.toReversed().find(m=>m.to.includes(owner));await page.goto((mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0]);await page.getByRole('button',{name:'Confirm',exact:true}).click();
  await page.waitForURL(/\/(setup|app)/);if(page.url().endsWith('/setup')){await page.getByLabel('Your name').fill('Recovery principal');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click();}
  await page.waitForURL(/\/app/);await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Team & safety',exact:true}).click();
  const panel=page.getByRole('region',{name:'Operational diagnostics'});await panel.getByText('Measured retained original bytes: '+data.storage.measuredOriginalBytes,{exact:true}).waitFor();
  // Desktop carries the behavioral assertions; phone is the existing workspace smoke and visual proof.
  if(width===1440){
   assert.ok(data.storage.measuredOriginalBytes>0);assert.equal(await panel.getByText('Provider quota: Unknown',{exact:false}).count(),1);
   assert.equal(await panel.getByRole('heading',{name:'Unreconciled trust periods: '+data.trust.unreconciledPeriods.length,exact:true}).count(),1);
   for(const j of data.jobs){const record=panel.getByRole('article',{name:j.name,exact:true});await record.getByText(`Queued: ${j.queued} · Failed or refused: ${j.failed} · In flight or uncertain: ${j.uncertain} · Paused: ${j.paused}`,{exact:true}).waitFor();}
   assert.equal(await panel.getByText('Bank-feed authorization: unknown',{exact:false}).count(),1);
  }
  await panel.getByText('Recovery settings',{exact:true}).click();await panel.getByRole('button',{name:'Authorize restored sending',exact:true}).waitFor();
  if(width===1440){
   const form=panel.getByRole('button',{name:'Authorize restored sending',exact:true}).locator('..');await form.getByLabel('Authorization reason',{exact:true}).fill('Review missing provider authority before releasing imported work');await form.getByRole('checkbox').check();await form.getByRole('button',{name:'Authorize restored sending',exact:true}).click();await page.getByRole('alert').getByText('Review the provider terms again in this installation after restoring',{exact:true}).waitFor();
   assert.ok((await target.json('/diagnostics',undefined,target.owner)).recovery.every(r=>r.authorized_at===null));
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0,'Recovery diagnostics fit the viewport');
  assert.equal(await panel.locator('button').evaluateAll(buttons=>buttons.filter(b=>!b.textContent.trim()).length),0,'Diagnostics controls have visible text');
  const small=await panel.locator('p,summary,label,button').evaluateAll(nodes=>nodes.filter(n=>parseFloat(getComputedStyle(n).fontSize)<13).map(n=>n.tagName));assert.deepEqual(small,[]);
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,panel,process.env.SATCHEL_SCREENSHOTS,`${width}-recovery-diagnostics`);
 }finally{await context?.close();await target.close();}
}
