import type { GuardCeilings } from '@genoacms/internal/guards'

/**
 * The instance's security policy, as a value.
 *
 * One document governed by one permission — `config:security:manage` — holding the settings that
 * feed security decisions rather than describe infrastructure. Rotation interval, token and cache
 * lifetimes, and the runtime guard ceilings; the fetch origin allowlist joins it as that is built.
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
   * Short by design: it is the window during which a revoked permission is still honored, since
   * grants travel inside the token.
   */
  accessTokenMinutes: number
  /**
   * How long resolved grants are cached per subject.
   *
   * A security parameter rather than a tuning one: it is the window during which a permission
   * removed from a role is still honored. It can be short, because a miss costs one storage read
   * rather than a re-authentication.
   */
  grantCacheSeconds: number
  /** Refresh token lifetime in days — how long a session survives without re-authenticating. */
  refreshTokenDays: number
  /**
   * Loop iterations and recursive branches a component may spend in one render.
   *
   * Compiled into every component published while this value is in force, and covered by its
   * signature. Changing it here binds what is published afterwards; artifacts already released keep
   * the ceiling they were built against until they are recompiled.
   */
  maxFuel: number
  /** How deep a component's recursive calls may nest before the depth guard stops it. */
  maxDepth: number
  /** Cumulative elements and bytes a component may ask for across one render. */
  maxAllocation: number
  /**
   * The origins a component's data bridge may reach.
   *
   * **Empty by default, which permits nothing.** A bridge that reached everywhere until someone
   * narrowed it would be indistinguishable from no bridge at all for as long as nobody noticed.
   *
   * An origin and nothing more — scheme, host and optional port. A path would suggest the allowlist
   * constrains what a component may ask for, and it does not: it constrains who it may ask.
   */
  fetchOrigins: string[]
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

/** Below a thousand iterations, ordinary presentational work stops fitting. */
const MIN_FUEL = 1_000
/** A billion iterations is long enough that the render is the outage the guard was meant to stop. */
const MAX_FUEL = 1_000_000_000

/** Below eight levels, a component cannot walk a nested slot tree of any depth. */
const MIN_DEPTH = 8
/** The engine's own stack gives out around here, so a higher ceiling would never be the binding one. */
const MAX_DEPTH = 10_000

const MIN_ALLOCATION = 1_000
/** Past a billion the process is out of memory before the counter notices. */
const MAX_ALLOCATION = 1_000_000_000

/**
 * Beyond this many origins the list stops being a decision and becomes a habit.
 *
 * It also bounds what gets compiled into every artifact: the allowlist travels inside each bundle,
 * so an unbounded list is unbounded bytes in every published component.
 */
const MAX_FETCH_ORIGINS = 64

/**
 * Every field, and the range it is meaningful in.
 *
 * A table rather than a check per field: the parser reads a signed document and every field is
 * validated identically, so writing the comparison seven times would be seven chances to write it
 * differently. **The key order is the order faults are reported in**, which is why the fields a
 * document has always had come first.
 */
const BOUNDS = {
  subordinateKeyRotationDays: { min: MIN_ROTATION_DAYS, max: MAX_ROTATION_DAYS },
  accessTokenMinutes: { min: MIN_ACCESS_TOKEN_MINUTES, max: MAX_ACCESS_TOKEN_MINUTES },
  grantCacheSeconds: { min: MIN_GRANT_CACHE_SECONDS, max: MAX_GRANT_CACHE_SECONDS },
  refreshTokenDays: { min: MIN_REFRESH_TOKEN_DAYS, max: MAX_REFRESH_TOKEN_DAYS },
  maxFuel: { min: MIN_FUEL, max: MAX_FUEL },
  maxDepth: { min: MIN_DEPTH, max: MAX_DEPTH },
  maxAllocation: { min: MIN_ALLOCATION, max: MAX_ALLOCATION }
} as const satisfies Record<string, { min: number, max: number }>

/** The fields that are a bounded whole number, and the one that is not. */
const NUMERIC_FIELDS = Object.keys(BOUNDS) as (keyof SecurityPolicy)[]
const POLICY_FIELDS = [...NUMERIC_FIELDS, 'fetchOrigins'] as (keyof SecurityPolicy)[]

/**
 * The permitted range of every field, for a screen to show beside its input.
 *
 * The same table the parser refuses against, exported rather than restated: a screen offering a
 * range the parser disagrees with would let an administrator enter a value the server then rejects,
 * which teaches them the screen is lying rather than that the value was wrong.
 */
const policyBounds = (): Record<string, { min: number, max: number }> => ({ ...BOUNDS })

