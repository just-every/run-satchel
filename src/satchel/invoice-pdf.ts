import {PDFDocument,StandardFonts,PDFName,PDFString,rgb} from 'pdf-lib';
import type {Data} from './model';
import {invoiceQr} from './invoice-qr';

export type InvoiceBranding={templateId:string;templateVersion:number;firmName:string;address:string;logoBase64:string;logoMime:'image/png'|'image/jpeg';remittance:string;terms:string;paymentUrl:string;dueDate:string;payerName:string;trustBalanceCents:number|null;trustAsOf:string};

// Frozen issue artifact, with optional counsel-approved, versioned delivery branding.
export async function invoicePdf(bill:Data,number:string,issuedAt:string,branding?:InvoiceBranding){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
 pdf.setCreationDate(new Date(issuedAt));pdf.setModificationDate(new Date(issuedAt));
 let page=pdf.addPage(),y=790;
 const write=(value:string)=>{
  // Standard PDF fonts cannot encode arbitrary names: refuse before committing,
  // preserving the original approved package and consuming no invoice number.
  const words=value.split(/\s+/);let line='';
  for(const word of words){
   if(line&&font.widthOfTextAtSize(line+' '+word,10)>490){draw(line);line='';}
   if(line)line+=' ';
   for(const character of word){if(font.widthOfTextAtSize(line+character,10)>490&&line){draw(line);line='';}line+=character;}
  }if(line)draw(line);
 };
 const draw=(line:string)=>{if(y<45){page=pdf.addPage();y=790;}page.drawText(line,{x:45,y,size:10,font});y-=17;};
 if(branding){
  const logoBytes=Uint8Array.from(atob(branding.logoBase64),c=>c.charCodeAt(0)),logo=branding.logoMime==='image/png'?await pdf.embedPng(logoBytes):await pdf.embedJpg(logoBytes),scale=Math.min(110/logo.width,48/logo.height);
  page.drawImage(logo,{x:45,y:y-48,width:logo.width*scale,height:logo.height*scale});y-=65;
  write(branding.firmName);write(branding.address);write('Invoice template version '+branding.templateVersion);
 }
 const s=bill.snapshot;write('Invoice '+number);write(s.title);write('Client: '+s.client);write('Matter: '+s.matterNumber+' '+s.matterTitle);write('Issued: '+issuedAt);write('Approved by: '+bill.approved_by+' at '+bill.approved_at);write('Approved CSV SHA-256: '+bill.artifact_digest);
 for(const l of s.lines)write(l.date+' | '+l.description+' | USD '+(l.amountCents/100).toFixed(2));
 if(s.taxReview){write('Subtotal USD '+(s.subtotalCents/100).toFixed(2));write('Tax USD '+(s.taxCents/100).toFixed(2));write('Tax review: '+s.taxReview.id+' | '+s.taxReview.snapshot.rule.jurisdiction+' | '+s.taxReview.snapshot.rule.reference);}
 write('Total USD '+(s.totalCents/100).toFixed(2));
 if(branding){
  write('Payer: '+branding.payerName);write('Due: '+branding.dueDate);write('Payment terms: '+branding.terms);write('Remittance: '+branding.remittance);
  if(branding.trustBalanceCents!==null)write('Matter trust balance USD '+(branding.trustBalanceCents/100).toFixed(2)+' as of '+branding.trustAsOf+' (not a payment or deduction)');
  if(y<340){page=pdf.addPage();y=790;}
  write('Sign in to review and pay only this invoice:');
  const address=branding.paymentUrl;for(let offset=0;offset<address.length;offset+=80)write(address.slice(offset,offset+80));
  const matrix=invoiceQr(address),unit=3,edge=matrix.length+8,baseY=y-edge*unit;
  page.drawRectangle({x:45,y:baseY,width:edge*unit,height:edge*unit,color:rgb(1,1,1)});
  matrix.forEach((row,iy)=>row.forEach((dark,ix)=>{if(dark)page.drawRectangle({x:45+(ix+4)*unit,y:baseY+(edge-iy-5)*unit,width:unit,height:unit,color:rgb(0,0,0)});}));
  const annotation=pdf.context.register(pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[45,baseY,45+edge*unit,y],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of(address)}}));
  page.node.set(PDFName.of('Annots'),pdf.context.obj([annotation]));
 }
 return pdf.save();
}
