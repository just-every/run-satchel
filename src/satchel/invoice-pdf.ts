import {PDFDocument,StandardFonts} from 'pdf-lib';
import type {Data} from './model';

// Issue freezes the prebill-reviewed template revision and exact rendered bytes.
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
 const s=bill.snapshot,t=s.template,options=t?.settings.options;
 if(t){const settings=t.settings,f=settings.firm,logo=settings.logo;if(logo){const bytes=Uint8Array.from(atob(logo.base64),c=>c.charCodeAt(0)),image=logo.mime==='image/png'?await pdf.embedPng(bytes):await pdf.embedJpg(bytes),size=image.scaleToFit(100,50);page.drawImage(image,{x:45,y:y-size.height,width:size.width,height:size.height});y-=size.height+17;}
  write(f.name);write([f.address.line1,f.address.line2,f.address.city,f.address.state,f.address.zip].filter(Boolean).join(', '));write(f.email+' | '+f.phone);write('Template: '+t.name+' | revision '+t.version+' | '+t.id);
 }
 write('Invoice '+number);write(s.title);write('Client: '+s.client);write('Matter: '+s.matterNumber+' '+s.matterTitle);write('Issued: '+issuedAt);write('Approved by: '+bill.approved_by+' at '+bill.approved_at);write('Approved CSV SHA-256: '+bill.artifact_digest);
 if(!t){for(const l of s.lines)write(l.date+' | '+l.description+' | USD '+(l.amountCents/100).toFixed(2));}
 else if(options.layout==='summary'){write('Summary: '+s.lines.length+' reviewed service and expense lines');}
 else for(const l of s.lines){if(l.amountCents===0&&!options.noCharge)continue;
  const parts=[l.date,options.detail?l.description:l.kind,'USD '+(l.amountCents/100).toFixed(2)];
  if(options.hours&&l.minutes!=null)parts.push('Hours '+((l.billedMinutes??l.minutes)/60).toFixed(2));
  if(options.rates&&l.rateCents!=null)parts.push('Rate USD '+(l.rateCents/100).toFixed(2)+'/hour');
  if(options.timekeepers&&l.timekeeperEmail)parts.push('Timekeeper '+l.timekeeperEmail);
  if(options.utbms)parts.push(...[l.utbmsTask,l.utbmsActivity,l.utbmsExpense].filter(Boolean));
  if(options.discounts&&l.discountBps)parts.push('Discount '+l.discountBps/100+'%');write(parts.join(' | '));
 }
 if(s.taxReview){write('Subtotal USD '+(s.subtotalCents/100).toFixed(2));write('Tax USD '+(s.taxCents/100).toFixed(2));write('Tax review: '+s.taxReview.id+' | '+s.taxReview.snapshot.rule.jurisdiction+' | '+s.taxReview.snapshot.rule.reference);}
 write('Total USD '+(s.totalCents/100).toFixed(2));
 if(t){write('Payment terms: '+t.settings.terms);write('Due date: '+new Date(Date.parse(s.date+'T00:00:00Z')+t.settings.termsDays*86400000).toISOString().slice(0,10));write('Remittance: '+t.settings.remittance);
  if(options.trust==='balance')write('Recorded matter trust balance USD '+(t.trustBalanceCents/100).toFixed(2)+' as of '+t.reviewedBalancesAt+' (not available funds)');
  if(options.prior==='balance')write('Prior unpaid matter invoices USD '+(t.priorBalanceCents/100).toFixed(2)+' as of '+t.reviewedBalancesAt);
 }
 return pdf.save();
}
