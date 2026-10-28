import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { verify } from '$lib/script/signing/envelope'
import { PermissionDeniedError } from '$lib/script/authorization/enforce'
import { memory } from '$lib/script/testing/memoryStorage'
import { declared, declareAgent, clearDeclarations } from '$lib/script/testing/host'
import { testKeyResolution, signingKey } from '$lib/script/testing/signingKeys'
import { importModule, principal, type Parsed } from '$lib/script/testing/requests'

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
const DECLARED_TOKEN = 'declared-token-of-the-e2e-builder-0123456789'

const administration = async () => await importModule('$lib/script/agents/administration.server')
const authentication = async () => await importModule('$lib/script/agents/authenticate.server')

const administrator = principal(['config:users:manage'], 'admin-1')

async function storedAgents (): Promise<Record<string, Parsed>> {
  const publicKey = await testKeyResolution.resolveVerificationKey(signingKey.keyId)
  const verified = verify(memory.json(AGENTS_PATH), 'genoacms.agents.v1' as never, publicKey as Uint8Array)
  if (!verified.valid) throw new Error(`agents.json does not verify: ${verified.reason}`)
  return (verified.payload as Parsed).agents
}

beforeEach(() => {
  memory.clear()
  clearDeclarations()
  declared.roles.Builder = [{ permission: 'pages:read', resource: '*' }, { permission: 'components:read', resource: '*' }]
  declareAgent('agent:e2e-builder', DECLARED_TOKEN, ['Builder'])
})

describe('administering agents', () => {
  it.fails('AGT-3: creating an agent stores its hash, never its token, and shows the token once', async () => {
    const { createAgent } = await administration()

    const created = await createAgent(administrator, { name: 'writer', label: 'W', roles: ['Builder'] })

    expect(created.token).toMatch(/^gat_[A-Za-z0-9_-]{43}$/)
    expect((await storedAgents())['agent:writer']).toEqual({
      label: 'W',
      tokenHash: createHash('sha256').update(created.token, 'utf8').digest('hex'),
      roles: ['Builder'],
      createdAt: expect.any(Number),
      createdBy: 'admin-1'
    })
    expect(memory.allText()).not.toContain(created.token)
  })

  it.fails('AGT-3: names are checked and unique across declared and stored agents', async () => {
    const { createAgent } = await administration()
    await createAgent(administrator, { name: 'writer', label: 'W', roles: [] })

    for (const name of ['Writer', '-a', 'a'.repeat(64), 'e2e-builder', 'writer']) {
      await expect(createAgent(administrator, { name, label: 'X', roles: [] }), name).rejects.toThrow()
    }
    await expect(createAgent(administrator, { name: 'a'.repeat(63), label: 'X', roles: [] })).resolves.toBeDefined()
    expect(Object.keys(await storedAgents()).sort()).toEqual([`agent:${'a'.repeat(63)}`, 'agent:writer'])
  })

  it.fails('AGT-3: a reissued token replaces the old one, and a revoked agent is gone', async () => {
    const { createAgent, reissueAgentToken, revokeAgent } = await administration()
    const { agentForToken } = await authentication()
    const created = await createAgent(administrator, { name: 'writer', label: 'W', roles: ['Builder'] })

    const reissued = await reissueAgentToken(administrator, 'agent:writer')

    expect(reissued.token).not.toBe(created.token)
    expect(await agentForToken(created.token)).toBeUndefined()
    expect(await agentForToken(reissued.token)).toBe('agent:writer')

    await revokeAgent(administrator, 'agent:writer')

    expect(await agentForToken(reissued.token)).toBeUndefined()
    expect(await storedAgents()).not.toHaveProperty('agent:writer')
  })

  it.fails('AGT-3: a declared agent cannot be changed', async () => {
    const { reissueAgentToken, updateAgent, revokeAgent } = await administration()
    const refusal = 'agents/declared: agent:e2e-builder is declared in genoa.config.'

    await expect(reissueAgentToken(administrator, 'agent:e2e-builder')).rejects.toThrow(refusal)
    await expect(updateAgent(administrator, 'agent:e2e-builder', { label: 'Renamed', roles: [] })).rejects.toThrow(refusal)
    await expect(revokeAgent(administrator, 'agent:e2e-builder')).rejects.toThrow(refusal)
  })

  it.fails('AGT-3: administering agents needs config:users:manage', async () => {
    const { createAgent, reissueAgentToken, updateAgent, revokeAgent } = await administration()
    await createAgent(administrator, { name: 'writer', label: 'W', roles: [] })
    const before = memory.snapshot()
    const others = principal(['config:roles:manage', 'config:keys:manage', 'pages:read'], 'admin-2')

    await expect(createAgent(others, { name: 'other', label: 'O', roles: [] })).rejects.toBeInstanceOf(PermissionDeniedError)
    await expect(reissueAgentToken(others, 'agent:writer')).rejects.toBeInstanceOf(PermissionDeniedError)
    await expect(updateAgent(others, 'agent:writer', { label: 'O', roles: [] })).rejects.toBeInstanceOf(PermissionDeniedError)
    await expect(revokeAgent(others, 'agent:writer')).rejects.toBeInstanceOf(PermissionDeniedError)
    expect(memory.snapshot()).toEqual(before)
  })
})
