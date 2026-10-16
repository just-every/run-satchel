import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { marked, Renderer } from 'marked'
import { SiteHeader,SiteFooter } from '../landing/chrome'
import './docs.css'
const sources=[
 ['getting-started','Get started','Open Satchel and work through your first matter.','docs/getting-started.md'],
 ['matters','Matters and conflict review','Search the firm’s records, open a reviewed matter and grant access.','docs/matters.md'],
 ['time-and-bills','Time and bills','Record work, review exact bill lines and export the CSV.','docs/time-and-bills.md'],
 ['documents-and-deadlines','Documents and deadlines','Keep original versions and record dates a lawyer confirms.','docs/documents-and-deadlines.md'],
 ['move-in','Move in from Clio','Preview, commit and undo a contacts import.','docs/move-in.md'],
 ['backup-and-restore','Backup and restore','Download your firm archive and restore an empty installation.','docs/backup-and-restore.md'],
 ['team-and-preparations','Team and preparations','Invite the firm and review agent preparations.','docs/team-and-preparations.md'],
 ['api','API reference','HTTP commands and recorded human decisions.','API.md'],
 ['importing','Import format reference','CSV columns, journals, resume and undo.','IMPORTING.md'],
 ['operations','Operations','Install, deploy and operate your installation.','README.md'],
]
const slugs = new Map(sources.map(([slug,,,source])=>[source,slug]))
const renderer=new Renderer()
renderer.link=function(token){
 let href=token.href
 const [file,hash]=href.split('#')
 if(file?.endsWith('.md')&&!/^https?:/.test(file)){
  const source=file.replace(/^\.\.\//,'').replace(/^\.\//,'')
  const slug=slugs.get(source)??slugs.get('docs/'+source)
  href=slug?`/docs/${slug}${hash?'#'+hash:''}`:`https://github.com/just-every/run-satchel/blob/main/${source}`
 }else if(file&&!/^(?:[a-z]+:|\/)/i.test(file))href='https://github.com/just-every/run-satchel/blob/main/'+href.replace(/^\.\.\//,'')
 return `<a href="${href.replaceAll('&','&amp;').replaceAll('"','&quot;')}">${this.parser.parseInline(token.tokens)}</a>`
}
function stripTags(text:string){let out=text,prev;do{prev=out;out=out.replace(/<[^>]*>/g,'')}while(out!==prev);return out}
renderer.heading=function(token){const id=stripTags(token.text.toLowerCase()).replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-');return `<h${token.depth} id="${id}">${this.parser.parseInline(token.tokens)}</h${token.depth}>`}
export const docsPages=sources.map(([slug,title,description,source])=>({slug,title,description,html:marked.parse(readFileSync(resolve(source),'utf8'),{renderer,async:false}) as string}))
export function DocsIndex(){return <div className="site docs-site"><SiteHeader/><main className="docs-index"><p className="docs-eyebrow">SATCHEL GUIDES</p><h1>A place for every part of practice.</h1><p>Get started, bring your contacts, and keep the firm’s work in order.</p><div className="docs-cards">{docsPages.map(page=><a key={page.slug} href={`/docs/${page.slug}`}><h2>{page.title}</h2><p>{page.description}</p><span aria-hidden="true">→</span></a>)}</div></main><SiteFooter/></div>}
export function DocsArticle({slug}:{slug:string}){const page=docsPages.find(p=>p.slug===slug)!;return <div className="site docs-site"><SiteHeader/><main className="docs-layout"><nav className="docs-nav" aria-label="Documentation"><a href="/docs">All guides</a>{docsPages.map(p=><a key={p.slug} aria-current={p.slug===slug?'page':undefined} href={`/docs/${p.slug}`}>{p.title}</a>)}</nav><article className="docs-article" dangerouslySetInnerHTML={{__html:page.html}}/></main><SiteFooter/></div>}
