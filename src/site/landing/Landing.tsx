import { SiteHeader } from '../shell/SiteHeader'
import { Client } from './sections/Client'
import { Closing } from './sections/Closing'
import { Deadlines } from './sections/Deadlines'
import { Documents } from './sections/Documents'
import { Evidence } from './sections/Evidence'
import { Hero } from './sections/Hero'
import { Intake } from './sections/Intake'
import { Interlude } from './sections/Interlude'
import { MovingIn } from './sections/MovingIn'
import { TimeBilling } from './sections/TimeBilling'
import { Trust } from './sections/Trust'
import '../styles/site.css'
import '../styles/landing.css'
import '../styles/cards.css'

/**
 * run-satchel.com's homepage, built from the design desk's approved page (17 Oct 2026) in its order. It follows one
 * matter, Martinez v. Reed, from the first call to the trust reconciliation; each section is a binder tab on the
 * petrol matter line. Painted art: the hero, the trust binder, the interlude and the closing; every product card is HTML.
 */
export function Landing() {
  return <>
    <SiteHeader overArt />
    <main id="main" className="landing">
      <Hero />
      <div className="binder-sections">
        <Intake />
        <Deadlines />
        <Evidence />
      </div>
      <Interlude />
      <div className="binder-sections">
        <Documents />
        <TimeBilling />
        <Trust />
        <Client />
        <MovingIn />
      </div>
      <Closing />
    </main>
  </>
}
