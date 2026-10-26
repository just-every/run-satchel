import {useEffect,useState} from 'react';
import type {Row} from './common';

export function ProductionRecipient({shareId}:{shareId:string}){
 const [packet,setPacket]=useState<Row|null>(null),[error,setError]=useState(''),[signIn,setSignIn]=useState(false),[opening,setOpening]=useState(false),[receipt,setReceipt]=useState('');
 const endpoint='/api/satchel/production-shares/'+encodeURIComponent(shareId);
 useEffect(()=>{
  let active=true;setPacket(null);setError('');setSignIn(false);setReceipt('');
  (async()=>{
   try{
    const response=await fetch(endpoint,{credentials:'same-origin',cache:'no-store'}),data=await response.json() as Row;
    if(!active)return;
    if(!response.ok){setSignIn(response.status===401);throw new Error(data.error??'This production is unavailable');}
    setPacket(data);
   }catch(problem){if(active)setError(problem instanceof Error?problem.message:'This production is unavailable');}
  })();return()=>{active=false;};
 },[endpoint]);
 async function openPacket(){
  if(!packet)return;
  setOpening(true);setError('');
  try{
   const response=await fetch(endpoint+'/file',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}',cache:'no-store'});
   if(!response.ok){const data=await response.json() as Row;setSignIn(response.status===401);throw new Error(data.error??'The packet could not be opened');}
   const blob=await response.blob(),bytes=await blob.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
   if(hash!==packet?.sha256||hash!==response.headers.get('x-production-sha256'))throw new Error('The downloaded packet failed its integrity check');
   const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='production-'+packet.productionId+'.zip';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
   setReceipt(response.headers.get('x-production-receipt')??'');
   setPacket(current=>current?{...current,openedAt:current.openedAt??response.headers.get('x-production-served-at'),status:'opened'}:current);
  }catch(problem){setError(problem instanceof Error?problem.message:'The packet could not be opened');}
  finally{setOpening(false);}
 }
 return <div className="intake-page"><main aria-labelledby="production-title">
  <p className="brand">Satchel</p><div className="rule" aria-hidden="true"/>
  <h1 id="production-title">Evidence production</h1>
  {!packet&&!error&&<p role="status">Checking recipient access…</p>}
  {error&&<p className="error" role="alert">{error}</p>}
  {signIn&&<p><a href={'/signin?returnTo='+encodeURIComponent('/production/'+shareId)}>Sign in as the named recipient</a></p>}
  {packet&&<>
   <p className="intro">This packet was released to your authenticated account. Its privilege and legal hold labels are included in the packet.</p>
   <section className="receipt" aria-label="Release details">
    <p><strong>Recipient</strong><br/>{packet.recipientEmail}</p>
    <p><strong>Access expires</strong><br/>{new Date(packet.expiresAt).toLocaleString()}</p>
    <p><strong>Packet SHA-256</strong><code>{packet.sha256}</code></p>
    <p>{packet.size.toLocaleString()} bytes · ZIP packet</p>
    {packet.openedAt?<p>First opened: {new Date(packet.openedAt).toLocaleString()}. This disclosure remains recorded.</p>:<p>Opening the packet records disclosure to your account. An opened release cannot be recalled.</p>}
    <button type="button" disabled={opening||signIn} onClick={()=>void openPacket()}>{opening?'Opening packet…':'Download packet'}</button>
   </section>
   {receipt&&<p role="status">Packet download recorded. Receipt: <code style={{overflowWrap:'anywhere'}}>{receipt}</code></p>}
  </>}
 </main></div>;
}
