import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import { verify } from '#lib/script/signing/envelope.js'
import { PermissionDeniedError } from '#lib/script/authorization/enforce.js'
import { memory } from '#lib/script/testing/memoryStorage.js'
import { declared, declareAgent, clearDeclarations } from '#lib/script/testing/host.js'
import { testKeyResolution, signingKey } from '#lib/script/testing/signingKeys.js'
import { importModule, principal, type Parsed } from '#lib/script/testing/requests.js'
import type { ObjectReference } from '@genoacms/contracts/storage'

const hooks = vi.hoisted(() => ({
  afterRead: undefined as ((reference: ObjectReference) => Promise<void>) | undefined
}))

vi.mock('#lib/script/host.server.js', async (importOriginal) => {
  const { withDeclarations } = await import('#lib/script/testing/host.js')
  const { host } = await importOriginal<typeof import('#lib/script/host.server.js')>()
  return { host: withDeclarations(host) }
})
vi.mock('#lib/script/storage/providers.server.js', async () => {
  const { memoryProviders } = await import('#lib/script/testing/memoryStorage.js')
  return {
    ...memoryProviders,
    getObject: async (reference: ObjectReference) => {
      const object = await memoryProviders.getObject(reference)
      const afterRead = hooks.afterRead
      if (afterRead !== undefined) await afterRead(reference)
      return object
    }
  }
})
vi.mock('#lib/script/signing/keyResolution.server.js', async () => (await import('#lib/script/testing/signingKeys.js')).testKeyResolution)
vi.mock('#lib/script/securityPolicy/policy.server.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('#lib/script/securityPolicy/policy.server.js')>(),
  ...(await import('#lib/script/testing/signingKeys.js')).testPolicyReaders
}))

const AGENTS_PATH = '.genoacms/security/agents.json'
const DECLARED_TOKEN = 'declared-token-of-the-e2e-builder-0123456789'

const administration = async () => await importModule('#lib/script/agents/administration.server.js')
const authentication = async () => await importModule('#lib/script/agents/authenticate.server.js')

const administrator = principal(['config:users:manage'], 'admin-1')
const bothAdministrator = principal(['config:users:manage', 'config:roles:manage'], 'admin-1')
const nobody = principal([], 'nobody-1')

async function storedAgents (): Promise<Record<string, Parsed>> {
  const resolution = await testKeyResolution.resolveVerificationKey(signingKey.keyId)
  if (!resolution.ok) throw new Error(resolution.reason)
  const verified = verify(memory.json(AGENTS_PATH), 'genoacms.agents.v1' as never, resolution.key)
  if (!verified.valid) throw new Error(`agents.json does not verify: ${verified.reason}`)
  return (verified.payload as Parsed).agents
}

