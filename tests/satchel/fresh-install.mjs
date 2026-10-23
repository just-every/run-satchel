// OSS-001 receipt: the published run command on a fresh installation, then the native firm, matter, time and bill
// workflow in a browser with no Satchel payment, plan or license prompt. Not a push-Verify test (it installs from the
// network); run it on the candidate: node tests/satchel/fresh-install.mjs <fresh clone dir> <repository URL> <receipt file>
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const [dir,repository,receipt]=process.argv.slice(2);
assert.ok(dir&&repository&&receipt,'usage: fresh-install.mjs <dir> <repository> <receipt>');
const forbidden=/upgrade|subscribe|free trial|license key|choose a plan|pricing|payment required/i;
const server=spawn('rer',['dev',repository,'--dir',dir,'--foreground','--non-interactive'],{stdio:['ignore','pipe','pipe']});
let output='';const open=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('rer dev never printed RER_OPEN:\n'+output.slice(-2000))),900000);
 for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>{output+=chunk;const found=output.match(/RER_OPEN[=: ]+(\S+)/);if(found){clearTimeout(timer);resolve(found[1]);}});
 server.on('exit',code=>reject(new Error('rer dev exited '+code+':\n'+output.slice(-2000))));});
const lines=[];
try{
 const link=await open,browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  const page=await(await browser.newContext({viewport:{width:1440,height:1000}})).newPage(),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(String(e)));
  const requested=new Set();page.on('request',r=>requested.add(new URL(r.url()).host));
  const form=name=>page.locator('form',{has:page.getByRole('button',{name,exact:true})}),done=text=>page.getByRole('status').getByText(text).waitFor();
  const check=async step=>{const body=await page.locator('body').innerText();assert.doesNotMatch(body,forbidden,step+' shows a payment, plan or license prompt');lines.push('ok '+step);};
  await page.goto(link);await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);await check('setup');
  const firm=form('Save firm settings');
  for(const [label,value] of [['Firm name','Barton & Lee LLP'],['Firm email','office@bartonlee.example'],['Firm phone','212 555 0100'],['Office phone','212 555 0100'],['Code (2–6 letters or digits)','LIT'],['Practice area','Litigation']])await firm.getByLabel(label,{exact:true}).fill(value);
  for(const address of await firm.locator('fieldset.address').all())for(const [label,value] of [['Street address','200 Park Avenue'],['City','New York'],['State (two letters)','NY'],['ZIP code','10166']])await address.getByLabel(label).fill(value);
  await firm.getByRole('button',{name:'Save firm settings'}).click();await done('Firm settings saved');await check('firm settings');
  const tab=async name=>{await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name,exact:true}).click();await page.getByRole('heading',{level:1,name,exact:true}).waitFor();};
  await tab('Matters');const search=form('Run conflict search');await search.getByLabel('Client name').fill('Harper Bakery LLC');await search.getByLabel('Adverse party name').fill('Main Street Holdings');await search.getByRole('button',{name:'Run conflict search'}).click();await done('Search recorded');
  const opening=form('Open reviewed matter');await opening.getByLabel('Matter title').fill('Harper lease dispute');await opening.getByLabel('Review conclusion and any conflict clearance').fill('No matches in firm records; cleared.');await opening.getByRole('checkbox').check();await opening.getByRole('button',{name:'Open reviewed matter'}).click();await done('Matter opened');await check('matter');
  await tab('Time & bills');const work=form('Record entry');await work.getByLabel('Description').fill('Review lease and notice');await work.getByLabel('Minutes').fill('90');await work.getByRole('button',{name:'Record entry'}).click();await done('Entry recorded');await page.getByRole('cell',{name:'$450.00'}).waitFor();await check('time entry');
  const unbilled=page.locator('section.panel',{has:page.getByRole('heading',{name:'Unbilled work',exact:true})});await unbilled.getByLabel('Bill title',{exact:true}).fill('First invoice');await unbilled.getByLabel('Bill date',{exact:true}).fill('2026-10-23');await unbilled.getByRole('button',{name:'Prepare bill from all unbilled work',exact:true}).click();await done('Bill prepared. Review the exact lines below.');
  await page.getByText('$450.00').first().waitFor();await check('bill');
  await tab('Team & safety');await page.getByRole('heading',{name:'Provider charges'}).waitFor();await page.getByText('Satchel charge: none.').first().waitFor();assert.match(await page.locator('section.providers').innerText(),/Satchel charge: none/);await check('provider charges');
  assert.deepEqual(errors,[]);
  const hosts=[...requested].filter(h=>!/^(127\.0\.0\.1|localhost|[a-z0-9-]+\.localhost)(:\d+)?$/.test(h));lines.push('external hosts contacted by the app pages: '+(hosts.join(', ')||'none'));
 }finally{await browser.close();}
 lines.push('PASS fresh installation of '+repository+' at '+process.env.CANDIDATE_SHA);
}finally{server.kill('SIGTERM');await writeFile(receipt,lines.join('\n')+'\n');}
