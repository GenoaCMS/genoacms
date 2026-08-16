import { sha256 } from '@noble/hashes/sha2.js'

/**
 * Refresh token families: the rules, without the storage.
 *
 * A family is one login. Each refresh consumes the current token and issues its successor, so a
 * token presented after it has been superseded means someone kept a copy — the family is revoked and
 * the user re-authenticates.
 *
 * **Only hashes are stored.** Reading the session store must not yield anything usable, so the
 * record holds digests and the token itself exists only in the client's cookie.
 */

interface SessionFamily {
  familyId: string
  subject: string
  /** Digest of the token that is currently valid. */
  currentHash: string
  /**
   * Digest of the token this one replaced, if any.
   *
   * Kept so that a browser's concurrent requests — which all present the same token when the access
   * token has just expired — are not mistaken for theft. See `assessToken`.
   */
  previousHash?: string
  /** When `previousHash` stopped being current, for the grace window. */
  rotatedAt?: number
  generation: number
  createdAt: number
  expiresAt: number
}

/** Digest of a presented token. Hex, so a record is inspectable without being usable. */
function hashToken (token: string): string {
  const bytes = sha256(new TextEncoder().encode(token))
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

type TokenVerdict =
  /** The presented token is the current one. Rotate and issue its successor. */
  | { outcome: 'current' }
  /**
   * The immediately previous token, within the grace window — a concurrent request from the same
   * client, not a replay. Answer with the token that superseded it rather than rotating again.
   */
  | { outcome: 'concurrent' }
  /** Older than the previous token, or outside the window. Revoke the family. */
  | { outcome: 'reused' }
  | { outcome: 'expired' }
  | { outcome: 'unknown' }

/** Seconds an immediately-superseded token stays acceptable, for one page's concurrent requests. */
const DEFAULT_GRACE_SECONDS = 10

/**
 * What to do about a presented token.
 *
 * Separated from acting on it so the rules are testable without a clock, a bucket, or a cookie —
 * these decide whether a user stays signed in and whether a session is treated as stolen.
 */
function assessToken (
  family: SessionFamily,
  token: string,
  now: number,
  graceSeconds: number = DEFAULT_GRACE_SECONDS
): TokenVerdict {
  if (now >= family.expiresAt) return { outcome: 'expired' }

  const presented = hashToken(token)
  if (presented === family.currentHash) return { outcome: 'current' }

  if (family.previousHash !== undefined && presented === family.previousHash) {
    const rotatedAt = family.rotatedAt ?? 0
    // Inside the window this is the legitimate client's own second request; outside it, the token
    // has outlived any plausible concurrency and is a replay.
    return now - rotatedAt <= graceSeconds * 1_000 ? { outcome: 'concurrent' } : { outcome: 'reused' }
  }

  // A token belonging to this family but matching neither hash is an older generation: someone
  // retained a copy across at least one rotation.
  return { outcome: 'reused' }
}

/** The family record after a successful rotation. The superseded hash is retained for the window. */
function rotated (family: SessionFamily, nextToken: string, now: number): SessionFamily {
  return {
    ...family,
    previousHash: family.currentHash,
    rotatedAt: now,
    currentHash: hashToken(nextToken),
    generation: family.generation + 1
  }
}

function newFamily (
  familyId: string,
  subject: string,
  token: string,
  now: number,
  lifetimeDays: number
): SessionFamily {
  return {
    familyId,
    subject,
    currentHash: hashToken(token),
    generation: 1,
    createdAt: now,
    expiresAt: now + lifetimeDays * 24 * 60 * 60 * 1_000
  }
}

function isPlainObject (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

/** Parses a stored family record. A malformed one is rejected, never partially believed. */
function parseSessionFamily (payload: unknown): SessionFamily | undefined {
  if (!isPlainObject(payload)) return undefined
  const { familyId, subject, currentHash, previousHash, rotatedAt, generation, createdAt, expiresAt, ...rest } = payload
  if (Object.keys(rest).length > 0) return undefined
  if (typeof familyId !== 'string' || familyId.length === 0) return undefined
  if (typeof subject !== 'string' || subject.length === 0) return undefined
  if (typeof currentHash !== 'string' || currentHash.length === 0) return undefined
  if (previousHash !== undefined && typeof previousHash !== 'string') return undefined
  if (rotatedAt !== undefined && !isTimestamp(rotatedAt)) return undefined
  if (!isTimestamp(generation) || generation < 1) return undefined
  if (!isTimestamp(createdAt) || !isTimestamp(expiresAt)) return undefined

  const family: SessionFamily = { familyId, subject, currentHash, generation, createdAt, expiresAt }
  if (previousHash !== undefined) family.previousHash = previousHash
  if (rotatedAt !== undefined) family.rotatedAt = rotatedAt
  return family
}

export {
  DEFAULT_GRACE_SECONDS,
  hashToken,
  assessToken,
  rotated,
  newFamily,
  parseSessionFamily
}

export type {
  SessionFamily,
  TokenVerdict
}
