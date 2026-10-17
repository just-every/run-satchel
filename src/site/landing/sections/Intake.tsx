import { intake, matter, rates, usd } from '../matter'
import { Avatar, Check, Icon, Lead } from '../parts'

/** TAB 1: the call becomes an opened matter before lunch: intake, conflicts, engagement and the retainer in trust. */
export function Intake() {
  return <section id="intake" className="band band-paper intake" aria-labelledby="intake-title">
    <div className="sheet">
      <Lead id="intake" n={1} name="Intake" title={<>Open the matter<br /> the day they call.</>}>Intake form, conflict check across every contact, engagement letter signed and the retainer in trust, before lunch.</Lead>
      <ol className="intake-flow" aria-label={`${matter.title}, opened on Sep 8`}>
        <li className="card intake-form">
          <h3><Icon name="doc" />Intake form · web</h3>
          <p className="person"><Avatar initials="AM" tone="clay" />{matter.client}</p>
          <dl><dt>Matter:</dt><dd>Contract dispute · home remodel</dd><dt>Opposing party:</dt><dd>{matter.opposing}</dd><dt>Amount at issue:</dt><dd>{usd(matter.atIssue)}</dd></dl>
          <p className="card-foot">Submitted {intake.submitted}</p>
        </li>
        <li className="stamp s1"><span>9:14 am</span></li>
        <li className="card conflict">
          <h3><Icon name="search" />Conflict check · {intake.contactsSearched.toLocaleString('en-US')} contacts searched</h3>
          <p className="row-note warn"><Icon name="warn" />1 possible match · {intake.match}</p>
          <p className="row-note ok"><Check />{intake.cleared}</p>
        </li>
        <li className="stamp s2"><span>9:41 am</span></li>
        <li className="card engagement">
          <h3><Icon name="doc" />Engagement letter<span className="pill pill-green">Signed 2 of 2</span></h3>
          <p>Hourly · {usd(rates.attorney, true)} attorney · {usd(rates.paralegal, true)} paralegal</p>
        </li>
        <li className="stamp s3"><span>11:52 am</span></li>
        <li className="card trust-in">
          <h3><Icon name="bank" />Trust · IOLTA</h3>
          <p>Retainer deposited · {usd(intake.retainer)} · {intake.retainerAt}</p>
        </li>
        <li className="opened"><Icon name="doc" />Matter opened · {matter.title} · {matter.number}</li>
      </ol>
    </div>
  </section>
}
