import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {harness,open} from './harness.mjs';
const form=(page,name)=>page.locator('form',{has:page.getByRole('button',{name,exact:true})});
async function notice(page,text){await page.getByRole('status').getByText(text).waitFor();}
for(const [width,height] of [[1440,1000],[390,844]])test(`CAL-008 view overlapping hearings and an unconfirmed limitation date, assign coverage and export the agenda at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const address={line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'};
  await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@bartonlee.example',phone:'2125550100',address,timezone:'America/New_York',currency:'USD',billing:{defaultRateCents:30000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Manhattan',phone:'2125550100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'}]}},h.owner);
  for(const [email,name] of [['lawyer@example.test','Marcus Lee'],['priya@example.test','Priya Shah']]){await h.json('/team',{email,name,role:'lawyer'},h.owner);await h.json('/team/invite',{email},h.owner);await h.login(email);}
  const m=await open(h),m2=await open(h,'Pine Studio lease','Pine Studio','Cedar Property');
  for(const email of ['lawyer@example.test','priya@example.test'])await h.json('/matters/'+m.id+'/access',{email},h.owner);await h.json('/matters/'+m2.id+'/access',{email:'lawyer@example.test'},h.owner);
  const once={frequency:'once',durationMinutes:60,timezone:'America/New_York',attendees:['lawyer@example.test']};
  await h.json('/matters/'+m.id+'/appointments',{...once,title:'Motion hearing',date:'2026-11-16',time:'09:30'},h.owner);
  await h.json('/matters/'+m2.id+'/appointments',{...once,title:'Deposition hearing',date:'2026-11-16',time:'10:00'},h.owner);
  await h.json('/matters/'+m.id+'/deadlines',{kind:'limitation',title:'Statute of limitations',date:'2027-02-01',timezone:'America/New_York',source:'Injury date 2024-02-01; CPLR 214'},h.owner);
  const filing=await h.json('/matters/'+m.id+'/deadlines',{kind:'filing',title:'File opposition',date:'2026-11-17',timezone:'America/New_York',source:'Scheduling order paragraph 4'},h.owner);await h.json('/deadlines/'+filing.id+'/confirm',{revision:filing.revision,note:'Checked order'},h.owner);
  const context=await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true,acceptDownloads:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));
  async function shot(name){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0,`${name} fits at ${width}px`);if(process.env.SATCHEL_SCREENSHOTS){await mkdir(process.env.SATCHEL_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.SATCHEL_SCREENSHOTS}/${width}-${name}.png`,fullPage:true});}}
  await page.goto(h.origin+'/signin');await page.getByLabel('Email').fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.toReversed().find(m=>m.to.includes('owner@example.test')),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];
  await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.waitForURL(/\/setup|\/app/);if(page.url().includes('/setup')){await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);}
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Calendar',exact:true}).click();await page.getByRole('heading',{level:1,name:'Calendar',exact:true}).waitFor();
  const panel=page.locator('section',{has:page.getByRole('heading',{name:'Agenda and coverage',exact:true})});
  const range=form(page,'Show agenda');await range.getByLabel('Agenda from').fill('2026-11-01');await range.getByLabel('Agenda to').fill('2027-02-28');await range.getByRole('button',{name:'Show agenda'}).click();
  const item=title=>panel.locator('article',{has:page.getByText(title,{exact:true})});
  await item('Motion hearing').getByText('Next action: Resolve conflict with Deposition hearing').waitFor();await item('Motion hearing').getByText(`Conflicts with Deposition hearing (Matter ${m2.matter_number})`).waitFor();
  await item('Statute of limitations').getByText('unconfirmed (proposed; needs lawyer confirmation)').waitFor();
  await panel.locator('p',{hasText:'2027-02-01 · Matter '+m.matter_number+' · Statute of limitations'}).getByText('unconfirmed',{exact:true}).waitFor();
  const owner=form(page,'Set owner for File opposition');await owner.getByLabel('Responsible person').selectOption({label:'Marcus Lee'});await owner.getByRole('button',{name:'Set owner for File opposition'}).click();await notice(page,'Owner assigned');
  const away=form(page,'Record absence');await away.getByLabel('Absent person').selectOption({label:'Marcus Lee'});await away.getByLabel('First day away').fill('2026-11-17');await away.getByLabel('Last day away').fill('2026-11-18');await away.getByLabel('Reason (seen by the principal and you)').fill('Medical leave');await away.getByRole('button',{name:'Record absence'}).click();await notice(page,'Absence recorded');
  await item('File opposition').getByText('Next action: Assign coverage for Marcus Lee').waitFor();
  const cover=form(page,'Assign coverage for Marcus Lee');await cover.getByLabel('Covering colleague').selectOption({label:'Priya Shah'});await cover.getByRole('button',{name:'Assign coverage for Marcus Lee'}).click();await notice(page,'Coverage assigned');
  await item('File opposition').getByText('Marcus Lee absent; covered by Priya Shah').waitFor();await item('File opposition').getByText('Next action: Prepare and complete').waitFor();
  await shot('agenda');
  const [download]=await Promise.all([page.waitForEvent('download'),panel.getByRole('link',{name:'Export agenda CSV'}).click()]);
  const csv=(await readFile(await download.path(),'utf8')).trim().split('\r\n');
  assert.equal(csv[0],'Date,Time,Timezone,Kind,Matter,Title,Source,Owner,Confirmation,Coverage,Conflicts,Next action');
  assert.equal(csv.length,5);assert.ok(csv.some(l=>l.includes('Statute of limitations')&&l.includes('unconfirmed (proposed; needs lawyer confirmation)')&&l.includes('Injury date 2024-02-01; CPLR 214')));
  assert.ok(csv.some(l=>l.includes('File opposition')&&l.includes('confirmed by owner@example.test')&&l.includes('covered by priya@example.test')));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
