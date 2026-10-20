// TIME-007. The original official schema is fixtures/ledes/Ledes213.xsd.
// https://ledes.org/wp-content/uploads/2020/07/LEDES213xsd.zip
import {type Data} from './model';
import {xmlLevel} from './ledes-xml-profile';

const escape=(v:unknown)=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;').replaceAll('\r','&#13;');
const el=(k:string,v:unknown)=>`<${k}>${escape(v)}</${k}>`;
const group=(k:string,v:string)=>`<${k}>${v}</${k}>`;
const money4=(v:number)=>`${v<0?'-':''}${Math.floor(Math.abs(v)/10000)}.${String(Math.abs(v)%10000).padStart(4,'0')}`;
const money=(v:number)=>`${v<0?'-':''}${Math.floor(Math.abs(v)/100)}.${String(Math.abs(v)%100).padStart(2,'0')}`;
export function ledesXml(bill:Data){
 const s=bill.snapshot,l=s.ledes,p=l.xml,lines:Data[]=l.lines;
 let serial=lines.length+1;
 const item=()=>el('file_item_nbr',serial++);
 const addr=(a:Data)=>el('address_1',a.line1)+(a.line2?el('address_2',a.line2):'')+el('city',a.city)+el('state_province',a.state)+el('zip_postal_code',a.zip)+el('country',a.country)+el('phone',a.phone)+item();
 const contact=(c:Data)=>el('contact_lname',c.lastName)+el('contact_fname',c.firstName)+el('contact_email',c.email)+item();
 const sum=(type:string)=>lines.filter(x=>x.type===type).reduce((n,x)=>n+x.totalCents,0),fees=sum('F'),expenses=sum('E');
 const dates=lines.map(x=>x.date).sort();
 const summary=p.timekeepers.map((t:Data)=>group('tksum',el('tk_id',t.id)+el('tk_lname',t.lastName)+el('tk_fname',t.firstName)+el('tk_level',t.level)+el('tk_rate',money(t.rateCents))+item())).join('');
 const detail=(x:Data)=>{
  const fee=x.type==='F',kind=fee?'fee':'expense',hundredths=Math.floor((x.units4+50)/100);
  const base=hundredths*x.unitCostCents,adjustment=x.totalCents*100-base;
  const adjustmentDetail=adjustment?group(kind+'_item_disc_cred',el('disc_cred','Other')+el('disc_cred_note','Agreed line adjustment and unit rounding')+el('disc_cred_type','Flat')+el('increase_decrease',adjustment<0?'Decrease':'Increase')+el('disc_cred_amount',money4(adjustment))+item()):'';
  return group(kind,el('charge_date',x.date)+(fee?el('tk_id',x.timekeeperId)+el('tk_level',xmlLevel[x.classification]):'')+el('work_location_country',p.workCountry)+el('charge_desc',x.description)+(x.task?el('task_code',x.task):'')+(fee?(x.activity?el('task_activity',x.activity):''):(x.expense?el('expense_code',x.expense):''))+el('charge_type',x.nonhourly?'F':'U')+el('units',(hundredths/100).toFixed(2))+el('rate',money(x.unitCostCents))+el('base_amount',money4(base))+el('item_disc_cred_amount',money4(adjustment))+el('total_amount',money(x.totalCents))+el('file_item_nbr',x.lineNumber)+adjustmentDetail);
 };
 const matter=group('matter',el('cl_matter_id',p.clientMatterId)+el('lf_matter_id',s.matterNumber)+el('matter_name',s.matterTitle)+el('account_type','O')+el('matter_final_bill','N')+el('matter_total_detail_fees',money(fees))+el('matter_total_detail_exp',money(expenses))+el('matter_disc_credit_fees','0.00')+el('matter_disc_credit_exp','0.00')+el('matter_disc_cred_total','0.00')+el('matter_perc_shar_fees','1.0000')+el('matter_perc_shar_exp','1.0000')+el('matter_disc_bill_pct_fees','0')+el('matter_disc_bill_pct_exp','0')+el('matter_tax_on_fees','0.00')+el('matter_tax_on_exp','0.00')+el('matter_net_fees',money(fees))+el('matter_net_exp',money(expenses))+el('matter_funds_applied','0.00')+el('matter_total_due',money(fees+expenses))+el('associated_line_items','Y')+item()+summary+lines.filter(x=>x.type==='F').map(detail).join('')+lines.filter(x=>x.type==='E').map(detail).join(''));
 // Replacement identity is retained in a standard extension without mislabelling it a credit note.
 const replacement=l.replaces?group('extend_header',el('vendor','Satchel')+group('extend_data',el('ext_name','replaces_invoice')+el('ext_value',l.replaces)+item())):'';
 const invoice=group('invoice',el('inv_id',l.invoiceNumber)+el('inv_date',s.date)+el('inv_currency','USD')+el('inv_start_date',dates[0])+el('inv_end_date',dates.at(-1))+el('inv_desc',s.title)+el('inv_total_tax','0.00')+el('inv_total_net_due',money(fees+expenses))+item()+replacement+matter);
 const client=group('client',el('cl_id',l.clientId)+el('cl_lf_id',p.clientFirmId)+el('cl_name',s.client)+group('cl_address',addr(p.clientAddress))+item()+invoice);
 const firm=group('firm',el('lf_vendor_id',p.vendorId)+el('lf_id',l.lawFirmId)+el('lf_name',p.firmName)+group('lf_address',addr(p.firmAddress))+group('lf_billing_contact',contact(p.billingContact))+el('source_app','Satchel')+el('app_version','0.1.0')+item()+client);
 return '<?xml version="1.0" encoding="UTF-8"?>\n<ledesxmlebilling2.1.3 xmlns="http://www.ledes.org/ledes213.xsd">'+firm+'</ledesxmlebilling2.1.3>\n';
}
