import { peekUnverifiedHeader, verify, type DocumentType } from './envelope'
import { resolveVerificationKey } from './keyResolution.server'
import { loadRootKey } from './rootKey.server'
import type { JsonValue } from './canonical'

/**
 * Reading a signed document: the part that is identical for every one of them.
 *
 * The registry, the authorization manifests and the security policy all arrive as envelopes, and
 * all establish trust the same way — look up the declared key, verify, and only then look at the
 * payload. What differs is what each does when that fails, which stays with the caller: the
 * manifests quarantine and replace, the registry refuses, the policy falls back to defaults.
 */

type SignedReadResult =
  | { ok: true, payload: JsonValue }
  /** The document is definitively bad. Callers may replace it. */
  | { ok: false, reason: string }

/**
 * Verifies an envelope's signature against the key it names.
 *
 * **Only verdicts are returned as `ok: false`.** A bad signature, an unknown key and a revoked key
 * are conclusions about the document. An unreachable registry is not — it propagates, because a
 * caller that replaces a document on a transient failure destroys data it merely could not read.
 */
async function readSignedDocument (candidate: unknown, expectedType: DocumentType): Promise<SignedReadResult> {
  const header = peekUnverifiedHeader(candidate)
  if (header === undefined) return { ok: false, reason: 'not a signed envelope' }

  // Throws when the registry cannot be read. That is deliberately not caught here.
  const publicKey = await resolveVerificationKey(header.keyId)
  if (publicKey === undefined) {
    return { ok: false, reason: `signing key ${header.keyId} is unknown or revoked` }
  }

  const verified = verify(candidate, expectedType, publicKey)
  if (!verified.valid) return { ok: false, reason: `signature: ${verified.reason}` }

  return { ok: true, payload: verified.payload }
}

/**
 * Verifies a document the **root** signed — the key registry and the security policy.
 *
 * Separate from `readSignedDocument` because these cannot go through the registry: the registry is
 * one of them, and the root is not among the subordinate keys it lists. Verification is against the
 * trust anchor directly, which is what makes the chain terminate.
 */
async function readRootSignedDocument (candidate: unknown, expectedType: DocumentType): Promise<SignedReadResult> {
  const root = await loadRootKey()
  const verified = verify(candidate, expectedType, root.publicKey)
  if (!verified.valid) return { ok: false, reason: `signature: ${verified.reason}` }
  return { ok: true, payload: verified.payload }
}

export {
  readSignedDocument,
  readRootSignedDocument
}

export type {
  SignedReadResult
}
