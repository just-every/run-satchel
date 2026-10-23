import {queuedEntrypoint} from '@runeditrun/rer/queued-entry';
const queued=await queuedEntrypoint(import.meta.url,'verify:email-link');if(queued!==null)process.exit(queued);
// The installer keeps this entry point; Verify runs the same authentication
// journey with the rest of the suite, without booting a second Worker harness.
import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-name-pattern=^native authentication,','tests/satchel/flows.test.mjs'],{stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
