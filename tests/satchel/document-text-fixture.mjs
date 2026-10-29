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
async function scanCanvas(phrase,width,height){
 const {createCanvas}=await import('@napi-rs/canvas'),canvas=createCanvas(width,height),context=canvas.getContext('2d');
 context.fillStyle='white';context.fillRect(0,0,width,height);context.fillStyle='black';context.font='52px sans-serif';context.fillText(phrase,70,140);context.fillText('Recorded from the scanned original',70,240);
 return canvas;
}
export async function scannedOriginal(phrase='Quartz harbor witness statement',{width=1400,height=900,dpi=144}={}){
 const canvas=await scanCanvas(phrase,width,height);
 const png=canvas.toBuffer('image/png'),pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
 const first=pdf.addPage([700,450]);first.drawText('First page has embedded text, no scan phrase',{x:30,y:350,font,size:15});
 const image=await pdf.embedPng(png),pageWidth=width*72/dpi,pageHeight=height*72/dpi,second=pdf.addPage([pageWidth,pageHeight]);second.drawImage(image,{x:0,y:0,width:pageWidth,height:pageHeight});
 return {png,jpeg:canvas.toBuffer('image/jpeg'),pdf:Buffer.from(await pdf.save())};
}
export async function ccittScannedPdf(){
 const width=1408,height=900,canvas=await scanCanvas('synthetic-satchel-82 witness statement',width,height),pixels=canvas.getContext('2d').getImageData(0,0,width,height).data;
 // Genuine Group 4 horizontal coding. Zero-length opposite-color runs let
 // this small fixture encoder use only the 0, 1 and 64-pixel Huffman codes.
 const bytes=[];let value=0,bits=0;
 const write=code=>{for(const bit of code){value=(value<<1)|Number(bit);if(++bits===8){bytes.push(value);value=0;bits=0;}}};
 const zero=['00110101','0000110111'],one=['000111','010'],makeup=['11011','0000001111'];
 const horizontal=(length,black)=>{
  const color=black?1:0,code=length===64?makeup[color]+zero[color]:one[color];
  write('001');write(black?zero[0]:code);write(black?code:zero[1]);
 };
 const run=(length,black)=>{
  while(length>=64){horizontal(64,black);length-=64;}
  while(length-->0)horizontal(1,black);
 };
 for(let y=0;y<height;y++){
  let start=0,black=pixels[y*width*4]<128;
  for(let x=1;x<=width;x++){
   const next=x<width&&pixels[(y*width+x)*4]<128;
   if(x===width||next!==black){run(x-start,black);start=x;black=next;}
  }
 }
 write('000000000001000000000001');if(bits)bytes.push(value<<(8-bits));
 const pdf=await PDFDocument.create(),context=pdf.context,page=pdf.addPage([704,450]);
 const image=context.register(context.stream(Uint8Array.from(bytes),{Type:'XObject',Subtype:'Image',Width:width,Height:height,ColorSpace:'DeviceGray',BitsPerComponent:1,Filter:'CCITTFaxDecode',DecodeParms:{K:-1,Columns:width,Rows:height,BlackIs1:false}}));
 const {PDFName}=await import('pdf-lib');page.node.set(PDFName.of('Resources'),context.obj({XObject:{Scan:image}}));
 page.node.set(PDFName.of('Contents'),context.register(context.stream('q 704 0 0 450 0 0 cm /Scan Do Q')));
 return Buffer.from(await pdf.save());
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
