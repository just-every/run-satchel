import assert from 'node:assert/strict';
import {agentMetricsFixture} from './agent-metrics-flow.mjs';
import {exemptTaxReview} from './tax-fixture.mjs';
import {capturePanel} from './browser-shots.mjs';
const form=(root,button)=>root.locator('form',{has:root.getByRole('button',{name:button,exact:true})});
export async function exerciseAgentMetrics(page,h,width){
 const f=await agentMetricsFixture(h),nav=page.getByRole('navigation',{name:'Workspace'});
 await h.json('/keys/'+f.key.id+'/revoke',{},h.owner);
 const confirmed=await h.json('/deadlines/'+f.native.id+'/confirm',{revision:f.native.revision,note:'Native completion review'},h.owner),completed=await h.json('/deadlines/'+f.native.id+'/complete',{revision:confirmed.revision,evidence:'Native completion receipt synthetic-satchel-41'},h.owner);
 await h.json('/bills/'+f.bill.id+'/approve',{revision:f.bill.revision,reviewNote:'Review source-linked work',taxReviewId:await exemptTaxReview(h,'/bills/'+f.bill.id+'/approve')},h.owner);
 const baseline=await h.json(f.base+'/deadlines',{title:'Measured baseline source review',date:'2000-01-01',timezone:'America/New_York',source:'Native baseline source review'},h.owner),checked=await h.json('/deadlines/'+baseline.id+'/confirm',{revision:baseline.revision,note:'Independent baseline review'},h.owner);await h.json('/deadlines/'+baseline.id+'/complete',{revision:checked.revision,evidence:'Retained baseline completion evidence'},h.owner);
 const work=async(minutes,description)=>h.json(f.base+'/entries',{kind:'time',date:'2026-10-15',minutes,rateCents:12000,description},h.owner);
 await work(60,'Measured baseline work');await work(20,'Measured assisted preparation and review');
 await page.reload();await nav.getByRole('button',{name:'Team & safety',exact:true}).click();
 const panel=page.locator('section.agent-metrics');await panel.getByText('Current permitted records',{exact:false}).waitFor();
 const pending=panel.locator('.agent-result').filter({has:page.getByRole('heading',{name:'Pending evidence review · pending',exact:true})});
 await pending.getByText('Original provenance and policy',{exact:true}).click();
 await pending.getByRole('link',{name:/Measured preparation source/}).waitFor();
 if(width===1440){const wire=await h.json('/agent-metrics',undefined,h.owner);for(const status of ['pending','accepted','declined','refused'])assert.equal(await panel.locator('[data-count='+status+']').innerText(),String(wire.counts[status]));assert.ok((await pending.innerText()).includes(f.grant.agreement.id));assert.ok((await pending.innerText()).includes(f.source.versions[0].sha256));}
 await pending.getByText('Review source accuracy',{exact:true}).click();const review=form(pending,'Record source review');await review.getByLabel('Source accuracy').selectOption('accurate');await review.getByLabel('Source review evidence').fill('Inspected retained original source and recommendation input');await review.getByRole('button',{name:'Record source review'}).click();await page.getByRole('status').getByText('Source review recorded',{exact:true}).waitFor();
 const recovery=panel.locator('.agent-result').filter({has:page.getByRole('heading',{name:'Recovered work preparation · accepted',exact:true})});await recovery.getByText('Confirm recovered billable work',{exact:true}).click();await recovery.getByLabel('Confirmed recovery attribution').fill('Principal confirms this previously unbilled native work was recovered by the recommendation');await recovery.getByRole('button',{name:'Confirm recovery '+f.work.id.slice(0,8),exact:true}).click();await page.getByRole('status').getByText('Recovery attribution recorded',{exact:true}).waitFor();
 await panel.getByText('Compare measured cohorts',{exact:true}).click();
 await panel.getByLabel('Completed milestone',{exact:true}).selectOption(baseline.id);await panel.getByRole('checkbox',{name:/Measured baseline work/}).check();await panel.getByRole('button',{name:'Add cohort milestone'}).click();
 await panel.getByLabel('Cohort',{exact:true}).selectOption('assisted');await panel.getByLabel('Completed milestone',{exact:true}).selectOption(completed.id);await panel.getByRole('checkbox',{name:/Measured assisted preparation and review/}).check();await panel.getByRole('button',{name:'Add cohort milestone'}).click();
 const comparison=form(panel,'Record measured comparison');await comparison.getByLabel('Comparison title').fill('Measured source-review comparison');await comparison.getByLabel('Comparable work and selection rationale').fill('Same native source-review milestone, actual posted preparation and human review minutes; observational comparison');await comparison.getByRole('button',{name:'Record measured comparison'}).click();await page.getByRole('status').getByText('Measured comparison recorded',{exact:true}).waitFor();
 const study=panel.locator('.agent-comparison').filter({hasText:'Measured source-review comparison'});await study.waitFor();
 if(width===1440){assert.ok((await study.innerText()).includes('40.00'));assert.ok((await study.innerText()).includes('100.00 percentage points'));assert.ok((await panel.innerText()).includes('30 minutes'));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0,'Agent results fit the desktop');const small=await panel.evaluate(root=>[...root.querySelectorAll('p,code,label,button,summary,pre,dt,dd')].filter(e=>e.getClientRects().length&&parseFloat(getComputedStyle(e).fontSize)<13).map(e=>e.tagName));assert.deepEqual(small,[]);}
 // The phone is the existing smoke; outcome assertions stay at one width.
 if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,panel,process.env.SATCHEL_SCREENSHOTS,`agent-results-${width}`);
 await panel.getByLabel('Preparation outcome').selectOption('refused');await panel.getByRole('heading',{name:'Refused queued preparation · refused',exact:true}).waitFor();
 if(width===1440){assert.equal(await pending.count(),0);assert.ok((await panel.innerText()).includes('key_revoked'));}
 if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,panel,process.env.SATCHEL_SCREENSHOTS,`agent-results-refused-${width}`);
}
export async function inspectRefusedAgentMetrics(page,width){
 const panel=page.locator('section.agent-metrics');await panel.getByText('Only the principal can inspect agent results.',{exact:false}).waitFor();
 if(width===1440)assert.equal(await panel.locator('.agent-result,[data-count],.agent-comparison').count(),0);
 if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,panel,process.env.SATCHEL_SCREENSHOTS,`agent-results-access-refused-${width}`);
}
