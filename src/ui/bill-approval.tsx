import {api,dollars,Field,Form,type Row,type Run} from './common';
import {TaxCalculation} from './tax-reviews';
import {FeeEarningFields} from './fee-plans';

export function BillApproval({bill:b,actor,run,rules}:{bill:Row;actor:Row;run:Run;rules:Row[]}){
 if(!['owner','lawyer'].includes(actor.role)||b.status!=='draft')return null;
 return <><TaxCalculation bill={b} rules={rules} run={run} pinnedRule={b.snapshot.taxBasis?.rule}/><Form label="Approve exact bill" submit={d=>run(()=>api('/bills/'+b.id+'/approve',{...d,revision:b.revision,earnedConfirmed:d.earnedConfirmed==='yes',milestoneCompleted:d.milestoneCompleted==='yes'}),'Bill approved. The reviewed package is ready to export.')}><FeeEarningFields bill={b}/>{b.taxReviews?.length>0&&<Field label="Reviewed tax calculation" name="taxReviewId" required={false}><select name="taxReviewId" aria-label="Reviewed tax calculation"><option value="">Select the exact reviewed calculation</option>{b.taxReviews.filter((t:Row)=>t.billRevision===b.revision).map((t:Row)=><option key={t.id} value={t.id}>{t.snapshot.rule.jurisdiction} · {dollars(t.snapshot.taxCents)} tax · {dollars(t.snapshot.totalCents)} total · {t.createdBy}</option>)}</select></Field>}<Field label="Review note" name="reviewNote"/></Form><details><summary>Discard draft</summary><Form label="Void draft" submit={d=>run(()=>api('/bills/'+b.id+'/void',{...d,revision:b.revision}),'Draft voided; sources released')}><Field label="Reason" name="reason"/></Form></details></>;
}
