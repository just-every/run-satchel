import {selectExemptTax} from './tax-fixture.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {readXml,xmlProfile} from './ledes-xml-reader.mjs';
import {harness,open} from './harness.mjs';
test('TIME-007 guideline and code set configured at 1440px, a missing activity code refused, the coded insurer bill exported as LEDES 1998B and official-XSD-valid XML 2.1.3, a rejection imported and corrected by a reviewed revision, inspected at 1440px and 390px',async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const address={line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'};await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@example.test',phone:'212-555-0100',address,timezone:'America/New_York',billing:{defaultRateCents:30000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main',phone:'212-555-0100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'}]}},h.owner);
  const m=await open(h,'Harper v. Reed','Harbor Mutual Insurance','Reed Logistics');
  for(const [kind,code,label] of [['task','L110','Fact investigation/development'],['task','L120','Analysis/strategy'],['activity','A101','Plan and prepare for'],['activity','A103','Draft/revise'],['expense','E112','Court fees']])await h.json('/ledes/codes',{kind,code,label},h.owner);
  await h.json('/ledes/timekeepers',{email:'owner@example.test',timekeeperId:'BL-001',name:'Barton, Avery',classification:'PT'},h.owner);
  const discovery=await h.json('/matters/'+m.id+'/entries',{kind:'time',date:'2026-10-15',description:'Draft discovery requests to Reed',minutes:54,utbmsTask:'L110',utbmsActivity:'A101'},h.owner);
  const analysis=await h.json('/matters/'+m.id+'/entries',{kind:'time',date:'2026-10-15',description:'Analyze coverage position letter',minutes:30,utbmsTask:'L120'},h.owner);

  const desktop=await browser.newContext({viewport:{width:1440,height:1000},ignoreHTTPSErrors:true,acceptDownloads:true}),errors=[];let page=await desktop.newPage();page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);
  await page.goto(h.origin+'/signin');await page.getByLabel('Email',{exact:true}).fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.at(-1),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.waitForURL(/\/setup|\/app/);if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
  const tab=async name=>{await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name,exact:true}).click();await page.getByRole('heading',{name,level:1,exact:true}).waitFor();};
  const done=async text=>page.getByRole('status').getByText(text,{exact:true}).waitFor();
  const shot=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${name}.png`,fullPage:true});}};
  const panel=name=>page.locator('section.panel',{has:page.getByRole('heading',{name,exact:true})});
  const opened=async(scope,summary)=>{const d=scope.locator('details',{has:page.getByText(summary,{exact:true})});if(!await d.evaluate(e=>e.open))await d.locator('summary').click();return d;};
  await page.getByRole('heading',{level:1,name:'Matters',exact:true}).waitFor();await tab('Time & bills');await page.getByLabel('Current matter').selectOption(m.id);
  const ledes=()=>panel('LEDES and UTBMS');await ledes().getByText('No billing guideline for Harbor Mutual Insurance.',{exact:false}).waitFor();

  // The principal adds a firm code and records the insurer's guideline.
  let form=await opened(ledes(),'Add or retire a code');await form.getByLabel('Kind').selectOption('activity');await form.getByLabel('Code',{exact:true}).fill('A104');await form.getByLabel('Code label').fill('Review/analyze');await form.getByRole('button',{name:'Save code'}).click();await done('Code saved');
  await ledes().getByRole('cell',{name:'Review/analyze'}).waitFor();
  form=await opened(ledes(),'Add a billing guideline');await form.getByLabel('LEDES client ID').fill('HARBOR01');await form.getByLabel('LEDES law firm ID').fill('13-1234567');await form.getByLabel('Minimum narrative length').fill('15');await form.getByLabel('Required increment (minutes, 0 for none)').fill('6');await form.getByLabel('Banned narrative phrases (comma separated)').fill('review file');await form.getByLabel('Maximum hourly rates in USD cents (e.g. PT=40000, AS=30000)').fill('PT=40000');await form.getByLabel('Enable LEDES XML 2.1.3 for future bill preparations and revisions').check();
  for(const [label,value] of [['Work country for invoice lines (3-letter ISO code)',xmlProfile.workCountry],['XML firm vendor identifier',xmlProfile.vendorId],['XML client-assigned firm vendor ID',xmlProfile.clientFirmId],['XML client matter ID',xmlProfile.clientMatterId],['Client address line 1',xmlProfile.clientAddress.line1],['Client city',xmlProfile.clientAddress.city],['Client state or province',xmlProfile.clientAddress.state],['Client postal code',xmlProfile.clientAddress.zip],['Client country (3-letter ISO code)',xmlProfile.clientAddress.country],['Client phone',xmlProfile.clientAddress.phone],['Billing contact first name',xmlProfile.billingContact.firstName],['Billing contact last name',xmlProfile.billingContact.lastName],['Billing contact email',xmlProfile.billingContact.email]])await form.getByLabel(label,{exact:true}).fill(value);
  await shot('1440-ledes-xml-profile');await form.getByLabel('Guideline source').fill('Harbor Mutual outside counsel guidelines 2026');await form.getByRole('button',{name:'Save guideline'}).click();await done('Guideline saved');
  await ledes().getByRole('article',{name:'Guideline version 1'}).getByText('LEDES 1998B · client ID HARBOR01 · law firm ID 13-1234567',{exact:true}).waitFor();await shot('1440-ledes-guideline');

  // Preparing without an activity code on the analysis line is refused with the reason.
  const unbilled=panel('Unbilled work');await unbilled.getByLabel('Bill title').fill('October services');await unbilled.getByLabel('Bill date').fill('2026-10-31');
  await unbilled.getByRole('button',{name:'Prepare bill from all unbilled work'}).click();
  await page.getByRole('alert').getByText(/Line 2 \(Analyze coverage position letter\): UTBMS activity code is required by the Harbor Mutual Insurance guideline/).waitFor();await shot('1440-ledes-refused');
  await unbilled.getByLabel('Activity · Analyze coverage position letter').fill('A103');await unbilled.getByRole('button',{name:'Prepare bill from all unbilled work'}).click();await done('Bill prepared. Review the exact lines below.');
  const invoice=m.matter_number+'-1',bill=()=>page.locator('article.record',{has:page.getByLabel('LEDES invoice '+invoice,{exact:true})});
  await bill().getByText(`LEDES 1998B invoice ${invoice} · e-billing status: not reported`,{exact:true}).waitFor();
  await selectExemptTax(h,page,bill());await bill().getByLabel('Review note').fill('Coded per Harbor guideline');await bill().getByRole('button',{name:'Approve exact bill'}).click();await done('Bill approved. The reviewed package is ready to export.');
  const [download]=await Promise.all([page.waitForEvent('download'),bill().getByRole('button',{name:'Download LEDES 1998B'}).click()]);await done('LEDES invoice exported');
  const chunks=[];for await(const c of await download.createReadStream())chunks.push(c);const file=Buffer.concat(chunks).toString('utf8');
  assert.equal(download.suggestedFilename(),invoice+'.ledes.txt');assert.match(file,/^LEDES1998B\[\]\r\n/);assert.ok(file.includes(`|${invoice}|HARBOR01|`));assert.ok(file.includes('|A103|BL-001|Analyze coverage position letter|13-1234567|300.00|Barton, Avery|PT|[]'));

  const [xmlDownload]=await Promise.all([page.waitForEvent('download'),bill().getByRole('button',{name:'Download LEDES XML 2.1.3'}).click()]);await done('LEDES invoice exported');
  const xmlChunks=[];for await(const c of await xmlDownload.createReadStream())xmlChunks.push(c);
  const xmlFile=Buffer.concat(xmlChunks).toString('utf8'),xml=readXml(xmlFile);
  assert.equal(xmlDownload.suggestedFilename(),invoice+'.ledes.xml');
  assert.deepEqual([xml.invoice.inv_id,xml.invoice.inv_total_net_due,xml.fees[1].task_activity],[invoice,'420.00','A103']);
  await shot('1440-ledes-xml-invoice');

  // Import the insurer's rejection, then correct the line through a reviewed revision.
  form=await opened(bill(),'Import e-billing outcome');await form.getByLabel('File name').fill('harbor-rejections.txt');await form.getByLabel('Outcome rows (INVOICE_NUMBER|LINE_ITEM_NUMBER|STATUS|REASON)').fill(`${invoice}|2|REJECTED|A103 not allowed on L120 analysis; use A104`);await form.getByRole('button',{name:'Record outcome'}).click();await done('Outcome recorded from the imported file');
  await bill().getByRole('alert').getByText('Rejected line 2: A103 not allowed on L120 analysis; use A104',{exact:true}).waitFor();await bill().getByText('e-billing status: rejected',{exact:false}).waitFor();await bill().getByText('Imported from the e-billing file, not verified with the vendor.',{exact:true}).waitFor();
  form=await opened(bill(),'Prepare a correction');await form.getByLabel('Source line').selectOption(analysis.id);await form.getByLabel('Corrected activity code (blank: unchanged)').fill('A104');await form.getByLabel('Reason').fill('Recode per Harbor rejection');await form.getByRole('button',{name:'Prepare correction for review'}).click();await done('Correction prepared; original export preserved');
  const revision=()=>page.locator('article.record',{has:page.getByLabel('LEDES invoice '+invoice+'-R1',{exact:true})});
  await revision().getByText(`LEDES 1998B invoice ${invoice}-R1 · replaces ${invoice} · e-billing status: not reported`,{exact:true}).waitFor();await revision().getByText('Correction: October services · $0.00',{exact:true}).waitFor();
  await selectExemptTax(h,page,revision());await revision().getByLabel('Review note').fill('Recode reviewed against Harbor rejection');await revision().getByRole('button',{name:'Approve exact bill'}).click();await done('Bill approved. The reviewed package is ready to export.');
  await Promise.all([page.waitForEvent('download'),revision().getByRole('button',{name:'Download LEDES 1998B'}).click()]);await done('LEDES invoice exported');await shot('1440-ledes-revision');

  // The rejection, the replacement invoice and an unchanged bill total on a phone.
  const phone=await browser.newContext({viewport:{width:390,height:844},ignoreHTTPSErrors:true,storageState:await desktop.storageState()});await desktop.close();
  page=await phone.newPage();page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(15000);await page.goto(h.origin+'/app');
  await page.getByRole('heading',{level:1,name:'Matters',exact:true}).waitFor();await tab('Time & bills');await page.getByLabel('Current matter').selectOption(m.id);
  await bill().getByRole('alert').getByText('Rejected line 2: A103 not allowed on L120 analysis; use A104',{exact:true}).waitFor();await bill().getByText('October services · $420.00',{exact:true}).waitFor();
  await revision().getByText(`LEDES 1998B invoice ${invoice}-R1 · replaces ${invoice} · e-billing status: not reported`,{exact:true}).waitFor();await shot('390-ledes-revision');
  const [phoneXmlDownload]=await Promise.all([page.waitForEvent('download'),revision().getByRole('button',{name:'Download LEDES XML 2.1.3'}).click()]);await done('LEDES invoice exported');
  const phoneChunks=[];for await(const c of await phoneXmlDownload.createReadStream())phoneChunks.push(c);
  const phoneXml=readXml(Buffer.concat(phoneChunks).toString('utf8'));
  assert.equal(phoneXml.invoice.inv_id,invoice+'-R1');assert.equal(phoneXml.invoice.inv_total_net_due,'420.00');assert.equal(phoneXml.fees[1].task_activity,'A104');
  assert.equal(await(await h.request('/api/satchel/bills/'+(await h.json('/matters/'+m.id+'/billing',undefined,h.owner)).bills[0].id+'/ledes-xml',undefined,h.owner)).text(),xmlFile);
  const phoneForm=await opened(ledes(),'Record a new guideline version');
  assert.equal(await phoneForm.getByLabel('XML client matter ID',{exact:true}).inputValue(),xmlProfile.clientMatterId);
  assert.equal(await phoneForm.getByLabel('Enable LEDES XML 2.1.3 for future bill preparations and revisions').isChecked(),true);
  await shot('390-ledes-xml-profile');await phoneForm.locator('summary').click();await shot('390-ledes-xml-invoice');
  const billing=await h.json('/matters/'+m.id+'/billing',undefined,h.owner);
  assert.deepEqual(billing.bills.map(b=>[b.status,b.snapshot.totalCents,b.ledes.invoiceNumber]),[['exported',42000,invoice],['exported',0,invoice+'-R1']]);
  assert.deepEqual(billing.bills[1].snapshot.ledes.lines.map(l=>[l.sourceId,l.activity,l.totalCents]),[[discovery.id,'A101',27000],[analysis.id,'A104',15000]]);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
