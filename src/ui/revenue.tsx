import {useEffect,useState} from 'react';
import {api,dollars,Field,Form,today,type Row,type Run} from './common';

type Props={matterId:string;actor:Row;run:Run;tick:number};
const kinds=['origination','responsible'] as const;
const percent=(bps:number)=>(bps/100).toLocaleString('en-US',{maximumFractionDigits:2})+'%';
const label=(kind:string)=>kind==='origination'?'Origination':'Responsible attorney';

function RuleRecord({rule}:{rule:Row}){
 return <article className="record">
  <strong>Rule version {rule.version} · {rule.reference}</strong>
  <p>Proportional collected fees · approved by {rule.approvedBy} · {rule.approvedAt}</p>
  {rule.splits.map((s:Row)=><p key={s.kind}>{label(s.kind)} · {s.email} · {percent(s.shareBps)} share · {percent(s.commissionBps)} commission on that share</p>)}
  <p>Firm retains {percent(10000-rule.splits.reduce((n:number,s:Row)=>n+s.shareBps,0))} of collected fees.</p>
  {rule.source.unavailable?<p>The approved agreement source is unavailable.</p>:<>
   <p>{rule.source.unavailable?'Supporting agreement is unavailable under current document access.':<a href={'/api/satchel/documents/'+encodeURIComponent(rule.source.id)+'/file?version='+rule.source.version}>Read approved agreement · version {rule.source.version}</a>}</p>
   <details><summary>Agreement verification</summary><p>Source {rule.source.id} · SHA-256 {rule.source.digest}</p><p>Rule {rule.id}</p></details>
  </>}
 </article>;
}

function RuleApproval({matterId,current,documents,run}:{matterId:string;current:Row|null;documents:Row[];run:Run}){
 const [requestKey,setRequestKey]=useState(()=>crypto.randomUUID());
 return <details><summary>{current?'Approve a replacement allocation rule':'Approve the firm’s allocation rule'}</summary>
  <p>Use the firm-approved agreement. Only collected fee revenue is shared; expense and tax receipts remain separate. Enter basis points: 100 basis points = 1%. The firm retains any unassigned share.</p>
  {!documents.length?<p>Add the supporting agreement in Documents before approving a rule.</p>:<Form label="Approve revenue allocation rule" submit={b=>run(async()=>{
   const splits=kinds.map(kind=>({kind,email:String(b[kind+'.email']).trim(),shareBps:Number(b[kind+'.shareBps']),commissionBps:Number(b[kind+'.commissionBps'])}));
   if(splits.some(s=>!Number.isInteger(s.shareBps)||s.shareBps<0||s.shareBps>10000||!Number.isInteger(s.commissionBps)||s.commissionBps<0||s.commissionBps>10000))throw new Error('Shares and commissions must be whole basis points from 0 to 10,000.');
   if(splits.reduce((n,s)=>n+s.shareBps,0)>10000)throw new Error('Combined attorney shares cannot exceed 10,000 basis points.');
   if(b.approve!=='on')throw new Error('Confirm principal approval of this exact rule.');
   const document=documents.find(d=>d.id===b.sourceDocumentId),version=document?.versions.find((v:Row)=>v.version===document.currentVersion);
   if(!document||!version)throw new Error('Reopen the supporting agreement before approving its current version.');
   await api('/matters/'+matterId+'/revenue/rules',{requestKey,previousId:current?.id??null,sourceDocumentId:document.id,sourceVersion:version.version,sourceDigest:version.sha256,basis:'proportional_fee_receipts',reference:b.reference,splits,approve:true});
   setRequestKey(crypto.randomUUID());
  },'Revenue allocation rule approved')}>
   <Field label="Supporting agreement" name="sourceDocumentId"><select name="sourceDocumentId" required defaultValue={current?.source.id??''}><option value="">Choose a supporting document</option>{documents.map(d=><option key={d.id} value={d.id}>{d.title} · version {d.currentVersion}</option>)}</select></Field>
   <Field label="Agreement citation" name="reference" value={current?.reference}/>
   <div className="grid">{kinds.map(kind=>{const split=current?.splits.find((s:Row)=>s.kind===kind);return <fieldset key={kind}>
    <legend>{label(kind)}</legend>
    <Field label={label(kind)+' email'} name={kind+'.email'} type="email" value={split?.email}/>
    <Field label={label(kind)+' share (basis points)'} name={kind+'.shareBps'}><input name={kind+'.shareBps'} type="number" min="0" max="10000" step="1" required defaultValue={split?.shareBps??0}/></Field>
    <Field label={label(kind)+' commission (basis points of share)'} name={kind+'.commissionBps'}><input name={kind+'.commissionBps'} type="number" min="0" max="10000" step="1" required defaultValue={split?.commissionBps??0}/></Field>
   </fieldset>;})}</div>
   <p>Both attorneys must be active members of the firm. The server verifies eligibility when you approve.</p>
   <label className="check"><input name="approve" type="checkbox" required/>I approve this exact agreement, shares, and commission rates for the firm.</label>
  </Form>}
 </details>;
}

