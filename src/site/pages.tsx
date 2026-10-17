import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { contractPageHtml } from '../base/contract-page'
import { runPageHtml,siteNotFoundHtml,type SiteContext,type SiteBuild } from '../base/run-site'
import { identity } from '../identity'
import { run } from './run'
import { Landing } from './landing/Landing'
import { DocsIndex,DocsArticle,docsPages } from './docs/pages'
export function sitePages({styles,contract}:SiteContext):SiteBuild{
 const document=(title:string,description:string,body:ReactElement)=>'<!doctype html>'+renderToStaticMarkup(<html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>{title}</title><meta name="description" content={description}/><link rel="icon" href="/brand/mark.svg"/><link rel="stylesheet" href="/rer-theme.css"/>{styles.map(href=><link key={href} rel="stylesheet" href={href}/>)}</head><body>{body}</body></html>)
 return {pages:[
  {path:'/',html:document('Satchel · Practice management for small law firms',identity.tagline,<Landing/>)},
  {path:'/run',html:runPageHtml(identity,run,contract)},
  ...(contract?[{path:'/contract',html:contractPageHtml(identity,run,contract)}]:[]),
  {path:'/docs',html:document('Docs · Satchel','Guides to running your practice with Satchel.',<DocsIndex/>)},
  ...docsPages.map(page=>({path:`/docs/${page.slug}`,html:document(`${page.title} · Satchel`,page.description,<DocsArticle slug={page.slug}/>)})),
  {path:'/404',html:siteNotFoundHtml(identity,run,contract)},
 ],assets:['rer-theme.css','fonts','brand']}
}
