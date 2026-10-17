import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import { docsPath } from '../shell/links'
import { DocsMenu, DocsSidebar } from './DocsNav'
import { docsNeighbours, getDocsPage, sectionOf } from './source'
import '../styles/site.css'
import '../styles/landing.css'
import '../styles/cards.css'
import '../styles/docs.css'

/** One docs page: the sidebar, the article from Markdown, "On this page", and previous and next. */
export function DocsArticle({ slug }: { slug: string }) {
  const page = getDocsPage(slug)
  if (!page) throw new Error(`No docs page "${slug}"`)
  const { previous, next } = docsNeighbours(slug)
  return <>
    <SiteHeader current="docs" />
    <div className="docs-page"><div className="docs-wrap docs-shell">
      <DocsSidebar current={slug} />
      <main id="main" className="docs-main">
        <DocsMenu current={slug} />
        <article aria-labelledby="docs-title">
          <header className="docs-page-head"><p className="docs-eyebrow">{sectionOf(slug)}</p><h1 id="docs-title">{page.title}</h1><p className="docs-summary">{page.summary}</p></header>
          <div className="docs-prose" dangerouslySetInnerHTML={{ __html: page.html }} />
        </article>
        <nav className="docs-pager" aria-label="Previous and next">
          {previous ? <a className="card docs-pager-link" href={docsPath(previous.slug)} rel="prev"><span>Previous</span>{previous.title}</a> : <span />}
          {next ? <a className="card docs-pager-link is-next" href={docsPath(next.slug)} rel="next"><span>Next</span>{next.title}</a> : <span />}
        </nav>
      </main>
      {page.toc.length > 1 ? <nav className="docs-toc" aria-label="On this page"><p>On this page</p><ul>{page.toc.map(entry => <li key={entry.id}><a href={`#${entry.id}`}>{entry.text}</a></li>)}</ul></nav> : <span />}
    </div></div>
    <SiteFooter />
  </>
}