function Calculation({value,rule}:{value:Row;rule?:Row}){
 return <>
  <p>Collected fees {dollars(value.feeCents)} · expenses {dollars(value.expenseCents)} · tax {dollars(value.taxCents)}</p>
  {value.grossCents!==undefined&&<p>Total receipt {dollars(value.grossCents)}</p>}
  {value.allocations.map((a:Row)=>{const split=rule?.splits.find((s:Row)=>s.kind===a.kind&&s.email===a.email);return <p key={a.kind+':'+a.email}>{label(a.kind)} · {a.email}{split&&<> · {percent(split.shareBps)} share</>} · allocated {dollars(a.cents)} · commission {dollars(a.commissionCents)}{split&&<> ({percent(split.commissionBps)} of share)</>}</p>;})}
  <p>Firm fee remainder {dollars(value.firmCents)}</p>
  <details><summary>Invoice source lines</summary><div className="table-scroll"><table><thead><tr><th>Source and timekeeper</th><th>Kind</th><th>Invoice amount</th><th>Collected</th></tr></thead><tbody>{value.sourceLines.map((line:Row)=><tr key={line.sourceId}><td>{line.sourceId}<br/>{line.timekeeper}</td><td>{line.kind}</td><td>{dollars(line.amountCents)}</td><td>{dollars(line.collectedCents)}</td></tr>)}</tbody></table></div></details>
 </>;
}

function AllocationApproval({matterId,source,rule,run}:{matterId:string;source:Row;rule?:Row;run:Run}){
 const [requestKey]=useState(()=>crypto.randomUUID());
 const preview=source.preview;
 return <div className="review"><h3>Review collected allocation</h3>
  <p>Rule {rule?('version '+rule.version+' · '+rule.reference):preview.ruleId}</p>
  <Calculation value={preview} rule={rule}/>
  <Form label="Approve collected allocation" submit={b=>run(async()=>{
   if(b.approve!=='on')throw new Error('Review and approve the exact collected allocation.');
   await api('/matters/'+matterId+'/revenue/allocations',{requestKey,sourceKey:source.key,ruleId:preview.ruleId,reviewDigest:preview.reviewDigest,approve:true});
  },'Collected revenue allocation approved')}>
   <label className="check"><input type="checkbox" name="approve" required/>I approve these exact collected fees, attorney shares, commissions, and firm remainder.</label>
  </Form>
 </div>;
}

function ReceiptDetails({receiptId,billId,tick,run}:{receiptId:string;billId:string;tick:number;run:Run}){
 const [open,setOpen]=useState(false),[receipt,setReceipt]=useState<Row>(),[requestKey,setRequestKey]=useState(()=>crypto.randomUUID());
 useEffect(()=>{let active=true;if(open)api('/offline-payments/'+encodeURIComponent(receiptId)).then(r=>{if(active)setReceipt(r);}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;};},[receiptId,tick,open]);
 const canCredit=receipt?.allocations.some((a:Row)=>a.bill_id===billId&&!a.release_action_id),canReturn=receipt&&['check','ach'].includes(receipt.method);
 return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary>Receipt details, return, or move to credit</summary>
  {!receipt?<p>Loading receipt…</p>:<>
   <p>{receipt.payer} · {receipt.method} · {receipt.reference} · {dollars(receipt.cents)} · {receipt.status}</p>
   <p>Received {receipt.received_date} · deposited {receipt.deposit_date} · operating account {receipt.operating_account_id}</p>
   <p>Unapplied credit {dollars(receipt.creditCents)}</p>
   <details><summary>Latest receipt record</summary><pre>{JSON.stringify(receipt,null,2)}</pre></details>
   {receipt.status!=='bounced'&&(canCredit||canReturn)&&<Form label="Record receipt correction" submit={b=>run(async()=>{
    const saved=await api('/offline-payments/'+encodeURIComponent(receiptId)+'/actions',{requestKey,kind:b.kind,reason:b.reason,billId});
    setReceipt(saved);setRequestKey(crypto.randomUUID());
   },'Receipt correction recorded; collected revenue refreshed')}>
    <Field label="Receipt correction" name="kind"><select name="kind" aria-label="Receipt correction">{canCredit&&<option value="credit">Move this invoice’s receipt allocation to client credit</option>}{canReturn&&<option value="bounce">Record returned or bounced receipt</option>}</select></Field>
    <Field label="Receipt correction reason" name="reason"/>
    <p>Moving to credit releases this invoice’s allocation. A return releases all invoice allocations from this receipt. Related revenue reversals remain in the history.</p>
   </Form>}
  </>}
 </details>;
}

