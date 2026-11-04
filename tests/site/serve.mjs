import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';

export async function serveSite(){
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
