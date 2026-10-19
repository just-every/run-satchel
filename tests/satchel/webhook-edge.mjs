// Test-only network edge. Application authorization, queueing and signing run in
// the built Satchel Worker; only the enforcing transport/provider boundary is fake.
import {WorkerEntrypoint} from 'cloudflare:workers';
export class WebhookEdge extends WorkerEntrypoint {
 async send(wire) {
  const response=await fetch(wire.url,{method:'POST',headers:wire.headers,body:wire.body,redirect:'manual'});
  await response.body?.cancel();return {status:response.status};
 }
}
export default {fetch:()=>new Response(null,{status:404})};