beforeEach(() => {
  memory.clear()
  clearDeclarations()
  hooks.afterRead = undefined
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

  it('AGT-3, ZF5: an account manager cannot create an agent with roles', async () => {
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

  it("AGT-3, ZF5: an account manager cannot change an agent's roles", async () => {
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

  it('AGT-3: the role check comes before the roles are checked', async () => {
    const { createAgent } = await administration()

    await expectRoleManagementDenied(createAgent(administrator, { name: 'writer', label: 'W', roles: ['NoSuchRole'] }))
  })

  it('AGT-3, ZF5: an account manager cannot reissue the token of an agent with roles', async () => {
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

describe('the roles of agents, after the audit', () => {
  const KEYS_CEILING = 'authorization/agent-ceiling: agent:writer is assigned Keys, which grants permissions an agent cannot hold.'

  function changeAfterRead (read: number, change: () => Promise<unknown>): void {
    let reads = 0
    hooks.afterRead = async (reference) => {
      if (reference.name !== AGENTS_PATH || ++reads < read) return
      hooks.afterRead = undefined
      await change()
    }
  }

  async function expectDenied (permission: string, attempt: Promise<unknown>): Promise<void> {
    const error = await attempt.then(() => undefined, (caught: unknown) => caught)
    expect(error).toBeInstanceOf(PermissionDeniedError)
    expect(error).toMatchObject({ permission })
  }

  it('AGT-5: assigning an agent a role beyond the ceiling is refused', async () => {
    const { createAgent, updateAgent } = await administration()
    declared.roles.Keys = [{ permission: 'pages:read', resource: '*' }, { permission: 'config:keys:manage', resource: '*' }]
    await createAgent(bothAdministrator, { name: 'seed', label: 'S', roles: [] })
    const empty = memory.snapshot()

    await expect(createAgent(bothAdministrator, { name: 'writer', label: 'W', roles: ['Keys'] })).rejects.toThrow(KEYS_CEILING)
    expect(memory.snapshot()).toEqual(empty)

    await createAgent(bothAdministrator, { name: 'writer', label: 'W', roles: ['Builder'] })
    const stored = memory.snapshot()
    await expect(updateAgent(bothAdministrator, 'agent:writer', { label: 'W', roles: ['Builder', 'Keys'] })).rejects.toThrow(KEYS_CEILING)
    expect(memory.snapshot()).toEqual(stored)
  })

  it('AGT-3, TF5: a repeated role is refused', async () => {
    const { createAgent, updateAgent } = await administration()
    await createAgent(bothAdministrator, { name: 'seed', label: 'S', roles: [] })
    const empty = memory.snapshot()

    await expect(createAgent(bothAdministrator, { name: 'writer', label: 'W', roles: ['Builder', 'Builder'] })).rejects.toThrow('user/duplicate-roles')
    expect(memory.snapshot()).toEqual(empty)

    await createAgent(bothAdministrator, { name: 'writer', label: 'W', roles: ['Builder'] })
    await expect(updateAgent(bothAdministrator, 'agent:writer', { label: 'W', roles: ['Builder', 'Builder'] })).rejects.toThrow('user/duplicate-roles')
    expect((await storedAgents())['agent:writer'].roles).toEqual(['Builder'])
  })

  it('AGT-3, TF6: a change that loses a race writes nothing', async () => {
    const { createAgent, reissueAgentToken, updateAgent } = await administration()
    const { agentForToken } = await authentication()
    const created = await createAgent(administrator, { name: 'writer', label: 'W', roles: [] })
    const giveBuilder = async (): Promise<unknown> => await updateAgent(bothAdministrator, 'agent:writer', { label: 'W', roles: ['Builder'] })

    changeAfterRead(1, giveBuilder)
    await expect(updateAgent(administrator, 'agent:writer', { label: 'W2', roles: [] })).rejects.toThrow('conflict/modified-since')
    expect((await storedAgents())['agent:writer']).toMatchObject({ label: 'W', roles: ['Builder'] })

    await updateAgent(bothAdministrator, 'agent:writer', { label: 'W', roles: [] })
    changeAfterRead(1, giveBuilder)
    await expect(reissueAgentToken(administrator, 'agent:writer')).rejects.toThrow('conflict/modified-since')
    expect((await storedAgents())['agent:writer'].roles).toEqual(['Builder'])
    expect(await agentForToken(created.token)).toBe('agent:writer')

    changeAfterRead(2, async () => await createAgent(administrator, { name: 'third', label: 'T', roles: [] }))
    await expect(createAgent(administrator, { name: 'other', label: 'O', roles: [] })).rejects.toThrow('conflict/modified-since')
    expect(Object.keys(await storedAgents()).sort()).toEqual(['agent:third', 'agent:writer'])
  })

  it('AGT-3, TF6: the checks run in the stated order', async () => {
    const { createAgent, reissueAgentToken, updateAgent } = await administration()

    await expectDenied('config:users:manage', createAgent(nobody, { name: 'Bad!', label: 'B', roles: ['Builder'] }))
    await expectDenied('config:users:manage', updateAgent(nobody, 'agent:nobody', { label: 'N', roles: [] }))
    await expectDenied('config:users:manage', reissueAgentToken(nobody, 'agent:nobody'))
    await expect(createAgent(administrator, { name: 'Bad!', label: 'B', roles: ['Builder'] })).rejects.toThrow('agents/invalid-name')
    await expectDenied('config:roles:manage', createAgent(administrator, { name: 'e2e-builder', label: 'E', roles: ['Builder'] }))
    await expect(updateAgent(administrator, 'agent:e2e-builder', { label: 'E', roles: [] })).rejects.toThrow('agents/declared')

    await createAgent(administrator, { name: 'writer', label: 'W', roles: [] })
    await expectDenied('config:roles:manage', updateAgent(administrator, 'agent:writer', { label: 'W', roles: ['NoSuchRole'] }))
  })
})
