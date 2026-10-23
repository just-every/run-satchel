// The published docs: the repo's Markdown, rendered to static HTML when the site builds. Links between the Markdown
// files become /docs links; other relative links go to the file on GitHub. Code blocks become the petrol code card.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { marked, Renderer } from 'marked'
import { run } from '../run'

export type DocsPage = { slug: string; title: string; summary: string; source: string; html: string; toc: { id: string; text: string }[] }
type Section = { title: string; pages: [slug: string, title: string, summary: string, source: string][] }

const SECTIONS: Section[] = [
  { title: 'Start here', pages: [
    ['getting-started', 'Get started', 'Start Satchel on your computer and work one matter through to its first bill.', 'docs/getting-started.md'],
  ] },
  { title: 'Run your practice', pages: [
    ['matters', 'Matters and conflict review', 'Search the firm’s records, record your conclusion and open a reviewed matter.', 'docs/matters.md'],
    ['time-and-bills', 'Time and bills', 'Record work in USD, review a bill’s exact lines and export it.', 'docs/time-and-bills.md'],
    ['documents-and-deadlines', 'Documents and deadlines', 'Keep original versions and record deadlines a lawyer confirms.', 'docs/documents-and-deadlines.md'],
    ['team-and-preparations', 'Team and preparations', 'Invite lawyers and assistants, grant matters and review agent preparations.', 'docs/team-and-preparations.md'],
  ] },
  { title: 'Move in and keep it safe', pages: [
    ['move-in', 'Move in from Clio', 'Preview, commit and undo a Clio contacts import.', 'docs/move-in.md'],
    ['client-portal', 'Client portal, timeline and summaries', 'Share exact records with clients, keep their messages, search the firm and schedule report summaries.', 'docs/client-portal.md'],
    ['free-and-providers', 'Free software and provider charges', 'Satchel is free and MIT licensed; the providers you connect bill your firm directly.', 'docs/free-and-providers.md'],
    ['backup-and-restore', 'Backup and restore', 'Download the firm archive and restore it into a new installation.', 'docs/backup-and-restore.md'],
  ] },
  { title: 'Reference', pages: [
    ['importing', 'Import format', 'The CSV columns, limits, journal, resume and undo.', 'IMPORTING.md'],
    ['api', 'API', 'Agent keys, preparation routes and the decisions people record.', 'API.md'],
    ['operations', 'Install and operate', 'Owner installation, deployment to your Cloudflare account and operations.', 'README.md'],
  ] },
]

const slugs = new Map(SECTIONS.flatMap(section => section.pages.map(([slug, , , source]) => [source, slug] as const)))
const blob = (path: string) => `${run.repository}/blob/main/${path.replace(/^(\.\.\/|\.\/)+/, '')}`
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const plain = (html: string) => { let out = html, prev; do { prev = out; out = out.replace(/<[^>]*>/g, '') } while (out !== prev); return out.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"') }

function render(markdown: string, from: string) {
  const toc: { id: string; text: string }[] = []
  const used = new Map<string, number>()
  const renderer = new Renderer()
  renderer.link = function (token) {
    const [file, hash] = token.href.split('#')
    let href = token.href
    if (file && !/^(?:[a-z]+:|\/)/i.test(file)) {
      const base = from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : ''
      const target = new URL(file, `https://x/${base}`).pathname.slice(1)
      const slug = slugs.get(target)
      href = slug ? `/docs/${slug}${hash ? `#${hash}` : ''}` : blob(target) + (hash ? `#${hash}` : '')
    }
    return `<a href="${escape(href)}">${this.parser.parseInline(token.tokens)}</a>`
  }
  renderer.heading = function (token) {
    const inner = this.parser.parseInline(token.tokens)
    if (token.depth === 1) return ''
    const text = plain(inner)
    const base = text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-')
    const n = used.get(base) ?? 0; used.set(base, n + 1)
    const id = n ? `${base}-${n}` : base
    if (token.depth === 2) toc.push({ id, text })
    return `<h${token.depth} id="${id}">${inner}</h${token.depth}>`
  }
  renderer.code = function (token) {
    const label = { sh: 'Shell', bash: 'Shell', shell: 'Shell', json: 'JSON', http: 'HTTP', csv: 'CSV' }[token.lang ?? ''] ?? (token.lang ? token.lang.toUpperCase() : 'Text')
    return `<div class="docs-code"><div class="docs-code-bar"><span>${escape(label)}</span><button class="docs-copy" type="button" hidden>Copy</button></div><pre><code>${escape(token.text)}</code></pre></div>`
  }
  renderer.table = function (token) {
    const head = token.header.map(cell => `<th>${this.parser.parseInline(cell.tokens)}</th>`).join('')
    const rows = token.rows.map(row => `<tr>${row.map(cell => `<td>${this.parser.parseInline(cell.tokens)}</td>`).join('')}</tr>`).join('')
    return `<div class="docs-table" role="region" aria-label="Table" tabindex="0"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`
  }
  // Raw HTML in the Markdown (README's mark) is for GitHub; the site page never passes it through.
  renderer.html = () => ''
  const html = marked.parse(markdown, { renderer, async: false }) as string
  return { html, toc }
}

export const docsSections = SECTIONS.map(section => ({
  title: section.title,
  pages: section.pages.map(([slug, title, summary, source]): DocsPage => ({ slug, title, summary, source, ...render(readFileSync(resolve(source), 'utf8'), source) })),
}))
export const docsPages = docsSections.flatMap(section => section.pages)
export const docsLead = 'Run Satchel on your own computer, open conflict-reviewed matters, bill exact USD work and keep every original.'
export const getDocsPage = (slug: string) => docsPages.find(page => page.slug === slug)
export const sectionOf = (slug: string) => docsSections.find(section => section.pages.some(page => page.slug === slug))!.title
export function docsNeighbours(slug: string) {
  const index = docsPages.findIndex(page => page.slug === slug)
  return { previous: docsPages[index - 1], next: docsPages[index + 1] }
}
