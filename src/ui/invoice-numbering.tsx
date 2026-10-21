import {useEffect,useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';

export function InvoiceNumbering({actor,run,tick}:{actor:Row;run:Run;tick:number}){
 const [state,setState]=useState<Row>();
 useEffect(()=>{let active=true;if(['owner','lawyer'].includes(actor.role))void api('/invoice-numbering').then(s=>{if(active)setState(s);}).catch(e=>run(async()=>{throw e;}));return()=>{active=false;};},[actor.role,tick]);
 if(!state)return null;
 const scheme=state.schemes.at(-1),terms=scheme?.terms;
 return <section className="panel" aria-label="Invoice numbering"><h2>Invoice numbering</h2>
  <p>{scheme?`Scheme version ${scheme.version} · next counter ${state.counter.next_number}`:'No firm scheme saved. Existing reserved invoice numbers are retained.'}</p>
  <p>Saving the first scheme starts issue-time numbering for later drafts. A draft keeps only its ID until issued. Issuance records the exact approved revision and PDF; it sends nothing and moves no money.</p>
  {actor.role==='owner'&&<details><summary>{scheme?'Change invoice scheme':'Configure invoice scheme'}</summary><Form key={scheme?.id??'first'} label="Save invoice scheme" submit={d=>run(()=>api('/invoice-numbering',{prefix:d.prefix,padding:Number(d.padding),separator:d.separator,year:d.year==='on',nextNumber:Number(d.nextNumber),revision:state.counter?.revision??null}),'Invoice scheme saved; legacy numbers retained')}>
   <Field label="Invoice prefix" name="prefix" required={false} value={terms?.prefix??'INV'}/><div className="inline"><Field label="Number padding" name="padding" type="number" value={terms?.padding??5}/><Field label="Next invoice counter" name="nextNumber" type="number" value={state.counter?.next_number??1}/></div>
   <Field label="Number separator" name="separator"><select name="separator" defaultValue={terms?.separator??'-'}><option value="-">Dash</option><option value="/">Slash</option><option value=".">Dot</option><option value="">None</option></select></Field><label><input type="checkbox" name="year" defaultChecked={terms?.year??true}/>Include issue year in the firm timezone</label>
  </Form></details>}
 </section>;
}

export function InvoiceIssue({bill,actor,run}:{bill:Row;actor:Row;run:Run}){
 if(!['owner','lawyer'].includes(actor.role))return null;
 if(bill.issue)return <p>Invoice <strong>{bill.issue.number}</strong> · issued {bill.issue.issued_at}<br/><small>Approved CSV SHA-256: {bill.issue.approved_digest}</small><br/><a href={`/api/satchel/bills/${bill.id}/invoice.pdf`}>Download issued PDF</a></p>;
 if(bill.status!=='approved')return bill.snapshot.numberingCutover?<p>Draft ID: {bill.id} · no invoice number assigned</p>:null;
 return <button type="button" onClick={()=>run(()=>api('/invoices/issue',{bills:[{id:bill.id,revision:bill.revision}]}),'Invoice issued; exact reviewed PDF retained')}>Issue exact approved invoice</button>;
}
