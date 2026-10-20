import test from 'node:test';
import assert from 'node:assert/strict';
import {readXml,xmlProfile} from './ledes-xml-reader.mjs';
import {harness,open} from './harness.mjs';

// An independent LEDES 1998B reading: header, 24 pipe fields, [] terminators, YYYYMMDD dates,
// line totals = units × unit cost (half-up to cents) + adjustment, and an exact invoice total.
function readLedes(file){
 assert.ok(file.endsWith('[]\r\n'));const rows=file.trimEnd().split('\r\n');
 assert.equal(rows[0],'LEDES1998B[]');assert.ok(rows.every(r=>r.endsWith('[]')));
 const names=rows[1].slice(0,-2).split('|');assert.equal(names.length,24);
 const lines=rows.slice(2).map(r=>{const v=r.slice(0,-2).split('|');assert.equal(v.length,24);return Object.fromEntries(names.map((n,i)=>[n,v[i]]));});
 const cents=v=>{assert.match(v,/^-?\d+\.\d{2}$/);return Math.round(Number(v)*100);};
 for(const l of lines){
  for(const k of ['INVOICE_DATE','BILLING_START_DATE','BILLING_END_DATE','LINE_ITEM_DATE'])assert.match(l[k],/^20\d{6}$/);
  for(const k of ['INVOICE_NUMBER','CLIENT_ID','LAW_FIRM_MATTER_ID','LAW_FIRM_ID','LINE_ITEM_NUMBER','LINE_ITEM_DESCRIPTION'])assert.ok(l[k],k);
  assert.equal(Math.round(Number(l.LINE_ITEM_NUMBER_OF_UNITS)*cents(l.LINE_ITEM_UNIT_COST))+cents(l.LINE_ITEM_ADJUSTMENT_AMOUNT),cents(l.LINE_ITEM_TOTAL));
  if(l['EXP/FEE/INV_ADJ_TYPE']==='F'){assert.match(l.LINE_ITEM_TASK_CODE,/^[A-Z]\d{3}$/);assert.match(l.LINE_ITEM_ACTIVITY_CODE,/^A\d{3}$/);assert.ok(l.TIMEKEEPER_ID&&l.TIMEKEEPER_NAME&&l.TIMEKEEPER_CLASSIFICATION);}
  else{assert.equal(l['EXP/FEE/INV_ADJ_TYPE'],'E');assert.match(l.LINE_ITEM_EXPENSE_CODE,/^E\d{3}$/);}
 }
 assert.equal(new Set(lines.map(l=>l.INVOICE_TOTAL)).size,1);
 assert.equal(cents(lines[0].INVOICE_TOTAL),lines.reduce((n,l)=>n+cents(l.LINE_ITEM_TOTAL),0));
 return lines;
}

