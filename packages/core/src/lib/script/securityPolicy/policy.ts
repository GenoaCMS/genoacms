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
   * Policy, never a constant in code — §4.1.15 is explicit that limits are configured rather than
   * embedded. The Tier-1 declaration supplies the default; this document holds the live value.
   */
  subordinateKeyRotationDays: number
}

type PolicyParseResult =
  | { ok: true, policy: SecurityPolicy }
  | { ok: false, reason: string }

/** A year is the outer bound: beyond it, "rotation" stops meaningfully limiting a key's exposure. */
const MAX_ROTATION_DAYS = 365
/** Below a day, an instance would rotate faster than it could plausibly publish and cache. */
const MIN_ROTATION_DAYS = 1

function isPlainObject (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseSecurityPolicy (payload: unknown): PolicyParseResult {
  if (!isPlainObject(payload)) return { ok: false, reason: 'policy is not an object' }

  const { subordinateKeyRotationDays, ...rest } = payload
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

  return { ok: true, policy: { subordinateKeyRotationDays } }
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
  DAY_MS,
  parseSecurityPolicy,
  isRotationDue
}

export type {
  SecurityPolicy,
  PolicyParseResult
}
