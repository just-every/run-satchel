import {Field,type Row} from './common';

export async function originalWaiver(file:File|undefined,data:Row){
 const metadata={parties:(data.waiverParties??'').split(/[;\n]/).map((v:string)=>v.trim()).filter(Boolean),date:data.waiverDate,scope:data.waiverScope,matchId:data.waiverMatch,confirmation:data.waiverConfirmation};
 if(!file)return data.waiverConfirmation?metadata:undefined;
 if(file.size===0||file.size>5*1024*1024)throw new Error('Choose an original waiver between 1 byte and 5 MB');
 const bytes=new Uint8Array(await file.arrayBuffer()),chunks:string[]=[];
 for(let offset=0;offset<bytes.length;offset+=32768)chunks.push(String.fromCharCode(...bytes.subarray(offset,offset+32768)));
 return {...metadata,name:file.name,mime:file.type||'application/octet-stream',contentBase64:btoa(chunks.join(''))};
}

export function WaiverUpload({label,onChange}:{label:string;onChange:(file?:File)=>void}){
 return <><Field label={label} name="waiver"><input type="file" name="waiver" aria-label={label} onChange={event=>onChange(event.target.files?.[0])}/></Field><small>Practitioner-recorded, not signed through Satchel. Supply a file or written confirmation, plus the client contacts, date, scope and answered match.</small><Field label="Waiving client contact IDs (separate with ;)" name="waiverParties" required={false}/><Field label="Waiver date" name="waiverDate" type="date" required={false}/><Field label="Waiver scope" name="waiverScope" required={false}/><Field label="Answered match contact ID" name="waiverMatch" required={false}/><Field label="Written waiver confirmation" name="waiverConfirmation" required={false}><textarea name="waiverConfirmation" aria-label="Written waiver confirmation" rows={3}/></Field></>;
}

export function WaiverOriginal({waiver}:{waiver?:Row|null}){
 if(!waiver)return null;
 return <div className="record" aria-label="Recorded original waiver">
  <a href={'/api/satchel/conflict-waivers/'+waiver.id+'/file'}>Download original waiver: {waiver.name}</a>
  <p>{waiver.label}</p><p>{waiver.waiver_date} · {waiver.scope}</p><p>{waiver.mime} · {waiver.size} bytes</p>
  <p>SHA-256: {waiver.sha256}</p>
 </div>;
}
