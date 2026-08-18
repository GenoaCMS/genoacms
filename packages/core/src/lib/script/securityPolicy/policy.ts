/**
 * The instance's security policy, as a value.
 *
 * One document governed by one permission — `config:security:manage` — holding the settings that
 * feed security decisions rather than describe infrastructure. Rotation interval today; runtime
 * guard ceilings and the fetch origin allowlist join it as those are built.
 *
 * It is a **signed document** like the manifests, not a plain config file. Everything here is an
 * input to a security decision, so it cannot be the one thing in the bucket that is merely trusted:
 * an adversary who could lower a guard ceiling or widen an allowlist by editing an unsigned file
 * would not need to break anything else.
 *
 * Pure and free of storage, so its rules and defaults are testable directly.
 */

interface SecurityPolicy {
  /**
   * How long a subordinate signing key stays current before rotation.
   *
   * Policy, never a constant in code: limits are configured rather than
   * embedded. The Tier-1 declaration supplies the default; this document holds the live value.
   */
  subordinateKeyRotationDays: number
  /**
   * Access token lifetime in minutes.
   *
   * Short by design: it is the window during which a revoked permission is still honoured, since
   * grants travel inside the token.
   */
  accessTokenMinutes: number
  /**
   * How long resolved grants are cached per subject.
   *
   * A security parameter rather than a tuning one: it is the window during which a permission
   * removed from a role is still honoured. It can be short, because a miss costs one storage read
   * rather than a re-authentication.
   */
  grantCacheSeconds: number
  /** Refresh token lifetime in days — how long a session survives without re-authenticating. */
  refreshTokenDays: number
}

type PolicyParseResult =
  | { ok: true, policy: SecurityPolicy }
  | { ok: false, reason: string }

/** A year is the outer bound: beyond it, "rotation" stops meaningfully limiting a key's exposure. */
const MAX_ROTATION_DAYS = 365
/** Below a day, an instance would rotate faster than it could plausibly publish and cache. */
const MIN_ROTATION_DAYS = 1

/** Beyond a day the token stops being "short-lived" and revocation stops meaning much. */
const MAX_ACCESS_TOKEN_MINUTES = 1_440
/** Below a minute, clock skew between nodes starts rejecting tokens that were just issued. */
const MIN_ACCESS_TOKEN_MINUTES = 1

/** Beyond five minutes a revoked permission outlives the incident it was revoked for. */
const MAX_GRANT_CACHE_SECONDS = 300
/** Zero is permitted: it means resolve every request, which is correct but costs a read each time. */
const MIN_GRANT_CACHE_SECONDS = 0

/** Beyond a year a "session" is a standing credential. */
const MAX_REFRESH_TOKEN_DAYS = 365
const MIN_REFRESH_TOKEN_DAYS = 1

function isPlainObject (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseSecurityPolicy (payload: unknown): PolicyParseResult {
  if (!isPlainObject(payload)) return { ok: false, reason: 'policy is not an object' }

  const { subordinateKeyRotationDays, accessTokenMinutes, grantCacheSeconds, refreshTokenDays, ...rest } = payload
  if (Object.keys(rest).length > 0) {
    // A field this version does not know is a document from a version that does. Guessing at it
    // would mean acting on a policy only half understood.
    return { ok: false, reason: `policy has unexpected fields: ${Object.keys(rest).join(', ')}` }
  }
  if (typeof subordinateKeyRotationDays !== 'number' || !Number.isInteger(subordinateKeyRotationDays)) {
    return { ok: false, reason: 'policy.subordinateKeyRotationDays is not an integer' }
  }
  if (subordinateKeyRotationDays < MIN_ROTATION_DAYS || subordinateKeyRotationDays > MAX_ROTATION_DAYS) {
    return {
      ok: false,
      reason: `policy.subordinateKeyRotationDays must be between ${MIN_ROTATION_DAYS} and ${MAX_ROTATION_DAYS}`
    }
  }

  if (typeof accessTokenMinutes !== 'number' || !Number.isInteger(accessTokenMinutes)) {
    return { ok: false, reason: 'policy.accessTokenMinutes is not an integer' }
  }
  if (accessTokenMinutes < MIN_ACCESS_TOKEN_MINUTES || accessTokenMinutes > MAX_ACCESS_TOKEN_MINUTES) {
    return {
      ok: false,
      reason: `policy.accessTokenMinutes must be between ${MIN_ACCESS_TOKEN_MINUTES} and ${MAX_ACCESS_TOKEN_MINUTES}`
    }
  }

  if (typeof grantCacheSeconds !== 'number' || !Number.isInteger(grantCacheSeconds)) {
    return { ok: false, reason: 'policy.grantCacheSeconds is not an integer' }
  }
  if (grantCacheSeconds < MIN_GRANT_CACHE_SECONDS || grantCacheSeconds > MAX_GRANT_CACHE_SECONDS) {
    return {
      ok: false,
      reason: `policy.grantCacheSeconds must be between ${MIN_GRANT_CACHE_SECONDS} and ${MAX_GRANT_CACHE_SECONDS}`
    }
  }

  if (typeof refreshTokenDays !== 'number' || !Number.isInteger(refreshTokenDays)) {
    return { ok: false, reason: 'policy.refreshTokenDays is not an integer' }
  }
  if (refreshTokenDays < MIN_REFRESH_TOKEN_DAYS || refreshTokenDays > MAX_REFRESH_TOKEN_DAYS) {
    return {
      ok: false,
      reason: `policy.refreshTokenDays must be between ${MIN_REFRESH_TOKEN_DAYS} and ${MAX_REFRESH_TOKEN_DAYS}`
    }
  }

  return {
    ok: true,
    policy: { subordinateKeyRotationDays, accessTokenMinutes, grantCacheSeconds, refreshTokenDays }
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Whether a key that became current at `createdAt` is now due for rotation.
 *
 * Separated from the decision to *act* on it so the arithmetic is testable without a clock, a
 * bucket, or a key.
 */
function isRotationDue (policy: SecurityPolicy, createdAt: number, now: number): boolean {
  return now - createdAt >= policy.subordinateKeyRotationDays * DAY_MS
}

export {
  MIN_ROTATION_DAYS,
  MAX_ROTATION_DAYS,
  MIN_ACCESS_TOKEN_MINUTES,
  MAX_ACCESS_TOKEN_MINUTES,
  MIN_GRANT_CACHE_SECONDS,
  MAX_GRANT_CACHE_SECONDS,
  MIN_REFRESH_TOKEN_DAYS,
  MAX_REFRESH_TOKEN_DAYS,
  DAY_MS,
  parseSecurityPolicy,
  isRotationDue
}

export type {
  SecurityPolicy,
  PolicyParseResult
}
