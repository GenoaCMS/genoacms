import { describe, it, expect, beforeAll } from 'vitest'
import { getAlgorithm, ROOT_ALGORITHM, SUBORDINATE_ALGORITHM, type Keypair } from './algorithms'
import { sign, verify, toBase64, fromBase64, isDocumentType, canonicalSignedObject, type SignedEnvelope, type SigningKey, type VerificationKey } from './envelope'
import { digest, type JsonValue } from './canonical'

const hex = (bytes: Uint8Array): string => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')

const algorithm = getAlgorithm(SUBORDINATE_ALGORITHM)
const payload: JsonValue = { roles: { Editor: [{ permission: 'pages:publish', resource: '*' }] } }

let keypair: Keypair
let stranger: Keypair
let key: SigningKey
let envelope: SignedEnvelope
let verificationKey: VerificationKey

beforeAll(() => {
  keypair = algorithm.generateKeypair()
  stranger = algorithm.generateKeypair()
  key = { alg: SUBORDINATE_ALGORITHM, keyId: 'sub-2026-08', secretKey: keypair.secretKey }
  envelope = sign('genoacms.roles.v1', payload, key)
  verificationKey = { alg: SUBORDINATE_ALGORITHM, publicKey: keypair.publicKey }
}, 30_000)

/** A structurally valid envelope with one field replaced, as an attacker with bucket write would. */
const tamperedWith = (changes: Partial<Record<string, unknown>>): unknown => ({ ...envelope, ...changes })

describe('a signed envelope', () => {
  it('ENV-2: carries the algorithm, key, type and payload alongside the signature', () => {
    expect(envelope).toMatchObject({
      alg: SUBORDINATE_ALGORITHM,
      keyId: 'sub-2026-08',
      type: 'genoacms.roles.v1',
      payload
    })
    expect(typeof envelope.signature).toBe('string')
  })

  it('ENV-2: verifies against the key that signed it', () => {
    const result = verify(envelope, 'genoacms.roles.v1', verificationKey)
    expect(result).toEqual({ valid: true, payload })
  })

  it('ENV-2: is a single object, so a payload cannot be stored apart from its signature', () => {
    // Round-tripping through JSON is how it reaches the bucket.
    const restored = JSON.parse(JSON.stringify(envelope))
    expect(verify(restored, 'genoacms.roles.v1', verificationKey).valid).toBe(true)
  })
})

describe('the digest binds every field, not only the payload', () => {
  // Tested at the digest rather than through verify(), because the two registered algorithms have
  // different key sizes — so an `alg` substitution happens to fail on size alone, and a test going
  // through verify() would pass even with no binding at all. These assert the property itself.
  const digestOf = (alg: Parameters<typeof canonicalSignedObject>[0], keyId: string, type: Parameters<typeof canonicalSignedObject>[2]): string =>
    hex(digest(canonicalSignedObject(alg, keyId, type, payload)))

  const base = () => digestOf(SUBORDINATE_ALGORITHM, 'sub-2026-08', 'genoacms.roles.v1')

  it('ENV-2: changes when the algorithm changes', () => {
    expect(digestOf('SLH-DSA-SHA2-128s', 'sub-2026-08', 'genoacms.roles.v1')).not.toBe(base())
  })

  it('ENV-2: changes when the key id changes', () => {
    expect(digestOf(SUBORDINATE_ALGORITHM, 'attacker-key', 'genoacms.roles.v1')).not.toBe(base())
  })

  it('ENV-2: changes when the document type changes', () => {
    expect(digestOf(SUBORDINATE_ALGORITHM, 'sub-2026-08', 'genoacms.users.v1')).not.toBe(base())
  })
})

