import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { memory } from '#lib/script/testing/memoryStorage.js'
import { declared, declareAgent, clearDeclarations } from '#lib/script/testing/host.js'
import { importModule, principal } from '#lib/script/testing/requests.js'

vi.mock('#lib/script/host.server.js', async (importOriginal) => {
  const { withDeclarations } = await import('#lib/script/testing/host.js')
  const { host } = await importOriginal<typeof import('#lib/script/host.server.js')>()
  return { host: withDeclarations(host) }
})
vi.mock('#lib/script/storage/providers.server.js', async () => (await import('#lib/script/testing/memoryStorage.js')).memoryProviders)
vi.mock('#lib/script/signing/keyResolution.server.js', async () => (await import('#lib/script/testing/signingKeys.js')).testKeyResolution)
vi.mock('#lib/script/securityPolicy/policy.server.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('#lib/script/securityPolicy/policy.server.js')>(),
  loadSecurityPolicy: async () => (await import('#lib/script/testing/signingKeys.js')).testSecurityPolicy
}))

const DECLARED_TOKEN = 'declared-token-of-the-e2e-builder-0123456789'

const administration = async () => await importModule('#lib/script/agents/administration.server.js')
const authentication = async () => await importModule('#lib/script/agents/authenticate.server.js')

const administrator = principal(['config:users:manage'], 'admin-1')

beforeEach(() => {
  memory.clear()
  clearDeclarations()
  declared.roles.Builder = [{ permission: 'pages:read', resource: '*' }]
  declareAgent('agent:e2e-builder', DECLARED_TOKEN, ['Builder'])
})

describe('authenticating an agent', () => {
  it('MCP-2: a token resolves to its agent, declared or stored, and nothing else does', async () => {
    const { createAgent } = await administration()
    const { agentForToken } = await authentication()
    const created = await createAgent(administrator, { name: 'writer', label: 'W', roles: ['Builder'] })

    expect(await agentForToken(DECLARED_TOKEN)).toBe('agent:e2e-builder')
    expect(await agentForToken(created.token)).toBe('agent:writer')

    const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')
    for (const other of ['', 'gat_', `${created.token} `, created.token.slice(0, -1), sha256(created.token), sha256(DECLARED_TOKEN), 'agent:writer', 'admin-1']) {
      expect(await agentForToken(other), JSON.stringify(other)).toBeUndefined()
    }
  })

  it('AGT-6: a revoked token stops at the next request', async () => {
    const { createAgent, revokeAgent } = await administration()
    const { agentForToken } = await authentication()
    const created = await createAgent(administrator, { name: 'writer', label: 'W', roles: ['Builder'] })
    expect(await agentForToken(created.token)).toBe('agent:writer')

    await revokeAgent(administrator, 'agent:writer')

    expect(await agentForToken(created.token)).toBeUndefined()
  })
})
