import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Drives the real bootstrap with storage and secrets replaced by in-memory stubs.
 *
 * The point is the **wiring**: that starting a fresh instance actually produces a root key, a
 * registry and signed manifests. That claim was previously made by the specification and not by the
 * code, and nothing in a type-check or a unit test of the parts would have caught the difference.
 */

const objects = new Map<string, string>()
const secrets = new Map<string, string>()

vi.mock('$lib/script/secrets/providers.server', () => ({
  getSecret: async (key: string) => secrets.get(key),
  setSecret: async (key: string, value: string) => { secrets.set(key, value); return true },
  deleteSecret: async (key: string) => secrets.delete(key),
  setSecretIfAbsent: async (key: string, value: string) => {
    if (secrets.has(key)) return false
    secrets.set(key, value)
    return true
  },
  getOrClaimSecret: async (key: string, generate: () => string) => {
    const existing = secrets.get(key)
    if (existing !== undefined) return { value: existing, claimed: false }
    const value = generate()
    secrets.set(key, value)
    return { value, claimed: true }
  }
}))

vi.mock('$lib/script/storage/storage.server', () => {
  const notFound = (name: string): never => { throw new Error(`no such object: ${name}`) }
  return {
    defaultBucketId: 'test-bucket',
    getObject: async ({ name }: { name: string }) => {
      const text = objects.get(name)
      if (text === undefined) notFound(name)
      return { data: text, version: `v${text?.length ?? 0}` }
    },
    uploadObject: async ({ name }: { name: string }, data: string) => { objects.set(name, data) },
    getInternalObjectStringVersioned: async (path: string) => {
      const text = objects.get(path)
      if (text === undefined) notFound(path)
      return { text, version: `v${text?.length ?? 0}` }
    },
    uploadInternalObjectJSON: async (path: string, data: unknown) => {
      objects.set(path, JSON.stringify(data))
    }
  }
})

vi.mock('$lib/script/utils.server', () => ({
  streamToString: async (data: string) => data
}))

vi.mock('$lib/script/authorization/seedAdmin.server', () => ({
  isSeedAdmin: (subject: string) => subject === 'admin-subject'
}))

const registryPath = '.genoacms/keys/public.json'
const rolesPath = '.genoacms/security/roles.json'
const usersPath = '.genoacms/security/users.json'

describe('bootstrapping a fresh instance', () => {
  beforeEach(() => {
    objects.clear()
    secrets.clear()
    vi.resetModules()
  })

  const bootstrap = async (): Promise<void> => {
    const { ensureInstanceInitialised } = await import('./bootstrap.server')
    await ensureInstanceInitialised()
  }

  it('creates the root key seed', async () => {
    await bootstrap()
    expect(secrets.get('GENOACMS_ROOT_KEY_SEED')).toBeDefined()
  })

  it('creates the key registry', async () => {
    await bootstrap()
    expect(objects.has(registryPath)).toBe(true)
  })

  it('creates both authorization manifests, signed and empty', async () => {
    // The thing that was missing: a fresh instance had none of these, and nothing said so.
    await bootstrap()
    expect(objects.has(rolesPath)).toBe(true)
    expect(objects.has(usersPath)).toBe(true)

    const roles = JSON.parse(objects.get(rolesPath) as string)
    expect(roles).toMatchObject({ type: 'genoacms.roles.v1', payload: { roles: {} } })
    expect(typeof roles.signature).toBe('string')

    const users = JSON.parse(objects.get(usersPath) as string)
    expect(users).toMatchObject({ type: 'genoacms.users.v1', payload: { users: {} } })
  })

  it('signs the manifests with the registry\'s current subordinate key', async () => {
    await bootstrap()
    const registry = JSON.parse(objects.get(registryPath) as string)
    const roles = JSON.parse(objects.get(rolesPath) as string)
    expect(roles.keyId).toBe(registry.payload.current)
  })

  it('stores a seed for that subordinate key', async () => {
    await bootstrap()
    const registry = JSON.parse(objects.get(registryPath) as string)
    expect(secrets.has(`GENOACMS_SUBORDINATE_KEY_SEED_${registry.payload.current}`)).toBe(true)
  })

  it('records the registry sequence high-water mark outside the bucket', async () => {
    await bootstrap()
    expect(secrets.get('GENOACMS_KEY_REGISTRY_SEQUENCE')).toBe('1')
  })

  it('is idempotent — a restart changes nothing', async () => {
    await bootstrap()
    const first = new Map(objects)
    const firstSeed = secrets.get('GENOACMS_ROOT_KEY_SEED')

    vi.resetModules()
    await bootstrap()

    expect(secrets.get('GENOACMS_ROOT_KEY_SEED')).toBe(firstSeed)
    expect(objects.get(registryPath)).toBe(first.get(registryPath))
    expect(objects.get(rolesPath)).toBe(first.get(rolesPath))
  })

  it('does not reject when storage is unreachable, so the seed admin can still sign in', async () => {
    const { ensureInstanceInitialised } = await import('./bootstrap.server')
    const storage = await import('$lib/script/storage/storage.server')
    vi.spyOn(storage, 'uploadInternalObjectJSON').mockRejectedValue(new Error('bucket unreachable'))

    await expect(ensureInstanceInitialised()).resolves.toBeUndefined()
  })
})
