import {createServer} from 'node:http';
import {access,readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve,extname} from 'node:path';

let siteReady;
async function ensureSite(){
 // Verify shards have isolated output directories; use the real site build in a shard that has not emitted it yet.
 siteReady??=(async()=>{
  try{await access(resolve('./dist/site/docs/agents.html'));}
  catch(error){
   if(error.code!=='ENOENT')throw error;
   await promisify(execFile)(process.execPath,[resolve('./node_modules/@runeditrun/rer/global/rer.mjs'),'build','--site'],{timeout:120000,maxBuffer:1024*1024});
  }
 })();
 await siteReady;
}

export async function serveSite(){
 await ensureSite();
 const root=resolve('./dist/site');
 const server=createServer(async(req,res)=>{
  try{
   const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   let file=resolve(root,'.'+path);
   if(!file.startsWith(root+'/')&&file!==root)throw Error('Outside site');
   if(path==='/')file=resolve(file,'index.html');else if(!extname(file))file+='.html';
   const types={'.html':'text/html','.css':'text/css','.js':'application/javascript','.svg':'image/svg+xml','.woff2':'font/woff2'};
   res.setHeader('content-type',types[extname(file)]??'application/octet-stream');res.end(await readFile(file));
  }catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {origin:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(r=>server.close(r))};
}
