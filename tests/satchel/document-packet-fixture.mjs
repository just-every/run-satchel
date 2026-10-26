import {inflateSync} from 'node:zlib';
import {PDFDict,PDFDocument,PDFName,PDFRawStream,StandardFonts} from 'pdf-lib';

export async function medicalPacketPdfs(){
 async function pdf(pages){
  const document=await PDFDocument.create(),font=await document.embedFont(StandardFonts.Helvetica);
  for(const lines of pages){const page=document.addPage([600,760]);for(const [index,line] of lines.entries())page.drawText(line,{x:36,y:710-index*24,font,size:12});}
  return Buffer.from(await document.save());
 }
 // A numeric date that reads differently month first (March 1) and day first (January 3).
 const statement=['Provider: Clinic','Itemized statement','Service date Description Charge','03/01/2026 Follow-up therapy $20.00','Total charges $20.00'];
 return {treatment:await pdf([
  ['Provider: Clinic','Treatment notes','Date of service: January 1, 2026','Reviewed treatment for shoulder mobility.'],
  ['Provider: Clinic','Treatment notes','Date of service: March 1, 2026','Follow-up therapy and mobility assessment.'],
  statement
 ]),bill:await pdf([statement])};
}

export async function inviteRecipient(h,email='counsel@example.test',returnTo='/signin'){
 const response=await h.request('/auth/invite',{email,displayName:'Opposing counsel',role:'member',returnTo},h.owner);
 if(response.status!==202)throw new Error('Native recipient invitation failed: '+await response.text());
 const mail=h.mails.toReversed().find(m=>m.to.includes(email)),token=(mail.text??mail.html).match(/\/auth\/confirm\?token=([^\s"&<]+)/)[1];
 const accepted=await h.request('/auth/confirm',{token});
 if(accepted.status!==303)throw new Error('Native recipient confirmation failed');
 return accepted.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
}

// Raster images on one produced page, decoded from pdf-lib's lossless 8-bit RGB image streams.
export async function pageImages(bytes,index){
 const pdf=await PDFDocument.load(bytes),xobjects=pdf.getPage(index).node.Resources()?.lookupMaybe(PDFName.of('XObject'),PDFDict);
 return (xobjects?.values()??[]).map(ref=>pdf.context.lookup(ref)).filter(stream=>stream instanceof PDFRawStream&&stream.dict.get(PDFName.of('Subtype'))===PDFName.of('Image')).map(stream=>{
  const size=key=>stream.dict.get(PDFName.of(key)).asNumber(),width=size('Width'),height=size('Height'),rgb=inflateSync(stream.contents);
  if(rgb.length!==width*height*3)throw new Error('Produced page images are 8-bit RGB rasters');
  return {width,height,rgb};
 });
}

// The bounds of every non-background pixel in a raster, or null for a blank one.
export function inkBounds({width,height,rgb}){
 let left=width,top=height,right=0,bottom=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*3;if(Math.min(rgb[i],rgb[i+1],rgb[i+2])<160){left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);}}
 return right?{left,top,right,bottom}:null;
}

// Where a source page places its text, in PDF units from the page's top-left corner.
export async function sourceTextBounds(bytes,pageNumber){
 const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs'),task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true});
 try{
  const page=await(await task.promise).getPage(pageNumber),[x0,y0,x1,y1]=page.view,items=(await page.getTextContent()).items.filter(item=>item.str?.trim());
  return {width:x1-x0,height:y1-y0,left:Math.min(...items.map(item=>item.transform[4]-x0)),right:Math.max(...items.map(item=>item.transform[4]-x0+item.width)),baseline:Math.max(...items.map(item=>y1-item.transform[5])),size:Math.max(...items.map(item=>item.height))};
 }finally{await task.destroy();}
}
