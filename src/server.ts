import {scheduledFees} from './satchel/fee-scheduler'
import {recoverIntakeUploads} from './satchel/intake-files'
import {dispatchWebhooks} from './satchel/webhooks'
import {purgeIntakeSecurity} from './satchel/intake-submissions'
import {runReminders} from './satchel/reminder-scheduler'
import {runFollowups} from './satchel/followup-worker'
import { withDemo } from './modules/demo/index.mjs'
import { seedDemo } from './demo'
import { rejectedResponse } from './base/rejected-response'
import start from '@tanstack/react-start/server-entry'
import { api } from './satchel/api'
import { dispatch } from './base/dispatch'
import { staticAssetResponse } from './base/static-assets'
import { deploymentHealth } from './base/deployment-health'
import { lobbyResponse } from './base/lobby'
import { setupStateResponse } from './base/setup-state'
import { authResponse, runtimeBindings, type Bindings } from './auth.server'
import { identity } from './identity'

// Start documents keep their own cache policy and add no-transform, so no proxy
// rewrites the HTML React hydrates (Cloudflare's email address obfuscation
// honours it; src/base/hydration/README.md).
function noTransform(response: Response): Response {
  const headers = new Headers(response.headers), policy = headers.get('cache-control')
  headers.set('cache-control', policy ? `${policy}, no-transform` : 'no-transform')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export default withDemo({
  async scheduled(controller,env) { await Promise.all([scheduledFees(runtimeBindings(env).DB,controller.scheduledTime),dispatchWebhooks(runtimeBindings(env)),runReminders(runtimeBindings(env),controller.scheduledTime),runFollowups(runtimeBindings(env),controller.scheduledTime),purgeIntakeSecurity(runtimeBindings(env).DB,new Date(controller.scheduledTime).toISOString()),recoverIntakeUploads(runtimeBindings(env),new Date(controller.scheduledTime).toISOString())]) },
  async fetch(request, env, execution) {
    const asset = await staticAssetResponse(request, env)
    if (asset) return asset
    const auth = await authResponse(request, env)
    if (auth) return auth
    // The installed variant: the Lobby at / and the public claim state it reads.
    // Local dev serves the saved origin's data at its own port (RER_DEV_ORIGIN).
    const state = await setupStateResponse(request, runtimeBindings(env))
    if (state) return state
    const lobby = await lobbyResponse(request, runtimeBindings(env), identity)
    if (lobby) return lobby
    const response=await dispatch(request, () => api.fetch(request, env, execution), async () => noTransform(await start.fetch(request)))
    if(/^\/(intake|book|consultation|followup)\//.test(new URL(request.url).pathname)){response.headers.set('referrer-policy','strict-origin');response.headers.set('cache-control','no-store, no-transform');response.headers.set('x-content-type-options','nosniff');}
    return rejectedResponse(request,response)
  },
} satisfies ExportedHandler<Bindings>, { seed: seedDemo })
