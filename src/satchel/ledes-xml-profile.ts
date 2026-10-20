// TIME-007: explicit XML 2.1.3 billing details, checked before the reviewed snapshot.
import {insist,integer,stmt,text,type Data} from './model';
import {firmSettings} from './firm';

export const xmlFormat='LEDES XML 2.1.3';
export const xmlLevel:Record<string,string>={PT:'PARTNR',AS:'ASSOC',OC:'OFCOUN',PL:'PARALG',LA:'LGLAST',OT:'NBOTHR'};
export function xmlText(value:unknown,label:string,max:number){
 const s=text(value,label,max);
 insist(!/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u.test(s),`${label} contains a character XML cannot represent`);
 return s;
}
function address(a:Data,label:string){
 const country=xmlText(a?.country,label+' country (ISO alpha-3)',3).toUpperCase();
 insist(/^[A-Z]{3}$/.test(country),`${label} country must be an ISO alpha-3 code`);
 return {line1:xmlText(a?.line1,label+' address',60),line2:a?.line2?xmlText(a.line2,label+' address line 2',60):'',city:xmlText(a?.city,label+' city',40),state:xmlText(a?.state,label+' state',40),zip:xmlText(a?.zip,label+' postal code',20),country,phone:xmlText(a?.phone,label+' phone',20)};
}
export function xmlProfile(value:Data|null|undefined){
 if(value==null)return null;
 insist(typeof value==='object'&&!Array.isArray(value),'Give XML billing details');
 const c=value.billingContact,email=xmlText(c?.email,'XML billing contact email',60);
 insist(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Enter the XML billing contact email');
 const workCountry=xmlText(value.workCountry,'XML work country (ISO alpha-3)',3).toUpperCase();
 insist(/^[A-Z]{3}$/.test(workCountry),'XML work country must be an ISO alpha-3 code');
 const expenseTimekeeperRateCents=value.expenseTimekeeperRateCents==null?null:integer(value.expenseTimekeeperRateCents,'XML expense billing timekeeper hourly USD cents',0,100000000);
 return {expenseTimekeeperRateCents,workCountry,vendorId:xmlText(value.vendorId,'XML firm vendor ID',25),clientFirmId:xmlText(value.clientFirmId,'XML client ID in firm system',20),clientMatterId:xmlText(value.clientMatterId,'XML client matter ID',25),clientAddress:address(value.clientAddress,'XML client'),billingContact:{firstName:xmlText(c?.firstName,'XML billing contact first name',20),lastName:xmlText(c?.lastName,'XML billing contact last name',30),email},expenseTimekeeperId:value.expenseTimekeeperId?xmlText(value.expenseTimekeeperId,'XML expense billing timekeeper ID',10):null};
}
export function xmlTimekeeper(t:Data){
 const [lastName,...first]=String(t.timekeeperName).split(',');
 insist(first.length>0,'XML timekeeper name must be recorded as Last, First');
 return {id:xmlText(t.timekeeperId,'XML timekeeper ID',10),lastName:xmlText(lastName,'XML timekeeper last name',30),firstName:xmlText(first.join(',').trim(),'XML timekeeper first name',20),level:xmlLevel[t.classification],rateCents:t.unitCostCents};
}
export async function snapshotXml(db:D1Database,profile:Data|null,client:string,matterId:string,matterNumber:string,matterTitle:string,invoiceNumber:string,lines:Data[]){
 if(!profile)return null;
 const clientMatterId=profile.clientMatterIds?.[matterId];insist(clientMatterId,'Record the client matter ID in this matter’s XML guideline before preparing an XML bill',422);
 const f=(await firmSettings(db)).settings;insist(f,'Enter Firm settings before preparing an XML bill',422);
 xmlText(client,'XML client name',120);xmlText(matterNumber,'XML firm matter ID',25);xmlText(matterTitle,'XML matter name',255);xmlText(invoiceNumber,'XML invoice number',50);
 const timekeepers=lines.filter(l=>l.type==='F').map(xmlTimekeeper);
 if(!timekeepers.length){
  const t=await stmt(db,'SELECT * FROM s_ledes_timekeepers WHERE timekeeper_id=?',profile.expenseTimekeeperId??'').first<Data>();
  insist(t,'Choose an XML expense billing timekeeper ID for an expense-only invoice',422);
  insist(profile.expenseTimekeeperRateCents!==null&&profile.expenseTimekeeperRateCents!==undefined,'Record the XML expense billing timekeeper hourly USD cents for an expense-only invoice',422);
  timekeepers.push(xmlTimekeeper({timekeeperId:t.timekeeper_id,timekeeperName:t.name,classification:t.classification,unitCostCents:profile.expenseTimekeeperRateCents}));
 }
 for(const l of lines)xmlText(l.description,`XML line ${l.lineNumber} narrative`,15000);
 const {clientMatterIds,...billingProfile}=profile;
 return {...billingProfile,clientMatterId,firmName:xmlText(f.name,'XML firm name',120),firmAddress:address({...f.address,country:'USA',phone:f.phone},'XML firm'),timekeepers:timekeepers.filter((t,i,a)=>a.findIndex(p=>p.id===t.id&&p.rateCents===t.rateCents)===i)};
}
