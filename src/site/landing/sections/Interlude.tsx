import { trial } from '../matter'
import { Icon, Painting, Tick } from '../parts'

/** Trial morning: the binder open on the walnut desk at dawn, the satchel packed. */
export function Interlude() {
  return <section className="interlude" aria-labelledby="interlude-title">
    <Painting className="interlude-art" name="interlude" widths={[768, 1152, 1536]} sizes="100vw" variant={{ name: 'interlude-phone', widths: [480, 716], media: '(max-width: 760px)', sizes: '100vw' }} />
    <div className="interlude-copy">
      <h2 id="interlude-title">Walk in ready.</h2>
      <p className="moment-card interlude-card"><Icon name="calendar" /><span className="moment-text"><span>Trial · {trial.day} · {trial.time} · {trial.room}</span><span className="good">5 of 5 deadlines met · 14 exhibits filed</span></span><Tick /></p>
    </div>
  </section>
}
