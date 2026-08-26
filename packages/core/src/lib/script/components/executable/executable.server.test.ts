import { describe, it, expect, vi } from 'vitest'
import { getAlgorithm, SUBORDINATE_ALGORITHM } from '$lib/script/signing/algorithms'
import { deriveKeyId } from '$lib/script/signing/keyId'
import { verify } from '$lib/script/signing/envelope'
import { EXECUTABLE_DOCUMENT } from './executable'

/**
 * Signing a compiled component, verified against the real primitives.
 *
 * The key store is mocked because a test has no secret manager. **The signing is not.** A real
 * ML-DSA keypair signs, and the real `verify` checks the result — so what is asserted is that an
 * executable produced here is one a consumer can actually verify, rather than that the right
 * functions were called.
 */

const algorithm = getAlgorithm(SUBORDINATE_ALGORITHM)
const keypair = algorithm.generateKeypair(new Uint8Array(algorithm.lengths.seed).fill(7))
const keyId = deriveKeyId(keypair.publicKey)

const getCurrentSigningKey = vi.fn(async () => ({
  alg: SUBORDINATE_ALGORITHM,
  keyId,
  secretKey: keypair.secretKey
}))

/** The registry, as far as this test is concerned: the signing key is listed, and nothing else is. */
const resolveVerificationKey = vi.fn(async (candidateId: string) =>
  candidateId === keyId ? keypair.publicKey : undefined
)

vi.mock('$lib/script/signing/keyResolution.server', () => ({
  getCurrentSigningKey: async () => await getCurrentSigningKey(),
  resolveVerificationKey: async (candidateId: string) => await resolveVerificationKey(candidateId)
}))

const { signComponentExecutable } = await import('./executable.server')
const { readSignedDocument } = await import('$lib/script/signing/signedDocument.server')

const SUBJECT = {
  uid: 'component-1',
  publicationId: 'commit-1',
  publisherId: 'user-1',
  publishedAt: 1_700_000_000_000
}

const signed = async (code = 'export const a = 1') =>
  await signComponentExecutable(SUBJECT, 'web-esmodule', code)

describe('signing an executable', () => {
  it('produces an envelope a consumer can verify', async () => {
    const envelope = await signed()
    const result = verify(envelope, EXECUTABLE_DOCUMENT, keypair.publicKey)

    expect(result.valid).toBe(true)
  })

  it('travels under the executable document type', async () => {
    const envelope = await signed()

    expect(envelope.type).toBe(EXECUTABLE_DOCUMENT)
  })

  it('names the current subordinate key, and its algorithm', async () => {
    const envelope = await signed()

    expect(envelope.keyId).toBe(keyId)
    expect(envelope.alg).toBe(SUBORDINATE_ALGORITHM)
  })

  it('carries the compiled code in the payload', async () => {
    const envelope = await signed('export function Component () { return 1 }')

    expect(envelope.payload.executableCode).toBe('export function Component () { return 1 }')
  })

  it('stamps compiledAt at signing time, leaving publishedAt as it was', async () => {
    const before = Date.now()
    const envelope = await signed()

    expect(envelope.payload.publishedAt).toBe(SUBJECT.publishedAt)
    expect(envelope.payload.compiledAt).toBeGreaterThanOrEqual(before)
  })
})

describe('reading one back through the registry', () => {
  // The path a consumer takes: look up the key the envelope names, then verify. Asserted here
  // because the browser suite can only see that a file was published, not that it verifies.
  it('resolves the key it names and verifies', async () => {
    const envelope = await signed()
    const result = await readSignedDocument(envelope, EXECUTABLE_DOCUMENT)

    expect(result).toMatchObject({ ok: true })
    expect(resolveVerificationKey).toHaveBeenCalledWith(keyId)
  })

  it('refuses one signed by a key the registry does not list', async () => {
    // A revoked or unknown key is a conclusion about the document, not a transient failure.
    const envelope = { ...(await signed()), keyId: 'not-in-the-registry' }
    const result = await readSignedDocument(envelope, EXECUTABLE_DOCUMENT)

    expect(result).toMatchObject({ ok: false })
  })

  it('refuses one asked for as a different document', async () => {
    const envelope = await signed()
    const result = await readSignedDocument(envelope, 'genoacms.roles.v1')

    expect(result).toMatchObject({ ok: false })
  })
})

describe('what the signature covers', () => {
  it('refuses a payload edited after signing', async () => {
    const envelope = await signed()
    const tampered = {
      ...envelope,
      payload: { ...envelope.payload, executableCode: 'globalThis.stolen = true' }
    }

    expect(verify(tampered, EXECUTABLE_DOCUMENT, keypair.publicKey).valid).toBe(false)
  })

  it('refuses an executable moved onto another document type', async () => {
    // The type is bound into the digest, so a genuine signature over a genuine executable cannot be
    // presented as a roles manifest.
    const envelope = await signed()

    expect(verify(envelope, 'genoacms.roles.v1', keypair.publicKey).valid).toBe(false)
  })

  it('refuses an executable reattributed to another author', async () => {
    // Attribution is the audit trail. If it could be edited after signing, the signature would prove
    // the instance built the artifact and nothing about who shipped it.
    const envelope = await signed()
    const tampered = { ...envelope, payload: { ...envelope.payload, publisherId: 'someone-else' } }

    expect(verify(tampered, EXECUTABLE_DOCUMENT, keypair.publicKey).valid).toBe(false)
  })

  it('refuses a signature checked against a different key', async () => {
    const other = algorithm.generateKeypair(new Uint8Array(algorithm.lengths.seed).fill(9))
    const envelope = await signed()

    expect(verify(envelope, EXECUTABLE_DOCUMENT, other.publicKey).valid).toBe(false)
  })
})
