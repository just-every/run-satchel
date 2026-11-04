// The descriptor owns public action metadata; runtime handlers and the guide consume it together.
// Classifier fixture expectations remain independently declared in its journey, never computed here.
import surface from '../../../agent-surface.json' with { type: 'json' }
import type { ToolDefinition } from '../../modules/agent-door/types.ts'
import type { Capability } from '../../modules/agent-door/capabilities.mjs'
import { capabilitySet } from '../../modules/agent-door/capabilities.mjs'

type Action = Pick<ToolDefinition, 'name' | 'title' | 'description' | 'scope' | 'readOnly' | 'classes' | 'clauses'>
export const actions = surface.tools as Action[]
export const specialist = surface.specialist
export const declaredCapabilities = surface.capabilities as Capability[]
export const capacityLimits = { requestsPerMinute: 600, maxBodyBytes: 1048576 }
export const scopes = [...new Set(actions.map(tool => tool.scope))]
export function action(name: string): Action {
  const entry = actions.find(tool => tool.name === name)
  if (!entry) throw new Error(`Missing action metadata: ${name}`)
  return { ...entry, classes: [...entry.classes], clauses: [...entry.clauses] }
}

const code = (value: string) => '`' + value.replaceAll('`', '') + '`'
const table = (headers: string[], rows: string[][]) => [headers, headers.map(() => '---'), ...rows].map(row => '| ' + row.join(' | ') + ' |').join('\n')
const source = (path: string, label = path) => `[${label}](../${path})`

/** Public reference generated at site build time; the Markdown copy is for source readers. */
export function agentReference(): string {
  const capabilities = capabilitySet(declaredCapabilities)
  const fixtures = surface.journey.filter(step => step.expect.some(item => item.class !== 'standard'))
  return `## Tools by job

The specialist is **${specialist}**. These are the registry's possible classes, not a permission grant. An authenticated listing also requires current policy answers; an unset or paused policy can hide the tools. On narrow screens, scroll tables sideways, or focus a table and use the arrow keys.

${table(['Job', 'Tool', 'Scope', 'Read only', 'Possible classes'], actions.map(tool => [tool.title, code(tool.name), code(tool.scope), tool.readOnly ? 'Yes' : 'No', tool.classes.map(code).join(', ')]))}

Every tool carries input and output schemas in the authenticated MCP listing. Mutating calls require an idempotency key; a replay returns the retained outcome. These jobs prepare native records for a person's review and never grant external execution.

## Computed class fixtures

${code('standard')} describes an internal preparation with measure 1. Approved selected health-source versions add ${code('sensitive')} with their native record count and kind ${code('health')}. Caller risk flags and instructions embedded in source text cannot remove it. The fixture calls below independently declare their expected classes in ${source('agent-surface.json')}; ${source(surface.verification.journey)} executes them through MCP and the maintained conformance journey checks the actual decisions under autonomous and held policies.

${table(['Fixture call', 'Tool', 'Expected classes and facts'], fixtures.map(step => [code(step.id), code(step.tool), step.expect.map(item => code(item.class) + ' ' + code(JSON.stringify(item.facts))).join('; ')]))}

The paired calls without health sources are ${surface.journey.filter(step => !step.expect.some(item => item.class !== 'standard')).map(step => code(step.id)).join(', ')}. Read the descriptor for their exact argument references and injected caller flags; fixture expectations are proof targets, not classification input.

## Declared capability families

Declared: ${capabilities.declared.map(code).join(', ')}. Undeclared and refused: ${capabilities.refused.map(code).join(', ')}.

${table(['Public surface', 'Current behavior'], [
  ['Resource templates', surface.resources.length ? surface.resources.map(code).join(', ') : 'None. The resource-template listing is empty; resource reads return ' + code('capability_not_declared') + '.'],
  ['Event types', 'None published. The event-list tool is absent and calls return ' + code('capability_not_declared') + '.'],
  ['Specialist prompts', 'None published. The prompt listing is empty and retrieval returns ' + code('capability_not_declared') + '.'],
  ['Subscriptions', 'Undeclared. Listening returns ' + code('capability_not_declared') + '; discovery advertises no change subscription.'],
])}

Internal pending-proposal adapters and internal event records do not declare a public resource or event family. The current descriptor enables only the families above; it does not narrow the full contract.

## Capacity and refusals

The installation admits ${capacityLimits.requestsPerMinute} requests per minute per agent and at most ${capacityLimits.maxBodyBytes} request-body bytes. Capacity protects the installation; it is not a daily business allowance, a provider-spend budget or execution authority. Overrun returns HTTP 429 with ${code('Retry-After')}; an oversized body returns HTTP 413. Transport and policy errors are described in ${source('src/modules/agent-door/README.md', 'the door protocol reference')}.

${table(['Common code', 'Meaning and next step'], [
  ['capability_not_declared', 'This public family is not enabled; a different credential does not enable it.'],
  ['policy_unset', 'A person must complete current company policy setup.'],
  ['policy_blocked', 'The current policy refuses the classified call.'],
  ['approval_required', 'The named person must decide at the supplied approval URL.'],
  ['agents_paused', 'A person must resume agents before another call.'],
  ['native_delegation_required', 'The sponsor must review the exact native key and agent binding.'],
  ['native_authority_required', 'Current native role, matter access or delegation refuses the call.'],
  ['native_conflict', 'Current native state conflicts with the requested preparation.'],
  ['resource_unavailable', 'The selected native record is unavailable to this authority.'],
  ['idempotency_conflict', 'That identity was already used for different arguments; reconcile the original outcome.'],
].map(([error, meaning]) => [code(error), meaning]))}

## Outstanding contract obligations

This reference documents the declared preparation subset. Registry-derived discovery instructions, public specialist prompt delivery, the complete stranger-agent specialist journey and every remaining full-contract conformance point under autonomous and held policies remain required by BASE-AGENT-013. Resource refresh, successful multi-sponsor isolation, provider mail, timed and queued lifecycle, dual-host operation, owner-native administration, broader ct workflow parity and client custody and redaction remain unproved. See ${source('CONTRACT.md', 'the contract and its Status gaps')}.

AGENT-010 retains the principal-approved native-preparation, sponsor-recipient, zero-spend, no-training and no-outbound-execution floor. Full scoped delegation and provider boundaries await ct approval; canonical generated contract documents await ct cleanup. This guide enables no capability or authority and releases no other lane hold.
`
}

export function withAgentReference(markdown: string): string {
  const start = '<!-- agent-reference:start -->', end = '<!-- agent-reference:end -->'
  const first = markdown.indexOf(start), last = markdown.indexOf(end)
  if (first < 0 || last < first || markdown.indexOf(start, first + start.length) !== -1 || markdown.indexOf(end, last + end.length) !== -1) throw new Error('Agent reference markers are missing or duplicated')
  return markdown.slice(0, first + start.length) + '\n\n' + agentReference() + '\n' + markdown.slice(last)
}
