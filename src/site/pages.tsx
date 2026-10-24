// The run site (run-satchel.com) `rer build --site` writes: the homepage with its Run action, /run, the docs from the
// repo's Markdown, /contract from CONTRACT.md, and the not-found page. Every Run page string and command is in run.ts;
// nothing here reads installation data.
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { contractPageHtml } from '../base/contract-page'
import { runPageHtml, siteNotFoundHtml, type SiteBuild, type SiteContext } from '../base/run-site'
import { identity } from '../identity'
import { DocsArticle } from './docs/DocsArticle'
import { DocsIndex } from './docs/DocsIndex'
import { docsLead, docsPages } from './docs/source'
import { Landing } from './landing/Landing'
import { run } from './run'
import { satchelRunPage } from './run-page'

// Code cards get their Copy button only when script runs; without it the command is still there to select.
const COPY = "document.querySelectorAll('.docs-copy').forEach(b=>{b.hidden=false;b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(b.closest('.docs-code').querySelector('code').textContent);b.textContent='Copied';setTimeout(()=>{b.textContent='Copy'},1600)}catch{}})})"
const SHARE_IMAGE = `${identity.runSite}/site/share.jpg`

// Base's shared pages (src/base/run-site.ts, copied unchanged) print British "licence"; Satchel is a US product.
const usSpelling = (html: string) => html.replaceAll(`${run.licence} licence<`, `${run.licence} license<`)
// Base's pages link the mark as their icon; the run site carries the hand-tuned favicons as well.
const icons = (html: string) => html.replace('</head>', '<link rel="icon" href="/favicon.ico" sizes="32x32"><link rel="icon" type="image/svg+xml" href="/brand/favicon-32.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png"></head>')

export function sitePages({ styles, contract }: SiteContext): SiteBuild {
  const document = (title: string, description: string, body: ReactElement, script = '') => '<!doctype html>' + renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="theme-color" content="#0f3b42" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Satchel" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={SHARE_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="icon" href="/favicon.ico" sizes="32x32" />
        <link rel="icon" type="image/svg+xml" href="/brand/favicon-32.svg" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preload" href="/fonts/figtree/figtree-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {identity.fonts ? <link rel="stylesheet" href={identity.fonts} /> : null}
        <link rel="stylesheet" href={identity.theme} />
        {styles.map(href => <link key={href} rel="stylesheet" href={href} />)}
      </head>
      <body>{body}{script ? <script dangerouslySetInnerHTML={{ __html: script }} /> : null}</body>
    </html>,
  )
  return {
    pages: [
      { path: '/', html: document('Satchel · Every matter, under control', identity.tagline, <Landing />) },
      { path: '/run', html: icons(usSpelling(satchelRunPage(runPageHtml(identity, run, contract)))) },
      ...(contract ? [{ path: '/contract', html: icons(contractPageHtml(identity, run, contract)) }] : []),
      { path: '/docs', html: document('Docs · Satchel', docsLead, <DocsIndex />) },
      ...docsPages.map(page => ({ path: `/docs/${page.slug}`, html: document(`${page.title} · Satchel docs`, page.summary, <DocsArticle slug={page.slug} />, COPY) })),
      { path: '/404', html: icons(siteNotFoundHtml(identity, run, contract)) },
    ],
    assets: ['rer-theme.css', 'fonts', 'brand', 'site', 'favicon.ico', 'apple-touch-icon.png'],
  }
}
