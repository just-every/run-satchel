import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
import {authorizeAgent} from './agent-fixture.mjs';
import {capturePanel} from './browser-shots.mjs';
import {makePart,ArchiveVerifier,ContentVerifier} from '../../node_modules/@runeditrun/rer/modules/portability/format.mjs';

async function historicalArchive(h,proposal,label){
 const response=await h.request('/api/satchel/backup',undefined,h.owner);
 assert.equal(response.status,200);
 const records=(await response.text()).trim().split('\n').map(JSON.parse),manifest=records[0],parts=[];
 let preparations=0,events=0;
 for(const part of records.filter(record=>record.kind==='part')){
  const items=part.items.map(item=>{
   if(item.kind!=='row')return item;
   if(item.table==='s_proposals'&&item.row.id===proposal.id){
    preparations++;
    return {...item,row:{...item.row,prepared_identity:null,prepared_agent_id:null,agent_label:label}};
   }
   if(item.table!=='s_audit'||item.row.object_id!==proposal.id||item.row.action!=='proposal.prepared')return item;
   events++;
   const evidence=JSON.parse(item.row.evidence);
   delete evidence.context.preparedBy;
   delete evidence.record.prepared_identity;
   evidence.record.prepared_agent_id=null;
   evidence.record.agent_label=label;
   return {...item,row:{...item.row,evidence:JSON.stringify(evidence)}};
  });
  parts.push(await makePart(part.index,items));
 }
 assert.equal(preparations,1);assert.equal(events,1);
 const archiveHash=new ArchiveVerifier(manifest),contentHash=new ContentVerifier(manifest);
 for(const part of parts){archiveHash.add(part);for(const item of part.items)contentHash.add(item);}
 const closing={kind:'closing',partCount:parts.length,archiveHash:archiveHash.digest(),contentHash:contentHash.digest()};
 return [manifest,...parts,closing].map(record=>JSON.stringify(record)).join('\n')+'\n';
}

async function downloadAudit(page,audit){
 const pending=page.waitForEvent('download');
 await audit.getByRole('link',{name:'Download matching audit JSONL'}).click();
 const stream=await(await pending).createReadStream(),chunks=[];
 for await(const chunk of stream)chunks.push(chunk);
 return Buffer.concat(chunks).toString().trim().split('\n').map(JSON.parse);
}

async function checkScreen(page,panel,width,stem){
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth),0,'Legacy attribution fits the viewport');
 const unreadable=await panel.locator('p,strong,small,span,summary,label,input,select,button,pre,a').evaluateAll(elements=>elements.filter(element=>element.getClientRects().length&&parseFloat(getComputedStyle(element).fontSize)<13).map(element=>element.tagName));
 assert.deepEqual(unreadable,[],'Legacy attribution stays readable');
 if(process.env.SATCHEL_SCREENSHOTS)await capturePanel(page,panel,process.env.SATCHEL_SCREENSHOTS,`${stem}-${width}`);
}

