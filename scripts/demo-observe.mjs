// Used only by run-demo's test host workflow. Retain admission diagnostics,
// never request headers, cookies, bodies or the tail credential.
import { appendFileSync } from 'node:fs'
const account = process.env.CLOUDFLARE_ACCOUNT_ID
if (account !== 'b20c0ca9cab0c2b70e13d7cf724b89bd') throw Error('wrong_account')
const worker = process.argv[2], output = process.argv[3]
if (!worker?.endsWith('-demo-test--demo') || !output) throw Error('test_host_required')
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${worker}/tails`
const headers = { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' }
const result = await fetch(endpoint, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(30000) })
const created = await result.json()
if (!result.ok || !created.success) throw Error(`tail_create_failed_${result.status}`)
const tail = created.result
const record = data => appendFileSync(output, JSON.stringify(data) + '\n')
let socket
try {
 socket = new WebSocket(tail.url, 'trace-v1')
 socket.binaryType = 'arraybuffer'
 await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('tail_connect_timeout')), 30000)
  socket.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
  socket.addEventListener('error', () => { clearTimeout(timer); reject(Error('tail_connect_failed')) }, { once: true })
 })
 record({ event: 'observation_started', at: new Date().toISOString(), worker })
 console.log('Admission observation started')
 socket.addEventListener('message', message => {
  const event = JSON.parse(typeof message.data === 'string' ? message.data : new TextDecoder().decode(message.data))
  for (const log of event.logs ?? []) for (const part of log.message ?? []) {
   if (typeof part !== 'string') continue
   let data
   try { data = JSON.parse(part) } catch { continue }
   if (data.event === 'demo_admitted') record({ at: new Date(log.timestamp).toISOString(), event: data.event, correlation: data.correlation, agent: data.agent, network: data.network })
  }
 })
 await new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, 15 * 60 * 1000)
  socket.addEventListener('close', () => { clearTimeout(timer); reject(Error('tail_closed_during_observation')) }, { once: true })
  socket.addEventListener('error', () => { clearTimeout(timer); reject(Error('tail_failed_during_observation')) }, { once: true })
 })
 record({ event: 'observation_completed', at: new Date().toISOString() })
 console.log('Fifteen-minute admission observation completed')
} finally {
 socket?.close()
 const removed = await fetch(`${endpoint}/${tail.id}`, { method: 'DELETE', headers, signal: AbortSignal.timeout(30000) })
 if (!removed.ok) throw Error(`tail_remove_failed_${removed.status}`)
}
// The remote tail is deleted; do not keep CI alive for a WebSocket close handshake.
console.log('Operator tail removed')
process.exit(0)