describe('the three substitutions the binding closes', () => {
  it('ENV-6: rejects a rewritten algorithm before checking the signature', () => {
    const result = verify(tamperedWith({ alg: 'SLH-DSA-SHA2-128s' }), 'genoacms.roles.v1', verificationKey)
    expect(result).toEqual({
      valid: false,
      reason: 'envelope-algorithm-mismatch: sub-2026-08 is registered for ML-DSA-65, the envelope names SLH-DSA-SHA2-128s'
    })
  })

  it('ENV-6: a signature by a key registered for another algorithm does not verify', () => {
    const rootAlgorithm = getAlgorithm(ROOT_ALGORITHM)
    const other = rootAlgorithm.generateKeypair(new Uint8Array(rootAlgorithm.lengths.seed).fill(5))
    const genuine = sign('genoacms.roles.v1', payload, { alg: ROOT_ALGORITHM, keyId: 'slh-key', secretKey: other.secretKey })

    expect(verify(genuine, 'genoacms.roles.v1', { alg: ROOT_ALGORITHM, publicKey: other.publicKey }))
      .toEqual({ valid: true, payload })
    expect(verify(genuine, 'genoacms.roles.v1', { alg: SUBORDINATE_ALGORITHM, publicKey: other.publicKey })).toEqual({
      valid: false,
      reason: 'envelope-algorithm-mismatch: slh-key is registered for ML-DSA-65, the envelope names SLH-DSA-SHA2-128s'
    })
  }, 30_000)

  it('ENV-6: the algorithm is checked after the type', () => {
    const result = verify(tamperedWith({ alg: 'SLH-DSA-SHA2-128s', type: 'genoacms.users.v1' }), 'genoacms.roles.v1', verificationKey)
    expect(result).toEqual({ valid: false, reason: 'envelope-wrong-type: expected genoacms.roles.v1, found genoacms.users.v1' })
  })

  it('ENV-5: rejects a rewritten key id', () => {
    const result = verify(tamperedWith({ keyId: 'attacker-key' }), 'genoacms.roles.v1', verificationKey)
    expect(result).toEqual({ valid: false, reason: 'envelope-signature-invalid' })
  })

  it('ENV-5: rejects a document moved to another type', () => {
    // A genuine roles signature presented as the users manifest.
    const moved = tamperedWith({ type: 'genoacms.users.v1' })
    expect(verify(moved, 'genoacms.users.v1', verificationKey))
      .toEqual({ valid: false, reason: 'envelope-signature-invalid' })
  })

  it('ENV-5: rejects a document whose type does not match what the caller asked for', () => {
    // Caught before the signature is even checked: the caller knows what it requested.
    const result = verify(envelope, 'genoacms.users.v1', verificationKey)
    expect(result.valid).toBe(false)
    expect(result).toMatchObject({ reason: expect.stringContaining('envelope-wrong-type') })
  })
})

describe('ordinary tampering', () => {
  it('ENV-5: rejects a modified payload', () => {
    const result = verify(
      tamperedWith({ payload: { roles: { Editor: [{ permission: '*', resource: '*' }] } } }),
      'genoacms.roles.v1',
      verificationKey
    )
    expect(result).toEqual({ valid: false, reason: 'envelope-signature-invalid' })
  })

  it('ENV-5: rejects a modified signature', () => {
    const bytes = fromBase64(envelope.signature)
    if (bytes === undefined) throw new Error('fixture')
    bytes[0] ^= 0x01
    expect(verify(tamperedWith({ signature: toBase64(bytes) }), 'genoacms.roles.v1', verificationKey).valid)
      .toBe(false)
  })

  it('ENV-5: rejects verification against another key', () => {
    expect(verify(envelope, 'genoacms.roles.v1', { alg: SUBORDINATE_ALGORITHM, publicKey: stranger.publicKey }))
      .toEqual({ valid: false, reason: 'envelope-signature-invalid' })
  })

  it('ENV-2: is unaffected by key reordering, since the digest is over canonical bytes', () => {
    const reordered = { signature: envelope.signature, payload: envelope.payload, type: envelope.type, keyId: envelope.keyId, alg: envelope.alg }
    expect(verify(reordered, 'genoacms.roles.v1', verificationKey).valid).toBe(true)
  })
})