test('TIME-007 firm UTBMS code sets and a client guideline code an insurer bill, refuse a missing activity code, export valid LEDES 1998B and official-XSD-valid XML 2.1.3 and correct an imported rejection through a reviewed revision without duplicate charges',async()=>{
 const h=await harness();
 try{
  const address={line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'};
  await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@example.test',phone:'212-555-0100',address,timezone:'America/New_York',billing:{defaultRateCents:30000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main',phone:'212-555-0100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'}]}},h.owner);
  const m=await open(h,'Harper v. Reed','Harbor Mutual Insurance','Reed Logistics'),plain=await open(h,'Pine estate','Pine family','Elm Trustee');
  for(const [email,role] of [['lawyer@example.test','lawyer'],['assistant@example.test','assistant']]){await h.json('/team',{email,name:email,role},h.owner);await h.json('/team/invite',{email},h.owner);await h.json('/matters/'+m.id+'/access',{email},h.owner);}
  const lawyer=await h.login('lawyer@example.test'),assistant=await h.login('assistant@example.test');

  // The principal configures firm code sets and timekeeper IDs; a lawyer cannot.
  await h.json('/ledes/codes',{kind:'activity',code:'A101',label:'Plan and prepare for'},lawyer,403);
  for(const [kind,code,label] of [['task','L110','Fact investigation/development'],['task','L120','Analysis/strategy'],['activity','A101','Plan and prepare for'],['activity','A103','Draft/revise'],['activity','A104','Review/analyze'],['expense','E112','Court fees']])await h.json('/ledes/codes',{kind,code,label},h.owner);
  await h.json('/ledes/codes',{kind:'expense',code:'X12',label:'Bad'},h.owner,400);
  await h.json('/ledes/timekeepers',{email:'owner@example.test',timekeeperId:'BL-001',name:'Principal, Pat',classification:'XX'},h.owner,400);
  let settings=await h.json('/ledes/timekeepers',{email:'owner@example.test',timekeeperId:'BL-001',name:'Principal, Pat',classification:'PT'},h.owner);
  assert.deepEqual(settings.timekeepers,[{email:'owner@example.test',timekeeperId:'BL-001',name:'Principal, Pat',classification:'PT'}]);
  // Once a kind has codes, every recording door uses the firm's active set.
  await h.json('/matters/'+m.id+'/entries',{kind:'time',date:'2026-10-14',description:'Coverage call with adjuster',minutes:12,utbmsTask:'L110',utbmsActivity:'A999'},h.owner,400);
  await h.json('/time/drafts',{matterId:m.id,date:'2026-10-14',minutes:12,billable:true,description:'Coverage call',utbmsTask:'L999'},h.owner,400);

  // The client's guideline is an append-only version; only the principal records it.
  const guideline={clientLedesId:'HARBOR01',lawFirmId:'13-1234567',requireTask:true,requireActivity:true,requireExpense:true,narrativeMin:15,bannedPhrases:['Review file'],maxRates:{PT:40000,AS:30000},incrementMinutes:6,note:'Harbor Mutual outside counsel guidelines 2026',xmlProfile};
  await h.json('/matters/'+m.id+'/ledes-guideline',guideline,lawyer,403);
  await h.json('/matters/'+m.id+'/ledes-guideline',{...guideline,xmlProfile:{...xmlProfile,clientAddress:{}}},h.owner,400);
  let ledes=await h.json('/matters/'+m.id+'/ledes-guideline',guideline,h.owner);
  assert.deepEqual([ledes.client,ledes.guideline.version,ledes.guideline.bannedPhrases,ledes.guideline.maxRates],['Harbor Mutual Insurance',1,['review file'],{PT:40000,AS:30000}]);
  await h.json('/matters/'+m.id+'/rates',{scope:'matter',effectiveFrom:'2026-01-01',rateCents:30000,incrementMinutes:6,discountBps:1000,billable:true,utbmsTask:'L120',note:'Harbor panel discount on analysis'},h.owner);

  const entry=(body,who=h.owner)=>h.json('/matters/'+m.id+'/entries',{kind:'time',date:'2026-10-15',...body},who);
  const discovery=await entry({description:'Draft discovery requests to Reed',minutes:50,utbmsTask:'L110',utbmsActivity:'A101'});
  const analysis=await entry({description:'Analyze coverage position letter',minutes:30,utbmsTask:'L120'});
  const vague=await entry({description:'Review file',minutes:30,utbmsTask:'L110',utbmsActivity:'A104'},lawyer);
  const premium=await entry({description:'Prepare for deposition of Reed',minutes:50,rateCents:45000,utbmsTask:'L110',utbmsActivity:'A101'});
  const fee=await h.json('/matters/'+m.id+'/entries',{kind:'disbursement',date:'2026-10-16',description:'Court filing fee for complaint',amountCents:40500,utbmsExpense:'E112'},h.owner);
  assert.deepEqual([discovery.amountCents,analysis.amountCents,analysis.discountBps,fee.utbmsExpense],[27000,13500,1000,'E112']);

  // Preparation refuses every line that breaks the guideline, naming each reason.
  const refused=await h.json('/matters/'+m.id+'/bills',{title:'October services',date:'2026-10-31',entryIds:[discovery.id,analysis.id,vague.id,premium.id,fee.id]},h.owner,422);
  assert.match(refused.error,/Line 2 \(Analyze coverage position letter\): UTBMS activity code is required by the Harbor Mutual Insurance guideline/);
  assert.match(refused.error,/Line 3 \(Review file\): timekeeper lawyer@example\.test has no LEDES timekeeper ID/);
  assert.match(refused.error,/Line 3 \(Review file\): narrative is shorter than the guideline's 15 characters/);
  assert.match(refused.error,/Line 3 \(Review file\): narrative uses "review file"/);
  assert.match(refused.error,/Line 4 \(Prepare for deposition of Reed\): rate \$450\.00\/h exceeds the guideline's \$400\.00\/h for PT/);
  assert.match(refused.error,/Line 4 \(Prepare for deposition of Reed\): 50 billed minutes is not a multiple of the guideline's 6-minute increment/);
  assert.doesNotMatch(refused.error,/Line 1|Line 5/);
  // A missing activity code is still refused when the bill tries to leave it blank or use a retired code.
  await h.json('/ledes/codes',{kind:'activity',code:'A104',label:'Review/analyze',active:false},h.owner);
  assert.match((await h.json('/matters/'+m.id+'/bills',{title:'October services',date:'2026-10-31',entryIds:[analysis.id],coding:{[analysis.id]:{utbmsActivity:'A104'}}},h.owner,422)).error,/UTBMS activity code A104 is not in the firm's active code set/);
  assert.equal((await h.json('/matters/'+m.id+'/billing',undefined,h.owner)).bills.length,0);

  // Code the analysis line at preparation; the entry itself stays as recorded.
  let bill=await h.json('/matters/'+m.id+'/bills',{title:'October services',date:'2026-10-31',entryIds:[discovery.id,analysis.id,fee.id],coding:{[analysis.id]:{utbmsActivity:'A103'}}},h.owner);
  const invoice=bill.snapshot.ledes.invoiceNumber;
  assert.equal(invoice,bill.snapshot.matterNumber+'-1');assert.equal(bill.snapshot.totalCents,81000);
  assert.deepEqual(bill.snapshot.ledes.lines.map(l=>[l.lineNumber,l.type,l.task,l.activity,l.expense,l.timekeeperId,l.units4,l.unitCostCents,l.adjustmentCents,l.totalCents]),[[1,'F','L110','A101',null,'BL-001',9000,30000,0,27000],[2,'F','L120','A103',null,'BL-001',5000,30000,-1500,13500],[3,'E',null,null,'E112',null,10000,40500,0,40500]]);
  await h.json('/bills/'+bill.id+'/ledes-outcomes',{fileName:'early.txt',content:`${invoice}||REJECTED|Too early`},h.owner,409);
  await h.json('/bills/'+bill.id+'/ledes',undefined,h.owner,409);
  await h.json('/bills/'+bill.id+'/ledes-xml',undefined,h.owner,409);
  bill=await h.json('/bills/'+bill.id+'/approve',{revision:bill.revision,reviewNote:'Coded per Harbor guideline'},h.owner);
  await h.json('/bills/'+bill.id+'/ledes',undefined,assistant,403);
  await h.json('/bills/'+bill.id+'/ledes-xml',undefined,assistant,403);

  const exported=await h.request('/api/satchel/bills/'+bill.id+'/ledes',undefined,h.owner);assert.equal(exported.status,200);
  const file=await exported.text(),lines=readLedes(file);
  const xmlResponse=await h.request('/api/satchel/bills/'+bill.id+'/ledes-xml',undefined,lawyer);
  assert.equal(xmlResponse.status,200);assert.match(xmlResponse.headers.get('content-type'),/application\/xml/);
  assert.equal(xmlResponse.headers.get('content-disposition'),`attachment; filename="${invoice}.ledes.xml"`);
  const xmlFile=await xmlResponse.text(),xml=readXml(xmlFile);
  assert.deepEqual([xml.firm.lf_name,xml.firm.lf_vendor_id,xml.client.cl_id,xml.client.cl_lf_id,xml.matter.cl_matter_id,xml.matter.lf_matter_id],['Barton & Lee LLP','BL-HARBOR','HARBOR01','HARBOR-ACCT','HM-2026-142',m.matter_number]);
  assert.deepEqual([xml.invoice.inv_id,xml.invoice.inv_date,xml.invoice.inv_start_date,xml.invoice.inv_end_date,xml.invoice.inv_total_net_due,xml.matter.matter_total_due],[invoice,'2026-10-31','2026-10-15','2026-10-16','810.00','810.00']);
  assert.deepEqual(xml.fees.map(l=>[l.file_item_nbr,l.tk_id,l.tk_level,l.task_code,l.task_activity,l.units,l.rate,l.base_amount,l.item_disc_cred_amount,l.total_amount]),[['1','BL-001','PARTNR','L110','A101','0.90','300.00','270.0000','0.0000','270.00'],['2','BL-001','PARTNR','L120','A103','0.50','300.00','150.0000','-15.0000','135.00']]);
  assert.deepEqual(xml.expenses.map(l=>[l.file_item_nbr,l.expense_code,l.units,l.rate,l.total_amount]),[['3','E112','1.00','405.00','405.00']]);
  assert.deepEqual(xml.timekeepers.map(t=>[t.tk_id,t.tk_lname,t.tk_fname,t.tk_level]),[['BL-001','Principal','Pat','PARTNR']]);
  assert.ok(xmlFile.includes('Barton &amp; Lee LLP'));
  // Changing guidelines and timekeeper details cannot change approval-frozen bytes.
  await h.json('/matters/'+m.id+'/ledes-guideline',{...guideline,xmlProfile:{...xmlProfile,clientAddress:{...xmlProfile.clientAddress,line1:'200 Insurance Plaza'}}},h.owner);
  await h.json('/ledes/timekeepers',{email:'owner@example.test',timekeeperId:'BL-001',name:'Principal, Patricia',classification:'PT'},h.owner);
  assert.equal(await(await h.request('/api/satchel/bills/'+bill.id+'/ledes-xml',undefined,h.owner)).text(),xmlFile);

  assert.deepEqual(lines.map(l=>[l.INVOICE_NUMBER,l.CLIENT_ID,l.LAW_FIRM_ID,l.INVOICE_TOTAL,l.LINE_ITEM_NUMBER_OF_UNITS,l.LINE_ITEM_UNIT_COST,l.LINE_ITEM_ADJUSTMENT_AMOUNT,l.LINE_ITEM_TOTAL,l.LINE_ITEM_ACTIVITY_CODE,l.LINE_ITEM_EXPENSE_CODE,l.TIMEKEEPER_CLASSIFICATION]),[
   [invoice,'HARBOR01','13-1234567','810.00','0.9','300.00','0.00','270.00','A101','','PT'],
   [invoice,'HARBOR01','13-1234567','810.00','0.5','300.00','-15.00','135.00','A103','','PT'],
   [invoice,'HARBOR01','13-1234567','810.00','1','405.00','0.00','405.00','','E112','']]);
  assert.deepEqual([lines[0].INVOICE_DATE,lines[0].BILLING_START_DATE,lines[0].BILLING_END_DATE],['20261031','20261015','20261016']);
  let billing=await h.json('/matters/'+m.id+'/billing',undefined,h.owner);
  bill=billing.bills.find(b=>b.id===bill.id);assert.deepEqual([bill.status,bill.ledes.status,billing.entries.find(e=>e.id===analysis.id).utbmsActivity],['exported','not reported',null]);

  // Import the insurer's rejection; the file must be for this invoice, and a replay records nothing.
  await h.json('/bills/'+bill.id+'/ledes-outcomes',{fileName:'harbor.txt',content:`OTHER-1|2|REJECTED|Wrong`},h.owner,400);
  await h.json('/bills/'+bill.id+'/ledes-outcomes',{fileName:'harbor.txt',content:`${invoice}|2|REJECTED|`},h.owner,400);
  await h.json('/bills/'+bill.id+'/ledes-outcomes',{fileName:'harbor.txt',content:`${invoice}|9|REJECTED|No such line`},h.owner,400);
  const rejection=`INVOICE_NUMBER|LINE_ITEM_NUMBER|STATUS|REASON[]\r\n${invoice}|2|REJECTED|A103 not allowed on L120 analysis; use A104[]\r\n`;
  let outcome=await h.json('/bills/'+bill.id+'/ledes-outcomes',{fileName:'harbor-rejections.txt',content:rejection},lawyer);
  assert.deepEqual([outcome.status,outcome.rejections],['rejected',[{lineNumber:2,reason:'A103 not allowed on L120 analysis; use A104'}]]);
  outcome=await h.json('/bills/'+bill.id+'/ledes-outcomes',{fileName:'harbor-rejections.txt',content:rejection},h.owner);assert.equal(outcome.outcomes.length,1);

  // Correct the rejected line through a reviewed revision: codes are rechecked against the firm set,
  // the replacement invoice carries every line once, and no entry is charged twice.
  const correct=(body,expected)=>h.json('/bills/'+bill.id+'/correct',{revision:bill.revision,sourceId:analysis.id,reason:'Recode per Harbor rejection',date:'2026-11-03',...body},h.owner,expected);
  assert.match((await correct({utbmsActivity:'A104'},422)).error,/A104 is not in the firm's active code set/);
  await correct({},400);
  await h.json('/ledes/codes',{kind:'activity',code:'A104',label:'Review/analyze',active:true},h.owner);
  let revision=await correct({utbmsActivity:'A104'});
  assert.deepEqual([revision.correctsBillId,revision.snapshot.totalCents,revision.snapshot.ledes.invoiceNumber,revision.snapshot.ledes.replaces,revision.snapshot.ledes.respondsToRejection],[bill.id,0,invoice+'-R1',invoice,true]);
  await h.json('/matters/'+m.id+'/bills',{title:'Rebill',date:'2026-11-03',entryIds:[analysis.id],coding:{[analysis.id]:{utbmsActivity:'A104'}}},h.owner,409);
  await correct({utbmsActivity:'A101'},409);
  revision=await h.json('/bills/'+revision.id+'/approve',{revision:revision.revision,reviewNote:'Recode reviewed against Harbor rejection'},h.owner);
  const replacement=readLedes(await(await h.request('/api/satchel/bills/'+revision.id+'/ledes',undefined,h.owner)).text());
  const replacementXmlFile=await(await h.request('/api/satchel/bills/'+revision.id+'/ledes-xml',undefined,h.owner)).text(),replacementXml=readXml(replacementXmlFile);
  assert.equal(replacementXml.invoice.inv_id,invoice+'-R1');assert.equal(replacementXml.invoice.inv_total_net_due,'810.00');
  assert.deepEqual(replacementXml.fees.map(l=>[l.file_item_nbr,l.task_activity,l.total_amount]),[['1','A101','270.00'],['2','A104','135.00']]);
  assert.deepEqual(replacementXml.extensions,[{ext_name:'replaces_invoice',ext_value:invoice,file_item_nbr:replacementXml.extensions[0].file_item_nbr}]);
  assert.deepEqual(replacement.map(l=>[l.INVOICE_NUMBER,l.LINE_ITEM_NUMBER,l.LINE_ITEM_ACTIVITY_CODE,l.LINE_ITEM_TOTAL,l.INVOICE_TOTAL]),[[invoice+'-R1','1','A101','270.00','810.00'],[invoice+'-R1','2','A104','135.00','810.00'],[invoice+'-R1','3','','405.00','810.00']]);
  outcome=await h.json('/bills/'+revision.id+'/ledes-outcomes',{fileName:'harbor-accept.txt',content:`${invoice}-R1||ACCEPTED|`},h.owner);
  assert.equal(outcome.status,'accepted');
  // The original export is unchanged and the branch total is the original's: nothing charged twice.
  assert.equal(await(await h.request('/api/satchel/bills/'+bill.id+'/ledes',undefined,h.owner)).text(),file);
  assert.equal(await(await h.request('/api/satchel/bills/'+bill.id+'/ledes-xml',undefined,h.owner)).text(),xmlFile);
  billing=await h.json('/matters/'+m.id+'/billing',undefined,h.owner);
  assert.equal(billing.bills.filter(b=>b.status!=='void').reduce((n,b)=>n+b.snapshot.totalCents,0),81000);
  assert.deepEqual(billing.bills.map(b=>[b.ledes.invoiceNumber,b.ledes.status]),[[invoice,'rejected'],[invoice+'-R1','accepted']]);

  // A client without a guideline keeps the plain reviewed bill: no LEDES invoice.
  const other=await h.json('/matters/'+plain.id+'/entries',{kind:'time',date:'2026-10-15',description:'Call',minutes:6},h.owner);
  const plainBill=await h.json('/matters/'+plain.id+'/bills',{title:'Estate',date:'2026-10-31',entryIds:[other.id]},h.owner);
  assert.equal(plainBill.snapshot.ledes,undefined);await h.json('/bills/'+plainBill.id+'/ledes',undefined,h.owner,404);
  ledes=await h.json('/matters/'+plain.id+'/ledes',undefined,h.owner);assert.equal(ledes.guideline,null);
  await h.json('/bills/'+plainBill.id+'/ledes-xml',undefined,h.owner,404);

  // XML rounds units to two decimals; its four-decimal adjustment preserves every cent.
  await h.json('/matters/'+m.id+'/ledes-guideline',{...guideline,incrementMinutes:0},h.owner);
  const small=await entry({description:'Read client’s email & <coverage> note',minutes:10,rateCents:10001,utbmsTask:'L110',utbmsActivity:'A101'});
  const prepare=body=>h.json('/matters/'+m.id+'/bills',{title:'Additional & <coverage>',date:'2026-11-03',entryIds:[small.id],...body},h.owner);
  let rounded=await prepare({});rounded=await h.json('/bills/'+rounded.id+'/approve',{revision:rounded.revision,reviewNote:'Reviewed exact fractional unit adjustment'},h.owner);
  const fractional=readXml(await(await h.request('/api/satchel/bills/'+rounded.id+'/ledes-xml',undefined,h.owner)).text());
  assert.deepEqual([fractional.invoice.inv_desc,fractional.fees[0].charge_desc,fractional.fees[0].units,fractional.fees[0].rate,fractional.fees[0].base_amount,fractional.fees[0].item_disc_cred_amount,fractional.fees[0].total_amount],['Additional & <coverage>','Read client’s email & <coverage> note','0.17','100.01','17.0017','-0.3317','16.67']);
  const onlyExpense=await h.json('/matters/'+m.id+'/entries',{kind:'disbursement',date:'2026-11-03',description:'Certified court copy',amountCents:1250,utbmsExpense:'E112'},h.owner);
  let expenseBill=await h.json('/matters/'+m.id+'/bills',{title:'Certified court copy',date:'2026-11-03',entryIds:[onlyExpense.id]},h.owner);
  expenseBill=await h.json('/bills/'+expenseBill.id+'/approve',{revision:expenseBill.revision,reviewNote:'Receipt reviewed'},h.owner);
  const expenseXml=readXml(await(await h.request('/api/satchel/bills/'+expenseBill.id+'/ledes-xml',undefined,h.owner)).text());
  assert.equal(expenseXml.fees.length,0);assert.equal(expenseXml.expenses[0].total_amount,'12.50');assert.equal(expenseXml.timekeepers[0].tk_id,'BL-001');

  // An identical client name never fabricates that client's identifier for another matter.
  const sibling=await open(h,'Harbor coverage advice','Harbor Mutual Insurance','Blue Transport');
  const siblingEntry=await h.json('/matters/'+sibling.id+'/entries',{kind:'disbursement',date:'2026-11-03',description:'Certified court copy',amountCents:500,utbmsExpense:'E112'},h.owner);
  await h.json('/matters/'+sibling.id+'/bills',{title:'Copy',date:'2026-11-03',entryIds:[siblingEntry.id]},h.owner,422);
  await h.json('/matters/'+sibling.id+'/ledes-guideline',{...guideline,xmlProfile:{...xmlProfile,clientMatterId:'HM-2026-143'}},h.owner);
  assert.equal((await h.json('/matters/'+m.id+'/ledes',undefined,h.owner)).guideline.xmlProfile.clientMatterId,'HM-2026-142');
  assert.equal((await h.json('/matters/'+sibling.id+'/ledes',undefined,h.owner)).guideline.xmlProfile.clientMatterId,'HM-2026-143');

  // Revoking matter access blocks both immutable export doors immediately.
  await h.json('/matters/'+m.id+'/access',{email:'lawyer@example.test',remove:true},h.owner);
  await h.json('/bills/'+bill.id+'/ledes-xml',undefined,lawyer,404);
  const archive=await(await h.request('/api/satchel/backup',undefined,h.owner)).text(),target=await harness();
  try{
   assert.equal((await target.json('/restore',{archive,confirm:'RESTORE'},target.owner)).phase,'complete');
   assert.equal(await(await target.request('/api/satchel/bills/'+bill.id+'/ledes-xml',undefined,target.owner)).text(),xmlFile);
   assert.equal(await(await target.request('/api/satchel/bills/'+revision.id+'/ledes-xml',undefined,target.owner)).text(),replacementXmlFile);
  }finally{await target.close();}


 }finally{await h.close();}
});
