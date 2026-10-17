import { Actions } from '../../shell/Actions'
import { discoveryDue, invoice2041, invoice2041Total, matter, usd } from '../matter'
import { Icon, Painting, Tick } from '../parts'

/** The four moments on the white matter line across the desk. */
const MOMENTS: { icon: string; first: string; second: string; done?: boolean }[] = [
  { icon: 'doc', first: `Intake · ${matter.title}`, second: 'conflict check clear', done: true },
  { icon: 'calendar', first: 'Discovery due', second: discoveryDue },
  { icon: 'sync', first: 'Court date moved →', second: 'deadlines recalculated · client notified', done: true },
  { icon: 'invoice', first: `Invoice ${invoice2041.number}`, second: `paid online · ${usd(invoice2041Total, true)}` },
]

/** The golden-hour office, the promise and the action, with one matter's day on the line across the desk. */
export function Hero() {
  return <section className="hero" aria-labelledby="hero-title">
    <Painting className="hero-art" name="hero" widths={[768, 1152, 1536]} sizes="(max-width: 1079px) 1400px, 100vw" eager />
    <div className="hero-copy">
      <h1 id="hero-title">Every matter,<br /> under control.</h1>
      <p className="hero-sub">Satchel runs your firm’s intake, matters, deadlines and documents, tracks your time, and keeps billing and trust accounts in order.</p>
      <p className="hero-alt">100% free, open source alternative to <strong>Clio</strong>, <strong>MyCase</strong> and <strong>Smokeball</strong></p>
      <Actions />
    </div>
    <ol className="matter-line" aria-label={`${matter.title}, from intake to a paid invoice`}>
      {MOMENTS.map(moment => <li key={moment.first} className="moment">
        <span className="moment-card"><Icon name={moment.icon} /><span className="moment-text"><span>{moment.first}</span><span>{moment.second}</span></span>{moment.done && <Tick />}</span>
      </li>)}
    </ol>
  </section>
}
