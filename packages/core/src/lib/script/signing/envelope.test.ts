import { describe, it, expect, beforeAll } from 'vitest'
import { getAlgorithm, SUBORDINATE_ALGORITHM, type Keypair } from './algorithms'
import { sign, verify, toBase64, fromBase64, isDocumentType, canonicalSignedObject, type SignedEnvelope, type SigningKey } from './envelope'
import { digest, type JsonValue } from './canonical'

const hex = (bytes: Uint8Array): string => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')

const algorithm = getAlgorithm(SUBORDINATE_ALGORITHM)
const payload: JsonValue = { roles: { Editor: [{ permission: 'pages:publish', resource: '*' }] } }

let keypair: Keypair
let stranger: Keypair
let key: SigningKey
let envelope: SignedEnvelope

beforeAll(() => {
  keypair = algorithm.generateKeypair()
  stranger = algorithm.generateKeypair()
  key = { alg: SUBORDINATE_ALGORITHM, keyId: 'sub-2026-08', secretKey: keypair.secretKey }
  envelope = sign('genoacms.roles.v1', payload, key)
}, 30_000)

/** A structurally valid envelope with one field replaced, as an attacker with bucket write would. */
const tamperedWith = (changes: Partial<Record<string, unknown>>): unknown => ({ ...envelope, ...changes })

describe('a signed envelope', () => {
  it('carries the algorithm, key, type and payload alongside the signature', () => {
    expect(envelope).toMatchObject({
      alg: SUBORDINATE_ALGORITHM,
      keyId: 'sub-2026-08',
      type: 'genoacms.roles.v1',
      payload
    })
    expect(typeof envelope.signature).toBe('string')
  })

  it('verifies against the key that signed it', () => {
    const result = verify(envelope, 'genoacms.roles.v1', keypair.publicKey)
    expect(result).toEqual({ valid: true, payload })
  })

  it('is a single object, so a payload cannot be stored apart from its signature', () => {
    // Round-tripping through JSON is how it reaches the bucket.
    const restored = JSON.parse(JSON.stringify(envelope))
    expect(verify(restored, 'genoacms.roles.v1', keypair.publicKey).valid).toBe(true)
  })
})

describe('the digest binds every field, not only the payload', () => {
  // Tested at the digest rather than through verify(), because the two registered algorithms have
  // different key sizes — so an `alg` substitution happens to fail on size alone, and a test going
  // through verify() would pass even with no binding at all. These assert the property itself.
  const digestOf = (alg: Parameters<typeof canonicalSignedObject>[0], keyId: string, type: Parameters<typeof canonicalSignedObject>[2]): string =>
    hex(digest(canonicalSignedObject(alg, keyId, type, payload)))

  const base = () => digestOf(SUBORDINATE_ALGORITHM, 'sub-2026-08', 'genoacms.roles.v1')

  it('changes when the algorithm changes', () => {
    expect(digestOf('SLH-DSA-SHA2-128s', 'sub-2026-08', 'genoacms.roles.v1')).not.toBe(base())
  })

  it('changes when the key id changes', () => {
    expect(digestOf(SUBORDINATE_ALGORITHM, 'attacker-key', 'genoacms.roles.v1')).not.toBe(base())
  })

  it('changes when the document type changes', () => {
    expect(digestOf(SUBORDINATE_ALGORITHM, 'sub-2026-08', 'genoacms.users.v1')).not.toBe(base())
  })
})

describe('the three substitutions the binding closes', () => {
  it('rejects a rewritten algorithm', () => {
    const result = verify(tamperedWith({ alg: 'SLH-DSA-SHA2-128s' }), 'genoacms.roles.v1', keypair.publicKey)
    expect(result.valid).toBe(false)
  })

  it('rejects a rewritten key id', () => {
    const result = verify(tamperedWith({ keyId: 'attacker-key' }), 'genoacms.roles.v1', keypair.publicKey)
    expect(result).toEqual({ valid: false, reason: 'envelope-signature-invalid' })
  })

  it('rejects a document moved to another type', () => {
    // A genuine roles signature presented as the users manifest.
    const moved = tamperedWith({ type: 'genoacms.users.v1' })
    expect(verify(moved, 'genoacms.users.v1', keypair.publicKey))
      .toEqual({ valid: false, reason: 'envelope-signature-invalid' })
  })

  it('rejects a document whose type does not match what the caller asked for', () => {
    // Caught before the signature is even checked: the caller knows what it requested.
    const result = verify(envelope, 'genoacms.users.v1', keypair.publicKey)
    expect(result.valid).toBe(false)
    expect(result).toMatchObject({ reason: expect.stringContaining('envelope-wrong-type') })
  })
})

