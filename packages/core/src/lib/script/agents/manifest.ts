import { validator, type Json } from '@exodus/schemasafe'
import type { ManifestParseResult } from '$lib/script/authorization/manifests'

/** A stored agent (AGT-2). */
interface AgentRecord {
  subject: string
  label: string
  tokenHash: string
  roles: string[]
  createdAt: number
  createdBy: string
}

interface AgentsManifest {
  agents: Record<string, Omit<AgentRecord, 'subject'>>
}

const agentsManifestSchema = {
  type: 'object',
  properties: {
    agents: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          tokenHash: { type: 'string', pattern: '^[0-9a-f]{64}$' },
          roles: { type: 'array', items: { type: 'string' } },
          createdAt: { type: 'number' },
          createdBy: { type: 'string' }
        },
        required: ['label', 'tokenHash', 'roles', 'createdAt', 'createdBy'],
        additionalProperties: false
      }
    }
  },
  required: ['agents'],
  additionalProperties: false
} as const

const validateAgentsManifest = validator(agentsManifestSchema as never, { includeErrors: true })

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** AGT-2: fails closed, as the other manifests do. */
function parseAgentsManifest (raw: unknown): ManifestParseResult<AgentRecord[]> {
  if (!validateAgentsManifest(raw as Json)) {
    return { ok: false, reason: `agents-manifest-malformed: ${JSON.stringify(validateAgentsManifest.errors ?? [])}` }
  }
  const { agents } = raw as AgentsManifest
  const subjects = Object.keys(agents)
  const unsafe = subjects.find(subject => UNSAFE_KEYS.has(subject))
  if (unsafe !== undefined) return { ok: false, reason: `agents-manifest-unsafe-subject: ${unsafe}` }
  return { ok: true, value: subjects.map(subject => ({ subject, ...agents[subject] })) }
}

function serializeAgentsManifest (agents: AgentRecord[]): AgentsManifest {
  const stored: AgentsManifest['agents'] = Object.create(null)
  for (const { subject, ...record } of agents) stored[subject] = record
  return { agents: stored }
}

export { parseAgentsManifest, serializeAgentsManifest }
export type { AgentRecord, AgentsManifest }
