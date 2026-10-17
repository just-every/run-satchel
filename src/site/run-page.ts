// Satchel's touches on Base's shared Run page (src/base/run-site.ts, copied unchanged): the petrol rail and a
// walnut binder tab from the homepage, a strip of the golden-hour office as the page's floor art (styles in
// public/site/run.css), and an install line that never breaks before `sh`.
import { installRer } from '../base/run-site'

const PLATE = [768, 1152, 1536]
const plateSet = (ext: string) => PLATE.map(w => `/site/hero-${w}.${ext} ${w}w`).join(', ')
const FLOOR = `<div class="art satchel-plate" aria-hidden="true"><picture><source type="image/avif" srcset="${plateSet('avif')}" sizes="100vw"><img src="/site/hero-1536.webp" srcset="${plateSet('webp')}" sizes="100vw" alt="" loading="lazy" decoding="async"></picture></div>`
const TAB = '<p class="satchel-tab"><span>Run · Satchel</span></p>'
const [installHead, installPipe] = [installRer.slice(0, installRer.lastIndexOf(' | ')), installRer.slice(installRer.lastIndexOf(' | ') + 1)]

/** Replace the one occurrence of `from`; Base's markup changing under us stops the build instead of passing quietly. */
function swap(html: string, from: string, to: string) {
  const at = html.indexOf(from)
  if (at < 0 || html.indexOf(from, at + 1) >= 0) throw new Error(`Run page: expected one ${JSON.stringify(from)} in Base's markup.`)
  return html.slice(0, at) + to + html.slice(at + from.length)
}

export function satchelRunPage(html: string) {
  html = swap(html, '</head>', '<link rel="stylesheet" href="/site/run.css"></head>')
  html = swap(html, '<body>', `<body class="satchel-run">${FLOOR}`)
  html = swap(html, '<main><div class="intro">', `<main>${TAB}<div class="intro">`)
  return swap(html, `<code>${installRer}</code>`, `<code>${installHead} <span class="nowrap">${installPipe}</span></code>`)
}
