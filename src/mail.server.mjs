import { createMailSender } from './modules/mail/index.mjs'

// MAIL_PROVIDER=none: the firm runs without outbound mail (the hosted demo keeps its development outbox). No sender exists, and every
// send site records the refusal under the code mail_off instead of contacting a provider.
export const mailOff = env => env.MAIL_PROVIDER === 'none' && env.RER_DEMO !== '1'
export const MAIL_OFF = 'Outbound mail is off for this firm (mail_off); nothing was sent'

export function operatorMail(env) {
 if (env.RER_DEMO === '1') return createMailSender({ provider: 'development', mode: 'development' })
 if (mailOff(env)) return undefined
 return env.MAIL_PROVIDER === 'development'
  ? env.AUTH_LOCAL === 'true' ? createMailSender({ provider: 'development', mode: 'development' }) : undefined
  : env.MAIL_PROVIDER ? createMailSender({ provider: env.MAIL_PROVIDER, mode: 'production', apiKey: env.MAIL_API_KEY, ...(env.MAIL_PROVIDER === 'rer' ? { relayUrl: env.MAIL_RELAY_URL } : {}), ...(env.MAIL_PROVIDER === 'cloudflare' ? { accountId: env.MAIL_ACCOUNT_ID } : {}) }) : undefined
}
