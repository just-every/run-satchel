import { links } from '../../shell/links'
import { clio, usd } from '../matter'
import { Check, Icon, Tab } from '../parts'

const COMMAND = 'npx -y @runeditrun/rer dev just-every/run-satchel'
const COMMENT = '# Run it on your own computer or server.'

/** TAB 9: the Clio import with real counts, the one line that starts Satchel, and what it doesn't do. */
export function MovingIn() {
  const rows: [string, boolean][] = [
    [`Matters · ${clio.matters.toLocaleString('en-US')}`, true],
    [`Contacts · ${clio.contacts.toLocaleString('en-US')}`, true],
    [`Documents · ${clio.documents.toLocaleString('en-US')}`, true],
    [`Time entries · ${clio.timeEntries.toLocaleString('en-US')}`, true],
    [`Unbilled time · ${usd(clio.unbilled)}`, true],
    [`Trust balances · ${clio.trustClients} clients · 1 differed by ${usd(clio.trustDiffered)}`, false],
    [`Fixed in Clio and re-imported · ${usd(clio.trustMatched)} matched`, true],
  ]
  return <section id="moving-in" className="band band-paper moving" aria-labelledby="moving-title">
    <div className="sheet">
      <div className="lead">
        <Tab n={9} name="Moving in" />
        <h2 id="moving-title">Bring every matter<br /> over from Clio.</h2>
        <p className="lead-body">Matters, contacts, documents, time and trust balances come across.<br /> Trust must match to the cent before you switch.</p>
      </div>
      <div className="moving-grid">
        <div className="card import">
          <h3>Importing from Clio</h3>
          <p className="progress"><span>100%</span></p>
          <ul>{rows.map(([text, ok]) => <li key={text}>{ok ? <Check /> : <Icon name="warn" className="warn-solid" />}<span>{text}</span></li>)}</ul>
        </div>
        <div className="terminal" role="img" aria-label={`One command: ${COMMAND}. Run it on your own computer or server.`}>
          <div className="terminal-bar" aria-hidden="true"><span /><span /><span /></div>
          <pre aria-hidden="true"><span><span className="prompt">$</span> {COMMAND}</span><span className="comment">{COMMENT}</span></pre>
        </div>
        <div className="card limits">
          <h3><span className="info" aria-hidden="true">i</span>What it doesn’t do.</h3>
          <p>Court e-filing goes through InfoTrack; court-rule deadlines come from LawToolBox or CalendarRules.</p>
          <p>Word and Gmail stay your editors; lawyers make every legal call.</p>
          <a href={links.contract}>Read the limits</a>
        </div>
      </div>
    </div>
  </section>
}
