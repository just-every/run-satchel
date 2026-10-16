import type { RunData } from '../base/run-site'

export const run: RunData = {
  name: 'Satchel',
  repository: 'https://github.com/just-every/run-satchel',
  clone: 'npx -y @runeditrun/rer dev just-every/run-satchel',
  folder: 'run-satchel',
  requirements: 'Needs Node 22 or later and pnpm 10.12.4, on macOS, Linux or Windows with WSL2.',
  licence: 'MIT',
  docs: true,
  hosted: [],
}
