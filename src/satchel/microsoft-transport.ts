// No provider response, token, or raw exception crosses this network boundary.
// Access tokens are opaque to this client; Microsoft Graph validates them.
type Failure={ok:false;outcome:string;status:number|null;uncertain:boolean};
async function readJson(response:Response,maxBytes:number):Promise<unknown>{
 if(!response.body)throw new Error('empty');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>maxBytes)throw new Error('size');chunks.push(item.value);}}
 finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
async function discard(response:Response){await response.body?.cancel().catch(()=>{});}
export async function microsoftToken(configuration:{tenant:string;client:string;secret:string}):Promise<Failure|{ok:true;token:string;expiresAt:number}>{
 try{
  const response=await fetch(`https://login.microsoftonline.com/${configuration.tenant}/oauth2/v2.0/token`,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:configuration.client,client_secret:configuration.secret,scope:'https://graph.microsoft.com/.default'}).toString()});
  if(!response.ok){await discard(response);return {ok:false,outcome:'token_refused',status:response.status,uncertain:response.status>=500};}
  const data=await readJson(response,65536) as Record<string,unknown>;
  if(typeof data.access_token!=='string'||!data.access_token.length||data.access_token.length>32768||/\s/.test(data.access_token)||data.token_type!=='Bearer'||!Number.isFinite(Number(data.expires_in))||Number(data.expires_in)<=60||Number(data.expires_in)>86400)return {ok:false,outcome:'invalid_token_response',status:response.status,uncertain:false};
  return {ok:true,token:data.access_token,expiresAt:Date.now()+Number(data.expires_in)*1000};
 }catch{return {ok:false,outcome:'token_outcome_unknown',status:null,uncertain:true};}
}
export type DirectoryUser={id:string;displayName:string|null};
export async function microsoftDirectory(token:string):Promise<Failure|{ok:true;users:DirectoryUser[];hasMore:boolean;status:number}>{
 try{
  const response=await fetch('https://graph.microsoft.com/v1.0/users?$select=id,displayName&$top=100',{method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+token,accept:'application/json'}});
  if(!response.ok){await discard(response);return {ok:false,outcome:'directory_refused',status:response.status,uncertain:response.status>=500};}
  const data=await readJson(response,1048576) as Record<string,unknown>;
  if(!Array.isArray(data?.value)||data.value.length>100||!data.value.every((u:unknown)=>{const v=u as Record<string,unknown>|null;return v&&typeof v.id==='string'&&v.id.length<=200&&(v.displayName===null||typeof v.displayName==='string'&&v.displayName.length<=1000);}))return {ok:false,outcome:'invalid_directory_response',status:response.status,uncertain:true};
  return {ok:true,users:data.value.map((u:Record<string,unknown>)=>({id:u.id as string,displayName:u.displayName as string|null})),hasMore:typeof data['@odata.nextLink']==='string',status:response.status};
 }catch{return {ok:false,outcome:'directory_outcome_unknown',status:null,uncertain:true};}
}
