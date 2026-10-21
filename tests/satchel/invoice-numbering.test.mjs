import test from 'node:test';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
import {scheme,draft,reviewed} from './invoice-numbering-fixture.mjs';
test('BILL-015 prospective numbering: exact approved issue, tax gate, batch rollback, collision refusal, import floor, replay, retained void number and full archive continuation',async()=>{
 const h=await harness();let target;try{
  const m=await open(h),base='/matters/'+m.id;
  const legacyMatter=await open(h,'Legacy insurer review','Harbor Insurance','Legacy opponent');
  await h.json('/ledes/timekeepers',{email:'owner@example.test',timekeeperId:'AB',name:'Barton, Avery',classification:'PT'},h.owner);
  await h.json('/matters/'+legacyMatter.id+'/ledes-guideline',{clientLedesId:'HARBOR',lawFirmId:'BARTON',requireTask:false,requireActivity:false,requireExpense:false,narrativeMin:0,bannedPhrases:[],maxRates:{},incrementMinutes:0,note:'Synthetic legacy insurer guideline'},h.owner);
  const legacy=await draft(h,legacyMatter,'Legacy reviewed insurer bill'),reserved=await draft(h,legacyMatter,'Legacy reserved draft');
  const legacyApproved=await h.json('/bills/'+legacy.id+'/approve',{revision:legacy.revision,reviewNote:'Reviewed before firm scheme cutover'},h.owner);
  const legacyFile=await(await h.request('/api/satchel/bills/'+legacy.id+'/ledes',undefined,h.owner)).text();
  const legacyCsv=await(await h.request('/api/satchel/bills/'+legacy.id+'/export',undefined,h.owner)).text();
  const legacyNumber=(await h.json('/matters/'+legacyMatter.id+'/billing',undefined,h.owner)).bills.find(b=>b.id===legacy.id).ledes.invoiceNumber;
  const reservedNumber=(await h.json('/matters/'+legacyMatter.id+'/billing',undefined,h.owner)).bills.find(b=>b.id===reserved.id).ledes.invoiceNumber;
  await h.json('/team',{email:'assistant@example.test',name:'Morgan Assistant',role:'assistant'},h.owner);await h.json('/team/invite',{email:'assistant@example.test'},h.owner);const assistant=await h.login('assistant@example.test');await h.json(base+'/access',{email:'assistant@example.test'},h.owner);
  await h.json('/invoice-numbering',scheme(),assistant,403);await h.json('/invoices/issue',{bills:[]},assistant,403);
  await h.json('/invoice-numbering/import',{source:'Vendor historical invoice export row 19',numbers:[{number:'OLD-00099',ordinal:99}]},h.owner);
  await h.json('/invoice-numbering',scheme(99),h.owner,422);
  const settings=await h.json('/invoice-numbering',scheme(),h.owner);assert.equal(settings.schemes.length,1);
  assert.equal(await(await h.request('/api/satchel/bills/'+legacy.id+'/ledes',undefined,h.owner)).text(),legacyFile);
  assert.equal(await(await h.request('/api/satchel/bills/'+legacy.id+'/export',undefined,h.owner)).text(),legacyCsv);
  const legacyRows=(await h.json('/matters/'+legacyMatter.id+'/billing',undefined,h.owner)).bills;
  assert.equal(legacyRows.find(b=>b.id===legacy.id).ledes.invoiceNumber,legacyNumber);assert.equal(legacyRows.find(b=>b.id===reserved.id).ledes.invoiceNumber,reservedNumber);
  const laterLedes=await draft(h,legacyMatter,'Later unnumbered LEDES draft');assert.equal(laterLedes.snapshot.ledes.invoiceNumber,null);assert.equal((await h.json('/matters/'+legacyMatter.id+'/billing',undefined,h.owner)).bills.find(b=>b.id===laterLedes.id).ledes,null);
  const first=await draft(h,m),second=await draft(h,m,'Draft returned for review');assert.equal(first.snapshot.numberingCutover,true);assert.equal(first.snapshot.invoiceNumber,undefined);
  assert.equal((await h.json('/invoice-numbering',undefined,h.owner)).counter.next_number,100);
  await h.json('/bills/'+first.id+'/approve',{revision:first.revision,reviewNote:'Unreviewed tax must refuse'},h.owner,422);
  await h.json('/invoices/issue',{bills:[{id:first.id,revision:first.revision}]},h.owner,409);
  const approved=await reviewed(h,m,first);
  const payload={bills:[{id:approved.id,revision:approved.revision}]};
  await h.json('/invoices/issue',{bills:[...payload.bills,{id:second.id,revision:second.revision}]},h.owner,409);
  assert.equal((await h.request('/api/satchel/bills/'+first.id+'/invoice.pdf',undefined,h.owner)).status,404);assert.equal((await h.json('/invoice-numbering',undefined,h.owner)).counter.next_number,100);
  await h.json('/invoices/issue',{bills:[{id:first.id,revision:'stale'}]},h.owner,409);
  const issued=await h.json('/invoices/issue',payload,h.owner),one=issued.issues[0];assert.match(one.number,/^BL-\d{4}-00100$/);assert.equal(one.approved_digest,approved.artifactDigest);assert.equal(one.snapshot_digest,hash(JSON.stringify(approved.snapshot)));
  const audit=await h.json('/audit?matterId='+m.id+'&action=invoice.issued',undefined,h.owner);assert.equal(audit.records.length,1);assert.equal(audit.records[0].revision,approved.revision);assert.equal(audit.records[0].evidence.record.pdf_digest,one.pdf_digest);
  assert.deepEqual(await h.json('/invoices/issue',payload,h.owner),issued);assert.equal((await h.json('/invoice-numbering',undefined,h.owner)).counter.next_number,101);
  const pdf=Buffer.from(await(await h.request('/api/satchel/bills/'+first.id+'/invoice.pdf',undefined,h.owner)).arrayBuffer());assert.match(pdf.toString('ascii',0,8),/^%PDF-/);assert.equal(hash(pdf),one.pdf_digest);
  const parsed=getDocument({data:Uint8Array.from(pdf),useSystemFonts:false});try{const document=await parsed.promise,text=[];for(let n=1;n<=document.numPages;n++)text.push((await(await document.getPage(n)).getTextContent()).items.map(i=>i.str).join(' '));const rendered=text.join(' ');assert.ok(rendered.includes('Invoice '+one.number));assert.ok(rendered.includes('Total USD 375.00'));assert.ok(rendered.includes(approved.artifactDigest));}finally{await parsed.destroy();}
  assert.equal((await h.request('/api/satchel/bills/'+first.id+'/invoice.pdf',undefined,assistant)).status,403);assert.equal((await h.request('/api/satchel/bills/'+first.id+'/invoice.pdf')).status,401);
  assert.equal(await(await h.request('/api/satchel/bills/'+first.id+'/export',undefined,h.owner)).text(),approved.artifact);
  const latest=(await h.json(base+'/billing',undefined,h.owner)).bills.find(b=>b.id===first.id);await h.json('/bills/'+first.id+'/void',{revision:latest.revision,reason:'Issued numbers must remain reserved'},h.owner,409);
  const current=await h.json('/invoice-numbering',undefined,h.owner);await h.json('/invoice-numbering',scheme(100,{revision:current.counter.revision}),h.owner,409);
  // An imported exact candidate collision is refused instead of being skipped.
  const collision=one.number.replace(/00100$/,'00101');await h.json('/invoice-numbering/import',{source:'External source numbering collision fixture',numbers:[{number:collision,ordinal:1}]},h.owner);
  const next=await reviewed(h,m,second);await h.json('/invoices/issue',{bills:[{id:next.id,revision:next.revision}]},h.owner,409);assert.equal((await h.json('/invoice-numbering',undefined,h.owner)).counter.next_number,101);
  const state=await h.json('/invoice-numbering',undefined,h.owner);await h.json('/invoice-numbering',scheme(102,{prefix:'NEW',year:false,separator:'.',revision:state.counter.revision}),h.owner);
  const after=await h.json('/invoices/issue',{bills:[{id:next.id,revision:next.revision}]},h.owner);assert.equal(after.issues[0].number,'NEW.00102');
  const pair=[];for(const title of ['Batch matter review','Batch title review'])pair.push(await reviewed(h,m,await draft(h,m,title)));
  const batch=await h.json('/invoices/issue',{bills:pair.map(b=>({id:b.id,revision:b.revision}))},h.owner);assert.deepEqual(batch.issues.map(i=>i.number),['NEW.00103','NEW.00104']);assert.deepEqual(Buffer.from(await(await h.request('/api/satchel/bills/'+first.id+'/invoice.pdf',undefined,h.owner)).arrayBuffer()),pdf);
  target=await harness();await target.json('/restore',{archive:await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),confirm:'RESTORE'},target.owner);
  assert.deepEqual(await target.json('/invoice-numbering',undefined,target.owner),await h.json('/invoice-numbering',undefined,h.owner));assert.deepEqual(Buffer.from(await(await target.request('/api/satchel/bills/'+first.id+'/invoice.pdf',undefined,target.owner)).arrayBuffer()),pdf);
  const third=await reviewed(target,m,await draft(target,m,'Recovered continuation'));const continuation=await target.json('/invoices/issue',{bills:[{id:third.id,revision:third.revision}]},target.owner);assert.equal(continuation.issues[0].number,'NEW.00105');
 }finally{await target?.close();await h.close();}
});
