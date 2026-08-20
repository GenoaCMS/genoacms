import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

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

const declaredRoles: { value: unknown } = { value: undefined }

vi.mock('@genoacms/cloudabstraction', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const real = actual.config as { authorization: Record<string, unknown> }
  return {
    ...actual,
    config: {
      ...real,
      authorization: { ...real.authorization, get roles () { return declaredRoles.value } }
    }
  }
})

const registryPath = '.genoacms/keys/public.json'
const policyPath = '.genoacms/security/policy.json'
const rolesPath = '.genoacms/security/roles.json'
const usersPath = '.genoacms/security/users.json'

const runBootstrap = async (): Promise<void> => {
  const { ensureInstanceInitialised } = await import('./bootstrap.server')
  await ensureInstanceInitialised()
}

const freshState = (): void => {
  objects.clear()
  secrets.clear()
  vi.resetModules()
  // A spy set by one case would otherwise persist into the next, which is how the rotation cases
  // first failed with "bucket unreachable".
  vi.restoreAllMocks()
}

/**
 * Bootstrapping signs several documents, and an SLH-DSA signature costs about a second. Running it
 * once and asserting against the result keeps the file from sitting at the edge of the default
 * timeout, where it fails intermittently rather than usefully.
 */
describe('bootstrapping a fresh instance', () => {
  beforeAll(async () => {
    freshState()
    await runBootstrap()
  }, 60_000)

  it('creates the root key seed', async () => {
    expect(secrets.get('GENOACMS_ROOT_KEY_SEED')).toBeDefined()
  })

  it('creates the key registry', async () => {
    expect(objects.has(registryPath)).toBe(true)
  })

  it('creates both authorization manifests, signed and empty', async () => {
    // The thing that was missing: a fresh instance had none of these, and nothing said so.
    expect(objects.has(rolesPath)).toBe(true)
    expect(objects.has(usersPath)).toBe(true)

    const roles = JSON.parse(objects.get(rolesPath) as string)
    expect(roles).toMatchObject({ type: 'genoacms.roles.v1', payload: { roles: {} } })
    expect(typeof roles.signature).toBe('string')

    const users = JSON.parse(objects.get(usersPath) as string)
    expect(users).toMatchObject({ type: 'genoacms.users.v1', payload: { users: {} } })
  })

  it('signs the manifests with the registry\'s current subordinate key', async () => {
    const registry = JSON.parse(objects.get(registryPath) as string)
    const roles = JSON.parse(objects.get(rolesPath) as string)
    expect(roles.keyId).toBe(registry.payload.current)
  })

  it('stores a seed for that subordinate key', async () => {
    const registry = JSON.parse(objects.get(registryPath) as string)
    expect(secrets.has(`GENOACMS_SUBORDINATE_KEY_SEED_${registry.payload.current}`)).toBe(true)
  })

  it('records the registry sequence high-water mark outside the bucket', async () => {
    expect(secrets.get('GENOACMS_KEY_REGISTRY_SEQUENCE')).toBe('1')
  })

  it('creates the security policy document from the Tier-1 default', async () => {
    expect(objects.has(policyPath)).toBe(true)
    const stored = JSON.parse(objects.get(policyPath) as string)
    expect(stored).toMatchObject({
      type: 'genoacms.securityPolicy.v1',
      payload: { subordinateKeyRotationDays: 90 }
    })
  })

  it('signs the policy with the root, not with a subordinate key', async () => {
    // The policy governs the subordinate keys — when they rotate, and later what ceilings constrain
    // the code they sign. A subordinate signing it could rewrite the rule that retires it.
    const policy = JSON.parse(objects.get(policyPath) as string)
    const registry = JSON.parse(objects.get(registryPath) as string)
    expect(policy.alg).toBe('SLH-DSA-SHA2-128s')
    expect(policy.keyId).toBe(registry.keyId)
    expect(policy.keyId).not.toBe(registry.payload.current)
  })

  it('completes without recursing, since a root-signed policy needs no subordinate key', async () => {
    // Deciding whether to rotate reads the policy; writing it with a subordinate key would have
    // required the very decision being made.
    expect(objects.has(policyPath)).toBe(true)
    expect(objects.has(registryPath)).toBe(true)
  })
})

