import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { memory } from '$lib/script/testing/memoryStorage'
import { declared, declareAgent, clearDeclarations, captureConsole } from '$lib/script/testing/host'
import { importModule, principal } from '$lib/script/testing/requests'

vi.mock('$lib/script/host.server', async (importOriginal) => {
  const { withDeclarations } = await import('$lib/script/testing/host')
  const { host } = await importOriginal<typeof import('$lib/script/host.server')>()
  return { host: withDeclarations(host) }
})
vi.mock('$lib/script/storage/providers.server', async () => (await import('$lib/script/testing/memoryStorage')).memoryProviders)
vi.mock('$lib/script/signing/keyResolution.server', async () => (await import('$lib/script/testing/signingKeys')).testKeyResolution)
vi.mock('$lib/script/securityPolicy/policy.server', async (importOriginal) => ({
  ...await importOriginal<typeof import('$lib/script/securityPolicy/policy.server')>(),
  loadSecurityPolicy: async () => (await import('$lib/script/testing/signingKeys')).testSecurityPolicy
}))

const AGENTS_PATH = '.genoacms/security/agents.json'
const REJECTED_DIRECTORY = '.genoacms/security/rejected/'
const DECLARED_TOKEN = 'declared-token-of-the-e2e-builder-0123456789'

const administration = async () => await importModule('$lib/script/agents/administration.server')
const authentication = async () => await importModule('$lib/script/agents/authenticate.server')

beforeEach(() => {
  memory.clear()
  clearDeclarations()
  declared.roles.Builder = [{ permission: 'pages:read', resource: '*' }]
  declareAgent('agent:e2e-builder', DECLARED_TOKEN, ['Builder'])
})

describe('the agents manifest', () => {
  it('AGT-2: the agents manifest round-trips, signed, and a tampered one is not trusted', async () => {
    captureConsole()
    const { createAgent } = await administration()
    const { agentForToken } = await authentication()
    const created = await createAgent(principal(['config:users:manage']), { name: 'writer', label: 'W', roles: ['Builder'] })
    expect(memory.json(AGENTS_PATH)).toMatchObject({ type: 'genoacms.agents.v1' })
    expect(await agentForToken(created.token)).toBe('agent:writer')

    const forged = 'gat_forged-token-that-nobody-issued-000000000'
    const tampered = memory.json(AGENTS_PATH)
    tampered.payload.agents['agent:writer'].tokenHash = createHash('sha256').update(forged, 'utf8').digest('hex')
    memory.set(AGENTS_PATH, JSON.stringify(tampered))

    expect(await agentForToken(forged)).toBeUndefined()
    expect(await agentForToken(created.token)).toBeUndefined()
    expect(memory.names().some(name => name.startsWith(REJECTED_DIRECTORY))).toBe(true)
    expect(await agentForToken(DECLARED_TOKEN)).toBe('agent:e2e-builder')
  })
})
