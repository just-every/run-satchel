import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {serveSite} from './serve.mjs';

export async function exerciseAgentReference(browser,width){
 const site=await serveSite(),context=await browser.newContext({viewport:{width,height:1000}});
 try{
  const page=await context.newPage();await page.goto(site.origin+'/docs');
  await page.getByRole('link',{name:'Company preparation agents',exact:false}).click();
  await page.getByRole('heading',{level:1,name:'Company preparation agents'}).waitFor();
  if(width===1440){
   assert.equal(await page.locator('html').evaluate(el=>el.scrollWidth),width,'The guide fits the viewport');
   const tables=page.getByRole('region',{name:'Table',exact:true});assert.ok(await tables.count(),'The published reference has readable tables');
   for(const table of await tables.all()){
    await table.focus();assert.equal(await table.evaluate(el=>el===document.activeElement),true,'Tables are keyboard reachable');
    for(const cell of await table.locator('th,td,code').all())assert.ok(await cell.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=13),'Reference text stays readable');
   }
   for(const link of await page.getByRole('navigation',{name:'On this page'}).getByRole('link').all()){
    await link.click();const id=(await link.getAttribute('href')).slice(1);assert.equal(await page.locator('[id="'+id+'"]').count(),1,'Section navigation reaches its heading');
   }
   for(const link of await page.locator('.docs-prose table a[href^="#fixture-"]').all()){
    await link.click();const id=(await link.getAttribute('href')).slice(1);
    const heading=page.locator('[id="'+id+'"]');await heading.waitFor();
    await page.waitForFunction(id=>{const rect=document.getElementById(id).getBoundingClientRect();return rect.bottom>0&&rect.top<window.innerHeight;},id);
   }
   const findings=await new AxeBuilder({page}).include('main').analyze();assert.deepEqual(findings.violations.filter(v=>['serious','critical'].includes(v.impact)),[]);
   const native=page.getByRole('link',{name:'tests/agent-door/native-journey.mjs',exact:true});assert.ok((await native.getAttribute('href')).endsWith('/tests/agent-door/native-journey.mjs'));
   await page.getByRole('navigation',{name:'Docs',exact:true}).getByRole('link',{name:'API',exact:true}).click();await page.getByRole('heading',{level:1,name:'API',exact:true}).waitFor();await page.goBack();
  }else{
   await page.locator('.docs-menu summary').click();await page.getByRole('navigation',{name:'Docs',exact:true}).getByRole('link',{name:'Company preparation agents',exact:true}).waitFor();await page.locator('.docs-menu summary').click();
  }
  await page.evaluate(()=>window.scrollTo(0,0));
  if(process.env.SATCHEL_PROOF_DIR){await mkdir(process.env.SATCHEL_PROOF_DIR,{recursive:true});await page.screenshot({path:resolve(process.env.SATCHEL_PROOF_DIR,'agents-'+width+'.png'),fullPage:true});}
 }finally{await context.close();await site.close();}
}
