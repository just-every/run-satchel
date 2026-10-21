import {exemptTaxReview} from './tax-fixture.mjs';
import test from 'node:test';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import assert from 'node:assert/strict';
import {harness,open} from './harness.mjs';
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
import {scheme,draft,reviewed,insurer} from './invoice-numbering-fixture.mjs';
test('BILL-015 BILL-016 prospective numbering and append-only native void/rebill: exact approved issue, tax gate, batch rollback, collision refusal, import floor, replay, retained void number and full archive continuation',async()=>{
 const h=await harness();let target;try{
  const m=await open(h),base='/matters/'+m.id;
  const legacyMatter=await open(h,'Legacy insurer review','Harbor Insurance','Legacy opponent');
  await h.json('/ledes/timekeepers',{email:'owner@example.test',timekeeperId:'AB',name:'Barton, Avery',classification:'PT'},h.owner);
  await h.json('/matters/'+legacyMatter.id+'/ledes-guideline',{clientLedesId:'HARBOR',lawFirmId:'BARTON',requireTask:false,requireActivity:false,requireExpense:false,narrativeMin:0,bannedPhrases:[],maxRates:{},incrementMinutes:0,note:'Synthetic legacy insurer guideline'},h.owner);
  const legacy=await draft(h,legacyMatter,'Legacy reviewed insurer bill'),reserved=await draft(h,legacyMatter,'Legacy reserved draft');
  const legacyApproved=await h.json('/bills/'+legacy.id+'/approve',{...({revision:legacy.revision,reviewNote:'Reviewed before firm scheme cutover'}),taxReviewId:await exemptTaxReview(h,'/bills/'+legacy.id+'/approve')},h.owner);
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
  // BILL-015: a legacy reservation approved after cutover must issue before any
  // export can turn it into an exported bill, preserving its one reserved number.
  const reservedApproved=await h.json('/bills/'+reserved.id+'/approve',{revision:reserved.revision,reviewNote:'Review legacy reservation after cutover',taxReviewId:await exemptTaxReview(h,'/bills/'+reserved.id+'/approve')},h.owner);
  assert.equal((await h.request('/api/satchel/bills/'+reserved.id+'/export',undefined,h.owner)).status,409);
  await h.json('/bills/'+reserved.id+'/ledes',undefined,h.owner,409);
  const reservedPayload={bills:[{id:reserved.id,revision:reservedApproved.revision}]};
  const reservedIssue=await h.json('/invoices/issue',reservedPayload,h.owner);
  assert.equal(reservedIssue.issues[0].number,reservedNumber);
  assert.equal((await h.json('/invoice-numbering',undefined,h.owner)).counter.next_number,100);
  const reservedFile=await(await h.request('/api/satchel/bills/'+reserved.id+'/ledes',undefined,h.owner)).text();
  assert.ok(reservedFile.includes('|'+reservedNumber+'|'));
  assert.deepEqual(await h.json('/invoices/issue',reservedPayload,h.owner),reservedIssue);
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
  // BILL-016: void a real two-entry invoice, retain its files and rebill once.
  const work=await h.json(base+'/entries',{kind:'time',date:'2026-10-03',description:'Reviewed closing advice',minutes:60,rateCents:25000},h.owner);
  const cost=await h.json(base+'/entries',{kind:'disbursement',date:'2026-10-03',description:'Courier advanced cost',amountCents:2500},h.owner);
  let native=await h.json(base+'/bills',{title:'Native invoice to void',date:'2026-10-03',entryIds:[work.id,cost.id]},h.owner);native=await reviewed(h,m,native);
  const nativeRequest={bills:[{id:native.id,revision:native.revision}]},nativeIssue=(await h.json('/invoices/issue',nativeRequest,h.owner)).issues[0];
  const nativePdf=Buffer.from(await(await h.request('/api/satchel/bills/'+native.id+'/invoice.pdf',undefined,h.owner)).arrayBuffer()),nativeCsv=await(await h.request('/api/satchel/bills/'+native.id+'/export',undefined,h.owner)).text();
  native=(await h.json(base+'/billing',undefined,h.owner)).bills.find(b=>b.id===native.id);
  const voidPayload={revision:native.revision,reason:'Counsel voids the reviewed invoice so the work can be rebilled once'};
  await h.json('/invoices/'+native.id+'/void',voidPayload,assistant,403);
  const key=await h.json('/keys',{label:'No invoice void authority'},h.owner);
  await h.json('/invoices/'+native.id+'/void',voidPayload,'',401,{authorization:'Bearer '+key.key});
  await h.json('/invoices/'+native.id+'/void',{...voidPayload,revision:'stale'},h.owner,409);
  await h.json('/invoices/'+native.id+'/void',{...voidPayload,reason:'   '},h.owner,400);
  const countBeforeVoid=(await h.json('/invoice-numbering',undefined,h.owner)).counter.next_number;
  const voids=await Promise.all([h.json('/invoices/'+native.id+'/void',voidPayload,h.owner),h.json('/invoices/'+native.id+'/void',voidPayload,h.owner)]);assert.deepEqual(voids[0],voids[1]);
  assert.deepEqual(await h.json('/invoices/'+native.id+'/void',voidPayload,h.owner),voids[0]);
  await h.json('/invoices/'+native.id+'/void',{...voidPayload,reason:'Different request'},h.owner,409);
  let nativeState=await h.json(base+'/billing',undefined,h.owner),voided=nativeState.bills.find(b=>b.id===native.id);
  assert.equal(voided.status,'void');assert.deepEqual(voided.invoiceVoid,voids[0]);assert.deepEqual(voided.snapshot,native.snapshot);assert.equal(voided.artifact,native.artifact);assert.equal(voided.approvedBy,native.approvedBy);assert.equal(voided.approvedAt,native.approvedAt);assert.deepEqual(voided.issue,nativeIssue);
  assert.equal(voided.trustPayment.status,'void');assert.equal(voided.trustPayment.due_cents,0);
  assert.ok(nativeState.entries.filter(e=>[work.id,cost.id].includes(e.id)).every(e=>e.reservedBy===null));
  assert.equal((await h.json('/invoice-numbering',undefined,h.owner)).counter.next_number,countBeforeVoid);
  assert.deepEqual((await h.json('/invoices/issue',nativeRequest,h.owner)).issues[0],nativeIssue,'Replaying the historical issue cannot restore a void');
  assert.equal((await h.json(base+'/billing',undefined,h.owner)).bills.find(b=>b.id===native.id).status,'void');
  const billAgain={title:'Replacement for native void',date:'2026-10-03',entryIds:[work.id,cost.id]};
  let replacement=await h.json(base+'/bills',billAgain,h.owner);await h.json(base+'/bills',billAgain,h.owner,409);
  replacement=await reviewed(h,m,replacement);const replacementIssue=(await h.json('/invoices/issue',{bills:[{id:replacement.id,revision:replacement.revision}]},h.owner)).issues[0];
  assert.notEqual(replacementIssue.number,nativeIssue.number);assert.equal((await h.json('/invoice-numbering',undefined,h.owner)).counter.next_number,countBeforeVoid+1);
  nativeState=await h.json(base+'/billing',undefined,h.owner);assert.ok(nativeState.entries.filter(e=>[work.id,cost.id].includes(e.id)).every(e=>e.reservedBy===replacement.id));
  assert.equal(nativeState.bills.filter(b=>b.status!=='void'&&b.snapshot.lines.some(l=>l.sourceId===work.id)).length,1);assert.equal(nativeState.bills.filter(b=>b.status!=='void'&&b.snapshot.lines.some(l=>l.sourceId===cost.id)).length,1);
  const voidAudit=await h.json('/audit?action=invoice.voided&matterId='+m.id,undefined,h.owner);assert.equal(voidAudit.records.length,1);assert.equal(voidAudit.records[0].evidence.record.recordType,'s_invoice_voids');assert.equal(voidAudit.records[0].evidence.record.reviewed_revision,native.revision);
  const unissued=await reviewed(h,m,await draft(h,m,'Approved but not issued void'));
  await h.json('/team',{email:'lawyer@example.test',name:'Responsible counsel',role:'lawyer'},h.owner);await h.json('/team/invite',{email:'lawyer@example.test'},h.owner);const lawyer=await h.login('lawyer@example.test');
  await h.json('/invoices/'+unissued.id+'/void',{revision:unissued.revision,reason:'Counsel withdraws approval before issue'},lawyer,404);await h.json(base+'/access',{email:'lawyer@example.test'},h.owner);
  await h.json('/invoices/'+unissued.id+'/void',{revision:unissued.revision,reason:'Counsel withdraws approval before issue'},lawyer);
  assert.equal(await(await h.request('/api/satchel/bills/'+unissued.id+'/export',undefined,lawyer)).text(),unissued.artifact);
  await h.json('/invoices/issue',{bills:[{id:unissued.id,revision:unissued.revision}]},h.owner,409);
  assert.equal((await h.json('/invoice-numbering',undefined,h.owner)).counter.next_number,countBeforeVoid+1,'Unissued void consumes no number');
  await target.close();target=await harness();await target.json('/restore',{archive:await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),confirm:'RESTORE'},target.owner);await target.restart();
  for(const source of [h,target]){assert.deepEqual((await source.json(base+'/billing',undefined,source.owner)).bills.find(b=>b.id===native.id).invoiceVoid,voids[0]);assert.deepEqual(Buffer.from(await(await source.request('/api/satchel/bills/'+native.id+'/invoice.pdf',undefined,source.owner)).arrayBuffer()),nativePdf);assert.equal(await(await source.request('/api/satchel/bills/'+native.id+'/export',undefined,source.owner)).text(),nativeCsv);assert.deepEqual(await source.json('/invoices/'+native.id+'/void',voidPayload,source.owner),voids[0]);}

 }finally{await target?.close();await h.close();}
});


