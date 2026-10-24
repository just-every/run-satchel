import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {harness} from './harness.mjs';
import {capturePanel} from './browser-shots.mjs';
const weekday=(n)=>['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short'}).format(new Date(Date.now()+n*86400000)))+1;
const iconOnly=page=>page.evaluate(()=>[...document.querySelectorAll('button,a[href],[role=button]')].filter(e=>!e.textContent.trim()&&!e.querySelector('input,img[alt]')).map(e=>e.outerHTML.slice(0,160)));
for(const [width,height] of [[1440,1000],[390,844]])test(`INTAKE-003 / INTAKE-008 prospect books, moves and opts out; staff see the consultation, consent and stopped sequence at ${width}px`,async()=>{
 const h=await harness(),browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try{
  await h.json('/team',{email:'lawyer@example.test',name:'Marcus Lee',role:'lawyer'},h.owner);await h.json('/team/invite',{email:'lawyer@example.test'},h.owner);
  await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);
  for(const kind of ['consultation_reminder','unanswered_inquiry']){const current=(await h.json('/followups/settings',undefined,h.owner)).settings.find(s=>s.kind===kind);await h.json('/followups/settings',{...current,enabled:true,quietStart:'22:00',quietEnd:'06:00',timezone:'UTC'},h.owner);}
  const offer=await h.json('/consult/offers',{title:'Initial consultation',lawyerEmail:'lawyer@example.test',timezone:'America/New_York',durationMinutes:60,bufferBefore:0,bufferAfter:15,windows:[2,3,4].map(n=>({day:weekday(n),start:'09:00',end:'10:00'})),noticeHours:0,horizonDays:5,feeCents:15000,consentText:'I consent to this firm reviewing my inquiry and booking a consultation.',published:true},h.owner);
  const context=await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true,timezoneId:'Asia/Tokyo'}),guest=await context.newPage(),errors=[];guest.setDefaultTimeout(15000);guest.on('pageerror',e=>errors.push(String(e)));
  await guest.goto(h.origin+'/book/'+offer.id);await guest.getByRole('heading',{level:1,name:'Initial consultation'}).waitFor();await guest.getByText('GMT+9').first().waitFor();
  assert.deepEqual(await iconOnly(guest),[]);assert.equal(await guest.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  await guest.getByRole('radio').first().check();await guest.getByLabel('Full name').fill('Elena Rivera');await guest.getByLabel('Email address').fill('elena@example.test');await guest.getByLabel('Matter summary').fill('Parenting arrangements');
  await guest.getByText(/Submitting creates no attorney-client relationship/).waitFor();assert.equal(await guest.getByRole('checkbox',{name:/Email me reminders/}).isChecked(),false);await guest.getByRole('checkbox',{name:/consultation fee/}).getAttribute('required').then(v=>assert.notEqual(v,null));
  await guest.getByRole('checkbox',{name:/I consent to this firm/}).check();await guest.getByRole('checkbox',{name:/consultation fee/}).check();await guest.getByRole('checkbox',{name:/Email me reminders/}).check();
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(guest,guest.locator('main'),process.env.SATCHEL_SCREENSHOTS,'book-'+width);
  await guest.getByRole('button',{name:'Book this time'}).click();await guest.getByRole('heading',{name:'Consultation booked'}).waitFor();await guest.getByText('Nothing was charged now').waitFor();
  await guest.getByRole('link',{name:'Change or cancel your consultation'}).click();await guest.getByRole('heading',{level:2,name:'Choose another time'}).waitFor();
  await guest.getByRole('radio').first().check();await guest.getByRole('button',{name:/^Move to /}).click();await guest.getByRole('status').getByText('Your consultation was moved.').waitFor();
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(guest,guest.locator('main'),process.env.SATCHEL_SCREENSHOTS,'manage-'+width);
  assert.equal((await h.json('/consultations',undefined,h.owner)).consultations.filter(c=>c.status==='booked').length,1,'Moving keeps one appointment');
  // Staff: sign in, open Matters and read the consultation, the consent and the lead's follow-up controls.
  const page=await(await browser.newContext({viewport:{width,height},ignoreHTTPSErrors:true})).newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(h.origin+'/signin');await page.getByLabel('Email').fill('owner@example.test');await page.getByRole('button',{name:'Email a sign-in link'}).click();await page.getByText('a sign-in link is on its way').waitFor();
  const mail=h.mails.toReversed().find(m=>m.to.includes('owner@example.test')),link=(mail.text??mail.html).match(/https:\/\/[^\s"<]+\/auth\/confirm\?token=[^\s"&<]+/)[0];await page.goto(link);await page.getByRole('button',{name:'Confirm'}).click();await page.waitForURL(/\/setup/);await page.getByLabel('Your name').fill('Avery Barton');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);
  await page.getByRole('navigation',{name:'Workspace'}).getByRole('button',{name:'Matters',exact:true}).click();await page.getByRole('heading',{level:1,name:'Matters',exact:true}).waitFor();
  const panel=page.locator('section.consultations');await panel.getByRole('heading',{name:'Consultations',exact:true}).waitFor();await panel.getByRole('article',{name:'Consultation Elena Rivera'}).getByText(/fee \$150\.00 due at the consultation/).waitFor();await panel.getByRole('article',{name:'Availability Initial consultation'}).getByText(/\/book\//).waitFor();
  await page.locator('section.followup-settings').getByRole('heading',{name:'Consented follow-ups'}).waitFor();
  const lead=page.getByRole('article',{name:'Lead Elena Rivera'});await lead.getByText('Consent and follow-ups for Elena Rivera').click();await lead.getByText(/Email consent: Consultation booking form/).waitFor();
  await lead.getByRole('button',{name:'Start follow-up'}).click();await page.getByRole('status').getByText('Follow-up scheduled').waitFor();await lead.getByRole('article',{name:'Unanswered-inquiry follow-ups for Elena Rivera'}).getByText(/active/).waitFor();
  await lead.getByLabel('Why they stop').selectOption('reply');await lead.getByLabel('What was received or decided').fill('She replied to ask about Thursday');await lead.getByRole('button',{name:'Stop sequences'}).click();await page.getByRole('status').getByText('Sequences stopped').waitFor();
  await lead.getByRole('article',{name:'Unanswered-inquiry follow-ups for Elena Rivera'}).getByText(/Next: Respond to the prospect.s reply · Responsible: lawyer@example.test/).waitFor();
  if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,panel,process.env.SATCHEL_SCREENSHOTS,'staff-'+width);
  assert.deepEqual(await iconOnly(page),[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0);
  // A second prospect's reminder link opens the opt-out page; choosing it revokes consent and stops what remains.
  const second=(await h.json('/consult/'+offer.id+'?tz=UTC')).slots[0],booked=await h.request('/api/satchel/consult/'+offer.id+'/book',{slot:second.start,timezone:'UTC',name:'Tom Hale',email:'tom@example.test',summary:'Custody',consent:true,feeAcknowledged:true,reminderConsent:true,website:''});assert.equal(booked.status,200);
  const tom=(await h.json('/consultations',undefined,h.owner)).consultations.find(c=>c.leadName==='Tom Hale');
  await h.scheduled(Date.parse(tom.start)-86400000+60000);
  const url=h.mails.toReversed().find(m=>m.to.includes('tom@example.test')).text.match(/https:\/\/\S+\/followup\/\S+/)[0];
  await guest.goto(url);await guest.getByRole('heading',{name:'Stop these messages'}).waitFor();assert.deepEqual(await iconOnly(guest),[]);await guest.getByRole('button',{name:'Stop these messages'}).click();await guest.getByRole('status').getByText(/will not receive further automated messages/).waitFor();
  const final=await h.json('/leads/'+tom.leadId+'/followups',undefined,h.owner);assert.ok(final.consents[0].revokedAt);assert.equal(final.followups.some(f=>f.status==='active'),false);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await h.close();}
});
