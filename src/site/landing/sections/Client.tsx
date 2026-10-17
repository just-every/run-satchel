import { firm, matter, mediation, trial } from '../matter'
import { Avatar, Icon, Tab } from '../parts'

/** TAB 8: the client portal, a text thread and a full email, so clients see their case without calling. */
export function Client() {
  return <section id="client" className="band band-client client" aria-labelledby="client-title">
    <div className="sheet">
      <Tab n={8} name="Client" />
      <div className="client-head">
        <h2 id="client-title">Clients see their case without calling.</h2>
        <p className="lead-body">A secure portal for documents and messages, plus text and email for the moments that matter.</p>
      </div>
      <div className="client-surfaces">
        <div className="card portal">
          <p className="portal-firm">{firm.name} · Client portal</p>
          <h3>{matter.client}</h3>
          <p className="next"><Icon name="calendar" />Next: Mediation · {mediation.date}</p>
          <p className="new-docs"><Icon name="doc" /><span>2 new documents · Foreman deposition transcript · Mediation statement</span><Icon name="chevron" className="chev" /></p>
          <div className="thread">
            <p className="msg in"><Avatar initials="AM" tone="peach" /><span>Do I need to bring anything?</span></p>
            <p className="msg out"><span>Just your photo ID. We have the rest.</span><Avatar initials="RD" tone="peach" /></p>
          </div>
        </div>
        <div className="phone" aria-label="Text message thread">
          <span className="phone-notch" aria-hidden="true" />
          <p className="sms in">Reminder: mediation {mediation.day}, {mediation.time}, {mediation.place}. Reply C to confirm.</p>
          <p className="sms out">C</p>
          <p className="sms-ok"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" /><path d="m7.2 12.4 3.2 3.2 6.4-6.8" /></svg>Confirmed</p>
          <p className="phone-input" aria-hidden="true"><span /><Icon name="send" /></p>
        </div>
        <div className="card email">
          <div className="email-head"><Avatar initials="RD" tone="chestnut" /><div><p>From: {firm.paralegal} · {firm.name}</p><p className="to">To: {matter.client}</p></div></div>
          <h3>Your trial date has moved</h3>
          <p className="email-body">Trial is now {trial.now.replace('Mar', 'March')}.<br /> Your new dates are in the portal.</p>
          <span className="button-drawn wide">View in portal</span>
        </div>
      </div>
    </div>
  </section>
}
