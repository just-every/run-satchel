import {readFile,writeFile} from 'node:fs/promises';
import {withAgentReference} from '../src/satchel/door/catalogue.ts';
const path='docs/agents.md',before=await readFile(path,'utf8'),after=withAgentReference(before);
if(process.argv[2]==='write')await writeFile(path,after);
else if(process.argv[2]!=='check')throw Error('Usage: node scripts/agent-reference.mjs write|check');
else if(before!==after)throw Error('Agent reference is stale; run node scripts/agent-reference.mjs write');
console.log('Agent reference '+process.argv[2]+' passed');
