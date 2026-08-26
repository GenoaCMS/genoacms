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

describe('fetching an executable', () => {
  const pin = { uid: 'component-1', publicationId: 'publication-2' }
  // One directory per publication, holding the signed header and — when the component has code —
  // this. The executable used to live under the source it was built from, which said a publication
  // was a fact about code rather than about a component.
  const path = '.genoacms/components/public/component-1/publication-2/executable.json'

  const payload = (over: Record<string, unknown> = {}) => ({
    uid: 'component-1',
    publicationId: 'publication-2',
    publisherId: 'user-1',
    publishedAt: 1_700_000_000_000,
    platform: 'web-esmodule',
    executableCode: 'export function Hero () { return 1 }',
    compiledAt: 1_700_000_001_000,
    ...over
  })

  const publish = (at = path, body = payload()) => {
    served[at] = sign(
      'ML-DSA-65', subordinateId, 'genoacms.componentExecutable.v1',
      body as JsonValue, subordinate.secretKey, subordinateScheme
    )
  }

  it('returns the artifact the page pinned', async () => {
    publish()

    const verdict = await verifier().executable(pin)

    expect(verdict).toMatchObject({ valid: true })
    expect(verdict?.valid === true && verdict.value.executableCode).toContain('function Hero')
  })

  it('reports an artifact that was never published as absent', async () => {
    expect(await verifier().executable(pin)).toBeUndefined()
  })

  it('refuses one whose code was edited after signing', async () => {
    publish()
    const envelope = served[path] as { payload: Record<string, unknown> }
    served[path] = { ...envelope, payload: { ...envelope.payload, executableCode: 'globalThis.stolen = 1' } }

    expect(await verifier().executable(pin))
      .toMatchObject({ valid: false, reason: 'envelope-signature-invalid' })
  })

  it('refuses a genuine artifact of an older revision moved onto this path', async () => {
    // The attack the pin comparison exists for. Everything about this artifact is real and correctly
    // signed — it is simply not the revision the page published.
    publish(path, payload({ publicationId: 'commit-1' }))

    const verdict = await verifier().executable(pin)

    expect(verdict?.valid).toBe(false)
    expect(verdict?.valid === false && verdict.reason).toContain('executable-wrong-revision')
  })

  it('refuses a genuine artifact belonging to another component', async () => {
    publish(path, payload({ uid: 'component-9' }))

    const verdict = await verifier().executable(pin)

    expect(verdict?.valid === false && verdict.reason).toContain('executable-wrong-component')
  })

  it('refuses one built for a platform it cannot run', async () => {
    // Correctly signed, and meant for a different SDK.
    publish(path, payload({ platform: 'android-dex' }))

    const verdict = await verifier().executable(pin)

    expect(verdict?.valid === false && verdict.reason).toContain('unsupported-platform')
  })

  it('runs a platform the consumer declared it supports', async () => {
    publish(path, payload({ platform: 'node-esmodule' }))

    const client = new Verifier({
      rootPublicKey: root.publicKey,
      source: { read: async (p) => p in served ? JSON.stringify(served[p]) : undefined },
      platforms: ['web-esmodule', 'node-esmodule']
    })

    expect(await client.executable(pin)).toMatchObject({ valid: true })
  })

  it('refuses a malformed artifact that is correctly signed', async () => {
    publish(path, payload({ executableCode: '' }))

    expect(await verifier().executable(pin))
      .toMatchObject({ valid: false, reason: 'executable-missing-code' })
  })
})

describe('fetching a header', () => {
  const pin = { uid: 'component-1', publicationId: 'publication-2' }
  const path = '.genoacms/components/public/component-1/publication-2/header.json'

  const payload = (over: Record<string, unknown> = {}) => ({
    uid: 'component-1',
    publicationId: 'publication-2',
    publisherId: 'user-1',
    publishedAt: 1_700_000_000_000,
    note: 'released by the suite',
    type: 'dynamic',
    name: 'Hero',
    attributes: { 'attr-1': { uid: 'attr-1', type: 'string' } },
    attributeOrder: ['attr-1'],
    ...over
  })

  const publish = (at = path, body = payload()) => {
    served[at] = sign(
      'ML-DSA-65', subordinateId, 'genoacms.componentHeader.v1',
      body as JsonValue, subordinate.secretKey, subordinateScheme
    )
  }

  it('returns the description the page pinned', async () => {
    publish()

    const verdict = await verifier().componentHeader(pin)

    expect(verdict).toMatchObject({ valid: true })
    expect(verdict?.valid === true && verdict.value.attributeOrder).toEqual(['attr-1'])
  })

  it('reports one that was never published as absent', async () => {
    expect(await verifier().componentHeader(pin)).toBeUndefined()
  })

  it('refuses one whose attribute order was edited after signing', async () => {
    // The attack signing a header exists to stop. Reordering the attributes reorders the arguments,
    // so every value lands in the wrong parameter — and the executable it is used with stays
    // perfectly valid, which is why nothing downstream could notice.
    publish()
    const envelope = served[path] as { payload: Record<string, unknown> }
    served[path] = {
      ...envelope,
      payload: { ...envelope.payload, attributeOrder: ['attr-9', 'attr-1'] }
    }

    expect(await verifier().componentHeader(pin))
      .toMatchObject({ valid: false, reason: 'envelope-signature-invalid' })
  })

  it('refuses a genuine header of an older publication moved onto this path', async () => {
    publish(path, payload({ publicationId: 'publication-1' }))

    const verdict = await verifier().componentHeader(pin)

    expect(verdict?.valid === false && verdict.reason).toContain('header-wrong-publication')
  })

  it('refuses one with no attribute order, which nothing could be called by', async () => {
    // The key is **removed**, not set to `undefined`: canonicalization refuses an undefined member
    // rather than dropping it, so a fixture that set one would fail while being built and never
    // reach the verifier at all.
    const { attributeOrder, ...withoutOrder } = payload()
    void attributeOrder
    publish(path, withoutOrder as ReturnType<typeof payload>)

    expect(await verifier().componentHeader(pin))
      .toMatchObject({ valid: false, reason: 'header-missing-attribute-order' })
  })

  it('refuses one attributing itself to nobody', async () => {
    publish(path, payload({ publisherId: '' }))

    expect(await verifier().componentHeader(pin))
      .toMatchObject({ valid: false, reason: 'header-missing-publisher-id' })
  })
})

