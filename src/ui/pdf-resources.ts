import faxDecoderUrl from 'pdfjs-dist/wasm/jbig2.wasm?url';

// PDF.js asks for its decoder by filename. Vite gives the bundled asset a
// hashed URL; resolve that exact resource without following document URLs.
export class PdfBinaryData {
 async fetch({kind,filename}:{kind:string;filename:string}){
  if(kind!=='wasmUrl'||filename!=='jbig2.wasm')throw new Error('The PDF requested an unavailable local resource');
  const response=await fetch(faxDecoderUrl);
  if(!response.ok)throw new Error('The local PDF image decoder could not be loaded');
  return new Uint8Array(await response.arrayBuffer());
 }
}
