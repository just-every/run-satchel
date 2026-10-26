import {PDFDocument,StandardFonts} from 'pdf-lib';

export async function medicalPacketPdfs(){
 async function pdf(pages){
  const document=await PDFDocument.create(),font=await document.embedFont(StandardFonts.Helvetica);
  for(const lines of pages){const page=document.addPage([600,760]);for(const [index,line] of lines.entries())page.drawText(line,{x:36,y:710-index*24,font,size:12});}
  return Buffer.from(await document.save());
 }
 const statement=['Provider: Clinic','Itemized statement','Service date Description Charge','01/01/2026 Reviewed treatment $20.00','Total charges $20.00'];
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
