import type { KeyRegistry, SubordinateKeyEntry } from './registry'

/**
 * The key registry as an administration screen needs to see it.
 *
 * Pure, and separate from the service that reads the bucket, so what a state *means* is decided in
 * one place and tested without a key, a clock or a storage adapter.
 *
 * The registry stores the facts — two optional timestamps — while a screen needs the conclusion
 * drawn from them. Leaving that to the interface would put the rule that a revoked key is rejected
 * outright somewhere a designer could disagree with it.
 */

/**
 * What a key is, in one word.
 *
 * `superseded` and `revoked` are the distinction §4.1.15 turns on: a superseded key still verifies,
 * which is what makes routine rotation safe and what makes it no answer to a leak.
 */
type KeyState = 'current' | 'superseded' | 'revoked'

interface AdministrableKey {
  keyId: string
  alg: string
  state: KeyState
  createdAt: number
  supersededAt?: number
  revokedAt?: number
  /**
   * Whether revoking this key is an operation that would do anything.
   *
   * The current key is revocable: the service rotates away from it first, so the instance keeps a
   * live key to sign the very registry that records the revocation. Only an already-revoked key is
   * not, and saying so is what stops the screen offering a second revocation of the same key.
   */
  revocable: boolean
}

/** The anchor a consumer SDK embeds. Public by construction — it is what verification needs. */
interface RootAnchor {
  keyId: string
  alg: string
  /** base64 */
  publicKey: string
}

interface KeyAdministrationView {
  root: RootAnchor
  /** Current key first, then newest to oldest. */
  keys: AdministrableKey[]
  /** The registry's publication counter, which rollback detection rests on. */
  sequence: number
  /**
   * The rotation interval and when the current key reaches it.
   *
   * Absent when the security policy could not be read. The screen reports that rather than assuming
   * an interval — a wrong date here would be read as a promise about when a key stops being used.
   */
  rotation?: {
    days: number
    dueAt: number
  }
}

/**
 * Revocation wins over every other state.
 *
 * A key can be superseded and later revoked, and the two are true at once. Reporting the milder one
 * would describe a key that verifies nothing as merely retired.
 */
function keyState (entry: SubordinateKeyEntry, currentKeyId: string): KeyState {
  if (entry.revokedAt !== undefined) return 'revoked'
  if (entry.keyId === currentKeyId) return 'current'
  return 'superseded'
}

function describeKey (entry: SubordinateKeyEntry, currentKeyId: string): AdministrableKey {
  const state = keyState(entry, currentKeyId)
  return {
    keyId: entry.keyId,
    alg: entry.alg,
    state,
    createdAt: entry.createdAt,
    ...(entry.supersededAt === undefined ? {} : { supersededAt: entry.supersededAt }),
    ...(entry.revokedAt === undefined ? {} : { revokedAt: entry.revokedAt }),
    revocable: state !== 'revoked'
  }
}

/**
 * Every key in the registry, current one first and the rest newest to oldest.
 *
 * Rotation appends, so the stored order is oldest first — the reverse of what an administrator
 * looks for. The current key is pulled to the front explicitly rather than relied upon to be the
 * newest: that happens to be true of every registry rotation produces, and a display that assumed
 * it would quietly mis-order any registry that was not.
 */
function describeKeys (registry: KeyRegistry): AdministrableKey[] {
  return registry.keys
    .map(entry => describeKey(entry, registry.current))
    .sort((left, right) => {
      if (left.state === 'current') return -1
      if (right.state === 'current') return 1
      return right.createdAt - left.createdAt
    })
}

export {
  keyState,
  describeKey,
  describeKeys
}

export type {
  KeyState,
  AdministrableKey,
  RootAnchor,
  KeyAdministrationView
}