describe('re-running bootstrap', () => {
  beforeEach(freshState)

  it('is idempotent — a restart changes nothing', async () => {
    await runBootstrap()
    const first = new Map(objects)
    const firstSeed = secrets.get('GENOACMS_ROOT_KEY_SEED')

    vi.resetModules()
    await runBootstrap()

    expect(secrets.get('GENOACMS_ROOT_KEY_SEED')).toBe(firstSeed)
    expect(objects.get(registryPath)).toBe(first.get(registryPath))
    expect(objects.get(rolesPath)).toBe(first.get(rolesPath))
  }, 30_000)

  it('does not reject when storage is unreachable, so the seed admin can still sign in', async () => {
    const { ensureInstanceInitialised } = await import('./bootstrap.server')
    const storage = await import('$lib/script/storage/storage.server')
    vi.spyOn(storage, 'uploadInternalObjectJSON').mockRejectedValue(new Error('bucket unreachable'))

    await expect(ensureInstanceInitialised()).resolves.toBeUndefined()
  }, 30_000)
})

describe('rotating the root trust anchor', () => {
  interface StoredRegistry { keyId: string, payload: { current: string, sequence: number } }
  let before: { rootSeed?: string, registry: StoredRegistry, roles: string }
  let result: { keyId: string, publicKey: string, subordinateKeyId: string, sequence: number }

  // Bootstrap and rotate are several root signatures at ~1.2s each; done once for all of the
  // assertions below rather than per case.
  beforeAll(async () => {
    freshState()
    await runBootstrap()
    before = {
      rootSeed: secrets.get('GENOACMS_ROOT_KEY_SEED'),
      registry: JSON.parse(objects.get(registryPath) as string),
      roles: objects.get(rolesPath) as string
    }
    const { rotateRootKey } = await import('./signing/rootRotation.server')
    result = await rotateRootKey()
  }, 60_000)

  it('replaces the stored root seed', async () => {
    expect(secrets.get('GENOACMS_ROOT_KEY_SEED')).not.toBe(before.rootSeed)
  })

  it('reports a 32 byte public key for consumers to embed', async () => {
    expect(Buffer.from(result.publicKey, 'base64')).toHaveLength(32)
  })

  it('re-signs the registry under the new root', async () => {
    const after = JSON.parse(objects.get(registryPath) as string)
    expect(after.keyId).toBe(result.keyId)
    expect(after.keyId).not.toBe(before.registry.keyId)
  })

  it('discards the previous subordinate keys', async () => {
    // A compromised root could have signed a registry naming keys the adversary controls, and once
    // the anchor that vouched for them is untrusted nothing tells those from the legitimate ones.
    const after = JSON.parse(objects.get(registryPath) as string)
    expect(after.payload.keys).toHaveLength(1)
    expect(after.payload.current).toBe(result.subordinateKeyId)
    expect(after.payload.keys.map((k: { keyId: string }) => k.keyId))
      .not.toContain(before.registry.payload.current)
  })

  it('re-signs the security policy, which is also root-signed', async () => {
    const policy = JSON.parse(objects.get(policyPath) as string)
    expect(policy.keyId).toBe(result.keyId)
  })

  it('continues the sequence from the high-water mark, not from the old registry', async () => {
    // After the root changes the old registry cannot be verified, so its sequence may not be
    // believed. Continuing from the mark preserves rollback detection across the rotation.
    expect(result.sequence).toBeGreaterThan(before.registry.payload.sequence)
    expect(secrets.get('GENOACMS_KEY_REGISTRY_SEQUENCE')).toBe(String(result.sequence))
  })

  it('leaves the manifests unverifiable, which is the stated cost', async () => {
    // The manifest bytes are untouched by rotation itself...
    expect(objects.get(rolesPath)).toBe(before.roles)
    // ...but they are signed by a key the new registry no longer lists.
    const roles = JSON.parse(objects.get(rolesPath) as string)
    const registry = JSON.parse(objects.get(registryPath) as string)
    expect(registry.payload.keys.map((k: { keyId: string }) => k.keyId)).not.toContain(roles.keyId)
  })
})

