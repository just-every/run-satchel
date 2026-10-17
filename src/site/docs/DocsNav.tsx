import { docsPath, links } from '../shell/links'
import { docsSections } from './source'

function NavList({ current, prefix }: { current?: string; prefix: string }) {
  return <>{docsSections.map((section, index) => <div className="docs-nav-group" key={section.title}>
    <p className="docs-nav-section" id={`${prefix}-${index}`}>{section.title}</p>
    <ul aria-labelledby={`${prefix}-${index}`}>{section.pages.map(page => <li key={page.slug}><a href={docsPath(page.slug)} aria-current={page.slug === current ? 'page' : undefined}>{page.title}</a></li>)}</ul>
  </div>)}<div className="docs-nav-group"><p className="docs-nav-section" id={`${prefix}-project`}>Project</p><ul aria-labelledby={`${prefix}-project`}><li><a href={links.run}>Run Satchel</a></li><li><a href={links.contract}>Contract</a></li></ul></div></>
}

/** The section navigation beside the page on wide screens. */
export function DocsSidebar({ current }: { current: string }) {
  return <nav className="docs-sidebar" aria-label="Docs"><a className="docs-nav-home" href={links.docs}>All docs</a><NavList current={current} prefix="docs-sidebar" /></nav>
}

/** The same navigation on phones: one button that opens the whole list, without script. */
export function DocsMenu({ current }: { current: string }) {
  return <nav className="docs-menu" aria-label="Docs"><details><summary>All docs</summary><div className="docs-menu-list"><NavList current={current} prefix="docs-menu" /></div></details></nav>
}
