import {queuedEntrypoint} from '@runeditrun/rer/queued-entry';
const queued=await queuedEntrypoint(import.meta.url,'verify:email-link');if(queued!==null)process.exit(queued);
// Exercise the emitted Worker and real email-link lifecycle at the paid provider edge.
import assert from 'node:assert/strict';
import {harness} from './satchel/harness.mjs';
const h=await harness();
try {
 assert.equal(h.mails.length,1,'owner sign-in submitted to provider');
 assert.equal((await h.request('/__dev/outbox')).status,404);
 const session=await h.request('/auth/session',undefined,h.owner);
 assert.equal(session.status,200);
 assert.equal((await session.json()).operator.email,'owner@example.test');
 console.log('Email-link sign-in passed against the emitted Worker: claim, provider submission, confirmation, session');
}finally{await h.close();}