export async function exerciseLegacyAttribution(browser,h,width){
 let target,context;
 try{
  const matter=await open(h,'Legacy attribution review','Synthetic Satchel legacy client','Synthetic Satchel legacy adverse');
  const label='Legacy preparation assistant',key=await h.json('/keys',{label},h.owner),{auth}=await authorizeAgent(h,key,matter.id);
  const proposal=await h.json('/agent/prepare-deadline',{matterId:matter.id,title:'Historical deadline preparation',date:'2027-03-20',timezone:'America/New_York',source:'Original retained instruction'},'',200,auth);
  const archive=await historicalArchive(h,proposal,label);
  target=await harness();
  await target.json('/restore',{archive,confirm:'RESTORE'},target.owner);
  const expected={agent:{id:null,name:null},for:{id:proposal.preparedBy.for.id,name:null},label,legacy:true};
  const restored=(await target.json('/state',undefined,target.owner)).proposals.find(record=>record.id===proposal.id);
  assert.deepEqual(restored.preparedBy,expected);
  const owner=await target.json('/me',undefined,target.owner);
  context=await browser.newContext({viewport:{width,height:width===390?844:1000},ignoreHTTPSErrors:true});
  await context.addCookies(target.owner.split(';').map(part=>{const cookie=part.trim(),separator=cookie.indexOf('=');return {name:cookie.slice(0,separator),value:cookie.slice(separator+1),url:target.origin,secure:true};}));
  const page=await context.newPage();page.setDefaultTimeout(15000);
  await page.goto(target.origin+'/setup');await page.getByLabel('Your name').fill('Destination principal');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Finish setup'}).click();await page.waitForURL(/\/app/);
  const navigation=page.getByRole('navigation',{name:'Workspace'});
  await navigation.getByRole('button',{name:'Preparations',exact:true}).click();
  const preparation=page.locator('article.record').filter({hasText:'Historical deadline preparation'});
  await preparation.getByText('Agent name unrecorded',{exact:false}).waitFor();
  const attribution=preparation.locator('p').filter({hasText:'Prepared by:'});
  assert.match(await attribution.innerText(),new RegExp('Prepared by: '+label));
  assert.match(await attribution.innerText(),/Person name unrecorded/);
  await preparation.getByText('Legacy',{exact:true}).waitFor();
  await checkScreen(page,preparation,width,'legacy-preparation');
  await preparation.getByText('Decline',{exact:true}).click();
  await preparation.getByLabel('Reason',{exact:true}).fill('Human review declines the historical suggestion');
  await preparation.getByRole('button',{name:'Decline preparation',exact:true}).click();
  await page.getByRole('status').getByText('Preparation declined',{exact:true}).waitFor();
  await preparation.getByText('Decision: '+owner.email,{exact:false}).waitFor();
  assert.match(await attribution.innerText(),/Person name unrecorded/);
  await checkScreen(page,preparation,width,'legacy-preparation-decided');
  await navigation.getByRole('button',{name:'Team & safety',exact:true}).click();
  const audit=page.locator('section').filter({has:page.getByRole('heading',{name:'Action audit',exact:true})});
  const filter=audit.locator('form');
  await filter.getByLabel('Audit matter',{exact:true}).selectOption(matter.id);
  for(const action of ['proposal.prepared','proposal.declined']){
   await filter.getByLabel('Exact action (optional)').fill(action);
   await filter.getByRole('button',{name:'Filter action audit',exact:true}).click();
   const record=audit.locator('details.record').filter({hasText:action});
   await record.locator('summary').click();
   await record.getByText('Agent name unrecorded',{exact:false}).waitFor();
   await record.getByText('Person name unrecorded',{exact:false}).waitFor();
   const summary=await record.locator('summary').innerText();
   if(action==='proposal.prepared'){
    assert.ok(summary.includes(label));assert.ok(!summary.includes(owner.email));
    await record.getByText('Prepared by: '+label,{exact:false}).waitFor();
   }else{
    assert.ok(summary.includes(owner.email));
    await record.getByText('Original preparation: '+label,{exact:false}).waitFor();
    await record.getByText(/owner · person/).waitFor();
   }
   const rows=await downloadAudit(page,audit);
   assert.equal(rows.length,1);assert.equal(rows[0].objectId,proposal.id);
   assert.deepEqual(rows[0].preparedBy,expected);
   assert.equal(rows[0].actor.channel,action==='proposal.prepared'?'agent':'person');
   assert.equal(rows[0].evidence.record.prepared_agent_id,null);
   assert.equal(rows[0].evidence.record.agent_label,label);
   if(action==='proposal.prepared'){
    assert.equal(Object.hasOwn(rows[0].evidence.context,'preparedBy'),false);
    assert.equal(Object.hasOwn(rows[0].evidence.record,'prepared_identity'),false);
   }else assert.equal(rows[0].evidence.record.prepared_identity,null);
   await checkScreen(page,audit,width,action==='proposal.prepared'?'legacy-preparation-audit':'legacy-human-decision-audit');
  }
 }finally{if(context)await context.close();if(target)await target.close();}
}
