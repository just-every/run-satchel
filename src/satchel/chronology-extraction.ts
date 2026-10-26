import {insist,type Data} from './model';
import {nativePdfText,type PdfTextPage} from './chronology-pdf-text';

const months='January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';
const datePattern=new RegExp('\\b(?:\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}[/.]\\d{1,2}[/.]\\d{4}|(?:'+months+')\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|\\d{1,2}\\s+(?:'+months+')\\.?\\s+\\d{4})\\b','gi');
const moneyPattern=/(?:USD\s*|\$\s*)?\b(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\b/gi;
const metadataDate=/\b(?:date of birth|dob|printed|generated|statement date|invoice date|billing date)\b/i;
const totalLine=/\b(?:total(?:\s+(?:charges|billed|amount|due|balance))?|balance\s+due|amount\s+due|subtotal)\s*[:$\d]/i;

function normalizedDate(value:string):string{
 let year:number,month:number,day:number;
 if(/^\d{4}-/.test(value))[year,month,day]=value.split('-').map(Number);
 else if(/^\d+[/.]/.test(value))[month,day,year]=value.split(/[/.]/).map(Number);
 else{const parsed=new Date(value.replace(/(\d)(st|nd|rd|th)/i,'$1'));year=parsed.getUTCFullYear();month=parsed.getUTCMonth()+1;day=parsed.getUTCDate();}
 const result=String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
 insist(Number.isFinite(year)&&year>=1900&&year<=2200&&new Date(result+'T00:00:00Z').toISOString().slice(0,10)===result,'A source service date is invalid or ambiguous. Review the original before importing.',422);return result;
}
function providerIn(line:string):string|undefined{
 const labelled=line.match(/(?:^|\b)(?:treating\s+provider|rendering\s+provider|provider|facility|physician|clinic)\s*:\s*(.+?)(?=\s+(?:Date|Patient|DOB|Service|Treatment|Charge)\s*:|$)/i);
 if(labelled)return labelled[1].trim();
 const doctor=line.match(/\bDr\.\s+[\p{L}][\p{L}'’-]*(?:\s+[\p{L}][\p{L}'’-]*){0,3}(?=\s+(?:provided|performed|treated|evaluated|reviewed|on|at)\b|[,;]|$)/u);
 if(doctor)return doctor[0].trim();
 if(line.length<=160&&!datePattern.test(line)&&/\b(?:hospital|clinic|medical center|medical centre|health center|health centre|rehabilitation|orthop[ae]edics|radiology|urgent care)\b/i.test(line)&&!/[.:]$/.test(line)&&!/^\s*(?:assessment|treatment|plan|description|service|procedure)\b/i.test(line))return line;
 return undefined;
}
function chargeIn(lines:string[],page:number):number|null{
 const values=lines.flatMap(line=>totalLine.test(line)?[]:[...line.matchAll(moneyPattern)]);
 if(!values.length)return null;
 insist(values.length===1,'Page '+page+' has multiple amounts for a service. Native extraction cannot determine the charge column; review the original before importing.',422);
 const value=values[0][0];insist(!/[-(]\s*$/.test(values[0].input!.slice(0,values[0].index)),'Page '+page+' contains a credit requiring manual review.',422);
 const cents=Math.round(Number(value.replace(/USD|[$,\s]/gi,''))*100);insist(Number.isSafeInteger(cents)&&cents>=0&&cents<=100000000,'Source charge is outside the supported range',422);return cents;
}
function extractPage(page:PdfTextPage,priorProvider?:string){
 const records:Data[]=[],totals:Data[]=[],lines=page.lines;
 let provider=priorProvider,block:{date:string;provider?:string;lines:string[]}|undefined;
 const finish=()=>{
  if(!block)return;
  const content=block.lines.join('\n');
  insist(block.provider&&block.provider.length<=160,'Page '+page.page+' has a service without an identifiable provider. Review the original before importing.',422);
  insist(content.replace(datePattern,'').replace(/\b(?:date|of|service|visit|encounter|treatment)\b|[\s:;,.-]/gi,'').length>4,'Page '+page.page+' has a service date without a treatment description.',422);
  insist(content.length<=2000,'Page '+page.page+' has a treatment record longer than 2,000 characters. Split the original into readable encounter records.',422);
  const chargeCents=chargeIn(block.lines,page.page);
  records.push({page:page.page,kind:chargeCents===null?'treatment':'bill',provider:block.provider,date:block.date,treatment:content,chargeCents,sourceText:content});block=undefined;
 };
 for(const line of lines){
  datePattern.lastIndex=0;
  const dates=[...line.matchAll(datePattern)];
  if(metadataDate.test(line))continue;
  if(totalLine.test(line)){
   const amounts=[...line.matchAll(moneyPattern)];if(amounts.length===1)totals.push({page:page.page,label:line,amountCents:Math.round(Number(amounts[0][0].replace(/USD|[$,\s]/gi,''))*100)});
   finish();continue;
  }
  datePattern.lastIndex=0;const found=providerIn(line);datePattern.lastIndex=0;
  if(found){if(block&&!dates.length)finish();provider=found;}
  if(dates.length){
   insist(dates.length===1,'Page '+page.page+' contains multiple service dates in one row. Review the original before importing.',422);
   finish();block={date:normalizedDate(dates[0][0]),provider,lines:[line]};
  }else if(block&&!found&&!/^\s*(?:page\s+\d+|(?:service\s+)?date\s+(?:description|provider)|(?:electronically\s+)?signed\s+by)\b/i.test(line))block.lines.push(line);
 }
 finish();
 insist(records.length>0,'Page '+page.page+' has no identifiable treatment or bill records. Scanned, unreadable, or unsupported pages cannot be omitted; no chronology was saved.',422);
 return {records,totals,provider};
}

export async function extractChronologyPdf(bytes:Uint8Array){
 let pages:PdfTextPage[];
 try{pages=await nativePdfText(bytes);}catch(error){if((error as {status?:number}).status)throw error;insist(false,'Native PDF extraction is unavailable or this original cannot be read. No chronology was saved; use a readable unencrypted PDF.',503);}
 const entries:Data[]=[],reportedTotals:Data[]=[];let provider:string|undefined;
 for(const page of pages){const result=extractPage(page,provider);entries.push(...result.records);reportedTotals.push(...result.totals);provider=result.provider;}
 return {entries,reportedTotals,pageCount:pages.length};
}
