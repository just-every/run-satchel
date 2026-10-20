import {useState} from 'react';
import {Field,type Row,type Run} from './common';

export function XmlProfileFields({profile}:{profile?:Row|null}){
 const [enabled,setEnabled]=useState(Boolean(profile));
 const input=(label:string,name:string,value?:string|number,options:{required?:boolean;maxLength?:number;type?:string;pattern?:string}={})=><Field label={label} name={name}><input name={name} type={options.type??'text'} defaultValue={value} required={options.required??true} maxLength={options.maxLength} pattern={options.pattern}/></Field>;
 return <fieldset><legend>Optional LEDES XML profile</legend>
  <label className="check"><input type="checkbox" name="xmlEnabled" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Enable LEDES XML 2.1.3 for future bill preparations and revisions</label>
  <p>The firm name, address and phone come from Firm settings when the bill is prepared. Enter the client details and billing contact below.</p>
  {enabled&&<fieldset><legend>XML billing details</legend>
   <div className="inline">{input('XML firm vendor identifier','xmlVendorId',profile?.vendorId,{maxLength:25})}{input('XML client-assigned firm vendor ID','xmlClientFirmId',profile?.clientFirmId,{maxLength:20})}</div>
   {input('Work country for invoice lines (3-letter ISO code)','xmlWorkCountry',profile?.workCountry,{maxLength:3,pattern:'[A-Za-z]{3}'})}
   {input('XML client matter ID','xmlClientMatterId',profile?.clientMatterId,{maxLength:25})}
   {input('Client address line 1','xmlClientLine1',profile?.clientAddress?.line1)}
   {input('Client address line 2 (optional)','xmlClientLine2',profile?.clientAddress?.line2,{required:false})}
   <div className="inline">{input('Client city','xmlClientCity',profile?.clientAddress?.city)}{input('Client state or province','xmlClientState',profile?.clientAddress?.state)}</div>
   <div className="inline">{input('Client postal code','xmlClientZip',profile?.clientAddress?.zip)}{input('Client country (3-letter ISO code)','xmlClientCountry',profile?.clientAddress?.country,{maxLength:3,pattern:'[A-Za-z]{3}'})}</div>
   {input('Client phone','xmlClientPhone',profile?.clientAddress?.phone,{type:'tel'})}
   <div className="inline">{input('Billing contact first name','xmlContactFirstName',profile?.billingContact?.firstName)}{input('Billing contact last name','xmlContactLastName',profile?.billingContact?.lastName)}</div>
   {input('Billing contact email','xmlContactEmail',profile?.billingContact?.email,{type:'email'})}
   {input('Expense timekeeper ID (needed for expense-only XML invoices)','xmlExpenseTimekeeperId',profile?.expenseTimekeeperId,{required:false})}
   {input('Expense timekeeper hourly USD cents (expense-only XML invoices)','xmlExpenseTimekeeperRateCents',profile?.expenseTimekeeperRateCents,{required:false,type:'number'})}
  </fieldset>}
 </fieldset>;
}

export function xmlProfileBody(d:Row){
 if(d.xmlEnabled!=='on')return null;
 const value=(key:string)=>String(d[key]??'').trim();
 return {workCountry:value('xmlWorkCountry').toUpperCase(),vendorId:value('xmlVendorId'),clientFirmId:value('xmlClientFirmId'),clientMatterId:value('xmlClientMatterId'),
  clientAddress:{line1:value('xmlClientLine1'),line2:value('xmlClientLine2')||undefined,city:value('xmlClientCity'),state:value('xmlClientState'),zip:value('xmlClientZip'),country:value('xmlClientCountry').toUpperCase(),phone:value('xmlClientPhone')},
  billingContact:{firstName:value('xmlContactFirstName'),lastName:value('xmlContactLastName'),email:value('xmlContactEmail')},expenseTimekeeperId:value('xmlExpenseTimekeeperId')||undefined,expenseTimekeeperRateCents:value('xmlExpenseTimekeeperRateCents')===''?undefined:Number(value('xmlExpenseTimekeeperRateCents'))};
}

export function XmlProfileSummary({profile}:{profile?:Row|null}){
 return profile?<p>LEDES XML 2.1.3 enabled · client matter ID {profile.clientMatterId}</p>:null;
}

export function LedesXmlDownload({bill,run}:{bill:Row;run:Run}){
 if(!bill.ledes.xmlReady)return null;
 return <div className="actions"><button onClick={()=>run(async()=>{
  const response=await fetch('/api/satchel/bills/'+bill.id+'/ledes-xml');
  if(!response.ok)throw new Error(((await response.json()) as Row).error);
  const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');
  a.href=url;a.download=bill.ledes.invoiceNumber+'.ledes.xml';a.click();URL.revokeObjectURL(url);
 },'LEDES invoice exported')}>Download {bill.ledes.xmlFormat}</button></div>;
}