describe('malformed envelopes are rejected, never thrown on', () => {
  // Everything here arrives from a bucket. A failed verification must not become a crash.
  it.each([
    ['not an object', 'a string'],
    ['null', null],
    ['an array', [1, 2]],
    ['empty', {}]
  ])('ENV-1: rejects %s', (_label, candidate) => {
    const result = verify(candidate, 'genoacms.roles.v1', verificationKey)
    expect(result.valid).toBe(false)
  })

  it('ENV-1: rejects an unknown algorithm rather than resolving one', () => {
    const result = verify(tamperedWith({ alg: 'RSA-2048' }), 'genoacms.roles.v1', verificationKey)
    expect(result).toMatchObject({ valid: false, reason: expect.stringContaining('unknown-algorithm') })
  })

  it('ENV-1: rejects an unknown document type', () => {
    const result = verify(tamperedWith({ type: 'genoacms.roles.v2' }), 'genoacms.roles.v1', verificationKey)
    expect(result).toMatchObject({ valid: false, reason: expect.stringContaining('unknown-type') })
  })

  it('ENV-1: rejects a missing key id', () => {
    expect(verify(tamperedWith({ keyId: '' }), 'genoacms.roles.v1', verificationKey))
      .toMatchObject({ reason: 'envelope-missing-key-id' })
  })

  it('ENV-5: rejects a signature that is not base64', () => {
    expect(verify(tamperedWith({ signature: 'not base64!!' }), 'genoacms.roles.v1', verificationKey))
      .toMatchObject({ reason: 'envelope-signature-not-base64' })
  })

  it('ENV-5: rejects a payload that cannot be canonicalized', () => {
    // JSON.parse cannot produce this, but a caller passing an object could.
    const result = verify(tamperedWith({ payload: { at: new Date(0) } }), 'genoacms.roles.v1', verificationKey)
    expect(result).toMatchObject({ valid: false, reason: expect.stringContaining('uncanonicalizable') })
  })

  it('ENV-1: rejects a missing payload without treating it as empty', () => {
    const { payload: _dropped, ...withoutPayload } = envelope
    expect(verify(withoutPayload, 'genoacms.roles.v1', verificationKey))
      .toMatchObject({ reason: 'envelope-missing-payload' })
  })

  it('ENV-2: accepts a null payload, which is a legitimate JSON value', () => {
    const nullPayload = sign('genoacms.roles.v1', null, key)
    expect(verify(nullPayload, 'genoacms.roles.v1', verificationKey)).toEqual({ valid: true, payload: null })
  })
})

describe('base64', () => {
  it('ENV-1: round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 250, 255, 128, 64])
    expect(Array.from(fromBase64(toBase64(bytes)) ?? [])).toEqual(Array.from(bytes))
  })

  it('ENV-1: emits padded standard base64, as every stdlib decoder expects by default', () => {
    expect(toBase64(new Uint8Array([255, 255, 254]))).toBe('///+')
    expect(toBase64(new Uint8Array([1]))).toBe('AQ==')
  })

  it.each(['not base64!!', 'AQ', 'AQ=', '===', ' AQ==', 'AQ== ', 'AQ==\n'])('ENV-1: rejects %j rather than decoding it loosely', (value) => {
    // Buffer.from ignores what it does not recognize, so a truncated signature would otherwise
    // decode to some bytes and fail verification for the wrong reason.
    expect(fromBase64(value)).toBeUndefined()
  })

  it('ENV-1: rejects an empty string', () => {
    expect(fromBase64('')).toBeUndefined()
  })
})

describe('document types', () => {
  it('ENV-1: recognizes the three documents that are signed', () => {
    expect(isDocumentType('genoacms.roles.v1')).toBe(true)
    expect(isDocumentType('genoacms.users.v1')).toBe(true)
    expect(isDocumentType('genoacms.keyRegistry.v2')).toBe(true)
    expect(isDocumentType('genoacms.keyRegistry.v1')).toBe(false)
  })

  it.each(['roles', 'genoacms.roles', 'genoacms.roles.v2', '', 'constructor'])('ENV-1: rejects %j', (value) => {
    expect(isDocumentType(value)).toBe(false)
  })
})
