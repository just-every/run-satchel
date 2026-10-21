import {PDFDocument,StandardFonts} from 'pdf-lib';
import type {Data} from './model';

// Frozen issue artifact; template selection/versioning remains BILL-013.
export async function invoicePdf(bill:Data,number:string,issuedAt:string){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
 pdf.setCreationDate(new Date(issuedAt));pdf.setModificationDate(new Date(issuedAt));
 let page=pdf.addPage(),y=790;
 const write=(value:string)=>{
  // Standard PDF fonts cannot encode arbitrary names: refuse before committing,
  // preserving the original approved package and consuming no invoice number.
  const words=value.split(/\s+/);let line='';
  for(const word of words){if(font.widthOfTextAtSize(line+' '+word,10)>490&&line){draw(line);line=word;}else line+=(line?' ':'')+word;}if(line)draw(line);
 };
 const draw=(line:string)=>{if(y<45){page=pdf.addPage();y=790;}page.drawText(line,{x:45,y,size:10,font});y-=17;};
 const s=bill.snapshot;write('Invoice '+number);write(s.title);write('Client: '+s.client);write('Matter: '+s.matterNumber+' '+s.matterTitle);write('Issued: '+issuedAt);write('Approved by: '+bill.approved_by+' at '+bill.approved_at);write('Approved CSV SHA-256: '+bill.artifact_digest);
 for(const l of s.lines)write(l.date+' | '+l.description+' | USD '+(l.amountCents/100).toFixed(2));
 if(s.taxReview){write('Subtotal USD '+(s.subtotalCents/100).toFixed(2));write('Tax USD '+(s.taxCents/100).toFixed(2));write('Tax review: '+s.taxReview.id+' | '+s.taxReview.snapshot.rule.jurisdiction+' | '+s.taxReview.snapshot.rule.reference);}
 write('Total USD '+(s.totalCents/100).toFixed(2));
 return pdf.save();
}
