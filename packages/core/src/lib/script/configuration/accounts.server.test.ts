import { describe, it, expect, vi, beforeEach } from 'vitest'
import { verify } from '#lib/script/signing/envelope.js'
import { PermissionDeniedError } from '#lib/script/authorization/enforce.js'
import type { ObjectReference } from '@genoacms/contracts/storage'
import { memory } from '#lib/script/testing/memoryStorage.js'
import { clearDeclarations } from '#lib/script/testing/host.js'
import { testKeyResolution, signingKey } from '#lib/script/testing/signingKeys.js'
import { importModule, principal, type Parsed } from '#lib/script/testing/requests.js'

const hooks = vi.hoisted(() => ({
  locked: false,
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
vi.mock('#lib/script/authorization/declared.server.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('#lib/script/authorization/declared.server.js')>(),
  isAdministrationLocked: () => hooks.locked
}))
vi.mock('#lib/script/database/database.server.js', () => ({
  getCollectionReferences: () => [],
  getCollectionReference: async () => { throw new Error('collection/not-found') }
}))

const USERS_PATH = '.genoacms/security/users.json'

const configuration = async () => await importModule('#lib/script/configuration/user.server.js')
const manifests = async () => await importModule('#lib/script/authorization/manifests.server.js')
const agents = async () => await importModule('#lib/script/agents/administration.server.js')
const resolution = async () => await importModule('#lib/script/authorization/resolution.server.js')

const accountAdmin = principal(['config:users:manage'], 'admin-1')
const bothAdmin = principal(['config:users:manage', 'config:roles:manage'], 'admin-2')
const nobody = principal([], 'nobody-1')

async function storedUsers (): Promise<Record<string, Parsed>> {
  const resolution = await testKeyResolution.resolveVerificationKey(signingKey.keyId)
  if (!resolution.ok) throw new Error(resolution.reason)
  const verified = verify(memory.json(USERS_PATH), 'genoacms.users.v1' as never, resolution.key)
  if (!verified.valid) throw new Error(`users.json does not verify: ${verified.reason}`)
  return (verified.payload as Parsed).users
}

async function expectDeniedFor (permission: string, attempt: Promise<unknown>): Promise<void> {
  const error = await attempt.then(() => undefined, (caught: unknown) => caught)
  expect(error).toBeInstanceOf(PermissionDeniedError)
  expect(error).toMatchObject({ permission })
}

async function expectRoleManagementDenied (attempt: Promise<unknown>): Promise<void> {
  await expectDeniedFor('config:roles:manage', attempt)
}

async function permissionsOf (subject: string): Promise<string[]> {
  const { resolvePrincipal } = await resolution()
  return (await resolvePrincipal(subject)).context.grants.map((grant: Parsed) => grant.permission)
}

beforeEach(async () => {
  memory.clear()
  clearDeclarations()
  hooks.locked = false
  hooks.afterRead = undefined
  const { writeRolesManifest, writeUsersManifest } = await manifests()
  await writeRolesManifest([
    { name: 'Editor', grants: [{ permission: 'pages:content_edit', resource: '*' }] },
    { name: 'Publisher', grants: [{ permission: 'pages:publish', resource: '*' }] }
  ])
  await writeUsersManifest([{ subject: 's-1', email: 's-1@example.com', roles: ['Editor'] }])
})

describe('creating and replacing accounts', () => {
  it('ENF-3, ZF5: an account manager cannot create an account with roles', async () => {
    const { upsertUserAccount } = await configuration()
    const before = memory.snapshot()

    await expectRoleManagementDenied(upsertUserAccount(accountAdmin, { subject: 's-2', email: 's-2@example.com', roles: ['Editor'] }))

    expect(memory.snapshot()).toEqual(before)
  })

  it("ENF-3, ZF5: an account manager cannot change an account's roles by replacing it", async () => {
    const { upsertUserAccount } = await configuration()
    const before = memory.snapshot()

    await expectRoleManagementDenied(upsertUserAccount(accountAdmin, { subject: 's-1', email: 's-1@example.com', roles: ['Editor', 'Publisher'] }))

    expect(memory.snapshot()).toEqual(before)
  })

  it("ENF-3, ZF5: an account manager cannot clear an account's roles by replacing it", async () => {
    const { upsertUserAccount } = await configuration()
    const before = memory.snapshot()

    await expectRoleManagementDenied(upsertUserAccount(accountAdmin, { subject: 's-1', email: 's-1@example.com', roles: [] }))

    expect(memory.snapshot()).toEqual(before)
  })

  it('ENF-3: an account manager creates an account with no roles', async () => {
    const { upsertUserAccount } = await configuration()

    expect(await upsertUserAccount(accountAdmin, { subject: 's-2', email: 's-2@example.com', roles: [] })).toEqual({ ok: true, value: undefined })

    expect((await storedUsers())['s-2']).toEqual({ email: 's-2@example.com', roles: [] })
  })

  it('ENF-3: an account manager replaces an email when the roles stay', async () => {
    const { upsertUserAccount } = await configuration()

    expect(await upsertUserAccount(accountAdmin, { subject: 's-1', email: 'new@example.com', roles: ['Editor'] })).toEqual({ ok: true, value: undefined })

    expect((await storedUsers())['s-1']).toEqual({ email: 'new@example.com', roles: ['Editor'] })
  })

  it('ENF-3: a holder of both creates an account with roles', async () => {
    const { upsertUserAccount } = await configuration()

    expect(await upsertUserAccount(bothAdmin, { subject: 's-2', email: 's-2@example.com', roles: ['Publisher'] })).toEqual({ ok: true, value: undefined })

    expect((await storedUsers())['s-2']).toEqual({ email: 's-2@example.com', roles: ['Publisher'] })
  })

  it('ENF-3: the role change is decided against the accounts the write replaces', async () => {
    const { upsertUserAccount } = await configuration()
    const { writeUsersManifest } = await manifests()
    hooks.afterRead = async (reference) => {
      if (reference.name !== USERS_PATH) return
      hooks.afterRead = undefined
      await writeUsersManifest([{ subject: 's-1', email: 's-1@example.com', roles: [] }], memory.versionOf(USERS_PATH))
    }

    expect(await upsertUserAccount(accountAdmin, { subject: 's-1', email: 's-1@example.com', roles: ['Editor'] }))
      .toEqual({ ok: false, reason: 'manifest/conflict' })

    expect((await storedUsers())['s-1'].roles).toEqual([])
  })

  it('ENF-3, TIR-4: the lock is reported before the role check', async () => {
    const { upsertUserAccount } = await configuration()
    hooks.locked = true

    expect(await upsertUserAccount(accountAdmin, { subject: 's-2', email: 's-2@example.com', roles: ['Editor'] }))
      .toEqual({ ok: false, reason: 'administration/locked-by-configuration' })
  })
})

describe('accounts and agents', () => {
  it("ENF-3, ZF15: an account manager cannot strip a stored agent's roles through an account", async () => {
    const { upsertUserAccount } = await configuration()
    const { createAgent } = await agents()
    await createAgent(bothAdmin, { name: 'writer', label: 'W', roles: ['Editor'] })
    const before = memory.json(USERS_PATH)

    expect(await upsertUserAccount(accountAdmin, { subject: 'agent:writer', email: '', roles: [] }))
      .toEqual({ ok: false, reason: 'user/agent-subject' })

    expect(memory.json(USERS_PATH)).toEqual(before)
    expect(await permissionsOf('agent:writer')).toContain('pages:content_edit')
  })

  it('ENF-3, ZF15: a holder of both cannot give an agent roles through an account', async () => {
    const { upsertUserAccount } = await configuration()

    expect(await upsertUserAccount(bothAdmin, { subject: 'agent:writer', email: '', roles: ['Editor'] }))
      .toEqual({ ok: false, reason: 'user/agent-subject' })

    expect(Object.keys(await storedUsers()).filter(subject => subject.startsWith('agent:'))).toEqual([])
  })

  it('RES-1, RES-2, ZF15: a stored account with an agent subject is ignored and reported', async () => {
    const { createAgent } = await agents()
    const { writeUsersManifest } = await manifests()
    const { resolvePrincipal } = await resolution()
    await createAgent(bothAdmin, { name: 'writer', label: 'W', roles: [] })
    await writeUsersManifest([
      { subject: 's-1', email: 's-1@example.com', roles: ['Editor'] },
      { subject: 'agent:writer', email: '', roles: ['Editor'] }
    ], memory.versionOf(USERS_PATH))

    const resolved = await resolvePrincipal('agent:writer')

    expect(resolved.context.grants).toEqual([])
    expect(resolved.warnings).toContain("account-agent-subject: 'agent:writer' in users.json is ignored; agents are stored in agents.json.")
  })
})

describe('the order of the checks', () => {
  it('ENF-3, TIR-4, ZF17: assigning roles reports the lock before config:roles:manage', async () => {
    const { assignUserAccountRoles } = await configuration()
    hooks.locked = true

    expect(await assignUserAccountRoles(accountAdmin, 's-1', ['Editor']))
      .toEqual({ ok: false, reason: 'administration/locked-by-configuration' })
  })

  it('ENF-3, TIR-4, ZF17: on a locked instance a principal without config:users:manage is denied', async () => {
    const { upsertUserAccount, assignUserAccountRoles } = await configuration()
    hooks.locked = true

    await expectDeniedFor('config:users:manage', upsertUserAccount(nobody, { subject: 's-2', email: 's-2@example.com', roles: [] }))
    await expectDeniedFor('config:users:manage', assignUserAccountRoles(nobody, 's-1', []))
  })

  it('ENF-3, ZF17: the role check comes before the refusals of ADM-3', async () => {
    const { upsertUserAccount } = await configuration()

    await expectRoleManagementDenied(upsertUserAccount(accountAdmin, { subject: 's-2', email: 's-2@example.com', roles: ['NoSuchRole'] }))
  })
})