function OperatingReceipt({state,run,tick}:{state:Row;run:Run;tick:number}){
 const [requestKey,setRequestKey]=useState(()=>crypto.randomUUID()),[latest,setLatest]=useState<{id:string;billId:string}>();
 const bills=state.bills.filter((b:Row)=>b.dueCents>0);
 return <details><summary>Record operating receipt</summary>
  <p>Record money already received in an operating account and apply an exact amount to one live invoice. Any excess remains client credit.</p>
  {!bills.length?<p>No live invoice has an unpaid balance.</p>:!state.accounts.length?<p>Create an operating bank register in Trust before recording a receipt.</p>:<Form key={requestKey} label="Record operating receipt" submit={b=>run(async()=>{
   const cents=Number(b.cents),allocationCents=Number(b.allocationCents);
   if(!Number.isSafeInteger(cents)||cents<=0||!Number.isSafeInteger(allocationCents)||allocationCents<=0||allocationCents>cents)throw new Error('Enter positive whole USD cents; the invoice allocation cannot exceed the receipt.');
   const saved=await api('/offline-payments',{purpose:'operating',requestKey,payer:state.client,method:b.method,reference:b.reference,receivedDate:b.receivedDate,depositDate:b.depositDate,operatingAccountId:b.operatingAccountId,cents,allocations:[{billId:b.billId,cents:allocationCents}]});
   setLatest({id:saved.id,billId:b.billId});setRequestKey(crypto.randomUUID());
  },'Operating receipt recorded')}>
   <p>Payer: {state.client}</p>
   <Field label="Receipt invoice" name="billId"><select name="billId" aria-label="Receipt invoice" required>{bills.map((b:Row)=><option key={b.id} value={b.id}>{b.title} · {dollars(b.dueCents)} due</option>)}</select></Field>
   <div className="inline"><Field label="Received amount (USD cents)" name="cents" type="number"/><Field label="Apply to invoice (USD cents)" name="allocationCents" type="number"/></div>
   <Field label="Payment method" name="method"><select name="method" aria-label="Payment method"><option value="check">Check</option><option value="ach">ACH</option><option value="wire">Wire</option><option value="cash">Cash</option></select></Field>
   <Field label="Check, wire, or receipt reference" name="reference"/>
   <div className="inline"><Field label="Received date" name="receivedDate" type="date" value={today()}/><Field label="Deposit date" name="depositDate" type="date" value={today()}/></div>
   <Field label="Operating deposit account" name="operatingAccountId"><select name="operatingAccountId" aria-label="Operating deposit account" required>{state.accounts.map((a:Row)=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
  </Form>}
  {latest&&<ReceiptDetails key={latest.id} receiptId={latest.id} billId={latest.billId} tick={tick} run={run}/>}
 </details>;
}

function CollectedSources({matterId,state,run,tick}:{matterId:string;state:Row;run:Run;tick:number}){
 return <><h3>Collected receipts</h3>{!state.sources.length&&<p>No collected receipts for this matter yet.</p>}{state.sources.map((source:Row)=><article className="record" key={source.key} aria-label={'Collected receipt '+source.reference}>
  <strong>{source.reference} · {dollars(source.netCents)} net collected</strong>
  <p>{source.kind} · {source.at} · invoice {state.bills.find((b:Row)=>b.id===source.billId)?.title??source.billId}</p>
  <p>Original receipt {dollars(source.cents)}</p>
  {source.reversals.map((r:Row)=><p key={r.id}>Reversed {dollars(r.cents)} · {r.at} · {r.id}</p>)}
  {source.allocationId?<p>Allocation approved; current amounts and reversals appear in allocation history.</p>:source.preview?<AllocationApproval key={source.preview.reviewDigest} matterId={matterId} source={source} rule={state.rules.find((r:Row)=>r.id===source.preview.ruleId)} run={run}/>:<p>{source.blockedReason??(state.current?'No collected amount available for allocation.':'Approve an allocation rule to review this receipt.')}</p>}
  {source.kind==='offline'&&source.receiptId&&<ReceiptDetails receiptId={source.receiptId} billId={source.billId} tick={tick} run={run}/>}
 </article>)}</>;
}

function AllocationHistory({state}:{state:Row}){
 return <details><summary>Allocation history and reversals ({state.allocations.length})</summary>{!state.allocations.length&&<p>No revenue allocations have been approved.</p>}{state.allocations.map((a:Row)=>{const rule=state.rules.find((r:Row)=>r.id===a.ruleId),source=state.sources.find((s:Row)=>s.key===a.sourceKey),bill=state.bills.find((b:Row)=>b.id===a.billId);return <article className="record" key={a.id}>
  <strong>{source?.reference??'Retained collection'} · {bill?.title??'Retained invoice'} · rule version {rule?.version}</strong><details><summary>Source and approval references</summary><p>Allocation {a.id} · source {a.sourceKey} · invoice {a.billId} · rule {a.ruleId}</p></details>
  <p>Approved by {a.approvedBy} · {a.approvedAt}</p>
  <h3>Current collected allocation</h3><Calculation value={a.current} rule={rule}/>
  <details><summary>Original approved allocation</summary><Calculation value={a.original} rule={rule}/></details>
  {a.reversals.map((r:Row)=><details key={r.id}><summary>Reversal {r.id} · {dollars(r.cents)}</summary><Calculation value={r.calculation} rule={rule}/></details>)}
 </article>;})}</details>;
}

export function Revenue({matterId,actor,run,tick}:Props){
 const [loaded,setLoaded]=useState<{matterId:string;state:Row;documents:Row[]}>();
 useEffect(()=>{let active=true;if(matterId&&actor.role==='owner')Promise.all([api('/matters/'+matterId+'/revenue'),api('/matters/'+matterId+'/documents')]).then(([state,documents])=>{if(active)setLoaded({matterId,state,documents:documents.filter((d:Row)=>!d.erasedAt)});}).catch(e=>{if(active)void run(async()=>{throw e;});});return()=>{active=false;};},[matterId,actor.role,tick]);
 if(actor.role!=='owner'||!matterId)return null;
 if(!loaded||loaded.matterId!==matterId)return <section className="panel"><h2>Collected revenue & commissions</h2><p>Loading collected revenue…</p></section>;
 const {state,documents}=loaded;
 return <section className="panel" aria-label="Collected revenue and commissions">
  <h2>Collected revenue & commissions</h2>
  <p>Collected {dollars(state.totals.collectedCents)} · allocated fees {dollars(state.totals.allocatedFeeCents)} · commissions {dollars(state.totals.commissionCents)}</p>
  {state.formula&&<details><summary>How collected revenue is calculated</summary><p>{state.formula}</p></details>}
  <OperatingReceipt key={matterId} state={state} run={run} tick={tick}/>
  <details><summary>Firm-approved allocation agreement</summary>
   {state.current?<RuleRecord rule={state.current}/>:<p>No firm-approved revenue allocation rule for this matter.</p>}
   <RuleApproval key={matterId+':'+(state.current?.id??'new')} matterId={matterId} current={state.current} documents={documents} run={run}/>
   <details><summary>Previous agreement versions</summary>{state.rules.filter((r:Row)=>r.id!==state.current?.id).map((r:Row)=><RuleRecord key={r.id} rule={r}/>)}</details>
  </details>
  <CollectedSources matterId={matterId} state={state} run={run} tick={tick}/>
  <AllocationHistory state={state}/>
 </section>;
}
