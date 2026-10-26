import {PDFDocument,StandardFonts,PDFName,PDFString,rgb} from 'pdf-lib';
import type {Data} from './model';
import {invoiceQr} from './invoice-qr';

export type InvoiceBranding={priorBalanceCents?:number|null;layout?:'summary'|'detailed';showTimeEntryDetail?:boolean;showHours?:boolean;showRates?:boolean;showTimekeepers?:boolean;showUtbms?:boolean;showNoChargeLines?:boolean;showDiscounts?:boolean;templateId:string;templateVersion:number;firmName:string;address:string;logoBase64:string;logoMime:'image/png'|'image/jpeg';remittance:string;terms:string;paymentUrl:string;dueDate:string;payerName:string;trustBalanceCents:number|null;trustAsOf:string};

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
 if(branding?.layout==='summary')write('Services and expenses USD '+((s.subtotalCents??s.totalCents)/100).toFixed(2));
 else for(const l of s.lines){
  if(branding?.showNoChargeLines===false&&l.amountCents===0)continue;
  const detail:string[]=[];
  if(branding?.showTimeEntryDetail!==false)detail.push(l.date,l.description);
  if(branding?.showHours&&l.kind==='time'&&l.minutes!=null)detail.push('Hours '+(l.minutes/60).toFixed(2));
  if(branding?.showRates&&l.kind==='time'&&l.rateCents!=null)detail.push('Hourly rate USD '+(l.rateCents/100).toFixed(2));
  if(branding?.showTimekeepers&&l.timekeeper)detail.push('Timekeeper '+l.timekeeper);
  if(branding?.showUtbms){const coded=s.ledes?.lines?.find((c:Data)=>c.sourceId===l.sourceId);const codes=[coded?.task??l.utbmsTask,coded?.activity??l.utbmsActivity,coded?.expense??l.utbmsExpense].filter(Boolean);if(codes.length)detail.push('UTBMS '+codes.join(' '));}
  if(branding?.showDiscounts){if(l.discountBps)detail.push('Agreement discount '+(l.discountBps/100)+'%');for(const a of l.prebillAdjustments??[])if(a.adjustmentCents<0)detail.push('Reviewed reduction USD '+(-a.adjustmentCents/100).toFixed(2));}
  detail.push('USD '+(l.amountCents/100).toFixed(2));write(detail.join(' | '));
 }
 if(s.taxReview){write('Subtotal USD '+(s.subtotalCents/100).toFixed(2));write('Tax USD '+(s.taxCents/100).toFixed(2));write('Tax review: '+s.taxReview.id+' | '+s.taxReview.snapshot.rule.jurisdiction+' | '+s.taxReview.snapshot.rule.reference);}
 write('Total USD '+(s.totalCents/100).toFixed(2));
 if(s.paymentSnapshot){
  write('Paid from trust USD '+(s.paymentSnapshot.trust_paid_cents/100).toFixed(2));
  write('Total paid USD '+(s.paymentSnapshot.paid_cents/100).toFixed(2));
  write('Balance due USD '+(s.paymentSnapshot.due_cents/100).toFixed(2));
 }
 if(branding){
  write('Payer: '+branding.payerName);write('Due: '+branding.dueDate);write('Payment terms: '+branding.terms);write('Remittance: '+branding.remittance);
  if(branding.priorBalanceCents!=null)write('Prior issued matter balance USD '+(branding.priorBalanceCents/100).toFixed(2)+' as of '+branding.trustAsOf+' (separate from this invoice)');
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
