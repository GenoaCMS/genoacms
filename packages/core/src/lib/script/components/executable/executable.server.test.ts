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

vi.mock('$lib/script/signing/keyResolution.server', () => ({
  getCurrentSigningKey: async () => await getCurrentSigningKey()
}))

const { signComponentExecutable } = await import('./executable.server')

const SUBJECT = {
  uid: 'component-1',
  commitId: 'commit-1',
  authorId: 'user-1',
  committedAt: 1_700_000_000_000
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

  it('stamps compiledAt at signing time, leaving committedAt as it was', async () => {
    const before = Date.now()
    const envelope = await signed()

    expect(envelope.payload.committedAt).toBe(SUBJECT.committedAt)
    expect(envelope.payload.compiledAt).toBeGreaterThanOrEqual(before)
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
    const tampered = { ...envelope, payload: { ...envelope.payload, authorId: 'someone-else' } }

    expect(verify(tampered, EXECUTABLE_DOCUMENT, keypair.publicKey).valid).toBe(false)
  })

  it('refuses a signature checked against a different key', async () => {
    const other = algorithm.generateKeypair(new Uint8Array(algorithm.lengths.seed).fill(9))
    const envelope = await signed()

    expect(verify(envelope, EXECUTABLE_DOCUMENT, other.publicKey).valid).toBe(false)
  })
})
