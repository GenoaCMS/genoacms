import { describe, it, expect, beforeEach } from 'vitest'
import { slh_dsa_sha2_128s as rootScheme } from '@noble/post-quantum/slh-dsa.js'
import { ml_dsa65 as subordinateScheme } from '@noble/post-quantum/ml-dsa.js'
import { Verifier, UnreachableError, REGISTRY_PATH } from './client.js'
import { digest, type JsonValue } from './canonical.js'
import { deriveKeyId } from './registry.js'

/**
 * The verifier, against real signatures.
 *
 * Nothing here is mocked but the network. Real SLH-DSA and ML-DSA keypairs sign real envelopes, and
 * the verifier is asked to accept and to refuse them — so what is asserted is that a document this
 * SDK accepts is one that was genuinely signed, rather than that the right functions were called.
 *
 * The envelopes are built here rather than imported from the CMS. That is the point of the whole
 * package: a verifier built on the signer's own code agrees with it whatever either of them does.
 */

const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const root = rootScheme.keygen(new Uint8Array(rootScheme.lengths.seed).fill(1))
const subordinate = subordinateScheme.keygen(new Uint8Array(subordinateScheme.lengths.seed).fill(2))
const other = subordinateScheme.keygen(new Uint8Array(subordinateScheme.lengths.seed).fill(3))

const subordinateId = deriveKeyId(subordinate.publicKey)
const otherId = deriveKeyId(other.publicKey)

/** Signs an envelope exactly as the specification says one is signed. */
const sign = (
  alg: string,
  keyId: string,
  type: string,
  payload: JsonValue,
  secretKey: Uint8Array,
  scheme: { sign: (msg: Uint8Array, key: Uint8Array) => Uint8Array }
) => ({
  alg,
  keyId,
  type,
  payload,
  signature: toBase64(scheme.sign(digest({ alg, keyId, type, payload }), secretKey))
})

const rootKeyId = deriveKeyId(root.publicKey)

const registryPayload = (overrides: Record<string, unknown> = {}): JsonValue => ({
  sequence: 3,
  current: subordinateId,
  keys: [
    {
      keyId: subordinateId,
      alg: 'ML-DSA-65',
      publicKey: toBase64(subordinate.publicKey),
      createdAt: 1_700_000_000_000
    }
  ],
  ...overrides
} as JsonValue)

const signedRegistry = (payload: JsonValue = registryPayload()) =>
  sign('SLH-DSA-SHA2-128s', rootKeyId, 'genoacms.keyRegistry.v1', payload, root.secretKey, rootScheme)

let served: Record<string, unknown>

/** A `Source` over an in-memory bucket. Absent is `undefined`, exactly as the contract says. */
const verifier = (): Verifier => new Verifier({
  rootPublicKey: root.publicKey,
  source: {
    read: async (path) => path in served ? JSON.stringify(served[path]) : undefined
  }
})

beforeEach(() => {
  served = { [REGISTRY_PATH]: signedRegistry() }
})