test('BILL-015 and TIME-007 issue legacy and prospective LEDES/XML, retain correction identities and reconcile concurrent issues without consuming replay numbers',async()=>{
 const {readXml}=await import('./ledes-xml-reader.mjs');
 const h=await harness();let restored;
 try{
  const m=await insurer(h),base='/matters/'+m.id;
  const legacy=await draft(h,m,'Reserved insurer prebill');
  const legacyNumber=legacy.snapshot.ledes.invoiceNumber;
  await h.json('/invoice-numbering',scheme(),h.owner);
  const approve=async b=>h.json('/bills/'+b.id+'/approve',{revision:b.revision,reviewNote:'Exact client tax mapping and insurer narrative reviewed',taxReviewId:await exemptTaxReview(h,'/bills/'+b.id+'/approve')},h.owner);
  const issued=[];
  for(const b of [legacy,await draft(h,m,'Prospective insurer invoice')]){
   const approved=await approve(b),payload={bills:[{id:b.id,revision:approved.revision}]};
   assert.equal((await h.request('/api/satchel/bills/'+b.id+'/export',undefined,h.owner)).status,409);
   const result=await h.json('/invoices/issue',payload,h.owner),number=result.issues[0].number;
   if(b.id===legacy.id)assert.equal(number,legacyNumber);else assert.match(number,/^BL-\d{4}-00100$/);
   const files={};
   for(const format of ['export','ledes','ledes-xml','invoice.pdf']){
    const response=await h.request('/api/satchel/bills/'+b.id+'/'+format,undefined,h.owner);assert.equal(response.status,200);files[format]=Buffer.from(await response.arrayBuffer());
   }
   assert.equal(readXml(files['ledes-xml'].toString()).invoice.inv_id,number);
   assert.ok(files.ledes.toString().trim().split('\r\n').slice(2).every(row=>row.split('|')[1]===number));
   assert.equal(hash(files['invoice.pdf']),result.issues[0].pdf_digest);
   assert.equal(hash(files.export),approved.artifactDigest);
   assert.deepEqual(await h.json('/invoices/issue',payload,h.owner),result);
   issued.push({id:b.id,number,files});
  }
  let parent=(await h.json(base+'/billing',undefined,h.owner)).bills.find(b=>b.id===issued[1].id);
  const counter=(await h.json('/invoice-numbering',undefined,h.owner)).counter.next_number;
  for(const [index,correctedAmountCents] of [35000,37500].entries()){
   const b=await h.json('/bills/'+parent.id+'/correct',{revision:parent.revision,sourceId:parent.snapshot.lines[0].sourceId,correctedAmountCents,reason:index?'Restore original reviewed amount':'Reviewed courtesy reduction',date:'2026-10-02'},h.owner),approved=await approve(b),payload={bills:[{id:b.id,revision:approved.revision}]};
   const result=await h.json('/invoices/issue',payload,h.owner),number=issued[1].number+'-R'+(index+1);assert.equal(result.issues[0].number,number);
   const files={};for(const format of ['export','ledes','ledes-xml','invoice.pdf']){const r=await h.request('/api/satchel/bills/'+b.id+'/'+format,undefined,h.owner);assert.equal(r.status,200);files[format]=Buffer.from(await r.arrayBuffer());}
   const xml=readXml(files['ledes-xml'].toString());assert.equal(xml.invoice.inv_id,number);assert.equal(xml.invoice.inv_total_net_due,(correctedAmountCents/100).toFixed(2));assert.equal(xml.extensions.find(x=>x.ext_name==='replaces_invoice').ext_value,issued.at(-1).number);
   assert.deepEqual(await h.json('/invoices/issue',payload,h.owner),result);assert.equal((await h.json('/invoice-numbering',undefined,h.owner)).counter.next_number,counter);
   issued.push({id:b.id,number,files});parent=(await h.json(base+'/billing',undefined,h.owner)).bills.find(x=>x.id===b.id);
  }
  const pair=[];for(const title of ['Independent coverage review','Independent deposition review'])pair.push(await approve(await draft(h,m,title)));
  const payloads=pair.map(b=>({bills:[{id:b.id,revision:b.revision}]}));
  const responses=await Promise.all(payloads.map(p=>h.request('/api/satchel/invoices/issue',p,h.owner)));
  assert.ok(responses.every(r=>[200,409].includes(r.status)));assert.ok(responses.some(r=>r.status===200));
  const reconciled=[];for(const p of payloads)reconciled.push((await h.json('/invoices/issue',p,h.owner)).issues[0]);
  assert.deepEqual(reconciled.map(i=>i.number).sort(),[101,102].map(n=>'BL-'+new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric'}).format(new Date())+'-'+String(n).padStart(5,'0')));
  assert.equal((await h.json('/invoice-numbering',undefined,h.owner)).counter.next_number,103);
  const duplicate=await Promise.all([h.json('/invoices/issue',payloads[0],h.owner),h.json('/invoices/issue',payloads[0],h.owner)]);assert.deepEqual(duplicate[0],duplicate[1]);assert.equal((await h.json('/invoice-numbering',undefined,h.owner)).counter.next_number,103);
  assert.equal((await h.json('/audit?action=invoice.issued',undefined,h.owner)).records.length,6);
  const raced=await approve(await draft(h,m,'Issue versus draft discard'));
  const race=await Promise.all([h.request('/api/satchel/invoices/issue',{bills:[{id:raced.id,revision:raced.revision}]},h.owner),h.request('/api/satchel/bills/'+raced.id+'/void',{revision:raced.revision,reason:'Discard only if still unissued'},h.owner)]);
  assert.ok(race.every(r=>[200,409].includes(r.status)));assert.equal(race.filter(r=>r.status===200).length,1);
  const final=(await h.json(base+'/billing',undefined,h.owner)).bills.find(b=>b.id===raced.id);assert.ok(final.issue?final.status==='approved':final.status==='void');
  // A void keeps every issued insurer format downloadable without a new number.
  const original=(await h.json(base+'/billing',undefined,h.owner)).bills.find(b=>b.id===issued[0].id);
  await h.json('/invoices/'+original.id+'/void',{revision:original.revision,reason:'Counsel reviewed insurer invoice void without deleting any files'},h.owner);
  await h.restart();restored=await harness();await restored.json('/restore',{archive:await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),confirm:'RESTORE'},restored.owner);
  for(const target of [h,restored])for(const original of issued)for(const [format,bytes] of Object.entries(original.files))assert.deepEqual(Buffer.from(await(await target.request('/api/satchel/bills/'+original.id+'/'+format,undefined,target.owner)).arrayBuffer()),bytes);
  assert.deepEqual(await restored.json('/invoice-numbering',undefined,restored.owner),await h.json('/invoice-numbering',undefined,h.owner));
 }finally{await restored?.close();await h.close();}
});
