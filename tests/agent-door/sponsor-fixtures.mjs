import assert from 'node:assert/strict';

// Sessions and native credentials live only in this disposable verifier process.
const members = new Map();
let admissionState;
const labels = ['inactive', 'excluded'];
const cookies = response => response.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ');
const address = label => ['synthetic-satchel-' + label, 'example.invalid'].join('@');

function personDoor({request, origin}, cookie) {
 return async (path, body, expected = 200) => {
  const response = await request(origin + path, {
   method: body === undefined ? 'GET' : 'POST', redirect: 'manual',
   headers: {Origin: origin, Cookie: cookie, 'Content-Type': 'application/json'},
   ...(body === undefined ? {} : {body: JSON.stringify(body)}),
  });
  if(response.status !== expected)console.log('Sponsor native door refused: '+path+' HTTP '+response.status);
  assert.equal(response.status, expected, 'Native sponsor lifecycle: ' + path);
  return response;
 };
}
const memberBody = (member, role = 'lawyer', active = true) => ({email: member.email, name: member.name, role, active});

/** Invite and confirm real members before the signed Business roster binds them. */
export async function initializeSponsors(reviewers, cookie) {
 members.clear();
 for (const label of labels) await reviewers.initialize(label, {cookie});
}

/** Reviewer initialization, Business subject binding, or a maintained phase fixture. */
export default async function sponsors(context) {
 const {phase, label, email, sub, owner, mail, request, origin} = context;
 if (phase !== undefined) {
  if (phase !== 'negative') return {};
  const native = personDoor(context, context.cookie);
  const inactive = members.get('inactive'), excluded = members.get('excluded');
  assert.ok(inactive?.sub && excluded?.sub, 'Real Business subjects were bound');
  await native('/api/satchel/team', memberBody(inactive, 'lawyer', false));
  await native('/auth/operator/status', {operatorId: inactive.operatorId, status: 'inactive'});
  await native('/api/satchel/team', memberBody(excluded, 'billing'));
  const roster = await (await native('/api/satchel/state')).json();
  assert.equal(roster.members.find(member => member.email === inactive.email)?.active, 0);
  assert.equal(roster.members.find(member => member.email === excluded.email)?.role, 'billing');
  const bindings = (await (await context.database('DB')).prepare('SELECT email,operator_id,business_id,state FROM bs_team ORDER BY email').all()).results;
  for(const member of [inactive,excluded]){
   const binding=bindings.find(row=>row.operator_id===member.operatorId);
   assert.equal(binding?.business_id,member.sub,'Original Business subject remains bound to the invited native person');
   assert.equal(binding?.email,member.email,'Original native email remains bound');
   assert.equal(binding?.state,'active','Business roster does not mask native membership refusal');
  }
  const operators = await (await native('/auth/operators')).json();
  assert.equal(operators.find(person => person.id === inactive.operatorId)?.status, 'inactive');
  assert.equal(operators.find(person => person.id === excluded.operatorId)?.status, 'active');
  admissionState=await nativeState(context);
  console.log('Sponsor fixtures: real inactive member and active billing member; original Business bindings retained');
  return {sponsors: Object.fromEntries(labels.map(label => {
   const member = members.get(label);
   return [label, {sub: member.sub, email: member.email}];
  }))};
 }
 if (sub !== undefined) {
  const member = members.get(label);
  assert.equal(member?.email, email, 'Bind the original invited member address');
  member.sub = sub;
  return new Response(null, {status: 303, headers: {'Set-Cookie': member.cookie, Location: '/app'}});
 }
 assert.equal(email, address(label));
 const native = personDoor(context, owner.cookie), name = 'Synthetic Satchel ' + label;
 await native('/api/satchel/team', {email, name, role: 'lawyer'});
 await native('/api/satchel/team/invite', {email});
 const invitation = mail.read().toReversed().find(message => /\/auth\/confirm\?token=/.test(message.text));
 const token = invitation?.text.match(/\/auth\/confirm\?token=([^\s"&<]+)/)?.[1];
 assert.ok(token, 'Native invitation reached the declared disposable mailbox');
 const confirmed = await request(origin + '/auth/confirm', {method: 'POST', redirect: 'manual', headers: {Origin: origin, 'Content-Type': 'application/json'}, body: JSON.stringify({token})});
 assert.equal(confirmed.status, 303, 'Consume the native invitation');
 const cookie = cookies(confirmed), memberDoor = personDoor(context, cookie);
 const session = await (await memberDoor('/auth/session')).json();
 assert.equal(session.operator.email, email);
 assert.equal((await (await memberDoor('/api/satchel/me')).json()).role, 'lawyer');
 const key = await (await memberDoor('/api/satchel/keys', {label: name})).json();
 members.set(label, {email, name, cookie, operatorId: session.operator.id, key});
 return confirmed;
}

async function nativeState({database}) {
 const db=await database('DB');
 const read=async sql=>(await db.prepare(sql).all()).results;
 return {proposals:await read('SELECT id,status,payload,delegation_id FROM s_proposals ORDER BY id'),delegations:await read('SELECT id,key_id,used_jobs,revoked_at FROM s_agent_delegations ORDER BY id')};
}

export async function verifySponsorProbeState(context){
 assert.ok(admissionState,'Negative sponsor probes were prepared');
 assert.deepEqual(await nativeState(context),admissionState,'Signed admission refusals leave every native proposal and delegation unchanged');
 console.log('Sponsor admission: signed probes leave all native proposals and delegations unchanged');
}

/** Previously usable native preparations stop on the very next changed membership. */
export async function proveSponsorLifecycle(context, matterId) {
 const native = personDoor(context, context.cookie);
 for (const label of labels) {
  const member = members.get(label);
  await native('/auth/operator/status', {operatorId: member.operatorId, status: 'active'});
  await native('/api/satchel/team', memberBody(member));
  await native('/api/satchel/matters/' + matterId + '/access', {email: member.email});
  const agreement = await (await native('/api/satchel/agent-agreements', {keyId: member.key.id, processor: 'Native preparation only', modelRevision: 'native-proposal', agreementReference: 'Synthetic counsel-reviewed agreement', retentionTerms: 'Firm-owned originals; retained decision evidence', trainingTerms: 'No training or secondary use', trainingAllowed: false, expiresAt: '2099-12-31T00:00:00.000Z', confirmed: true})).json();
  const grant = await (await native('/api/satchel/agent-delegations', {keyId: member.key.id, agreementId: agreement.id, matterId, actions: ['context', 'prepare-matter'], recipients: [member.email], maxJobs: 10, spendCents: 0, expiresAt: '2099-12-30T00:00:00.000Z', stopRule: 'Stop on revoked authority', escalationEmail: context.email, sources: [], confirmed: true})).json();
  const prepare = () => requestPreparation(context, member.key.key, grant.id);
  const witness = () => nativeState(context);
  for (const role of label === 'inactive' ? ['lawyer'] : ['billing', 'accountant', 'client']) {
   await native('/api/satchel/team', memberBody(member));
   const allowed = await prepare();
   assert.equal(allowed.status, 200, 'Current counsel can prepare within the principal-approved grant');
   const result=await allowed.json();
   assert.equal(result.status, 'pending', 'Preparation remains human-reviewed');
   await native('/api/satchel/team', memberBody(member, role, label !== 'inactive'));
   const before = await witness(), refused = await prepare();
   assert.equal(refused.status, 403, 'Changed membership stops the next previously authorized preparation');
   assert.equal(typeof (await refused.json()).error, 'string', 'Native refusal is typed');
   assert.deepEqual(await witness(), before, 'Refusal changes no proposal or delegation state');
   console.log('Sponsor lifecycle: ' + (label === 'inactive' ? 'inactive' : role) + ' -> HTTP 403; native state unchanged');
  }
 }
}

function requestPreparation({request, origin}, key, delegationId) {
 return request(origin + '/api/satchel/agent/prepare-matter', {method: 'POST', headers: {Origin: origin, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'x-satchel-delegation': delegationId}, body: JSON.stringify({title: 'Synthetic membership preparation', client: 'Synthetic client', adverse: 'Synthetic counterparty'})});
}