describe('loading the registry', () => {
  it('accepts one the root signed', async () => {
    const verdict = await verifier().loadRegistry()

    expect(verdict).toMatchObject({ valid: true })
    expect(verdict.valid && verdict.value.current).toBe(subordinateId)
    expect(verdict.valid && verdict.value.sequence).toBe(3)
  })

  it('refuses one signed by anything but the root', async () => {
    // The registry is what makes every other key resolvable, so it cannot be resolved through the
    // thing it defines. Verifying against the anchor is what makes the chain terminate.
    served[REGISTRY_PATH] = sign(
      'ML-DSA-65', subordinateId, 'genoacms.keyRegistry.v1',
      registryPayload(), subordinate.secretKey, subordinateScheme
    )

    expect(await verifier().loadRegistry())
      .toMatchObject({ valid: false, reason: 'envelope-signature-invalid' })
  })

  it('refuses an entry whose id does not derive from its own key', async () => {
    // What stops a tampered registry publishing an attacker's key under an id documents already name.
    served[REGISTRY_PATH] = signedRegistry(registryPayload({
      current: subordinateId,
      keys: [{
        keyId: subordinateId,
        alg: 'ML-DSA-65',
        publicKey: toBase64(other.publicKey),
        createdAt: 1
      }]
    }))

    expect(await verifier().loadRegistry())
      .toMatchObject({ valid: false, reason: expect.stringContaining('key-id-mismatch') })
  })

  it('refuses the whole registry when one entry is bad', async () => {
    // Keeping the entries that happen to validate would let whoever corrupted one choose which keys
    // survive.
    served[REGISTRY_PATH] = signedRegistry(registryPayload({
      keys: [
        { keyId: subordinateId, alg: 'ML-DSA-65', publicKey: toBase64(subordinate.publicKey), createdAt: 1 },
        { keyId: 'deadbeefdeadbeef', alg: 'ML-DSA-65', publicKey: toBase64(other.publicKey), createdAt: 1 }
      ]
    }))

    expect(await verifier().loadRegistry()).toMatchObject({ valid: false })
  })

  it('refuses a duplicated key id', async () => {
    const entry = { keyId: subordinateId, alg: 'ML-DSA-65', publicKey: toBase64(subordinate.publicKey), createdAt: 1 }
    served[REGISTRY_PATH] = signedRegistry(registryPayload({ keys: [entry, entry] }))

    expect(await verifier().loadRegistry())
      .toMatchObject({ valid: false, reason: expect.stringContaining('duplicate-key-id') })
  })

  it('refuses a current key that is not listed', async () => {
    served[REGISTRY_PATH] = signedRegistry(registryPayload({ current: otherId }))

    expect(await verifier().loadRegistry())
      .toMatchObject({ valid: false, reason: expect.stringContaining('current-not-listed') })
  })

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5]
  ])('refuses a %s sequence', async (_name, sequence) => {
    served[REGISTRY_PATH] = signedRegistry(registryPayload({ sequence }))

    expect(await verifier().loadRegistry())
      .toMatchObject({ valid: false, reason: expect.stringContaining('sequence') })
  })
})

describe('rollback', () => {
  it('refuses a registry older than one already seen', async () => {
    // A signature says a document came from the instance, not when. An older registry replays a
    // valid signature and undoes whatever the newer one recorded — a revocation, above all.
    const client = verifier()
    await client.loadRegistry()

    served[REGISTRY_PATH] = signedRegistry(registryPayload({ sequence: 2 }))

    // Asserted on `reason`, the machine-readable code, rather than on the sentence: the message
    // names the sequences and is meant to be read, the reason is what a caller branches on.
    expect(await client.loadRegistry())
      .toMatchObject({ valid: false, reason: expect.stringContaining('registry-rollback') })
  })

  it('accepts a newer one', async () => {
    const client = verifier()
    await client.loadRegistry()

    served[REGISTRY_PATH] = signedRegistry(registryPayload({ sequence: 4 }))

    const verdict = await client.loadRegistry()
    expect(verdict.valid && verdict.value.sequence).toBe(4)
  })

  it('holds only within one verifier, as the specification asks it to say', async () => {
    const client = verifier()
    await client.loadRegistry()
    served[REGISTRY_PATH] = signedRegistry(registryPayload({ sequence: 2 }))

    // A fresh verifier is a fresh page load: no high-water mark, so no protection. Asserted rather
    // than left implicit, because it is the limit of what this implementation claims.
    const verdict = await verifier().loadRegistry()
    expect(verdict.valid && verdict.value.sequence).toBe(2)
  })
})

