import { requirePermission } from '$lib/script/authorization/enforce'
import type { AuthContext } from '$lib/script/authorization/context'
import { loadSecurityPolicy } from '$lib/script/securityPolicy/policy.server'
import { rotationDueAt } from '$lib/script/securityPolicy/policy'
import { getRegistry, rotateSubordinateKey, revokeSubordinateKey } from './keyResolution.server'
import { findKey, currentKey } from './registry'
import { getRootPublicKey } from './rootKey.server'
import { describeKeys, type KeyAdministrationView } from './keyAdministration'

/**
 * The signing service: administering the operational keys.
 *
 * `keyResolution.server` is the primary layer and stays unprivileged — the CMS signs its own
 * artifacts through it on every request, with no principal involved — matching the split used by
 * storage, database and configuration. Everything here takes an `AuthContext` first and checks a
 * permission before delegating.
 *
 * ## Why this module exists at all
 *
 * `config:keys:manage` was in the taxonomy from the start and **checked nowhere**, because until
 * there was a screen the signing module had only one caller: the CMS itself. A permission enforced
 * nowhere is indistinguishable from one nobody holds, and putting the checks in the route instead
 * would spread the decision across call sites, which is what this layer exists to avoid.
 *
 * ## One permission for reading and for acting
 *
 * There is no `config:keys:read`. The registry is *published* — every consumer fetches it in order
 * to verify anything at all — so a read permission would withhold nothing that is not already
 * public. What this module adds is the ability to act, which is the decision worth governing. The
 * same reasoning that rejected `storage:bucket:list`.
 *
 * ## Root rotation is not here
 *
 * Deliberately. Rotating the root strands every deployed consumer until it is rebuilt with the new
 * anchor, so it belongs with whoever can also redeploy them: `genoacms rotate-root`, which refuses
 * to act without explicit confirmation. Exposing it here would put the one operation whose blast
 * radius is every consumer behind a session that can be hijacked.
 */

/**
 * The shape the configuration screens already speak.
 *
 * A refusal is an ordinary answer here — the key is gone, someone else rotated first — not a server
 * fault, so it comes back as a reason the page can render rather than as an exception the route has
 * to guess the meaning of.
 */
type KeyOperationResult<T> =
  | { ok: true, value: T }
  | { ok: false, reason: string }

const failure = (error: unknown): { ok: false, reason: string } =>
  ({ ok: false, reason: (error as Error).message })

/**
 * The registry as an administration screen needs it: the anchor, every key, and when the current
 * one falls due.
 *
 * **Reading bootstraps.** An instance that has never signed anything has no registry, and the
 * primary layer creates one rather than reporting its absence — the same path every signature takes
 * on first use. A screen that reported "no keys" would describe a state the next signature silently
 * leaves.
 */
const listUserSigningKeys = async (
  ctx: AuthContext
): Promise<KeyOperationResult<KeyAdministrationView>> => {
  // Acting on the keys and seeing them are the same decision; see the note above.
  requirePermission(ctx, 'config:keys:manage')

  try {
    const [registry, root] = await Promise.all([getRegistry(), getRootPublicKey()])
    return {
      ok: true,
      value: {
        root,
        keys: describeKeys(registry),
        sequence: registry.sequence,
        // The registry is invalid without a current key, so this cannot be reached without one.
        ...await rotationOf(currentKey(registry).createdAt)
      }
    }
  } catch (error) {
    // A registry that exists but does not verify is reported, never replaced. Overwriting it would
    // destroy the evidence, and could be exactly what an attacker wanted.
    return failure(error)
  }
}

/**
 * The rotation interval, when it can be read.
 *
 * A policy that will not load leaves the view without it rather than falling back to a default. The
 * date is read as a statement about when a key stops being used, and one derived from an interval
 * this instance is not actually applying would be worse than none.
 */
const rotationOf = async (createdAt: number): Promise<Pick<KeyAdministrationView, 'rotation'>> => {
  try {
    const policy = await loadSecurityPolicy()
    return {
      rotation: {
        days: policy.subordinateKeyRotationDays,
        dueAt: rotationDueAt(policy, createdAt)
      }
    }
  } catch {
    return {}
  }
}

/**
 * Mints a fresh subordinate key and supersedes the outgoing one.
 *
 * Offered even though the interval rotates on its own, because nothing schedules it: the check
 * happens when a key is about to be used and is found overdue, which is the only moment a CMS that
 * is not a daemon can make it. An administrator who has just shortened the interval, or who wants a
 * key of known age before a release, has no other way to bring one about.
 */
const rotateUserSubordinateKey = async (
  ctx: AuthContext
): Promise<KeyOperationResult<{ keyId: string }>> => {
  requirePermission(ctx, 'config:keys:manage')

  try {
    const rotated = await rotateSubordinateKey()
    return { ok: true, value: { keyId: rotated.current } }
  } catch (error) {
    return failure(error)
  }
}

/**
 * Marks a key untrusted, rotating away from it first when it is the one currently signing.
 *
 * **This is the response to a leak, and rotation is not.** A superseded key still verifies, so
 * rotating away from a key an adversary holds achieves nothing; only revocation does. The cost is
 * accepted rather than softened: every signature that key ever made stops verifying, because
 * nothing dates a signature and a rule honoring "earlier" ones would honor the forgeries too.
 *
 * The already-revoked case is refused rather than repeated. Revoking twice would publish a second
 * registry that says exactly what the first one did, spending a sequence number and a signature to
 * change nothing.
 */
const revokeUserSubordinateKey = async (
  ctx: AuthContext,
  keyId: string
): Promise<KeyOperationResult<void>> => {
  requirePermission(ctx, 'config:keys:manage')

  try {
    const registry = await getRegistry()
    const entry = findKey(registry, keyId)
    if (entry === undefined) return { ok: false, reason: `key/unknown: ${keyId}` }
    if (entry.revokedAt !== undefined) return { ok: false, reason: `key/already-revoked: ${keyId}` }

    await revokeSubordinateKey(keyId)
    return { ok: true, value: undefined }
  } catch (error) {
    return failure(error)
  }
}

export {
  listUserSigningKeys,
  rotateUserSubordinateKey,
  revokeUserSubordinateKey
}

export type {
  KeyOperationResult
}
