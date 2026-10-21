import {api,dollars,Empty,Field,Form,type Row,type Run} from './common';

function RuleDetails({rule}:{rule:Row}){
 return <><p>{rule.state} · {rule.jurisdiction}<br/><small>Rule {rule.id} · reviewed by {rule.reviewedBy} · {rule.reviewedAt}</small></p>
  <p>Review reference: {rule.reference} · Per-line rounding: {rule.rounding}</p><p>Tax draw from trust: {rule.trust?.eligibility??'not reviewed'}{rule.trust&&<> · {rule.trust.reference}</>}</p>{rule.ledesMapping&&<p>Client-reviewed tax mapping: {rule.ledesMapping.client} · {rule.ledesMapping.clientLedesId} · 1998B {rule.ledesMapping.expenseCode} · XML {rule.ledesMapping.taxType} / {rule.ledesMapping.taxIdNumber}<br/><small>{rule.ledesMapping.reference}</small></p>}
  {['service','expense'].map(kind=><p key={kind}>{kind==='service'?'Services':'Expenses'}: {rule[kind].eligibility} · {rule[kind].ratePpm} parts per million<br/><small>Treatment reference: {rule[kind].reference}</small></p>)}</>;
}

function TreatmentFields({kind}:{kind:'service'|'expense'}){
 const label=kind==='service'?'Services':'Expenses';
 return <fieldset><legend>{label}</legend>
  <Field label={label+' reviewed treatment'} name={kind+'Eligibility'}><select name={kind+'Eligibility'} aria-label={label+' reviewed treatment'} required defaultValue=""><option value="" disabled>Select reviewed treatment</option><option value="taxable">Taxable</option><option value="exempt">Exempt</option></select></Field>
  <Field label={label+' rate (exact parts per million)'} name={kind+'RatePpm'}><input name={kind+'RatePpm'} type="number" min="0" max="1000000" step="1" required/></Field>
  <Field label={label+' treatment or exemption reference'} name={kind+'Reference'}/>
 </fieldset>;
}

export function TaxRules({matterId,actor,run,rules}:{matterId:string;actor:Row;run:Run;rules:Row[]}){
 if(!matterId)return null;
 return <section className="panel"><h2>Reviewed tax rules</h2><p>Save the exact jurisdiction and treatment reviewed by counsel or an accountant. Each saved rule is immutable. A new review creates a separate rule.</p>
  {rules.length?rules.map(rule=><details key={rule.id}><summary>{rule.jurisdiction} · {rule.reviewedBy} · {rule.reviewedAt}</summary><RuleDetails rule={rule}/></details>):<Empty>No reviewed tax rules saved for this matter.</Empty>}
  {['owner','lawyer'].includes(actor.role)&&<details><summary>Save a reviewed tax rule</summary><Form label="Save reviewed tax rule" submit={data=>run(()=>api('/matters/'+matterId+'/tax-rules',{
   trust:data.taxTrustEligibility?{eligibility:data.taxTrustEligibility,reference:data.taxTrustReference}:undefined,ledesMapping:data.taxClientId?{clientLedesId:data.taxClientId,expenseCode:data.taxExpenseCode,taxIdNumber:data.taxIdNumber,taxType:data.taxType,reference:data.taxMappingReference}:undefined,
   state:data.state,jurisdiction:data.jurisdiction,reference:data.reference,rounding:data.rounding,reviewed:data.reviewed==='yes',
   service:{eligibility:data.serviceEligibility,ratePpm:Number(data.serviceRatePpm),reference:data.serviceReference},
   expense:{eligibility:data.expenseEligibility,ratePpm:Number(data.expenseRatePpm),reference:data.expenseReference},
  }),'Immutable reviewed tax rule saved')}>
   <Field label="Reviewed US state or DC (two-letter code)" name="state"><input name="state" required minLength={2} maxLength={2} pattern="[A-Za-z]{2}"/></Field>
   <Field label="Reviewed jurisdiction including locality" name="jurisdiction"/>
   <Field label="Counsel/accountant review reference" name="reference"/>
   <TreatmentFields kind="service"/><TreatmentFields kind="expense"/>
   <small>Enter rates as exact integer parts per million: 7.25% = 72500. An exempt treatment requires an explicit zero rate.</small>
   <Field label="Reviewed per-line rounding" name="rounding"><select name="rounding" aria-label="Reviewed per-line rounding" required defaultValue=""><option value="" disabled>Select reviewed rounding</option><option value="half_up">Half up</option><option value="half_even">Half even</option><option value="down">Down</option></select></Field>
   <fieldset><legend>Tax draw-down eligibility</legend><p>Unreviewed or prohibited treatment blocks tax-reviewed trust applications. Each application also needs an explicit earned-base and tax allocation.</p><Field label="Reviewed tax trust eligibility" name="taxTrustEligibility" required={false}><select name="taxTrustEligibility" defaultValue=""><option value="">Not reviewed</option><option value="permitted">Permitted by reviewed authority</option><option value="prohibited">Prohibited</option></select></Field><Field label="Tax trust eligibility reference" name="taxTrustReference" required={false}/></fieldset>
   <fieldset><legend>Client-reviewed LEDES tax mapping</legend><p>For LEDES clients, record their exact client ID, approved 1998B tax expense code and XML tax identity. Blank mapping blocks tax-reviewed LEDES approval.</p><Field label="Tax mapping LEDES client ID" name="taxClientId" required={false}/><Field label="1998B tax expense code" name="taxExpenseCode" required={false}/><Field label="XML tax registration or reference" name="taxIdNumber" required={false}/><Field label="XML tax type" name="taxType" required={false}/><Field label="Client tax mapping review reference" name="taxMappingReference" required={false}/></fieldset>
   <label><input type="checkbox" name="reviewed" value="yes" required/> I confirm counsel or an accountant reviewed this exact jurisdiction, service and expense treatment, rates, references and per-line rounding.</label>
  </Form></details>}
 </section>;
}

