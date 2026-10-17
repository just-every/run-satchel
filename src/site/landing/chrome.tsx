import { run } from '../run'
export function Brand(){return <a className="site-brand" href="/"><img src="/brand/mark.svg" alt=""/>Satchel</a>}
export function SiteHeader(){return <header className="site-header"><Brand/><nav aria-label="Main navigation"><a href="/docs">Docs</a><a href="/contract">Contract</a><a href={run.repository}>Source</a></nav></header>}
export function SiteFooter(){return <footer className="site-footer"><Brand/><nav aria-label="Footer"><a href={`${run.repository}/blob/main/LICENSE`}>MIT licence</a><a href={run.repository}>Source</a><a href="/docs">Docs</a></nav></footer>}
export function Actions(){return <div className="site-actions"><a className="site-pill" href="/run">Run Satchel <span aria-hidden="true">→</span></a><a className="site-pill" href="https://demo.run-satchel.com/">Try the demo</a><a className="docs-link" href="/docs">Read the docs</a></div>}