describe('verifying a document', () => {
  const document = (payload: JsonValue = { hello: 'world' }, keyId = subordinateId, secret = subordinate.secretKey) =>
    sign('ML-DSA-65', keyId, 'genoacms.pageTree.v1', payload, secret, subordinateScheme)

  it('accepts one signed by a key the registry lists', async () => {
    expect(await verifier().verifyDocument(document(), 'genoacms.pageTree.v1'))
      .toEqual({ valid: true, value: { hello: 'world' } })
  })

  it('refuses one whose payload was edited after signing', async () => {
    const envelope = { ...document(), payload: { hello: 'tampered' } }

    expect(await verifier().verifyDocument(envelope, 'genoacms.pageTree.v1'))
      .toMatchObject({ valid: false, reason: 'envelope-signature-invalid' })
  })

  it('refuses one presented as a different document type', async () => {
    // A distinct reason from a bad signature: the signature is genuine and the document is genuine,
    // the caller is simply being handed the wrong one.
    expect(await verifier().verifyDocument(document(), 'genoacms.roles.v1'))
      .toMatchObject({ valid: false, reason: expect.stringContaining('envelope-wrong-type') })
  })

  it('refuses one signed by a key the registry does not list', async () => {
    expect(await verifier().verifyDocument(document({ hello: 'world' }, otherId, other.secretKey), 'genoacms.pageTree.v1'))
      .toMatchObject({ valid: false, reason: expect.stringContaining('key-unresolvable') })
  })

  it('refuses a revoked key, including for documents it signed before revocation', async () => {
    served[REGISTRY_PATH] = signedRegistry(registryPayload({
      current: otherId,
      keys: [
        { keyId: subordinateId, alg: 'ML-DSA-65', publicKey: toBase64(subordinate.publicKey), createdAt: 1, revokedAt: 2 },
        { keyId: otherId, alg: 'ML-DSA-65', publicKey: toBase64(other.publicKey), createdAt: 2 }
      ]
    }))

    expect(await verifier().verifyDocument(document(), 'genoacms.pageTree.v1'))
      .toMatchObject({ valid: false, reason: expect.stringContaining('key-unresolvable') })
  })

  it('accepts a superseded key, whose signatures remain valid', async () => {
    // Refusing one would invalidate every document written before the last rotation.
    served[REGISTRY_PATH] = signedRegistry(registryPayload({
      current: otherId,
      keys: [
        { keyId: subordinateId, alg: 'ML-DSA-65', publicKey: toBase64(subordinate.publicKey), createdAt: 1, supersededAt: 2 },
        { keyId: otherId, alg: 'ML-DSA-65', publicKey: toBase64(other.publicKey), createdAt: 2 }
      ]
    }))

    expect(await verifier().verifyDocument(document(), 'genoacms.pageTree.v1'))
      .toEqual({ valid: true, value: { hello: 'world' } })
  })

  it('refuses an algorithm it does not recognize, rather than defaulting', async () => {
    const envelope = { ...document(), alg: 'ML-DSA-44' }

    expect(await verifier().verifyDocument(envelope, 'genoacms.pageTree.v1'))
      .toMatchObject({ valid: false, reason: 'not-an-envelope' })
  })
})

describe('fetching a page tree', () => {
  const treePayload = {
    component: 'Page',
    type: 'dynamic',
    uid: 'component-1',
    publicationId: 'publication-1',
    data: { body: [{ component: 'Card', type: 'prebuilt', uid: 'component-2', publicationId: 'publication-2', data: {} }] }
  }

  const publish = (payload: JsonValue = treePayload as JsonValue) => {
    served['.genoacms/pages/readables/home'] =
      sign('ML-DSA-65', subordinateId, 'genoacms.pageTree.v1', payload, subordinate.secretKey, subordinateScheme)
  }

  it('returns the tree when it verifies', async () => {
    publish()

    const verdict = await verifier().pageTree('home')

    expect(verdict).toMatchObject({ valid: true })
    expect(verdict?.valid === true && verdict.value.component).toBe('Page')
  })

  it('reports a page that was never published as absent', async () => {
    // A different answer from one that failed to verify, and the caller has to be able to tell.
    expect(await verifier().pageTree('never-built')).toBeUndefined()
  })

  it('refuses a tree whose node was repointed after signing', async () => {
    publish()
    const envelope = served['.genoacms/pages/readables/home'] as { payload: Record<string, unknown> }
    served['.genoacms/pages/readables/home'] =
      { ...envelope, payload: { ...envelope.payload, component: 'Attacker' } }

    // Asserted on the reason, not merely on the verdict: a tree that fell through the signature
    // check and then failed to parse is also `valid: false`, and the two must not be conflated.
    expect(await verifier().pageTree('home'))
      .toMatchObject({ valid: false, reason: 'envelope-signature-invalid' })
  })

  it('refuses a tree whose publication pin was rolled back after signing', async () => {
    publish()
    const envelope = served['.genoacms/pages/readables/home'] as { payload: Record<string, unknown> }
    served['.genoacms/pages/readables/home'] =
      { ...envelope, payload: { ...envelope.payload, publicationId: 'an-older-publication' } }

    expect(await verifier().pageTree('home'))
      .toMatchObject({ valid: false, reason: 'envelope-signature-invalid' })
  })

  it('refuses a malformed tree that is correctly signed', async () => {
    // A signature attests to the bytes, not to their shape. Whoever holds the key can sign this.
    publish({ component: 'Page', type: 'dynamic' } as JsonValue)

    expect(await verifier().pageTree('home'))
      .toMatchObject({ valid: false, reason: 'node-missing-data' })
  })

  it('does not return a degraded tree when one fails', async () => {
    // There is no safe partial form: the plausible tampering leaves a document that looks entirely
    // ordinary, so anything handed back would be whatever was written to the bucket.
    publish({ component: 'Page', type: 'dynamic' } as JsonValue)
    const verdict = await verifier().pageTree('home')

    expect(verdict?.valid).toBe(false)
    expect(verdict !== undefined && 'value' in verdict).toBe(false)
  })
})

