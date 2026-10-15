import { createMailSender } from './modules/mail/index.mjs'
import { demoEffect } from './modules/demo/index.mjs'

export function operatorMail(env) {
 const real = () => env.MAIL_PROVIDER === 'development'
  ? env.AUTH_LOCAL === 'true' ? createMailSender({ provider: 'development', mode: 'development' }) : undefined
  : env.MAIL_PROVIDER ? createMailSender({ provider: env.MAIL_PROVIDER, mode: 'production', apiKey: env.MAIL_API_KEY, ...(env.MAIL_PROVIDER === 'cloudflare' ? { accountId: env.MAIL_ACCOUNT_ID } : {}) }) : undefined
 // Construct real provider configuration only when the effect will run.
 return env.RER_DEMO === '1' ? { send: message => demoEffect(() => real()?.send(message), () => ({ provider: 'development', status: 'accepted', providerMessageId: null })) } : real()
}
