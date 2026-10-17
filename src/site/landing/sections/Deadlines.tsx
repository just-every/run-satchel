import { deadlines, discoveryDue, firm, matter, trial } from '../matter'
import { Check, Icon, Tab } from '../parts'

/** TAB 2: one new trial date moves every deadline, syncs every calendar and tells the client. */
export function Deadlines() {
  return <section id="deadlines" className="band band-paper deadlines" aria-labelledby="deadlines-title">
    <div className="sheet">
      <Tab n={2} name="Deadlines" />
      <div className="deadlines-head">
        <h2 id="deadlines-title">The court moves. Your calendar follows.</h2>
        <p className="lead-body">Enter the new trial date once. Satchel recalculates every deadline, syncs every calendar and tells the client.</p>
      </div>
      <div className="card docket">
        <h3>{matter.title} · {matter.court}</h3>
        <p className="docket-number">{matter.number}</p>
        <p className="moved"><Icon name="calendar" />Trial setting moved · {trial.was} → {trial.now}</p>
        <table>
          <thead><tr><th scope="col">Deadline</th><th scope="col">Was</th><th scope="col">Now</th><th scope="col">Rule</th></tr></thead>
          <tbody>{deadlines.map(([name, was, now, rule]) => <tr key={name}><th scope="row">{name}</th><td className="was"><s>{was}</s></td><td className="now">{now}</td><td className="rule">{rule}</td></tr>)}</tbody>
        </table>
        <ul className="synced">
          <li><Check />Google Calendar · 3 people synced</li>
          <li><Check />Outlook · synced</li>
          <li><Check />Client notified in portal</li>
        </ul>
      </div>
      <p className="card reminder"><Icon name="bell" /><span>Discovery responses due {discoveryDue} ·<br /> reminder to {firm.associate} 7 days before.</span></p>
    </div>
  </section>
}
