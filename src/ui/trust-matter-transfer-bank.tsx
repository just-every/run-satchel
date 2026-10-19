import {useState} from 'react';
import {api,Field,Form,type Row,type Run} from './common';
export function MatterTransferBank({transfer:t,docs,run}:{transfer:Row;docs:Row[];run:Run}){
 const [outcome,setOutcome]=useState(t.status==='authorized'?'submitted':'cleared');
 const source=(label:string,name:string,matterId:string)=><Field label={label} name={name}><select name={name}>{docs.filter(d=>d.matterId===matterId&&d.visibility==='matter'&&!d.erasedAt).map(d=><option key={d.id} value={d.id}>{d.title} · version {d.currentVersion}</option>)}</select></Field>;
 return <Form label="Record matter transfer bank result" submit={b=>run(()=>api('/trust/matter-transfers/'+t.id+'/bank-result',{...b,revision:t.revision,debitCents:Number(b.debitCents),creditCents:Number(b.creditCents)}),'Matter transfer bank result recorded')}>
 <Field label="Matter transfer bank outcome" name="outcome"><select name="outcome" value={outcome} onChange={e=>setOutcome(e.target.value)}>{t.status==='authorized'?<option value="submitted">Recorded bank submission — awaiting reconciliation</option>:<><option value="cleared">Both bank movements reconciled</option><option value="not_executed">Banks confirm no execution</option></>}</select></Field>
 <Field label="Source bank reference" name="bankReference"/><Field label="Destination bank reference" name="destinationBankReference"/>
 <Field label="Source bank date" name="bankDate" type="date"/><Field label="Destination bank date" name="destinationBankDate" type="date"/>
 <Field label="Bank debit USD cents" name="debitCents" type="number" value={outcome==='not_executed'?0:t.cents} key={'debit:'+outcome}/><Field label="Bank credit USD cents" name="creditCents" type="number" value={outcome==='not_executed'?0:t.cents} key={'credit:'+outcome}/>
 {source('Source bank original','documentId',t.from_matter_id)}{source('Destination bank original','destinationDocumentId',t.to_matter_id)}
 <Field label="Bank reconciliation evidence" name="evidence"/>
 </Form>;
}
