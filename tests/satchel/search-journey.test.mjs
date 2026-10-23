import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {harness} from './harness.mjs';
import {searchFixture} from './search-fixture.mjs';
import {capturePanel} from './browser-shots.mjs';
async function signIn(page,h,email,name){
 await page.goto(h.origin+'/signin');await page.getByLabel('Email').fill(email);await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
 const mail=h.mails.toReversed().find(m=>m.to.includes(email)),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/(?:confirm|invite)[^\s"<]*/)[0].replaceAll('&amp;','&');
 await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();
 if(name){await page.waitForURL(/\/setup/);await page.getByLabel('Your name').fill(name);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();}
 await page.waitForURL(/\/app/);await page.getByRole('navigation',{name:'Workspace'}).waitFor();
}
const ask=async(page,box,query)=>{const [response]=await Promise.all([page.waitForResponse(r=>r.url().includes('/api/satchel/search?q='+encodeURIComponent(query))),box.fill(query)]);const body=await response.json();await page.waitForTimeout(100);return body;};
for(const [width,height] of [[1440,1000],[390,844]])test(`MATTER-009 one search box: grouped keyboard results, matter and case numbers, unassigned and walled-out people see nothing at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const f=await searchFixture(h),base='/matters/'+f.m.id;
  const page=await(await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true})).newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));
  await signIn(page,h,'owner@example.test','Avery Barton');
  const box=page.getByRole('combobox',{name:'Search the firm'}),results=page.getByRole('listbox',{name:'Search results'}),status=page.locator('.firm-search [role=status]');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Matters',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>![...document.querySelectorAll('nav[aria-label=Workspace] button')].some(b=>b.disabled));
  // The shortcut is a window listener that exists once the workspace has hydrated; press until it takes.
  for(let attempt=0;attempt<40&&(await page.evaluate(()=>document.activeElement?.getAttribute('role')))!=='combobox';attempt++){await page.locator('body').click({position:{x:2,y:2}});await page.keyboard.press('/');await page.waitForTimeout(250);}
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('role')),'combobox','"/" focuses the search box');
  await page.keyboard.type('Barton');await results.waitFor();
  for(const type of ['Matters','Contacts','Notes','Tasks','Events','Documents','Email','Invoices'])await results.getByRole('heading',{name:new RegExp('^'+type+' ')}).waitFor();
  assert.match(await status.innerText(),/^\d+ results? in 8 groups$/);
  await results.getByRole('option',{name:/Review the notice period/}).waitFor();await results.getByRole('option',{name:/Barton notice period requires counsel review/}).waitFor();await results.getByRole('option',{name:/Lease advice prebill/}).waitFor();
  const inside=await results.evaluate(el=>{const r=el.parentElement.getBoundingClientRect();return r.left>=0&&r.right<=window.innerWidth;});assert.ok(inside,'The result list stays inside the viewport');
  if(process.env.SATCHEL_SCREENSHOTS)await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/search-${width}.png`});
  // The arrow keys walk the groups in order; Enter opens the highlighted record's screen with its matter.
  const active=async()=>page.evaluate(()=>document.getElementById(document.activeElement.getAttribute('aria-activedescendant'))?.innerText??'');
  const first=await active();await page.keyboard.press('ArrowDown');assert.notEqual(await active(),first);await page.keyboard.press('ArrowUp');assert.equal(await active(),first);
  await page.keyboard.press('ArrowUp');assert.notEqual(await active(),first,'Navigation wraps from the first result to the last');
  const target=await results.getByRole('option',{name:/Review the notice period/}).getAttribute('id');while((await box.getAttribute('aria-activedescendant'))!==target)await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');await page.getByRole('heading',{level:1,name:'Tasks',exact:true}).waitFor();await page.getByRole('status').getByText(/^Opened Tasks: Review the notice period/).waitFor();
  assert.equal(await page.locator('select').first().inputValue(),f.m.id,'The record\'s matter is the current matter');assert.equal(await results.count(),0,'Opening a result closes the list');
  // Matter number and case number find the matter; clicking opens the matter; Escape closes the list.
  for(const query of [f.m.matter_number,'CASE-2026-BARTON-42']){await box.fill(query);await results.getByRole('heading',{name:/^Matters /}).waitFor();await results.getByRole('group',{name:/^Matters /}).getByRole('option',{name:new RegExp(f.m.matter_number)}).click();await page.getByRole('heading',{level:1,name:'Matters',exact:true}).waitFor();}
  await box.fill('Barton');await results.waitFor();await page.keyboard.press('Escape');assert.equal(await results.count(),0);await page.keyboard.press('Escape');assert.equal(await box.inputValue(),'');
  await box.fill('zzzz-no-such-record');await status.getByText('No matching records you may see.').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  // An unassigned assistant receives no record, title, count or snippet.
  await h.json('/team',{email:'reader@example.test',name:'Case assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'reader@example.test'},h.owner);
  const assistant=await(await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true})).newPage();assistant.setDefaultTimeout(15000);
  const invite=h.mails.toReversed().find(m=>m.to.includes('reader@example.test')),link=(invite.text??invite.html).match(/https:\/\/[^\s"<]+\/auth\/[^\s"<]+/)[0].replaceAll('&amp;','&');
  await assistant.goto(link);await assistant.getByRole('button').first().click();await assistant.goto(h.origin+'/app');await assistant.getByRole('navigation',{name:'Workspace'}).waitFor();
  const reader=assistant.getByRole('combobox',{name:'Search the firm'});for(const query of ['Barton',f.m.matter_number,'CASE-2026-BARTON-42']){assert.deepEqual((await ask(assistant,reader,query)).groups,[]);await assistant.locator('.firm-search [role=status]').getByText('No matching records you may see.').waitFor();assert.equal(await assistant.locator('.firm-search').getByRole('option').count(),0);assert.ok(!(await assistant.locator('.firm-search').innerText()).includes('Barton Workshop'),'No title or snippet');}
  // A walled-out principal receives none either; the wall's custodian still finds the matter.
  await h.json('/team',{email:'custodian@example.test',name:'Wall counsel',role:'lawyer'},h.owner);await h.json('/team/invite',{email:'custodian@example.test'},h.owner);await h.login('custodian@example.test');await h.json(base+'/access',{email:'custodian@example.test'},h.owner);
  await h.json(base+'/wall',{custodianEmail:'custodian@example.test',members:[],reason:'Conflicting representation screen',revision:null},h.owner);
  for(const query of ['Barton',f.m.matter_number,'CASE-2026-BARTON-42']){const answer=await ask(page,box,query);assert.deepEqual(answer.groups,[],'The server returns no group, count or snippet');await status.getByText('No matching records you may see.').waitFor();assert.equal(await page.locator('.firm-search').getByRole('option').count(),0);assert.ok(!(await page.locator('.firm-search').innerText()).includes('Barton Workshop'));}
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