function isPlainObject (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Why this value cannot be one of the bounded whole numbers, or nothing if it can. */
function rejectNumber (field: string, value: unknown): string | undefined {
  const { min, max } = BOUNDS[field as keyof typeof BOUNDS]
  if (typeof value !== 'number' || !Number.isInteger(value)) return `policy.${field} is not an integer`
  if (value < min || value > max) return `policy.${field} must be between ${min} and ${max}`
  return undefined
}

/**
 * An origin, and nothing that is not one.
 *
 * Compared against what the platform's own parser calls the origin, so `https://api.example.com/`
 * and `https://api.example.com/v1` are both refused rather than trimmed. An allowlist entry that
 * did not survive a round trip through a URL parser is one the runtime check might read differently
 * from the person who typed it.
 */
const isOrigin = (value: unknown): boolean => {
  if (typeof value !== 'string' || value === '') return false
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === value
  } catch {
    return false
  }
}

/** Why this value cannot be the allowlist, or nothing if it can. */
function rejectOrigins (value: unknown): string | undefined {
  if (!Array.isArray(value)) return 'policy.fetchOrigins is not a list'
  if (value.length > MAX_FETCH_ORIGINS) {
    return `policy.fetchOrigins carries more than ${MAX_FETCH_ORIGINS} origins`
  }
  const offending = value.find(entry => !isOrigin(entry))
  if (offending !== undefined) {
    return `policy.fetchOrigins contains ${JSON.stringify(offending)}, which is not an origin`
  }
  // A repeated origin grants nothing twice, but it is a list somebody edited by hand and the
  // duplicate is more likely a mistake than an intention.
  if (new Set(value as string[]).size !== value.length) {
    return 'policy.fetchOrigins lists the same origin more than once'
  }
  return undefined
}

const reject = (field: keyof SecurityPolicy, value: unknown): string | undefined =>
  field === 'fetchOrigins' ? rejectOrigins(value) : rejectNumber(field, value)

function parseSecurityPolicy (payload: unknown): PolicyParseResult {
  if (!isPlainObject(payload)) return { ok: false, reason: 'policy is not an object' }

  // A field this version does not know is a document from a version that does. Guessing at it would
  // mean acting on a policy only half understood.
  const unexpected = Object.keys(payload).filter(key => !POLICY_FIELDS.includes(key as keyof SecurityPolicy))
  if (unexpected.length > 0) {
    return { ok: false, reason: `policy has unexpected fields: ${unexpected.join(', ')}` }
  }

  const policy = {} as SecurityPolicy
  for (const field of POLICY_FIELDS) {
    const reason = reject(field, payload[field])
    if (reason !== undefined) return { ok: false, reason }
    // Copied rather than referenced, so the parsed policy does not alias the payload it was read
    // from — a caller mutating the list afterwards would otherwise change what was validated.
    policy[field] = (field === 'fetchOrigins'
      ? [...(payload[field] as string[])]
      : payload[field]) as never
  }

  return { ok: true, policy }
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

/**
 * The moment a key that became current at `createdAt` falls due.
 *
 * The same threshold `isRotationDue` compares against, exposed so an administration screen can state
 * *when* rather than only *whether*. Derived from the one arithmetic rather than restated, so a
 * screen cannot show a date the rotation would disagree with.
 */
function rotationDueAt (policy: SecurityPolicy, createdAt: number): number {
  return createdAt + policy.subordinateKeyRotationDays * DAY_MS
}

/**
 * The three ceilings, lifted out of everything else the policy governs.
 *
 * A named selection rather than the whole policy being handed around: what gets signed into an
 * artifact is these three numbers, and passing a policy would put a key rotation interval inside a
 * component's payload. Turning them into the budgets a render runs against is `budgetsFrom`, in the
 * shared vocabulary, so the two shapes meet in exactly one place.
 */
function guardCeilings (policy: SecurityPolicy): GuardCeilings {
  return { maxFuel: policy.maxFuel, maxDepth: policy.maxDepth, maxAllocation: policy.maxAllocation }
}

export {
  policyBounds,
  isOrigin,
  POLICY_FIELDS,
  NUMERIC_FIELDS,
  MAX_FETCH_ORIGINS,
  MIN_ROTATION_DAYS,
  MAX_ROTATION_DAYS,
  MIN_ACCESS_TOKEN_MINUTES,
  MAX_ACCESS_TOKEN_MINUTES,
  MIN_GRANT_CACHE_SECONDS,
  MAX_GRANT_CACHE_SECONDS,
  MIN_REFRESH_TOKEN_DAYS,
  MAX_REFRESH_TOKEN_DAYS,
  MIN_FUEL,
  MAX_FUEL,
  MIN_DEPTH,
  MAX_DEPTH,
  MIN_ALLOCATION,
  MAX_ALLOCATION,
  DAY_MS,
  guardCeilings,
  parseSecurityPolicy,
  isRotationDue,
  rotationDueAt
}

export type {
  SecurityPolicy,
  PolicyParseResult
}
