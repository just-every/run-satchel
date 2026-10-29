import {gunzipSync} from 'fflate';
import wasmModule from './vendor/tesseract/core.wasm?module';
import modelData from './vendor/tesseract/eng.traineddata.gz?inline';
// @ts-expect-error The vendored Emscripten adapter is JavaScript.
import {createEngine} from './vendor/tesseract/engine.mjs';
import {insist} from './model';
export type ScanImage={width:number;height:number;data:Uint8Array;kind:number};
// Covers 300 dpi Letter and A4 originals while bounding local OCR memory.
export const maxScanPixels=12_000_000;

// Each extraction owns its engine and releases native memory afterwards.
// OCR is a local search derivative, never a replacement for retained evidence.
export async function scanText(images:ScanImage[]){
 const engine=await createEngine(wasmModule);
 try{
  const encoded=modelData.slice(modelData.indexOf(',')+1),compressed=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  engine.loadModel(gunzipSync(compressed));
  const text:string[]=[];
  for(const image of images){
   const {width,height,data,kind}=image;insist(width>0&&height>0&&width*height<=maxScanPixels,'The scanned page exceeds local OCR resolution',422);
   const rgba=new Uint8Array(width*height*4);
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=y*width+x,dest=i*4;let r,g,b,a=255;
    if(kind===1)r=g=b=(data[y*Math.ceil(width/8)+(x>>3)]&(128>>(x&7)))?255:0;
    else if(kind===2){r=data[i*3];g=data[i*3+1];b=data[i*3+2];}
    else {r=data[dest];g=data[dest+1];b=data[dest+2];a=data[dest+3];}
    // Composite transparency onto white before recognition.
    rgba[dest]=Math.round((r*a+255*(255-a))/255);rgba[dest+1]=Math.round((g*a+255*(255-a))/255);rgba[dest+2]=Math.round((b*a+255*(255-a))/255);rgba[dest+3]=255;
   }
   engine.loadImage({width,height,data:rgba});text.push(engine.getText());engine.clearImage();
  }
  return text.join('\n').trim();
 }finally{engine.destroy();}
}
