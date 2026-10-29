import type {Plugin} from 'vite';
// Cloudflare imports Wasm as precompiled modules. PDF.js normally receives bytes;
// adapt its instantiation result to support the Module overload as well.
export function pdfCompiledImageCodec():Plugin{
 return {
  name:'pdf-compiled-image-codec',
  enforce:'pre',
  transform(code,id){
   if(!id.replaceAll('\\','/').endsWith('/pdfjs-dist/build/pdf.worker.mjs'))return;
   const call='return successCallback(results.instance);';
   if(!code.includes(call))throw new Error('PDF image codec instantiation adapter needs updating');
   return {code:code.replace(call,'return successCallback(results.instance ?? results);'),map:null};
  }
 };
}
