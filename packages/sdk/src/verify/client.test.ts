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

const verifier = (): Verifier => new Verifier({
  baseURL: 'https://storage.example/',
  rootPublicKey: root.publicKey,
  fetch: (async (input: RequestInfo | URL) => {
    const path = String(input).replace('https://storage.example/', '')
    if (!(path in served)) return new Response('', { status: 404 })
    return new Response(JSON.stringify(served[path]), { status: 200 })
  }) as typeof globalThis.fetch
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

describe('unreachable is neither answer', () => {
  it('throws for a missing object rather than calling it invalid', async () => {
    // A caller that read an outage as "invalid" would reject good documents whenever the network
    // faltered. Making this the one thing that throws is what keeps the two apart at a call site.
    await expect(verifier().fetchVerified('.genoacms/pages/readables/absent', 'genoacms.pageTree.v1'))
      .rejects.toBeInstanceOf(UnreachableError)
  })

  it('reports a response that is not JSON', async () => {
    served['bad.json'] = undefined
    const client = new Verifier({
      baseURL: 'https://storage.example',
      rootPublicKey: root.publicKey,
      fetch: (async () => new Response('not json at all', { status: 200 })) as typeof globalThis.fetch
    })

    await expect(client.loadRegistry()).rejects.toMatchObject({ reason: 'not-json' })
  })

  it('does not answer about a document when the registry cannot be fetched', async () => {
    const client = new Verifier({
      baseURL: 'https://storage.example',
      rootPublicKey: root.publicKey,
      fetch: (async () => new Response('', { status: 503 })) as typeof globalThis.fetch
    })

    await expect(client.verifyDocument(signedRegistry(), 'genoacms.keyRegistry.v1'))
      .rejects.toBeInstanceOf(UnreachableError)
  })
})
