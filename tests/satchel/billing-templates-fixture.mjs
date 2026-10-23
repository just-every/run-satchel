import {getDocument,OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {readFile} from 'node:fs/promises';
import {open} from './harness.mjs';
import {reviewed,scheme} from './invoice-numbering-fixture.mjs';
export const templateOptions={layout:'detailed',detail:true,hours:true,rates:true,timekeepers:true,utbms:true,noCharge:true,discounts:true,trust:'hide',prior:'hide'};
export async function templateFixture(h){
 const address={line1:'200 Park Avenue',city:'New York',state:'NY',zip:'10166'};
 await h.json('/firm',{settings:{name:'Barton & Lee LLP',email:'office@example.test',phone:'212-555-0100',address,timezone:'America/New_York',billing:{defaultRateCents:25000,incrementMinutes:6,paymentTermsDays:30},fiscal:{yearStartMonth:1,basis:'cash'},offices:[{name:'Main',phone:'212-555-0100',timezone:'America/New_York',address}],practiceAreas:[{code:'LIT',name:'Litigation'}]}},h.owner);
 const m=await open(h),second=await open(h,'Barton second lease'),third=await open(h,'Barton third lease');await h.json('/invoice-numbering',scheme(),h.owner);
 const logo={mime:'image/png',base64:(await readFile('public/brand/favicon-32.png')).toString('base64')};
 const body={name:'Detailed counsel invoice',remittance:'Send operating payments to Barton & Lee, 200 Park Avenue',terms:'Payment due in thirty days under the reviewed engagement',termsDays:30,logo,options:templateOptions};
 return {m,second,third,body,async draft(matter,title){const entries=[];for(const [description,rateCents] of [[title+' confidential work',25000],[title+' no-charge courtesy',0]])entries.push(await h.json('/matters/'+matter.id+'/entries',{kind:'time',date:'2026-10-01',description,minutes:60,rateCents,utbmsTask:'L110',utbmsActivity:'A101'},h.owner));return h.json('/matters/'+matter.id+'/bills',{title,date:'2026-10-01',entryIds:entries.map(e=>e.id)},h.owner);},async issue(matter,b){b=await reviewed(h,matter,b);await h.json('/invoices/issue',{bills:[{id:b.id,revision:b.revision}]},h.owner);return (await h.json('/matters/'+matter.id+'/billing',undefined,h.owner)).bills.find(x=>x.id===b.id);}};
}

export async function readInvoicePdf(bytes){const task=getDocument({data:Uint8Array.from(bytes),useSystemFonts:false});try{const d=await task.promise,text=[],ops=[];for(let n=1;n<=d.numPages;n++){const p=await d.getPage(n);text.push((await p.getTextContent()).items.map(x=>x.str).join(' '));ops.push(...(await p.getOperatorList()).fnArray);}return {text:text.join(' '),hasLogo:ops.includes(OPS.paintImageXObject)};}finally{await task.destroy();}}
