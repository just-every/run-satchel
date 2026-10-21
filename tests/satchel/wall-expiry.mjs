// Deliberately outside push Verify: ct's literal sixty-minute acceptance proof.
// No test clock or application state is changed. Only mail delivery is faked by
// the ordinary public-door harness. Write receipts outside the product repo.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {setTimeout as wait} from 'node:timers/promises';
import {harness,open} from './harness.mjs';
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),'','Use a clean committed candidate');
const h=await harness(),startedAt=new Date().toISOString(),runId='satchel-wall-expiry-'+Date.now();
let receipt;
try{
 const m=await open(h,'Sixty-minute wall expiry','Synthetic client','Synthetic adverse');
 await h.json('/team',{email:'custodian@example.test',name:'Custodian',role:'lawyer'},h.owner);await h.json('/team/invite',{email:'custodian@example.test'},h.owner);const custodian=await h.login('custodian@example.test');
 const w=await h.json('/matters/'+m.id+'/wall',{custodianEmail:'custodian@example.test',members:[],reason:'synthetic-satchel-14',revision:null},h.owner);
 const r=await h.json('/ethical-walls/'+w.id+'/requests',{reason:'synthetic-satchel-15'},h.owner),before=Date.now();
 const approval=await h.json('/wall-requests/'+r.id+'/decide',{approve:true,note:'synthetic-satchel-16',minutes:60},custodian),expires=Date.parse(approval.expires_at);
 assert.ok(expires>=before+3600000&&expires<=Date.now()+3600000);
 await h.json('/matters/'+m.id,undefined,h.owner);await h.json('/backup',undefined,h.owner,403);
 await h.json('/wall-requests/'+r.id+'/decide',{approve:true,note:'Cannot renew',minutes:60},custodian,409);
 console.log(JSON.stringify({runId,head,startedAt,expiresAt:approval.expires_at,state:'awaiting real sixty-minute expiry'}));
 for(let minute=1;minute<=60;minute++){
  const until=minute===60?expires+1000:before+minute*60000;
  await wait(Math.max(0,until-Date.now()));
  if(minute<60){await h.json('/matters/'+m.id,undefined,h.owner);console.log(JSON.stringify({runId,minute,state:'grant still permits its person'}));}
 }
 await h.json('/matters/'+m.id,undefined,h.owner,404);
 const own=(await h.json('/ethical-walls',undefined,h.owner)).requests.find(q=>q.id===r.id);assert.equal(own.expires_at,approval.expires_at);assert.ok(Date.parse(own.expires_at)<Date.now());
 const audit=(await h.json('/audit?matterId='+m.id+'&limit=200',undefined,custodian)).records;
 assert.equal(audit.filter(a=>a.action==='wall.access_expired'&&a.objectId===r.id).length,1);
 receipt={runId,head,startedAt,completedAt:new Date().toISOString(),expiresAt:approval.expires_at,approvalMinutes:60,elapsedMs:Date.now()-before,conclusion:'success',assertions:['person access before expiry at every minute 1–59','renewal refused','whole-firm archive refused','person read refused after 60 minutes','recipient sees unchanged expiry','one attributed expiry audit action']};
 if(process.env.SATCHEL_EXPIRY_RECEIPT)await writeFile(process.env.SATCHEL_EXPIRY_RECEIPT,JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify(receipt));
}finally{await h.close();}
