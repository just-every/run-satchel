import type { RunData } from '../base/run-site'

export const run: RunData = {
  name: 'Satchel',
  repository: 'https://github.com/just-every/run-satchel',
  clone: 'npx -y @runeditrun/rer dev just-every/run-satchel',
  folder: 'run-satchel',
  requirements: 'Runs on macOS, Linux or Windows with WSL2, with git. The installer brings Node when it is missing, and rer brings pnpm.',
  licence: 'MIT',
  docs: true,
  hosted: [],
}
