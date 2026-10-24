import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {deploymentSpec} from './delivery/base/spec.mjs';
const root = process.cwd();
const config = JSON.parse(await readFile(new URL('../packaging.json', import.meta.url), 'utf8'));
const spec = await deploymentSpec(root, config.artifact.specInputs);
const bytes = `${JSON.stringify(spec, null, 2)}\n`;
const destination = new URL('../management/integration/deployment-spec.json', import.meta.url);
if (process.argv.includes('--check')) {
  if (await readFile(destination, 'utf8') !== bytes) throw Error('Deployment specification is stale; run pnpm delivery:spec after building.');
  console.log('Deployment specification matches the real build and source policy.');
} else {
  await mkdir(new URL('.', destination), {recursive: true});
  await writeFile(destination, bytes);
  console.log(`Wrote deployment specification with ${spec.migrations.length} migrations.`);
}
