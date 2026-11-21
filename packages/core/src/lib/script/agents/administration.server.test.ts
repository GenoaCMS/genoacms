import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { verify } from '#lib/script/signing/envelope.js'
import { PermissionDeniedError } from '#lib/script/authorization/enforce.js'
import { memory } from '#lib/script/testing/memoryStorage.js'
import { declared, declareAgent, clearDeclarations } from '#lib/script/testing/host.js'
import { testKeyResolution, signingKey } from '#lib/script/testing/signingKeys.js'
import { importModule, principal, type Parsed } from '#lib/script/testing/requests.js'

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

const AGENTS_PATH = '.genoacms/security/agents.json'
const DECLARED_TOKEN = 'declared-token-of-the-e2e-builder-0123456789'

const administration = async () => await importModule('#lib/script/agents/administration.server.js')
const authentication = async () => await importModule('#lib/script/agents/authenticate.server.js')

const administrator = principal(['config:users:manage'], 'admin-1')
const bothAdministrator = principal(['config:users:manage', 'config:roles:manage'], 'admin-1')

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
  it('AGT-3: creating an agent stores its hash, never its token, and shows the token once', async () => {
    const { createAgent } = await administration()

    const created = await createAgent(bothAdministrator, { name: 'writer', label: 'W', roles: ['Builder'] })

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

  it('AGT-3: names are checked and unique across declared and stored agents', async () => {
    const { createAgent } = await administration()
    await createAgent(administrator, { name: 'writer', label: 'W', roles: [] })

    for (const name of ['Writer', '-a', 'a'.repeat(64), 'e2e-builder', 'writer']) {
      await expect(createAgent(administrator, { name, label: 'X', roles: [] }), name).rejects.toThrow()
    }
    await expect(createAgent(administrator, { name: 'a'.repeat(63), label: 'X', roles: [] })).resolves.toBeDefined()
    expect(Object.keys(await storedAgents()).sort()).toEqual([`agent:${'a'.repeat(63)}`, 'agent:writer'])
  })

  it('AGT-3: a reissued token replaces the old one, and a revoked agent is gone', async () => {
    const { createAgent, reissueAgentToken, revokeAgent } = await administration()
    const { agentForToken } = await authentication()
    const created = await createAgent(bothAdministrator, { name: 'writer', label: 'W', roles: ['Builder'] })

    const reissued = await reissueAgentToken(bothAdministrator, 'agent:writer')

    expect(reissued.token).not.toBe(created.token)
    expect(await agentForToken(created.token)).toBeUndefined()
    expect(await agentForToken(reissued.token)).toBe('agent:writer')

    await revokeAgent(administrator, 'agent:writer')

    expect(await agentForToken(reissued.token)).toBeUndefined()
    expect(await storedAgents()).not.toHaveProperty('agent:writer')
  })

  it('AGT-3: a declared agent cannot be changed', async () => {
    const { reissueAgentToken, updateAgent, revokeAgent } = await administration()
    const refusal = 'agents/declared: agent:e2e-builder is declared in genoa.config.'

    await expect(reissueAgentToken(administrator, 'agent:e2e-builder')).rejects.toThrow(refusal)
    await expect(updateAgent(administrator, 'agent:e2e-builder', { label: 'Renamed', roles: [] })).rejects.toThrow(refusal)
    await expect(revokeAgent(administrator, 'agent:e2e-builder')).rejects.toThrow(refusal)
  })

  it('AGT-3: administering agents needs config:users:manage', async () => {
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

describe('the roles of agents', () => {
  async function expectRoleManagementDenied (attempt: Promise<unknown>): Promise<void> {
    const error = await attempt.then(() => undefined, (caught: unknown) => caught)
    expect(error).toBeInstanceOf(PermissionDeniedError)
    expect(error).toMatchObject({ permission: 'config:roles:manage' })
  }

  it.fails('AGT-3, ZF5: an account manager cannot create an agent with roles', async () => {
    const { createAgent } = await administration()
    const before = memory.snapshot()

    await expectRoleManagementDenied(createAgent(administrator, { name: 'writer', label: 'W', roles: ['Builder'] }))

    expect(memory.snapshot()).toEqual(before)
  })

  it('AGT-3: an account manager creates an agent with no roles', async () => {
    const { createAgent } = await administration()

    const created = await createAgent(administrator, { name: 'writer', label: 'W', roles: [] })

    expect(created.token).toMatch(/^gat_/)
    expect((await storedAgents())['agent:writer'].roles).toEqual([])
  })

  it.fails("AGT-3, ZF5: an account manager cannot change an agent's roles", async () => {
    const { createAgent, updateAgent } = await administration()
    await createAgent(administrator, { name: 'writer', label: 'W', roles: [] })
    await createAgent(bothAdministrator, { name: 'reader', label: 'R', roles: ['Builder'] })
    const before = memory.snapshot()

    await expectRoleManagementDenied(updateAgent(administrator, 'agent:writer', { label: 'W', roles: ['Builder'] }))
    await expectRoleManagementDenied(updateAgent(administrator, 'agent:reader', { label: 'R', roles: [] }))

    expect(memory.snapshot()).toEqual(before)
  })

  it("AGT-3: an account manager changes an agent's label when the roles stay", async () => {
    const { createAgent, updateAgent } = await administration()
    await createAgent(bothAdministrator, { name: 'writer', label: 'W', roles: ['Builder'] })

    await updateAgent(administrator, 'agent:writer', { label: 'W2', roles: ['Builder'] })

    expect((await storedAgents())['agent:writer']).toMatchObject({ label: 'W2', roles: ['Builder'] })
  })

  it.fails('AGT-3: the role check comes before the roles are checked', async () => {
    const { createAgent } = await administration()

    await expectRoleManagementDenied(createAgent(administrator, { name: 'writer', label: 'W', roles: ['NoSuchRole'] }))
  })

  it.fails('AGT-3, ZF5: an account manager cannot reissue the token of an agent with roles', async () => {
    const { createAgent, reissueAgentToken } = await administration()
    const { agentForToken } = await authentication()
    const created = await createAgent(bothAdministrator, { name: 'writer', label: 'W', roles: ['Builder'] })
    const before = memory.snapshot()

    await expectRoleManagementDenied(reissueAgentToken(administrator, 'agent:writer'))

    expect(memory.snapshot()).toEqual(before)
    expect(await agentForToken(created.token)).toBe('agent:writer')
  })

  it('AGT-3: an account manager reissues the token of an agent with no roles', async () => {
    const { createAgent, reissueAgentToken } = await administration()
    const { agentForToken } = await authentication()
    const created = await createAgent(administrator, { name: 'writer', label: 'W', roles: [] })

    const reissued = await reissueAgentToken(administrator, 'agent:writer')

    expect(await agentForToken(reissued.token)).toBe('agent:writer')
    expect(await agentForToken(created.token)).toBeUndefined()
  })

  it('AGT-3: an account manager revokes an agent with roles', async () => {
    const { createAgent, revokeAgent } = await administration()
    const { agentForToken } = await authentication()
    const created = await createAgent(bothAdministrator, { name: 'writer', label: 'W', roles: ['Builder'] })

    await revokeAgent(administrator, 'agent:writer')

    expect(await storedAgents()).not.toHaveProperty('agent:writer')
    expect(await agentForToken(created.token)).toBeUndefined()
  })

  it("AGT-3: a holder of both creates and changes an agent's roles", async () => {
    const { createAgent, updateAgent } = await administration()

    await createAgent(bothAdministrator, { name: 'writer', label: 'W', roles: ['Builder'] })
    await updateAgent(bothAdministrator, 'agent:writer', { label: 'W', roles: [] })

    expect((await storedAgents())['agent:writer'].roles).toEqual([])
  })
})
