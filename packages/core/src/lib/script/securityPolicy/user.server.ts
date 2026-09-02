import { requirePermission } from '$lib/script/authorization/enforce'
import type { AuthContext } from '$lib/script/authorization/context'
import { isPreconditionFailed } from '@genoacms/cloudabstraction/storage'
import { parseSecurityPolicy, policyBounds, type SecurityPolicy } from './policy'
import { readStoredPolicy, writePolicy } from './policy.server'

/**
 * Administering the security policy.
 *
 * The same split the signing service uses: `policy.server` stays unprivileged, because the CMS reads
 * the policy on nearly every request with no principal involved, and everything a person does to it
 * goes through here behind `config:security:manage`.
 *
 * ## One permission, for reading and for writing
 *
 * There is no `config:security:read`. Unlike the key registry — which is published, so withholding
 * it would withhold nothing — this document is private, and its values are inputs to security
 * decisions. But a principal who may read the ceilings and not change them has no use for the screen
 * this feeds, and the taxonomy already treats configuration as one decision per document. The same
 * reasoning that gave the keys one permission, reaching the opposite starting point.
 *
 * ## Nothing here is partial
 *
 * A write replaces the whole document, because `parseSecurityPolicy` reads it as a whole and the
 * format has no notion of a field left alone. A screen that edited only the guard ceilings would
 * still be sending back every other value, so it may as well say so.
 */

type PolicyResult<T> =
  | { ok: true, value: T }
  | { ok: false, reason: string }

/** What a screen needs to render the policy and write it back safely. */
interface PolicyAdministrationView {
  policy: SecurityPolicy
  /** The permitted range of each field, so the screen refuses what the parser would. */
  bounds: Record<keyof SecurityPolicy, { min: number, max: number }>
  /** Quoted back on write, so a concurrent edit is refused rather than overwritten. */
  version?: string
  /** Set when the stored document could not be used and these are the configured defaults. */
  degraded?: string
}

const readUserSecurityPolicy = async (
  ctx: AuthContext
): Promise<PolicyResult<PolicyAdministrationView>> => {
  requirePermission(ctx, 'config:security:manage')

  const stored = await readStoredPolicy()
  return {
    ok: true,
    value: {
      policy: stored.policy,
      bounds: policyBounds(),
      ...(stored.version === undefined ? {} : { version: stored.version }),
      ...(stored.degraded === undefined ? {} : { degraded: stored.degraded })
    }
  }
}

/**
 * Replaces the policy, refusing a document that moved since it was read.
 *
 * **Validated before it is signed.** A signature over an out-of-range value would be an attested
 * claim that the instance accepted it, and the next read would refuse the very document this wrote.
 *
 * The value is **rejected, never clamped**: an administrator who wrote 5000 days meant something,
 * and quietly storing 365 would leave the instance behaving differently from the screen they are
 * looking at.
 */
const updateUserSecurityPolicy = async (
  ctx: AuthContext,
  candidate: unknown,
  expectedVersion?: string
): Promise<PolicyResult<SecurityPolicy>> => {
  requirePermission(ctx, 'config:security:manage')

  const parsed = parseSecurityPolicy(candidate)
  if (!parsed.ok) return { ok: false, reason: parsed.reason }

  try {
    await writePolicy(parsed.policy, expectedVersion)
  } catch (error) {
    // Someone else wrote between the read and this. Reporting it as a conflict is what lets the
    // screen reload rather than silently discarding whatever they changed.
    if (isPreconditionFailed(error)) {
      return {
        ok: false,
        reason: 'The policy was changed by someone else while you were editing it. Reload and try again.'
      }
    }
    return { ok: false, reason: (error as Error).message }
  }

  return { ok: true, value: parsed.policy }
}

export { readUserSecurityPolicy, updateUserSecurityPolicy }
export type { PolicyAdministrationView, PolicyResult }
