import {audit,digest,insist,now,stmt,type Data} from './model';
import type {InvoiceDeliveryEnv} from './invoice-notifications';

function base64(value:string){return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
// SendGrid signs ASN.1 DER ECDSA; WebCrypto verifies the 64-byte P1363 form.
function signatureBytes(der:Uint8Array){
 insist(der[0]===0x30&&der[1]===der.length-2,'Invalid event signature',401);let p=2;const out=new Uint8Array(64);
 for(let i=0;i<2;i++){insist(der[p++]===2,'Invalid event signature',401);const size=der[p++];insist(size>0&&size<=33&&p+size<=der.length,'Invalid event signature',401);let value=der.slice(p,p+size);p+=size;if(value.length===33){insist(value[0]===0,'Invalid event signature',401);value=value.slice(1);}insist(value.length<=32,'Invalid event signature',401);out.set(value,i*32+32-value.length);}
 insist(p===der.length,'Invalid event signature',401);return out;
}
export async function invoiceSendgridEvents(request:Request,env:InvoiceDeliveryEnv){
 insist(request.method==='POST','Use POST',405);insist(env.SENDGRID_EVENT_PUBLIC_KEY,'SendGrid event signature verification is not configured',503);
 const timestamp=request.headers.get('X-Twilio-Email-Event-Webhook-Timestamp')??'',signature=request.headers.get('X-Twilio-Email-Event-Webhook-Signature')??'';
 insist(/^\d{10}$/.test(timestamp)&&Math.abs(Date.now()/1000-Number(timestamp))<=300,'Stale or missing SendGrid event timestamp',401);
 const reader=request.body?.getReader();insist(reader,'Event payload required');const chunks:Uint8Array[]=[];let size=0;
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1000000){await reader.cancel();insist(false,'Event payload is too large',413);}chunks.push(part.value);}
 const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
 try{
  const keyBytes=base64(env.SENDGRID_EVENT_PUBLIC_KEY.replace(/-----[^-]+-----|\s/g,'')),key=await crypto.subtle.importKey('spki',keyBytes,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  const prefix=new TextEncoder().encode(timestamp),signed=new Uint8Array(prefix.length+raw.length);signed.set(prefix);signed.set(raw,prefix.length);
  insist(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,signatureBytes(base64(signature)),signed),'Invalid SendGrid event signature',401);
 }catch{insist(false,'Invalid SendGrid event signature',401);}
 let events:Data[];try{events=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{insist(false,'Invalid event JSON');}
 insist(Array.isArray(events)&&events.length<=1000,'Supply at most 1000 events');
 const writes:D1PreparedStatement[]=[],at=now(),system={id:'sendgrid-events',email:'sendgrid',role:'system',channel:'provider'} as any;
 const outcomes:Data={processed:'processed',delivered:'delivered',bounce:'bounced',deferred:'deferred',dropped:'dropped',spamreport:'complained',unsubscribe:'unsubscribed',group_unsubscribe:'unsubscribed'};
 for(const event of events){
  if(!event||typeof event!=='object'||!outcomes[event.event])continue;
  const eventId=String(event.sg_event_id??''),attemptId=String(event.rer_delivery_id??'');insist(eventId.length>0&&eventId.length<=500,'Provider event identity required');if(!attemptId)continue;
  const a=await stmt(env.DB,"SELECT a.*,d.recipient,b.matter_id FROM s_invoice_delivery_attempts a JOIN s_invoice_deliveries d ON d.id=a.delivery_id JOIN s_bills b ON b.id=d.bill_id WHERE a.id=? AND a.provider='sendgrid' AND a.status IN('sending','accepted','uncertain')",attemptId).first<Data>();if(!a)continue;
  insist(String(event.email??'').toLowerCase()===a.recipient,'Provider event recipient does not match the attempt',409);
  const messageId=String(event.sg_message_id??'');if(a.provider_id)insist(messageId===a.provider_id||messageId.startsWith(a.provider_id+'.'),'Provider message does not match the attempt',409);
  insist(Number.isSafeInteger(event.timestamp)&&event.timestamp>=0&&event.timestamp<=Date.now()/1000+300,'Invalid provider event time');
  const status=outcomes[event.event],hash=await digest(JSON.stringify(event)),existing=await stmt(env.DB,'SELECT * FROM s_invoice_delivery_events WHERE id=?',eventId).first<Data>();
  if(existing){insist(existing.attempt_id===a.id&&existing.payload_digest===hash,'Provider event identity was reused with different data',409);continue;}
  writes.push(stmt(env.DB,'INSERT OR IGNORE INTO s_invoice_delivery_events VALUES(?,?,?,?,?,?)',eventId,a.id,status,new Date(event.timestamp*1000).toISOString(),at,hash),audit(env.DB,system,'invoice.provider_event',a.id,JSON.stringify({providerEventId:eventId,status,payloadDigest:hash}),{matterId:a.matter_id}));
 }
 if(writes.length)await env.DB.batch(writes);return Response.json({received:true},{headers:{'cache-control':'no-store'}});
}
