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
test('MATTER-009 one search box: grouped keyboard results, matter and case numbers, unassigned and walled-out people see nothing at desktop and phone widths',async()=>{
 for(const [width,height] of [[1440,1000],[390,844]]){
 const h=await harness(),browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
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
  assert.equal(await page.getByRole('combobox',{name:'Current matter',exact:true}).inputValue(),f.m.id,'The record\'s matter is the current matter');assert.equal(await results.count(),0,'Opening a result closes the list');
  // Matter number and case number find the matter; clicking opens the matter; Escape closes the list.
  for(const query of [f.m.matter_number,'CASE-2026-BARTON-42']){await box.fill(query);await results.getByRole('heading',{name:/^Matters /}).waitFor();await results.getByRole('group',{name:/^Matters /}).getByRole('option',{name:new RegExp(f.m.matter_number)}).click();await page.getByRole('heading',{level:1,name:'Matters',exact:true}).waitFor();}
  await box.fill('Barton');await results.waitFor();await page.keyboard.press('Escape');assert.equal(await results.count(),0);await page.keyboard.press('Escape');assert.equal(await box.inputValue(),'');
  await box.fill('zzzz-no-such-record');await status.getByText('No matching records you may see.').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  const {textSearchFixture}=await import('./document-text-fixture.mjs'),textFixture=await textSearchFixture(h,f.m);
  const answer=await ask(page,box,'copper lantern');assert.equal(answer.total,2,'The principal may see both public and private originals');
  const bodyHit=results.getByRole('option').filter({hasText:'Testimony.pdf'});await bodyHit.waitFor();assert.match(await bodyHit.innerText(),/Version 1 · page 2 · SHA-256/);assert.match(await bodyHit.innerText(),/Current text index/);
  if(process.env.SATCHEL_SCREENSHOTS)await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/document-text-search-${width}.png`});
  await bodyHit.click();const citation=page.getByRole('region',{name:'Search citation',exact:true});await citation.getByRole('img',{name:'PDF version 1, page 2',exact:true}).waitFor();
  await citation.getByText('Page 2 of 2',{exact:true}).waitFor();assert.match(await citation.locator('pre').innerText(),/Copper lantern testimony/);assert.ok(!(await citation.locator('pre').innerText()).includes('First page'));
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,citation,process.env.SATCHEL_SCREENSHOTS,`document-text-citation-${width}`);
  await citation.getByRole('button',{name:'Close search citation',exact:true}).click();assert.equal(await results.count(),0,'Closing the citation cannot revive cached snippets');
  await page.getByText('Document filters',{exact:true}).click();await page.getByLabel('Search matter',{exact:true}).selectOption(f.m.id);await page.getByRole('search').getByLabel('Document type',{exact:true}).fill('Deposition');
  const day=textFixture.document.versions[0].createdAt.slice(0,10);await page.getByLabel('Original date from',{exact:true}).fill(day);await page.getByLabel('Original date to',{exact:true}).fill(day);
  await box.focus();await results.getByRole('option').filter({hasText:'Testimony.pdf'}).waitFor();assert.match(await status.innerText(),/^1 result in 1 group$/);
  // Refocusing asks the server too; stale options and text are discarded on blur.
  await page.getByRole('search').getByLabel('Document type',{exact:true}).fill('Correspondence');await box.focus();await status.getByText('No matching records you may see.').waitFor();
  await page.getByRole('search').getByLabel('Document type',{exact:true}).fill('');await page.getByLabel('Search matter',{exact:true}).selectOption('');await page.getByLabel('Original date from',{exact:true}).fill('');await page.getByLabel('Original date to',{exact:true}).fill('');
  await page.getByText('Document filters',{exact:true}).click();
  const {scannedOriginal}=await import('./document-text-fixture.mjs'),scan=await scannedOriginal('Quartz harbor witness statement',{width:2550,height:3300,dpi:300});await textFixture.upload('Witness scan.pdf',scan.pdf);
  const scannedAnswer=await ask(page,box,'quartz harbor');assert.equal(scannedAnswer.total,1);const scannedHit=results.getByRole('option').filter({hasText:'Witness scan.pdf'});await scannedHit.waitFor();assert.match(await scannedHit.innerText(),/Version 1 · page 2/);
  if(process.env.SATCHEL_SCREENSHOTS)await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/scanned-page-search-${width}.png`});
  await scannedHit.click();const scannedPage=page.getByRole('region',{name:'Search citation',exact:true});const scannedCanvas=scannedPage.getByRole('img',{name:'PDF version 1, page 2',exact:true});await scannedCanvas.waitFor();await scannedPage.getByText('Page 2 of 2',{exact:true}).waitFor();
  await scannedPage.getByText('No embedded text on this page.',{exact:true}).waitFor({state:'attached'});assert.match(await scannedPage.locator('pre').innerText(),/Quartz harbor witness statement/);
  assert.ok(await scannedCanvas.evaluate(canvas=>{const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;return data.some((v,i)=>i%4!==3&&v<100);}), 'The exact scanned page is rendered from original bytes');
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,scannedPage,process.env.SATCHEL_SCREENSHOTS,`scanned-page-citation-${width}`);await scannedPage.getByRole('button',{name:'Close search citation',exact:true}).click();
  const {ccittScannedPdf,readablePdf}=await import('./document-text-fixture.mjs');
  await textFixture.upload('Faxed statement.pdf',await ccittScannedPdf());
  assert.equal((await ask(page,box,'synthetic-satchel-82')).total,1);
  const faxHit=results.getByRole('option').filter({hasText:'Faxed statement.pdf'});await faxHit.waitFor();assert.match(await faxHit.innerText(),/Version 1 · page 1/);
  if(process.env.SATCHEL_SCREENSHOTS)await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/fax-search-${width}.png`});
  await faxHit.click();const faxPage=page.getByRole('region',{name:'Search citation',exact:true});await faxPage.getByRole('img',{name:'PDF version 1, page 1',exact:true}).waitFor();await faxPage.getByText('Page 1 of 1',{exact:true}).waitFor();assert.match(await faxPage.locator('pre').innerText(),/synthetic-satchel-82/i);
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,faxPage,process.env.SATCHEL_SCREENSHOTS,`fax-citation-${width}`);
  await faxPage.getByRole('button',{name:'Close search citation',exact:true}).click();
  await textFixture.upload('Hearing transcript.pdf',await readablePdf(Array.from({length:201},(_,i)=>i===200?'Obsidian orchard final testimony':'Retained hearing transcript page '+(i+1))));
  assert.equal((await ask(page,box,'obsidian orchard')).total,1);
  const transcriptHit=results.getByRole('option').filter({hasText:'Hearing transcript.pdf'});await transcriptHit.waitFor();assert.match(await transcriptHit.innerText(),/Version 1 · page 201/);
  await transcriptHit.click();const transcriptPage=page.getByRole('region',{name:'Search citation',exact:true});await transcriptPage.getByRole('img',{name:'PDF version 1, page 201',exact:true}).waitFor();await transcriptPage.getByText('Page 201 of 201',{exact:true}).waitFor();assert.match(await transcriptPage.locator('pre').innerText(),/Obsidian orchard final testimony/);
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,transcriptPage,process.env.SATCHEL_SCREENSHOTS,`transcript-citation-${width}`);
  await transcriptPage.getByRole('button',{name:'Close search citation',exact:true}).click();
  const {reviewedMessage}=await import('./document-text-fixture.mjs');await reviewedMessage(h,f.m);const nativeMailAnswer=await ask(page,box,'turquoise garden');assert.equal(nativeMailAnswer.total,1);const nativeOption=results.getByRole('option').filter({hasText:'Reviewed case letter'});await nativeOption.waitFor();assert.match(await nativeOption.innerText(),/SHA-256/);await nativeOption.click();const nativeLetter=page.getByRole('article',{name:'Email Reviewed case letter',exact:true});await nativeLetter.getByText('Turquoise garden counsel instructions are retained in this native letter.',{exact:true}).waitFor();await nativeLetter.getByText('Message source',{exact:true}).click();assert.ok((await nativeLetter.innerText()).includes(nativeMailAnswer.groups[0].items[0].sourceCitation.sha256));if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,nativeLetter,process.env.SATCHEL_SCREENSHOTS,`native-email-source-${width}`);
  // An unassigned assistant receives no record, title, count or snippet.
  await h.json('/team',{email:'reader@example.test',name:'Case assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'reader@example.test'},h.owner);
  const assistant=await(await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true})).newPage();assistant.setDefaultTimeout(15000);
  const invite=h.mails.toReversed().find(m=>m.to.includes('reader@example.test')),link=(invite.text??invite.html).match(/https:\/\/[^\s"<]+\/auth\/[^\s"<]+/)[0].replaceAll('&amp;','&');
  await assistant.goto(link);await assistant.getByRole('button').first().click();await assistant.goto(h.origin+'/app');await assistant.getByRole('navigation',{name:'Workspace'}).waitFor();
  const reader=assistant.getByRole('combobox',{name:'Search the firm'});for(const query of ['Barton',f.m.matter_number,'CASE-2026-BARTON-42']){assert.deepEqual((await ask(assistant,reader,query)).groups,[]);await assistant.locator('.firm-search [role=status]').getByText('No matching records you may see.').waitFor();assert.equal(await assistant.locator('.firm-search').locator('[role=option]').count(),0);assert.ok(!(await assistant.locator('.firm-search').innerText()).includes('Barton Workshop'),'No title or snippet');}
  const readerEmail=await assistant.evaluate(async()=>{const r=await fetch('/api/satchel/me');return (await r.json()).email;});
  await h.json(base+'/access',{email:readerEmail},h.owner);
  const permitted=await ask(assistant,reader,'quartz harbor');assert.equal(permitted.total,1);await assistant.getByRole('option').filter({hasText:'Witness scan.pdf'}).waitFor();assert.ok(!JSON.stringify(permitted).includes(textFixture.privateDocument.id));
  await h.json(base+'/access',{email:readerEmail,remove:true},h.owner);
  await assistant.locator('.firm-search [role=status]').getByText('No matching records you may see.').waitFor();
  assert.equal(await reader.evaluate(el=>el===document.activeElement),true,'Revocation is observed while search stays focused');
  assert.equal(await assistant.locator('[role=option]').count(),0,'Revocation removes cached OCR snippets without a focus change');
  assert.ok(!(await assistant.locator('.firm-search').innerText()).includes('Quartz harbor'));
  if(process.env.SATCHEL_SCREENSHOTS)await assistant.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/revoked-search-${width}.png`});
  await h.json(base+'/access',{email:readerEmail},h.owner);
  await assistant.getByRole('option').filter({hasText:'Witness scan.pdf'}).waitFor();
  await reader.press('Shift+Tab');assert.equal(await assistant.locator('[role=option]').count(),0,'Blur removes the cached text');
  await h.json(base+'/access',{email:readerEmail,remove:true},h.owner);
  const revokedResponse=assistant.waitForResponse(r=>r.url().includes('/api/satchel/search?q='+encodeURIComponent('quartz harbor')));await reader.focus();const revokedAnswer=await(await revokedResponse).json();await assistant.locator('.firm-search [role=status]').getByText('No matching records you may see.').waitFor();assert.equal(await assistant.locator('[role=option]').count(),0,'Refocus cannot restore revoked snippets');
  assert.deepEqual(revokedAnswer.documentIndex,[]);
  // A walled-out principal receives none either; the wall's custodian still finds the matter.
  await h.json('/team',{email:'custodian@example.test',name:'Wall counsel',role:'lawyer'},h.owner);await h.json('/team/invite',{email:'custodian@example.test'},h.owner);await h.login('custodian@example.test');await h.json(base+'/access',{email:'custodian@example.test'},h.owner);
  await h.json(base+'/wall',{custodianEmail:'custodian@example.test',members:[],reason:'Conflicting representation screen',revision:null},h.owner);
  for(const query of ['Barton',f.m.matter_number,'CASE-2026-BARTON-42']){const answer=await ask(page,box,query);assert.deepEqual(answer.groups,[],'The server returns no group, count or snippet');await status.getByText('No matching records you may see.').waitFor();assert.equal(await page.locator('.firm-search').locator('[role=option]').count(),0);assert.ok(!(await page.locator('.firm-search').innerText()).includes('Barton Workshop'));}
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
 }
});
