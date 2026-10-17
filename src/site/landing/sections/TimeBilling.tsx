import { day, dayHours, dayValue, firm, invoice2033, invoice2041, invoice2041Total, matter, usd } from '../matter'
import { Alert, Avatar, Check, Tab } from '../parts'

/** TAB 5 and TAB 6, side by side: the day's time drafted for review, and invoices that get paid. */
export function TimeBilling() {
  return <section id="time" className="band band-paper split" aria-label="Time and billing">
    <div className="sheet split-row">
      <div className="split-half time" aria-labelledby="time-title">
        <div className="lead">
          <Tab n={5} name="Time" />
          <h2 id="time-title">Every hour<br /> found.</h2>
          <p className="lead-body">Satchel drafts time entries from your email, calendar and documents. Review the day and post it.</p>
        </div>
        <div className="card day-card">
          <div className="day-head"><p className="person"><Avatar initials="ML" tone="honey" />{firm.associate} · {day.date}</p><p className="day-total">{dayHours} h</p></div>
          <table>
            <tbody>{day.entries.map(entry => <tr key={entry.text} className={entry.found ? 'found' : undefined}><td className="code">{entry.code}</td><td className="hours">{entry.hours.toFixed(1)}</td><td className="what">{entry.text}</td><td className="source">{entry.source}</td></tr>)}</tbody>
          </table>
          <div className="day-foot"><p>{dayHours} h · {usd(dayValue)}</p><span className="button-drawn">Post day</span></div>
        </div>
      </div>
      <div id="billing" className="split-half billing" aria-labelledby="billing-title">
        <div className="lead">
          <Tab n={6} name="Billing" />
          <h2 id="billing-title">Invoices<br /> that get paid.</h2>
          <p className="lead-body">Hourly, flat fee or contingency, with LEDES for insurers. Clients pay by card or bank transfer from the invoice.</p>
        </div>
        <div className="card invoice inv-paid">
          <h3>Invoice {invoice2041.number} · {matter.client} · {invoice2041.period}</h3>
          <ul>{invoice2041.lines.map(line => <li key={line.text}><span>{line.text}</span><span>{usd(line.cents)}</span></li>)}</ul>
          <p className="invoice-total">{usd(invoice2041Total)}</p>
          <p className="row-note ok big"><Check />{invoice2041.paid}</p>
        </div>
        <div className="card invoice inv-late">
          <h3>Invoice {invoice2033.number} · {invoice2033.client}</h3>
          <p className="row-note bad big"><Alert />{invoice2033.overdue}</p>
          <p className="row-note ok big"><Check />{invoice2033.plan}</p>
        </div>
      </div>
    </div>
  </section>
}
