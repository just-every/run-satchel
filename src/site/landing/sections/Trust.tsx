import { adjustedBank, martinezBalance, trust, usd } from '../matter'
import { Alert, Check, Lead, Painting } from '../parts'

/** TAB 7: the month's three-way reconciliation, a printed sheet clipped into the trial binder on the walnut desk. */
export function Trust() {
  return <section id="trust" className="band band-paper trust" aria-labelledby="trust-title">
    <div className="sheet trust-row">
      <Lead id="trust" n={7} name="Trust" title={<>Trust that<br /> reconciles<br /> to the cent.</>}>Bank statement, trust ledger and every client ledger, matched each month. When they disagree, Satchel shows you why.</Lead>
      <div className="binder">
      <Painting className="binder-art" name="trust" widths={[640, 942]} sizes="(max-width: 760px) 100vw, 62vw" />
      <div className="reco">
        <h3>IOLTA trust · Three-way reconciliation · September 2026</h3>
        <p className="row-note bad"><Alert />Oct 1 · Bank statement {usd(trust.statement)} ≠ trust ledger {usd(trust.ledger)} · off by {usd(trust.statement - trust.ledger)}</p>
        <p className="row-note ok"><Check />{trust.outstanding.check} to {trust.outstanding.payee} not yet cleared · marked outstanding</p>
        <div className="three">
          <div className="box"><p>Adjusted bank balance</p><p className="amount">{usd(adjustedBank)}</p><p className="sub">Statement {usd(trust.statement)} − outstanding {trust.outstanding.check} {usd(trust.outstanding.cents)}</p></div>
          <span className="eq" aria-label="equals">=</span>
          <div className="box"><p>Trust ledger</p><p className="amount">{usd(trust.ledger)}</p></div>
          <span className="eq" aria-label="equals">=</span>
          <div className="box"><p>Client ledgers</p><p className="amount">{usd(trust.clientLedgers)}</p></div>
        </div>
        <p className="row-note ok"><Check />{trust.reconciled}</p>
        <p className="books">Operating books · QuickBooks Online · synced</p>
        <h4>Martinez · client trust ledger</h4>
        <table><tbody>
          {trust.martinez.map(line => <tr key={line.text}><td>{line.date} · {line.text}</td><td>{line.cents > 0 ? '+' : ''}{usd(line.cents)}</td></tr>)}
          <tr className="balance"><th scope="row">Balance</th><td>{usd(martinezBalance)}</td></tr>
        </tbody></table>
      </div>
      </div>
    </div>
  </section>
}
