import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import { docsPath } from '../shell/links'
import { Tab } from '../landing/parts'
import { docsLead, docsSections } from './source'
import '../styles/site.css'
import '../styles/landing.css'
import '../styles/cards.css'
import '../styles/docs.css'

/** The docs home: a binder of guides, each section a tab with its pages as white cards. */
export function DocsIndex() {
  return <>
    <SiteHeader current="docs" />
    <main id="main" className="docs-page"><div className="docs-wrap docs-home">
      <header className="docs-home-head"><h1>Docs</h1><p className="docs-summary">{docsLead}</p></header>
      {docsSections.map((section, index) => <section key={section.title} className="docs-home-section" aria-labelledby={`docs-section-${index}`}>
        <Tab n={index + 1} name={section.title} />
        <h2 id={`docs-section-${index}`} className="sr-only">{section.title}</h2>
        <ul className="docs-cards">{section.pages.map(page => <li key={page.slug}><a className="card docs-card" href={docsPath(page.slug)}><span className="docs-card-title">{page.title}</span><span className="docs-card-summary">{page.summary}</span><span className="docs-card-arrow" aria-hidden="true">→</span></a></li>)}</ul>
      </section>)}
    </div></main>
    <SiteFooter />
  </>
}
