import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import surface from '../../agent-surface.json' with {type:'json'}
import {readAgentReference,assertFixtureReference} from '../agent-door/reference.mjs'

// Exercise the emitted site through HTTP, without scripts or the application runtime.
test('run-site navigation reaches run instructions, every guide and local asset', async () => {
 const root=resolve('dist/site')
 const server=createServer(async(req,res)=>{
  try{
   const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname)
   let file=resolve(root,'.'+path)
   if(!file.startsWith(root+'/')&&file!==root)throw Error('outside site')
   if(path==='/')file=resolve(file,'index.html');else if(!extname(file))file+='.html'
   res.setHeader('content-type',extname(file)==='.html'?'text/html':'application/octet-stream')
   res.end(await readFile(file))
  }catch{res.writeHead(404).end()}
 })
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 const origin=`http://127.0.0.1:${server.address().port}`
 const seen=new Set(),queue=['/'];let visitedRun=false,visitedDocs=false
 try{
  while(queue.length){
   const path=queue.shift();if(seen.has(path))continue;seen.add(path)
   const response=await fetch(origin+path);assert.equal(response.status,200,path)
   if(!response.headers.get('content-type')?.includes('text/html'))continue
   const html=await response.text()
   if(path==='/run'){visitedRun=true;assert.match(html,/rer dev/)}
   if(path==='/docs')visitedDocs=true
   if(path==='/docs/agents'){
    const guide=readAgentReference(html)
    assert.deepEqual(guide.tools,surface.tools.map(({name,title,scope,readOnly,classes})=>({name,title,scope,readOnly,classes})),'The emitted guide lists every declared job exactly once')
    assert.deepEqual(guide.templates,surface.resources,'The emitted guide discloses the current resource surface')
    assertFixtureReference(guide,surface)
    for(const capability of surface.capabilities)assert.ok(html.includes('<code>'+capability+'</code>'),'Declared family '+capability)
    const targets=new Set([...html.matchAll(/id="([^" ]+)"/g)].map(m=>m[1]))
    for(const m of html.matchAll(/href="#([^" ]+)"/g))assert.ok(targets.has(m[1]),'Guide section link resolves: '+m[1])
   }
   for(const match of html.matchAll(/(?:href|src)="([^"#]+)"/g)){
    const url=new URL(match[1].replaceAll('&amp;','&'),origin+path)
    if(url.origin===origin){url.hash='';queue.push(url.pathname+url.search)}
   }
  }
  assert.ok(visitedRun,'The homepage reaches the run instructions')
  assert.ok(visitedDocs,'The homepage reaches the guides')
  assert.ok([...seen].some(p=>p.startsWith('/docs/')),'The guides can be read on the site')
  assert.ok(seen.has('/docs/agents'),'The docs catalogue reaches the company preparation guide')
 }finally{await new Promise(r=>server.close(r))}
})
