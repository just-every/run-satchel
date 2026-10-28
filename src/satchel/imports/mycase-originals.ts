import {unzipSync} from 'fflate';
import {sha256} from '../../modules/import-kit/src/d1/index';
import {insist,text,type Data} from '../model';

// Archive bytes use the same erasure-aware original store as their members.
export function mycaseOriginals(input:Data){
 const archive=input.binaryArchive,files:Data[]=[...(input.files??[])],warnings:string[]=[],errors:string[]=[];
 if(!archive)return {files,warnings,errors};
 insist(archive.file&&Array.isArray(archive.members)&&archive.members.length>0&&archive.members.length<=500,'Map every supplied binary archive member to an original identity');
 text(archive.file.name,'MyCase binary archive filename',240);
 if(typeof archive.file.contentBase64!=='string'){errors.push('MyCase binary archive was erased; source originals cannot be resurrected');return {files,warnings,errors,archive};}
 insist(archive.file.contentBase64.length<=5_592_408&&!/[^A-Za-z0-9+/=]/.test(archive.file.contentBase64),'Split binary archives above 4 MiB compressed');
 let binary='';try{binary=atob(archive.file.contentBase64);}catch{insist(false,'Invalid binary archive base64');}
 insist(binary.length>0&&binary.length<=4_194_304&&btoa(binary)===archive.file.contentBase64,'Supply canonical binary archive bytes within 4 MiB');
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));insist(sha256(bytes)===archive.file.sha256,'MyCase binary archive hash does not match its bytes');
 let count=0,total=0;
 const unpacked=unzipSync(bytes,{filter:f=>{if(f.name.endsWith('/'))return false;insist(++count<=500&&f.originalSize<=1_048_576&&(total+=f.originalSize)<=6_291_456,'Split binary originals above 1 MiB per file or 6 MiB expanded');return true;}});
 const paths=new Set<string>(),ids=new Set<string>();
 for(const member of archive.members){
  const path=text(member.path,'Binary archive member path',240),sid=text(member.id,'Original identity',100);
  insist(!path.startsWith('/')&&!path.split(/[\\/]/).includes('..')&&!/[\x00-\x1f]/.test(path),'Use relative binary archive paths');
  insist(!paths.has(path)&&!ids.has(sid),'Binary archive member paths and original identities must be unique');paths.add(path);ids.add(sid);
  const body=unpacked[path];if(!body){errors.push('MyCase binary archive: missing mapped original '+path);continue;}
  let raw='';for(const b of body)raw+=String.fromCharCode(b);
  const original={id:sid,name:path.split(/[\\/]/).at(-1)!,contentBase64:btoa(raw),sha256:sha256(body),modifiedAt:member.modifiedAt};
  const prior=files.find(f=>f.id===sid);
  if(prior)insist(['name','contentBase64','sha256','modifiedAt'].every(k=>prior[k]===original[k as keyof typeof original]),'Conflicting separately supplied original and binary archive member');
  else files.push(original);
 }
 for(const path of Object.keys(unpacked))if(!paths.has(path))warnings.push('MyCase unmatched binary archive member '+path+': retained only; map and reconcile before cutover');
 return {files,warnings,errors,archive,sourceFile:{name:archive.file.name,sha256:archive.file.sha256,size:bytes.length}};
}
