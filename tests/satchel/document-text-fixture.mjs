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
