// This edition's identity: what its installed Lobby and its run site say.
// The name and colour are the ones setup saves in src/branding.json; replace
// the purpose and tagline with the product's own when it has one.
import type { EditionIdentity } from './base/identity'
import branding from './branding.json'

export const identity: EditionIdentity = {
  product: branding.name,
  deployment: branding.name,
  purpose: '{deployment} keeps matters, documents, deadlines and reviewed bill packages together.',
  tagline: 'Every matter, under control. Free, open source practice management for US small law firms.',
  runSite: 'https://run-satchel.com',
  signInPath: '/signin',
  // An installed instance serves the Lobby at /.
  installedHome: 'lobby',
  theme: '/rer-theme.css',
  mark: '/brand/mark.svg',
  fonts: '/fonts/fonts.css',
  accentColor: branding.primaryColor,
}
