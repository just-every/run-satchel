import assert from 'node:assert/strict';

export const recoveryIntegration=(h,matter)=>h.json('/integrations',{label:'Recovery docket receiver',matterIds:[matter.id],scopes:['tasks:read'],endpoint:'https://receiver.example.com/events',eventTypes:['task.changed']},h.owner);
export async function proveRecoveryConnectors(h,edge,matter){
 const integration=await recoveryIntegration(h,matter),path='/integrations/'+integration.id;
 const task=title=>h.json('/matters/'+matter.id+'/tasks',{title,priority:'normal'},h.owner);
 const diagnostics=()=>h.json('/diagnostics',undefined,h.owner);
 const connector=data=>data.connectors.find(c=>c.id==='integration:'+integration.id);
 const queue=data=>data.jobs.find(j=>j.id==='webhooks');
 await task('Review restored docket');
 let data=await diagnostics(),journal=await h.json(path+'/journal',undefined,h.owner);
 assert.equal(queue(data).queued,journal.health.queued);assert.equal(queue(data).queued,1,'Unclaimed source events are queued work too');
 assert.equal(connector(data).authorization,'authorized');assert.equal(connector(data).lastAcceptedAt,null);
 await h.json(path+'/dispatch',{},h.owner);data=await diagnostics();journal=await h.json(path+'/journal',undefined,h.owner);
 const accepted=journal.health.lastSuccessfulSync;assert.ok(accepted);assert.equal(connector(data).lastAcceptedAt,accepted);assert.equal(connector(data).lastHttpStatus,204);
 await task('Resolve receiver outage');edge.webhookStatus=503;await h.json(path+'/dispatch',{},h.owner);
 data=await diagnostics();journal=await h.json(path+'/journal',undefined,h.owner);
 assert.equal(queue(data).uncertain,journal.health.uncertain);assert.equal(queue(data).uncertain,1);assert.equal(connector(data).lastAcceptedAt,accepted);assert.equal(connector(data).lastHttpStatus,503);
 await task('Keep this source work queued');await h.json(path+'/rotate',{},h.owner);data=await diagnostics();
 assert.equal(connector(data).authorization,'authorized','Pausing delivery does not revoke API reads');assert.equal(connector(data).deliveryPaused,true);assert.ok(connector(data).nextAction);
 await h.json(path+'/revoke',{},h.owner);data=await diagnostics();
 assert.equal(connector(data).authorization,'revoked');assert.equal(connector(data).lastAcceptedAt,accepted);assert.equal(connector(data).lastSuccessfulReadAt,null);
 await h.json('/v1/matters',undefined,'',401,{authorization:'Bearer '+integration.key});
 assert.ok(!JSON.stringify(data).includes(integration.key));assert.ok(!JSON.stringify(data).includes(integration.signingSecret));assert.ok(!JSON.stringify(data).includes('https://receiver.example.com/events'));
 console.log('PROBE FIRM-007 connector diagnostics: native queued event and receiver replies -> unclaimed queue counted; acceptance retained through uncertainty and revocation; credential refused and absent from diagnostics');
}
