import {Field,type Row} from './common';

export async function originalWaiver(file?:File){
 if(!file)return undefined;
 if(file.size===0||file.size>5*1024*1024)throw new Error('Choose an original waiver between 1 byte and 5 MB');
 const bytes=new Uint8Array(await file.arrayBuffer()),chunks:string[]=[];
 for(let offset=0;offset<bytes.length;offset+=32768)chunks.push(String.fromCharCode(...bytes.subarray(offset,offset+32768)));
 return {name:file.name,mime:file.type||'application/octet-stream',contentBase64:btoa(chunks.join(''))};
}

export function WaiverUpload({label,onChange}:{label:string;onChange:(file?:File)=>void}){
 return <><Field label={label} name="waiver"><input type="file" name="waiver" aria-label={label} onChange={event=>onChange(event.target.files?.[0])}/></Field><small>Optional original waiver file, up to 5 MB. Its original bytes and SHA-256 are retained.</small></>;
}

export function WaiverOriginal({waiver}:{waiver?:Row|null}){
 if(!waiver)return null;
 return <div className="record" aria-label="Recorded original waiver">
  <a href={'/api/satchel/conflict-waivers/'+waiver.id+'/file'}>Download original waiver: {waiver.name}</a>
  <p>{waiver.mime} · {waiver.size} bytes</p>
  <p>SHA-256: {waiver.sha256}</p>
 </div>;
}
