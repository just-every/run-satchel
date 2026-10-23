import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const text=async file=>(await readFile(file,'utf8')).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g,' ').replace(/<[^>]*>/g,' ').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ');
// OSS-001: LICENSE, homepage, /run, README and owner guides tell one story.
test('LICENSE, homepage, run page, README and owner guides agree: MIT, free Satchel software, self-hosting and direct provider billing',async()=>{
 assert.match(await readFile('LICENSE','utf8'),/^MIT License/);
 const home=await text('dist/site/index.html'),run=await text('dist/site/run.html'),readme=(await readFile('README.md','utf8')).replace(/\s+/g,' '),guide=await text('dist/site/docs/free-and-providers.md'.replace('.md','.html'));
 assert.match(home,/100% free, open source alternative/);assert.match(home,/Free and open source, MIT licensed/);assert.match(home,/own computer or server/);
 assert.match(run,/MIT license/);assert.match(run,/rer dev just-every\/run-satchel/);
 assert.match(readme,/MIT licensed/);assert.match(readme,/runs in your own Cloudflare account/i);
 for(const [name,page] of [['README',readme],['guide',guide]]){
  assert.match(page,/no (Satchel )?license fee, subscription, paywall, seat charge or matter limit/i,name);
  assert.match(page,/bill(s)? (the firm|your firm) directly/i,name);
  for(const provider of ['LawPay','Stripe','DocuSign','Inkwell','QuickBooks Online','Xero'])if(name!=='README')assert.ok(page.includes(provider),name+' names '+provider);
 }
 assert.match(guide,/MIT license/);assert.match(guide,/own Cloudflare account/);assert.match(guide,/Satchel adds no charge, markup or resale fee/);
  assert.match(guide,/100% free.{1,8}describes Satchel software/);
 assert.match(await text('dist/site/contract.html'),/100% free.{1,8}describes Satchel software only/);
 // The homepage and run page offer no price, plan, trial or license-key step.
 for(const page of [home,run])assert.doesNotMatch(page,/\b(pricing|subscribe|subscription plan|free trial|license key|per seat|per user|upgrade to)\b/i);
 // Every guide that tells a reader to run Satchel points to the provider-billing guide.
 assert.match(await text('dist/site/docs/getting-started.html'),/Free software and provider charges/);
});