describe('fetching a publication', () => {
  const pin = { uid: 'component-1', publicationId: 'publication-2' }
  /*
   * **One object per release.** It used to be a directory holding `header.json` and, for a component
   * with code, `executable.json` — two fetches, two signatures, and a pairing between them that no
   * amount of verifying either document could establish.
   */
  const path = '.genoacms/components/public/component-1/publication-2.json'

  const bundle = (over: Record<string, unknown> = {}) => ({
    platform: 'web-esmodule',
    executableCode: 'export default function component () { return 1 }',
    compiledAt: 1_700_000_001_000,
    ...over
  })

  const payload = (over: Record<string, unknown> = {}) => ({
    uid: 'component-1',
    publicationId: 'publication-2',
    publisherId: 'user-1',
    publishedAt: 1_700_000_000_000,
    note: 'released by the suite',
    type: 'dynamic',
    name: 'Hero',
    attributes: {},
    attributeOrder: [],
    executables: [bundle()],
    ...over
  })

  /** A prebuilt payload: the key absent rather than empty, which is what the CMS writes. */
  const prebuiltPayload = (over: Record<string, unknown> = {}) => {
    const { executables: _dropped, ...rest } = payload({ type: 'prebuilt', ...over })
    return rest
  }

  const publish = (body: Record<string, unknown> = payload(), at = path) => {
    served[at] = sign(
      'ML-DSA-65', subordinateId, 'genoacms.componentPublication.v1',
      body as JsonValue, subordinate.secretKey, subordinateScheme
    )
  }

  it('returns the description and the code in one fetch', async () => {
    publish()

    const verdict = await verifier().component(pin)

    expect(verdict).toMatchObject({ valid: true })
    expect(verdict?.valid === true && verdict.value.publication.name).toBe('Hero')
    expect(verdict?.valid === true && verdict.value.executable?.executableCode)
      .toContain('function component')
  })

  it('returns a prebuilt component as a description alone', async () => {
    // Its code is in the consuming application, so the description is the whole of what was
    // published — and the absent key is the answer rather than a bundle that failed to arrive.
    publish(prebuiltPayload())

    const verdict = await verifier().component(pin)

    expect(verdict).toMatchObject({ valid: true })
    expect(verdict?.valid === true && 'executable' in verdict.value).toBe(false)
  })

  it('reports a publication that was never written as absent', async () => {
    // An ordinary answer, and a different one from a publication that failed to verify.
    expect(await verifier().component(pin)).toBeUndefined()
  })

  it('refuses a publication whose payload was edited after signing', async () => {
    publish()
    const envelope = served[path] as { payload: Record<string, unknown> }
    served[path] = { ...envelope, payload: { ...envelope.payload, name: 'Attacker' } }

    expect(await verifier().component(pin))
      .toMatchObject({ valid: false, reason: 'envelope-signature-invalid' })
  })

  it('refuses a genuine release of another publication moved onto this path', async () => {
    /*
     * The attack the pin check exists for, and the one the merge does **not** close. Whoever can
     * write to storage can move a correctly signed older release onto the path a newer one occupies;
     * every signature stays valid, and only comparing the pin against the document catches it.
     */
    publish(payload({ publicationId: 'publication-1' }))

    const verdict = await verifier().component(pin)

    expect(verdict?.valid === false && verdict.reason).toContain('publication-wrong-publication')
  })

  it('refuses another component published at this path', async () => {
    publish(payload({ uid: 'component-9' }))

    const verdict = await verifier().component(pin)

    expect(verdict?.valid === false && verdict.reason).toContain('publication-wrong-component')
  })

  it('refuses a publication whose kind is not the one the page pinned', async () => {
    /*
     * The page tree states the kind under its own signature; the publication states it under
     * another, made at a different time. Verifying either alone settles nothing about the other.
     *
     * Here the page composed a prebuilt component — code the consuming application supplies — and
     * the publication carries code of its own.
     */
    publish()

    const verdict = await verifier().component({ ...pin, type: 'prebuilt' })

    expect(verdict?.valid === false && verdict.reason).toContain('publication-wrong-type')
  })

  it('accepts a publication whose kind is the one the page pinned', async () => {
    publish()

    expect(await verifier().component({ ...pin, type: 'dynamic' })).toMatchObject({ valid: true })
  })

  it('refuses a dynamic component with no code published', async () => {
    // A release that verifies and renders nothing, kept apart from "never published".
    publish(prebuiltPayload({ type: 'dynamic' }))

    const verdict = await verifier().component(pin)

    expect(verdict?.valid === false && verdict.reason).toContain('publication-missing-executables')
  })

  it('refuses a prebuilt component that carries code', () => {
    /*
     * This and the case above used to be **cross-document** failures — a bundle sitting beside a
     * prebuilt header, a dynamic header with none beside it — reachable only after two fetches and
     * two verifications. They are now one payload's shape, and the CMS cannot emit either: only a
     * signing key in the wrong hands produces one, which is exactly what must not render.
     */
    publish(payload({ type: 'prebuilt' }))

    return verifier().component(pin).then(verdict => {
      expect(verdict?.valid === false && verdict.reason).toContain('publication-unexpected-executables')
    })
  })

  it('refuses a release with nothing this runtime can run', async () => {
    // Checked after verification: a correctly signed artifact meant for another runtime, not a
    // corrupted one, and the two deserve different answers.
    publish(payload({ executables: [bundle({ platform: 'android-dex' })] }))

    const verdict = await verifier().component(pin)

    expect(verdict?.valid === false && verdict.reason).toContain('publication-unsupported-platform')
  })

  it('runs the supported bundle from a release that also serves another runtime', async () => {
    // What the list of targets buys: one release, several platforms, and a page that pins the
    // release rather than the platform.
    publish(payload({ executables: [bundle({ platform: 'android-dex' }), bundle()] }))

    const verdict = await verifier().component(pin)

    expect(verdict?.valid === true && verdict.value.executable?.platform).toBe('web-esmodule')
  })

  it('runs a bundle a consumer configured itself to run', async () => {
    publish(payload({ executables: [bundle({ platform: 'android-dex' })] }))
    const client = new Verifier({
      rootPublicKey: root.publicKey,
      source: { read: async (path) => path in served ? JSON.stringify(served[path]) : undefined },
      platforms: ['android-dex']
    })

    expect(await client.component(pin)).toMatchObject({ valid: true })
  })

  it('refuses a publication that is correctly signed but malformed', async () => {
    // A signature attests to bytes, not to their shape. Whoever holds the key can sign this.
    publish(payload({ attributeOrder: 'attr-1' }))

    expect(await verifier().component(pin))
      .toMatchObject({ valid: false, reason: 'publication-missing-attribute-order' })
  })

  it('refuses a publication signed as some other kind of document', async () => {
    // The envelope binds the document type into the digest, so a page tree cannot be served here.
    served[path] = sign(
      'ML-DSA-65', subordinateId, 'genoacms.pageTree.v1',
      payload() as JsonValue, subordinate.secretKey, subordinateScheme
    )

    const verdict = await verifier().component(pin)

    expect(verdict?.valid === false && verdict.reason).toContain('envelope-wrong-type')
  })
})


describe('unreachable is neither answer', () => {
  it('reports an object that is not there as absent, not as invalid', async () => {
    // A page that was never published is an ordinary answer, and a different one from a page that
    // failed to verify.
    expect(await verifier().fetchVerified('.genoacms/pages/readables/absent', 'genoacms.pageTree.v1'))
      .toBeUndefined()
  })

  it('reports a response that is not JSON', async () => {
    served['bad.json'] = undefined
    const client = new Verifier({
      rootPublicKey: root.publicKey,
      source: { read: async () => 'not json at all' }
    })

    await expect(client.loadRegistry()).rejects.toMatchObject({ reason: 'not-json' })
  })

  it('does not answer about a document when the registry cannot be fetched', async () => {
    const client = new Verifier({
      rootPublicKey: root.publicKey,
      source: { read: async () => { throw new UnreachableError('storage-down') } }
    })

    await expect(client.verifyDocument(signedRegistry(), 'genoacms.keyRegistry.v1'))
      .rejects.toBeInstanceOf(UnreachableError)
  })
})
