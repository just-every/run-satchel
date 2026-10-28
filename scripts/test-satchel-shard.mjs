// Explicit file groups avoid filename-order drift in Node's round-robin shards.
// Run --check after regrouping; every Satchel test file must occur exactly once.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';

const shards = JSON.parse(readFileSync('.github/satchel-shards.json', 'utf8'));
assert.equal(shards.length, 8, 'Verify must retain eight shard jobs');
assert.ok(shards.every(files => Array.isArray(files) && files.length > 0), 'Every shard needs files');
const assigned = shards.flat();
assert.ok(assigned.every(file => typeof file === 'string' && /^[a-z0-9-]+\.test\.mjs$/.test(file)), 'Invalid test filename');
assert.equal(new Set(assigned).size, assigned.length, 'A test file appears in more than one shard');
const discovered = readdirSync('tests/satchel').filter(file => file.endsWith('.test.mjs')).sort();
assert.deepEqual([...assigned].sort(), discovered, 'Update satchel-shards.json to cover every test file exactly once');

const [argument, ...extra] = process.argv.slice(2);
assert.equal(extra.length, 0, 'Usage: node scripts/test-satchel-shard.mjs <1-8|--check>');
if (argument === '--check') {
  console.log(`Satchel shards: ${assigned.length} files, eight groups, no omissions or duplicates`);
} else {
  assert.match(argument ?? '', /^[1-8]$/, 'Choose a shard from 1 to 8');
  const files = shards[Number(argument) - 1].map(file => `tests/satchel/${file}`);
  console.log(`Satchel shard ${argument}/8: ${files.length} files, two file workers`);
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=2', ...files], {stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.signal) throw Error(`Satchel shard terminated by ${result.signal}`);
  process.exitCode = result.status;
}
