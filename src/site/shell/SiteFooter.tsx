import { Brand } from './Brand'
import { links } from './links'

/** The petrol footer: the lockup with the mark on a cream tile, then Docs, Source and the license. */
export function SiteFooter() {
  return <footer className="site-footer">
    <div className="site-wrap site-footer-row">
      <Brand tone="light" tile />
      <nav aria-label="Footer"><a href={links.docs}>Docs</a><a href={links.source}>Source</a><a href={links.licence}>MIT licensed</a></nav>
    </div>
  </footer>
}