describe('fetching a whole publication', () => {
  const pin = { uid: 'component-1', publicationId: 'publication-2' }
  const headerAt = '.genoacms/components/public/component-1/publication-2/header.json'
  const executableAt = '.genoacms/components/public/component-1/publication-2/executable.json'

  const headerPayload = (over: Record<string, unknown> = {}) => ({
    uid: 'component-1',
    publicationId: 'publication-2',
    publisherId: 'user-1',
    publishedAt: 1_700_000_000_000,
    note: 'released by the suite',
    type: 'dynamic',
    name: 'Hero',
    attributes: {},
    attributeOrder: [],
    ...over
  })

  const executablePayload = (over: Record<string, unknown> = {}) => ({
    uid: 'component-1',
    publicationId: 'publication-2',
    publisherId: 'user-1',
    publishedAt: 1_700_000_000_000,
    platform: 'web-esmodule',
    executableCode: 'export function Hero () { return 1 }',
    compiledAt: 1_700_000_001_000,
    ...over
  })

  const publishHeader = (body = headerPayload(), at = headerAt) => {
    served[at] = sign('ML-DSA-65', subordinateId, 'genoacms.componentHeader.v1',
      body as JsonValue, subordinate.secretKey, subordinateScheme)
  }
  const publishExecutable = (body = executablePayload(), at = executableAt) => {
    served[at] = sign('ML-DSA-65', subordinateId, 'genoacms.componentExecutable.v1',
      body as JsonValue, subordinate.secretKey, subordinateScheme)
  }

  it('returns both documents for a dynamic component', async () => {
    publishHeader()
    publishExecutable()

    const verdict = await verifier().component(pin)

    expect(verdict).toMatchObject({ valid: true })
    expect(verdict?.valid === true && verdict.value.executable?.executableCode).toContain('Hero')
  })

  it('returns a prebuilt component as a header alone', async () => {
    // Its code is in the consuming application, so the header is the whole of what was published.
    publishHeader(headerPayload({ type: 'prebuilt' }))

    const verdict = await verifier().component(pin)

    expect(verdict).toMatchObject({ valid: true })
    expect(verdict?.valid === true && verdict.value.executable).toBeUndefined()
  })

  it('refuses a publication whose kind is not the one the page pinned', async () => {
    /*
     * The pin a renderer passes comes from a page node, which states the kind under the page tree's
     * signature; the header states it under its own, made at a different time. Verifying either
     * alone settles nothing about the other.
     *
     * Here the page composed a prebuilt component — code the consuming application supplies — and
     * the publication at that path describes a dynamic one. Rendering it would run the application's
     * own component under a name the CMS published code for.
     */
    publishHeader()

    const verdict = await verifier().component({ ...pin, type: 'prebuilt' })

    expect(verdict?.valid === false && verdict.reason).toContain('header-wrong-type')
  })

  it('accepts a publication whose kind is the one the page pinned', async () => {
    publishHeader()
    publishExecutable()

    expect(await verifier().component({ ...pin, type: 'dynamic' })).toMatchObject({ valid: true })
  })

  it('refuses a header and an executable from different publications', async () => {
    /*
     * The header is genuine and pinned correctly; the executable is genuine and was moved here from
     * publication 3.
     *
     * **What catches it is the executable's own pin check, not `sharesPublication`.** Both documents
     * are compared against the same pin, so two that pass cannot disagree with each other — the
     * binding is *implied* here rather than independently enforced. That is worth stating plainly:
     * `sharesPublication` exists for a caller who fetches the pair itself, without a pin to check
     * either against, and it is tested directly in `header.test.ts`.
     */
    publishHeader()
    publishExecutable(executablePayload({ publicationId: 'publication-3' }))

    const verdict = await verifier().component(pin)

    expect(verdict?.valid === false && verdict.reason).toContain('executable-wrong-revision')
  })

  it('refuses a dynamic component with no code published', async () => {
    // A publication that renders nothing, kept apart from "this component was never published".
    publishHeader()

    const verdict = await verifier().component(pin)

    expect(verdict?.valid === false && verdict.reason).toContain('component-missing-executable')
  })

  it('refuses an executable published beside a prebuilt header', async () => {
    // Either the header was swapped for a prebuilt one, or a bundle nobody asked for is sitting
    // there. Both are reasons to stop rather than to pick whichever document looks right.
    publishHeader(headerPayload({ type: 'prebuilt' }))
    publishExecutable()

    const verdict = await verifier().component(pin)

    expect(verdict?.valid === false && verdict.reason).toContain('component-unexpected-executable')
  })

  it('reports a publication that does not exist as absent', async () => {
    expect(await verifier().component(pin)).toBeUndefined()
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