export function TaxCalculation({bill,rules,run,pinnedRule}:{bill:Row;rules:Row[];run:Run;pinnedRule?:Row|null}){
 if(bill.status!=='draft')return null;
 const correction=!!bill.correctsBillId;
 return <details><summary>Review exact tax calculation</summary>
  {correction&&<><p>This correction uses the original bill's immutable reviewed tax rule.</p>{pinnedRule?<RuleDetails rule={pinnedRule}/>:<p>The original reviewed tax rule is unavailable. Calculation requires its original review.</p>}</>}
  {(!correction||pinnedRule)&&<Form label="Calculate tax for this revision" submit={data=>run(()=>api('/bills/'+bill.id+'/tax-reviews',{revision:bill.revision,...(correction?{}:{ruleId:data.ruleId})}),'Tax calculation saved for this exact bill revision')}>
   {!correction&&<Field label="Immutable reviewed tax rule" name="ruleId"><select name="ruleId" aria-label="Immutable reviewed tax rule" required defaultValue=""><option value="" disabled>Select an exact reviewed rule</option>{rules.map(rule=><option key={rule.id} value={rule.id}>{rule.jurisdiction} · {rule.reviewedBy} · {rule.reviewedAt} · {rule.id}</option>)}</select></Field>}
  </Form>}
  {!correction&&!rules.length&&<p>Save an explicit reviewed tax rule for this matter before calculating.</p>}
  {(bill.taxReviews??[]).map((review:Row)=><details key={review.id}><summary>{dollars(review.snapshot.taxCents)} tax · {dollars(review.snapshot.totalCents)} total · revision {review.billRevision}{review.billRevision!==bill.revision?' · prior revision':''}</summary>
   <p>{review.snapshot.label}<br/><small>{review.snapshot.provider} · Review {review.id} · {review.createdBy} · {review.createdAt}</small></p>
   <RuleDetails rule={review.snapshot.rule}/>
   <p>{review.snapshot.rounding} · Before tax: {dollars(review.snapshot.subtotalCents)} · Tax: {dollars(review.snapshot.taxCents)} · Total: {dollars(review.snapshot.totalCents)}</p>
   <div className="table-scroll"><table style={{minWidth:768}}><thead><tr><th>Source</th><th>Tax base (USD)</th><th>Treatment</th><th>Tax (USD)</th><th>Total (USD)</th></tr></thead><tbody>{review.snapshot.lines.map((line:Row,index:number)=><tr key={index}>
    <td>{line.sourceId} · revision {line.sourceRevision}<br/><small>{line.kind}</small></td><td>{dollars(line.baseCents)}{line.priorBaseCents!==undefined&&<small> · {dollars(line.priorBaseCents)} → {dollars(line.correctedBaseCents)}</small>}</td><td>{line.eligibility} · {line.ratePpm} parts per million<br/><small>{line.reference}</small></td><td>{dollars(line.taxCents)}{line.priorTaxCents!==undefined&&<small> · {dollars(line.priorTaxCents)} → {dollars(line.correctedTaxCents)}</small>}</td><td>{dollars(line.baseCents+line.taxCents)}</td>
   </tr>)}</tbody></table></div>
  </details>)}
 </details>;
}
