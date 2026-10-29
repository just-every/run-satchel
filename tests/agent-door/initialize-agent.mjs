import assert from 'node:assert/strict';

/** Bind the verifier-selected identity before its first MCP request. */
export default async function initialize({agentId, request}) {
 const response = await request('/api/satchel/team');
 assert.equal(response.ok, true, 'Read principal-owned preparation keys');
 const {keys} = await response.json();
 const key = keys.find(key => key.label === 'Declared company preparation' && !key.revoked);
 assert.ok(key, 'Principal-created native preparation key');
 const bound = await request('/api/satchel/agent-keys/' + key.id + '/business', {
  method: 'POST', body: JSON.stringify({agentId, confirmed: true}),
 });
 assert.equal(bound.ok, true, 'Bind the exact selected agent through the native person door');
}
