import { Actions } from '../../shell/Actions'
import { SiteFooter } from '../../shell/SiteFooter'
import { day, dayHours } from '../matter'
import { Icon, Painting, Tick } from '../parts'

/** The same office after dark, the satchel gone home: the closing promise, the action and the footer. */
export function Closing() {
  return <>
    <section className="closing" aria-labelledby="closing-title">
      <Painting className="closing-art" name="closing" widths={[768, 1152, 1536]} sizes="100vw" variant={{ name: 'closing-phone', widths: [480, 700], media: '(max-width: 760px)', sizes: '100vw' }} />
      <div className="closing-copy">
        <h2 id="closing-title">Go home on time.</h2>
        <Actions demo={false} />
        <p className="closing-small">Free and open source, MIT licensed.</p>
      </div>
      <div className="matter-line closing-line"><p className="moment"><span className="moment-card"><Icon name="moon" /><span className="moment-text"><span>{day.date} · {dayHours} h posted</span><span>0 deadlines open tonight</span></span><Tick /></span></p></div>
    </section>
    <SiteFooter />
  </>
}
