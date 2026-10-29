import {officeText} from './document-office-text';
import {decode as decodePng,convertIndexedToRgb} from 'fast-png';
import {decode as decodeJpeg} from 'jpeg-js';
import {nativePdfSearchPages} from './chronology-pdf-text';
import {scanText,maxScanPixels,type ScanImage} from './document-ocr';

export async function readableText(bytes:Uint8Array,mime:string,version:Record<string,any>={mime}){
 const office=officeText(bytes,version);if(office)return office;
 const pages:{page:number;body:string}[]=[],missing:string[]=[];let ocrPages=0;
 if(mime==='text/plain')pages.push(...new TextDecoder('utf-8',{fatal:true}).decode(bytes).split('\f').map((body,i)=>({page:i+1,body})));
 else if(mime==='application/pdf'){
  for(const p of await nativePdfSearchPages(bytes)){
   let body=p.lines.join('\n');
   if(p.images.length){try{const scanned=await scanText(p.images);if(scanned){body+='\n'+scanned;ocrPages++;}}catch{missing.push('Page '+p.page+' image text');}}
   if(body.trim())pages.push({page:p.page,body:body.trim()});
   else missing.push('Page '+p.page+' has no readable text');
  }
 }else if(mime==='image/png'||mime==='image/jpeg'){
  let image:ScanImage;
  if(mime==='image/jpeg'){const jpg=decodeJpeg(bytes,{useTArray:true,formatAsRGBA:true,maxResolutionInMP:maxScanPixels/1_000_000,maxMemoryUsageInMB:128});image={...jpg,kind:3};}
  else {
   let png=decodePng(bytes);if(png.palette)png={...png,data:convertIndexedToRgb(png),channels:png.palette[0].length,depth:8,palette:undefined};
   const {width,height,data,channels,depth}=png,rgba=new Uint8Array(width*height*4),scale=depth===16?257:1;
   for(let i=0;i<width*height;i++){
    const source=i*channels,dest=i*4;
    if(depth<8){const x=i%width,y=Math.floor(i/width),shift=8-depth-(x*depth)%8,level=(data[y*Math.ceil(width*depth/8)+Math.floor(x*depth/8)]>>shift)&((1<<depth)-1);rgba[dest]=rgba[dest+1]=rgba[dest+2]=level*255/((1<<depth)-1);}
    else if(channels<=2)rgba[dest]=rgba[dest+1]=rgba[dest+2]=data[source]/scale;
    else {rgba[dest]=data[source]/scale;rgba[dest+1]=data[source+1]/scale;rgba[dest+2]=data[source+2]/scale;}
    rgba[dest+3]=channels===2?data[source+1]/scale:channels===4?data[source+3]/scale:255;
   }
   image={width,height,data:rgba,kind:3};
  }
  const body=await scanText([image]);if(body){pages.push({page:1,body});ocrPages++;}else missing.push('No readable image text');
 }else missing.push('Unsupported original format');
 return {pages,missing,ocrPages};
}
