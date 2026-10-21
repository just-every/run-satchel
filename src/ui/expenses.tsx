import {useState} from 'react';
import {Field,type Row} from './common';

const categories:Record<string,string>={
 client_disbursement:'Client disbursement',
 advanced_cost:'Advanced cost',
 overhead:'Overhead',
};

export function ExpenseFields({documents}:{documents:Row[]}){
 const [sourceSystem,setSourceSystem]=useState(''),[sourceId,setSourceId]=useState(''),[receipt,setReceipt]=useState('');
 return <>
  <Field label="Expense category" name="expenseCategory"><select name="expenseCategory" required defaultValue=""><option value="" disabled>Choose a category</option>{Object.entries(categories).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>
  <div className="inline"><Field label="Vendor" name="vendor"/><Field label="Vendor reference" name="vendorReference"/></div>
  <Field label="Accounting code" name="accountingCode"/>
  <div className="inline">
   <Field label="Imported reference system (optional)" name="sourceSystem"><input name="sourceSystem" value={sourceSystem} onChange={e=>setSourceSystem(e.target.value)} required={!!sourceId}/></Field>
   <Field label="Imported reference ID (optional)" name="sourceId"><input name="sourceId" value={sourceId} onChange={e=>setSourceId(e.target.value)} required={!!sourceSystem}/></Field>
  </div>
  <small>For imported references, enter both the system and ID. These references do not verify a provider record.</small>
  <Field label="Receipt (optional)" name="receipt" required={false}><select name="receipt" value={receipt} onChange={e=>setReceipt(e.target.value)}><option value="">No receipt attached</option>{documents.filter(d=>!d.erasedAt).flatMap(d=>d.versions.map((v:Row)=><option key={`${d.id}:${v.version}`} value={`${d.id}:${v.version}`}>{d.title} · {v.name} · version {v.version}</option>))}</select></Field>
 </>;
}

export function expenseInput(d:Row){
 const receipt=d.receipt?String(d.receipt).split(':'):undefined;
 return {
  category:d.expenseCategory,
  vendor:d.vendor,
  vendorReference:d.vendorReference,
  accountingCode:d.accountingCode,
  sourceSystem:d.sourceSystem||undefined,
  sourceId:d.sourceId||undefined,
  receipt:receipt?{documentId:receipt[0],version:Number(receipt[1])}:undefined,
 };
}

export function ExpenseDetails({expense}:{expense:Row}){
 return <>
  <p><span className="badge">{categories[expense.category]??expense.category}</span><br/>Vendor: {expense.vendor}<br/>Vendor reference: {expense.vendorReference}<br/>Accounting code: {expense.accountingCode}</p>
  {(expense.sourceSystem||expense.sourceId)&&<p>Imported reference: {expense.sourceSystem} · {expense.sourceId}<br/><small>Provider record not verified.</small></p>}
  {expense.receipt&&(expense.receipt.documentId?<p><a href={`/api/satchel/documents/${encodeURIComponent(expense.receipt.documentId)}/file?version=${expense.receipt.version}`}>Download receipt · version {expense.receipt.version}</a></p>:<p>Receipt unavailable.</p>)}
 </>;
}
