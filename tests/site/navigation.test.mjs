import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'

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
   for(const match of html.matchAll(/(?:href|src)="([^"#]+)"/g)){
    const url=new URL(match[1].replaceAll('&amp;','&'),origin+path)
    if(url.origin===origin){url.hash='';queue.push(url.pathname+url.search)}
   }
  }
  assert.ok(visitedRun,'The homepage reaches the run instructions')
  assert.ok(visitedDocs,'The homepage reaches the guides')
  assert.ok([...seen].some(p=>p.startsWith('/docs/')),'The guides can be read on the site')
 }finally{await new Promise(r=>server.close(r))}
})
