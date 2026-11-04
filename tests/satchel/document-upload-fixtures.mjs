import {readFile} from 'node:fs/promises';
import {office} from './office-fixture.mjs';
import {readablePdf,scannedOriginal} from './document-text-fixture.mjs';
export async function uploadOriginals(){
 const wav=Buffer.alloc(16044);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 const image=await scannedOriginal('synthetic-satchel-15');
 return [
  {name:'Record.pdf',mime:'application/pdf',bytes:await readablePdf(['synthetic-satchel-16'])},
  {name:'Counsel.docx',mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',bytes:office('docx','synthetic-satchel-17')},
  {name:'Exhibit.png',mime:'image/png',bytes:image.png},
  {name:'Recording.wav',mime:'audio/wav',bytes:wav},
  {name:'Recording.mp4',mime:'video/mp4',bytes:await readFile(new URL('./fixtures/synthetic-video.mp4',import.meta.url))}
 ];
}