describe('ordinary tampering', () => {
  it('rejects a modified payload', () => {
    const result = verify(
      tamperedWith({ payload: { roles: { Editor: [{ permission: '*', resource: '*' }] } } }),
      'genoacms.roles.v1',
      keypair.publicKey
    )
    expect(result).toEqual({ valid: false, reason: 'envelope-signature-invalid' })
  })

  it('rejects a modified signature', () => {
    const bytes = fromBase64(envelope.signature)
    if (bytes === undefined) throw new Error('fixture')
    bytes[0] ^= 0x01
    expect(verify(tamperedWith({ signature: toBase64(bytes) }), 'genoacms.roles.v1', keypair.publicKey).valid)
      .toBe(false)
  })

  it('rejects verification against another key', () => {
    expect(verify(envelope, 'genoacms.roles.v1', stranger.publicKey))
      .toEqual({ valid: false, reason: 'envelope-signature-invalid' })
  })

  it('is unaffected by key reordering, since the digest is over canonical bytes', () => {
    const reordered = { signature: envelope.signature, payload: envelope.payload, type: envelope.type, keyId: envelope.keyId, alg: envelope.alg }
    expect(verify(reordered, 'genoacms.roles.v1', keypair.publicKey).valid).toBe(true)
  })
})

describe('malformed envelopes are rejected, never thrown on', () => {
  // Everything here arrives from a bucket. A failed verification must not become a crash.
  it.each([
    ['not an object', 'a string'],
    ['null', null],
    ['an array', [1, 2]],
    ['empty', {}]
  ])('rejects %s', (_label, candidate) => {
    const result = verify(candidate, 'genoacms.roles.v1', keypair.publicKey)
    expect(result.valid).toBe(false)
  })

  it('rejects an unknown algorithm rather than resolving one', () => {
    const result = verify(tamperedWith({ alg: 'RSA-2048' }), 'genoacms.roles.v1', keypair.publicKey)
    expect(result).toMatchObject({ valid: false, reason: expect.stringContaining('unknown-algorithm') })
  })

  it('rejects an unknown document type', () => {
    const result = verify(tamperedWith({ type: 'genoacms.roles.v2' }), 'genoacms.roles.v1', keypair.publicKey)
    expect(result).toMatchObject({ valid: false, reason: expect.stringContaining('unknown-type') })
  })

  it('rejects a missing key id', () => {
    expect(verify(tamperedWith({ keyId: '' }), 'genoacms.roles.v1', keypair.publicKey))
      .toMatchObject({ reason: 'envelope-missing-key-id' })
  })

  it('rejects a signature that is not base64', () => {
    expect(verify(tamperedWith({ signature: 'not base64!!' }), 'genoacms.roles.v1', keypair.publicKey))
      .toMatchObject({ reason: 'envelope-signature-not-base64' })
  })

  it('rejects a payload that cannot be canonicalized', () => {
    // JSON.parse cannot produce this, but a caller passing an object could.
    const result = verify(tamperedWith({ payload: { at: new Date(0) } }), 'genoacms.roles.v1', keypair.publicKey)
    expect(result).toMatchObject({ valid: false, reason: expect.stringContaining('uncanonicalizable') })
  })

  it('rejects a missing payload without treating it as empty', () => {
    const { payload: _dropped, ...withoutPayload } = envelope
    expect(verify(withoutPayload, 'genoacms.roles.v1', keypair.publicKey))
      .toMatchObject({ reason: 'envelope-missing-payload' })
  })

  it('accepts a null payload, which is a legitimate JSON value', () => {
    const nullPayload = sign('genoacms.roles.v1', null, key)
    expect(verify(nullPayload, 'genoacms.roles.v1', keypair.publicKey)).toEqual({ valid: true, payload: null })
  })
})

describe('base64', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 250, 255, 128, 64])
    expect(Array.from(fromBase64(toBase64(bytes)) ?? [])).toEqual(Array.from(bytes))
  })

  it('emits padded standard base64, as every stdlib decoder expects by default', () => {
    expect(toBase64(new Uint8Array([255, 255, 254]))).toBe('///+')
    expect(toBase64(new Uint8Array([1]))).toBe('AQ==')
  })

  it.each(['not base64!!', 'AQ', 'AQ=', '===', ' AQ==', 'AQ== ', 'AQ==\n'])('rejects %j rather than decoding it loosely', (value) => {
    // Buffer.from ignores what it does not recognize, so a truncated signature would otherwise
    // decode to some bytes and fail verification for the wrong reason.
    expect(fromBase64(value)).toBeUndefined()
  })

  it('rejects an empty string', () => {
    expect(fromBase64('')).toBeUndefined()
  })
})

describe('document types', () => {
  it('recognizes the three documents that are signed', () => {
    expect(isDocumentType('genoacms.roles.v1')).toBe(true)
    expect(isDocumentType('genoacms.users.v1')).toBe(true)
    expect(isDocumentType('genoacms.keyRegistry.v1')).toBe(true)
  })

  it.each(['roles', 'genoacms.roles', 'genoacms.roles.v2', '', 'constructor'])('rejects %j', (value) => {
    expect(isDocumentType(value)).toBe(false)
  })
})
