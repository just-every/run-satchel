import {invoiceTemplateJourney} from './invoice-template-journey.mjs';
import assert from 'node:assert/strict';
import {invoiceLogo} from './invoice-delivery-fixture.mjs';
import {capturePanel} from './browser-shots.mjs';

// Extend the existing reviewed-invoice provider journey; callers own its signed-in page and fixture.
export async function invoiceDeliveryJourney({page,h,m,bill,deliveryEdge,width}){
 const navigation=page.getByRole('navigation',{name:'Workspace'});
 await navigation.getByRole('button',{name:'Firm',exact:true}).click();
 const templates=page.getByRole('region',{name:'Invoice templates'});await templates.waitFor();
 const configure=templates.locator('details').first();await configure.locator('summary').click();
 await templates.getByLabel('Invoice firm name',{exact:true}).fill('Synthetic Satchel Counsel');await templates.getByLabel('Invoice firm address',{exact:true}).fill('100 Example Street, New York NY 10001');
 await templates.getByLabel('Firm invoice logo',{exact:true}).setInputFiles({name:'synthetic-satchel-logo.png',mimeType:'image/png',buffer:Buffer.from(invoiceLogo,'base64')});
 await templates.getByLabel('Remittance details',{exact:true}).fill('Remit to Synthetic Satchel Counsel, operating account ending 1234');await templates.getByLabel('Invoice payment terms',{exact:true}).fill('Due within 30 days. Contact counsel with questions.');await templates.getByLabel('Template approval reason',{exact:true}).fill('Counsel approves the complete invoice layout and trust disclosure.');await templates.getByLabel('I approve this exact template for future invoice artifacts').check();
 await templates.getByLabel('Invoice layout',{exact:true}).selectOption('detailed');
 for(const label of ['Show hours','Show hourly rates','Show timekeepers','Show UTBMS codes','Show no-charge lines','Show discounts'])await templates.getByLabel(label,{exact:true}).check();
 if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,templates,process.env.SATCHEL_SCREENSHOTS,'invoice-display-options-'+width);
 await templates.getByRole('button',{name:'Approve template version',exact:true}).click();await page.getByRole('status').getByText('Invoice template version approved',{exact:true}).waitFor();
 await templates.getByText('Approve sign-in notification',{exact:true}).click();await templates.getByLabel('Notification approval reason',{exact:true}).fill('Counsel approves the exact content-free sign-in notification.');await templates.getByLabel('Counsel approves this exact plain-text sign-in notification').check();await templates.getByRole('button',{name:'Approve notification wording'}).click();await page.getByRole('status').getByText('Sign-in notification approved',{exact:true}).waitFor();
 if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,templates,process.env.SATCHEL_SCREENSHOTS,'invoice-templates-'+width);
 const state=await h.json('/invoice-templates',undefined,h.owner),template=state.templates.at(-1),notification=state.notifications.at(-1);
 assert.equal(template.config.layout,'detailed');for(const key of ['showHours','showRates','showTimekeepers','showUtbms','showNoChargeLines','showDiscounts'])assert.equal(template.config[key],true,key);
 await navigation.getByRole('button',{name:'Time & bills',exact:true}).click();
 const article=page.locator('.bill-packages article.record').filter({has:page.locator('strong').filter({hasText:bill.snapshot.title})}).first();await article.waitFor();
 const delivery=article.locator('details').filter({has:page.getByText('Invoice delivery',{exact:true})});
 const openDelivery=async()=>{await delivery.waitFor();if(!await delivery.evaluate(e=>e.open))await delivery.locator('summary').first().click();};
 await openDelivery();await delivery.getByLabel('Payer portal email',{exact:true}).fill('client@example.test');await delivery.getByLabel('Invoice payer name',{exact:true}).fill('Synthetic Satchel Client');await delivery.getByLabel('Approved invoice template',{exact:true}).selectOption(template.id);await delivery.getByRole('button',{name:'Deliver invoice to portal',exact:true}).click();await page.getByRole('status').getByText('Branded invoice delivered inside the authenticated portal',{exact:true}).waitFor();
 await openDelivery();const record=delivery.getByRole('region',{name:'Invoice delivery to client@example.test'});await record.getByRole('link',{name:'Download delivered PDF'}).waitFor();await record.getByLabel('Counsel-approved notification',{exact:true}).selectOption(notification.id);await record.getByLabel('Sending authority and provider check',{exact:true}).fill('Counsel checked recipient consent and authorizes this one notification.');await record.getByLabel('I checked the prior outcome and authorize exactly one notification').check();await record.getByRole('button',{name:'Authorize one notification',exact:true}).click();await page.getByRole('status').getByText('One notification authorized',{exact:true}).waitFor();
 await openDelivery();await record.getByRole('button',{name:'Send authorized sign-in notification',exact:true}).click();await page.getByRole('status').getByText('Notification attempt recorded',{exact:true}).waitFor();await openDelivery();await record.getByText('Provider accepted the notification. Mailbox delivery is unconfirmed.',{exact:false}).waitFor();
 await delivery.getByRole('button',{name:'Deliver payer statement',exact:true}).click();await page.getByRole('status').getByText('Payer statement delivered to the portal',{exact:true}).waitFor();await openDelivery();
 await delivery.getByRole('link',{name:/Payer statement · client@example.test/}).waitFor();
 const file=await h.request((await record.getByRole('link',{name:'Download delivered PDF'}).getAttribute('href')),undefined,h.owner);assert.equal(file.status,200);assert.equal(file.headers.get('content-type'),'application/pdf');
 if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,article,process.env.SATCHEL_SCREENSHOTS,'invoice-delivery-'+width);
 const delivered=(await h.json('/matters/'+m.id+'/invoice-deliveries',undefined,h.owner)).deliveries.find(d=>d.bill_id===bill.id);
 await deliveryEdge.bounce(h,delivered.attempts.at(-1));await page.reload();await navigation.getByRole('button',{name:'Time & bills',exact:true}).click();await openDelivery();await record.getByText('Provider bounced',{exact:false}).waitFor();
 if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,record,process.env.SATCHEL_SCREENSHOTS,'invoice-bounced-'+width);
 await record.getByLabel('Sending authority and provider check',{exact:true}).fill('Counsel inspected the bounce, rechecked consent and authorizes exactly one further attempt.');await record.getByLabel('I checked the prior outcome and authorize exactly one notification').check();await record.getByRole('button',{name:'Authorize one resend',exact:true}).click();await page.getByRole('status').getByText('One notification authorized',{exact:true}).waitFor();await openDelivery();deliveryEdge.uncertain(true);await record.getByRole('button',{name:'Send authorized sign-in notification',exact:true}).click();await page.getByRole('status').getByText('Notification attempt recorded',{exact:true}).waitFor();await openDelivery();await record.getByText('Provider acknowledgment is uncertain.',{exact:false}).waitFor();assert.equal(await record.getByRole('button',{name:'Send authorized sign-in notification',exact:true}).count(),0);
 if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,record,process.env.SATCHEL_SCREENSHOTS,'invoice-uncertain-'+width);deliveryEdge.uncertain(false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0,'Invoice delivery fits the viewport');
 assert.deepEqual(await delivery.locator('button,a[href],[role=button]').evaluateAll(elements=>elements.filter(e=>!e.textContent.trim()).map(e=>e.outerHTML)),[]);
 await invoiceTemplateJourney({page,h,width,detailed:template});
}