describe('Tier-1 role declarations', () => {
  beforeEach(() => {
    freshState()
    declaredRoles.value = undefined
  })

  const rolesPayload = (): Record<string, unknown> =>
    JSON.parse(objects.get(rolesPath) as string).payload.roles

  it('creates an empty roles manifest when nothing is declared', async () => {
    await runBootstrap()
    expect(rolesPayload()).toEqual({})
  }, 30_000)

  it('are never written into the manifest', async () => {
    // Declarations are merged when authorization is read, not persisted. Writing
    // them would leave a copy behind that survived deleting the declaration — and revoking access
    // by deleting a line from genoa.config is the behaviour that depends on this.
    declaredRoles.value = { Editor: [{ permission: 'pages:content_edit', resource: '*' }] }
    await runBootstrap()
    expect(rolesPayload()).toEqual({})
  }, 30_000)

  it('are in effect anyway, because resolution merges them', async () => {
    // The other direction: absent from storage must not mean absent from authority, or the
    // declaration would be decorative.
    declaredRoles.value = { Editor: [{ permission: 'pages:content_edit', resource: '*' }] }
    await runBootstrap()

    const { loadAuthorizationSource } = await import('./authorization/resolution.server')
    const { source } = await loadAuthorizationSource()

    expect(source.available).toBe(true)
    if (!source.available) throw new Error('unreachable')
    expect(source.roles.map(role => role.name)).toEqual(['Editor'])
  }, 30_000)

  it('signs the empty manifest it creates like any other', async () => {
    declaredRoles.value = { Editor: [{ permission: 'pages:publish', resource: '*' }] }
    await runBootstrap()
    const stored = JSON.parse(objects.get(rolesPath) as string)
    expect(stored.type).toBe('genoacms.roles.v1')
    expect(typeof stored.signature).toBe('string')
  }, 30_000)

  /** Re-signs roles.json properly, as the configuration service will once it exists. */
  const rewriteRolesValidly = async (roles: Record<string, unknown>): Promise<void> => {
    const { getAlgorithm, SUBORDINATE_ALGORITHM } = await import('./signing/algorithms')
    const { sign, fromBase64 } = await import('./signing/envelope')
    const registry = JSON.parse(objects.get(registryPath) as string)
    const keyId = registry.payload.current as string
    const seed = fromBase64(secrets.get(`GENOACMS_SUBORDINATE_KEY_SEED_${keyId}`) as string)
    const keypair = getAlgorithm(SUBORDINATE_ALGORITHM).generateKeypair(seed)
    const envelope = sign('genoacms.roles.v1', { roles } as never, {
      alg: SUBORDINATE_ALGORITHM, keyId, secretKey: keypair.secretKey
    })
    objects.set(rolesPath, JSON.stringify(envelope))
  }

  it('leaves runtime-created roles in the manifest untouched', async () => {
    // Declarations and stored roles coexist: Tier 1 is a floor, not a ceiling. The rewrite has to
    // be properly signed — an edited payload would simply be rejected, which would make this pass
    // for the wrong reason.
    declaredRoles.value = { Editor: [{ permission: 'pages:publish', resource: '*' }] }
    await runBootstrap()
    await rewriteRolesValidly({ Runtime: [{ permission: 'pages:delete', resource: '*' }] })

    vi.resetModules()
    await runBootstrap()

    expect(JSON.parse(objects.get(rolesPath) as string).payload.roles)
      .toEqual({ Runtime: [{ permission: 'pages:delete', resource: '*' }] })
  }, 30_000)

  it('does not reseed configured roles when a manifest is rejected', async () => {
    // Replacement is recovery and must grant nothing. Restoring configured roles at the moment
    // tampering is detected would hand back permissions exactly when least should be assumed.
    declaredRoles.value = { Editor: [{ permission: 'pages:publish', resource: '*' }] }
    await runBootstrap()

    const tampered = JSON.parse(objects.get(rolesPath) as string)
    tampered.payload.roles = { Sneaky: [{ permission: '*', resource: '*' }] }
    objects.set(rolesPath, JSON.stringify(tampered))

    vi.resetModules()
    const { loadAuthorizationSource } = await import('./authorization/resolution.server')
    await loadAuthorizationSource()

    expect(JSON.parse(objects.get(rolesPath) as string).payload.roles).toEqual({})
  }, 30_000)

  it('fails on a malformed declaration rather than ignoring it', async () => {
    // Silently skipping would leave an instance with fewer permissions than its configuration
    // describes, and nothing to say so.
    declaredRoles.value = { Editor: [{ permission: 'not:a:permission', resource: '*' }] }
    const { loadAuthorizationSource } = await import('./authorization/resolution.server')
    await expect(loadAuthorizationSource()).rejects.toThrow(/security\/invalid-declarations/)
  }, 30_000)
})
