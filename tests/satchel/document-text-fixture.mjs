import {office} from './office-fixture.mjs';
import {PDFDocument,StandardFonts} from 'pdf-lib';
export async function readablePdf(lines=['First page of retained testimony','Copper lantern testimony appears only on this page']){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
 for(const line of lines){const p=pdf.addPage([500,600]);p.drawText(line,{x:30,y:500,font,size:15});}
 return Buffer.from(await pdf.save());
}
export async function textSearchFixture(h,m){
 const bytes=await readablePdf(),base='/matters/'+m.id;
 const upload=(name,content,mime='application/pdf',visibility='matter',extra={})=>h.json(base+'/documents',{name,mime,contentBase64:content.toString('base64'),visibility,...extra},h.owner);
 const document=await upload('Testimony.pdf',bytes),privateDocument=await upload('Counsel private.pdf',bytes,'application/pdf','private');
 const plain=await upload('Notes.txt',Buffer.from('Local text original contains a silver compass passage'),'text/plain');
 const preview=await h.json(base+'/document-sets/preview',{documents:[{id:document.id,revision:document.revision}],documentType:'Deposition',tags:['Reviewed']},h.owner);
 await h.json(base+'/document-sets/apply',{previewId:preview.id},h.owner);
 return {bytes,document,privateDocument,plain,upload};
}
export async function messageOriginal(){
 const boundary='synthetic-satchel-message',alternative='synthetic-satchel-alternative';
 const pdf=await readablePdf(['Retained email attachment first page','Indigo island appendix is only on its second page']);
 const scan=await scannedOriginal('Marigold field attachment');
 const parts=[
  'Subject: Reviewed instructions',
  'MIME-Version: 1.0',
  `Content-Type: multipart/mixed; boundary="${boundary}"`,'',
  '--'+boundary,`Content-Type: multipart/alternative; boundary="${alternative}"`,'',
  '--'+alternative,'Content-Type: text/plain; charset=utf-8','Content-Transfer-Encoding: quoted-printable','','Violet=20harbor=20instructions are retained.',
  '--'+alternative,'Content-Type: text/html; charset=utf-8','','<p>Golden&nbsp;meadow direction</p><img src="https://images.example.com/unrequested"><script>Hostile executable instruction</script>',
  '--'+alternative+'--',
  '--'+boundary,'Content-Type: text/plain; charset=utf-8','Content-Disposition: attachment; filename="Appendix.txt"','','Saffron bridge attachment passage',
  '--'+boundary,'Content-Type: application/pdf','Content-Disposition: attachment; filename="Exhibit.pdf"','Content-Transfer-Encoding: base64','',pdf.toString('base64'),
  '--'+boundary,'Content-Type: message/rfc822','Content-Disposition: attachment; filename="Nested.eml"','','Subject: Retained nested message','Content-Type: text/plain; charset=utf-8','','Scarlet orchard nested instructions',
  '--'+boundary,'Content-Type: image/png','Content-Disposition: attachment; filename="Scanned appendix.png"','Content-Transfer-Encoding: base64','',scan.png.toString('base64'),
  '--'+boundary,'Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document','Content-Disposition: attachment; filename="Counsel memo.docx"','Content-Transfer-Encoding: base64','',office('docx','Cerulean counsel memo').toString('base64'),
  '--'+boundary+'--'
 ];
 return Buffer.from(parts.join('\r\n'));
}
export async function scannedOriginal(phrase='Quartz harbor witness statement'){
 const {createCanvas}=await import('@napi-rs/canvas'),canvas=createCanvas(1400,900),context=canvas.getContext('2d');
 context.fillStyle='white';context.fillRect(0,0,1400,900);context.fillStyle='black';context.font='52px sans-serif';context.fillText(phrase,70,140);context.fillText('Recorded from the scanned original',70,240);
 const png=canvas.toBuffer('image/png'),pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
 const first=pdf.addPage([700,450]);first.drawText('First page has embedded text, no scan phrase',{x:30,y:350,font,size:15});
 const image=await pdf.embedPng(png),second=pdf.addPage([700,450]);second.drawImage(image,{x:0,y:0,width:700,height:450});
 return {png,jpeg:canvas.toBuffer('image/jpeg'),pdf:Buffer.from(await pdf.save())};
}
export async function reviewedMessage(h,m){
 const {inquiry}=await import('./intake-fixture.mjs'),recipient=inquiry({token:'synthetic-satchel-1',revision:null}).email,base='/matters/'+m.id;
 await h.json('/team',{email:recipient,name:'Message recipient',role:'client'},h.owner);await h.json('/team/invite',{email:recipient},h.owner);
 await h.json(base+'/portal',{email:recipient,reason:'Explicit native client authority'},h.owner);
 const graph=await h.json('/contacts',undefined,h.owner),contact=graph.contacts.find(c=>c.name===m.client);
 await h.json('/contacts',{id:contact.id,revision:graph.revision,kind:'person',name:contact.name,emails:[recipient]},h.owner);
 const current=await h.json('/contacts',undefined,h.owner);await h.json('/contacts/'+contact.id+'/consent',{revision:current.revision,channel:'email',decision:'allowed',evidenceDate:'2026-10-20',source:'Synthetic explicit client instruction'},h.owner);
 await h.json('/providers/mail/review',{termsUrl:'https://resend.com/legal/terms-of-service',confirmed:true},h.owner);
 const reviewed=await h.json(base+'/correspondence',{recipient,subject:'Reviewed case letter',body:'Turquoise garden counsel instructions are retained in this native letter.',reviewNote:'Counsel reviewed this exact recipient and content'},h.owner);
 return reviewed;
}
