import { firm, matter, mediation, usd } from '../matter'
import { Avatar, Check, Icon, Tab } from '../parts'

type Item = { icon: string; text: string; ok: boolean; follow?: { icon: string; text: string; ok?: boolean }[] }
const FILE: Item[] = [
  { icon: 'doc', text: 'Remodel contract · signed Mar 3', ok: true },
  { icon: 'doc', text: 'Change orders · 4 of 4', ok: true },
  { icon: 'doc', text: 'City inspection report · failed framing Jul 9', ok: true },
  { icon: 'image', text: 'Site photos · missing', ok: false, follow: [{ icon: 'chat', text: 'Asked Ana in the portal · Sep 15' }, { icon: 'doc', text: '6 photos uploaded · Sep 16', ok: true }] },
  { icon: 'doc', text: 'Bank records of payments · missing', ok: false, follow: [{ icon: 'chat', text: 'Requested from Ana’s bank with her signed authorization' }, { icon: 'doc', text: `Received Sep 22 · ${usd(matter.atIssue)} matched`, ok: true }] },
]

/** TAB 3 (dark): the matter agent checks the file against the claim, chases what is missing and drafts with sources. */
export function Evidence() {
  return <section id="evidence" className="band band-dark evidence" aria-labelledby="evidence-title">
    <div className="sheet">
      <Tab n={3} name="Evidence" tone="brass" />
      <div className="evidence-head">
        <h2 id="evidence-title">Nothing missing when it counts.</h2>
        <p className="lead-body">The matter agent checks the file against the claim, asks the client for what is missing and drafts with every source cited.</p>
      </div>
      <div className="evidence-cards">
        <div className="card evidence-file">
          <h3>Evidence · {matter.title}</h3>
          <ul>{FILE.map(item => <li key={item.text}>
            <p className="ev-row"><Icon name={item.icon} />{item.ok ? <Check /> : <span className="dot-missing" aria-label="missing" />}<span>{item.text}</span></p>
            {item.follow && <ul className="ev-follow">{item.follow.map(step => <li key={step.text}><Icon name={step.icon} />{step.ok && <Check />}<span>{step.text}</span></li>)}</ul>}
          </li>)}</ul>
        </div>
        <div className="card demand">
          <h3>Settlement demand · draft 2</h3>
          <p className="pill pill-agent">Prepared by the matter agent</p>
          <p className="demand-for">For mediation · {mediation.date}</p>
          <p className="demand-body">Ms. Martinez paid Reed Construction {usd(matter.atIssue)} under the March 3 contract [1]. The city inspector failed the framing on July 9 [2], and work stopped on July 22 [3].</p>
          <ul className="cites"><li><Icon name="doc" />[1] Remodel contract p.4</li><li><Icon name="doc" />[2] Inspection report p.1</li><li><Icon name="doc" />[3] Site photos 3–6</li></ul>
          <div className="demand-foot"><p className="person"><Avatar initials="DO" tone="sand" />{firm.partner}</p><span className="button-drawn">Approve and send</span></div>
        </div>
      </div>
    </div>
  </section>
}
