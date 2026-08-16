/**
 * The integrity gate for authorization manifests.
 *
 * Manifests live in a bucket, so an actor able to write to that bucket out-of-band edits
 * authorization without going through the CMS. A signature is what makes that detectable.
 *
 * **No verifier exists yet** — signing arrives with the secrets service and the PQC key
 * hierarchy. Until then an instance runs under `accept-unsigned`, and this file is the single
 * place that will change: implement `ManifestVerifier`, register it, and flip the default policy.
 * Nothing above this layer needs to know which of those two worlds it is in.
 */

/** What an instance does with a manifest it could not verify. */
type ManifestTrustPolicy = 'accept-unsigned' | 'require-signature'

const DEFAULT_MANIFEST_TRUST: ManifestTrustPolicy = 'accept-unsigned'

interface VerificationOutcome {
  verified: boolean
  reason: string
}

/**
 * A verifier runs on the **stored bytes**, before parsing — a signature attests to what was
 * written, not to what a parser made of it.
 */
interface ManifestVerifier {
  verify: (path: string, raw: string) => Promise<VerificationOutcome>
}

/**
 * The placeholder in force until signing exists. It does not pretend to verify: it reports that
 * no verifier is configured, and the trust policy decides what that means.
 */
const unverifiedManifestVerifier: ManifestVerifier = {
  verify: async () => ({ verified: false, reason: 'no-manifest-verifier-configured' })
}

/**
 * Whether a manifest may be acted upon, and whether its integrity was actually established.
 *
 * `trusted` and `verified` are deliberately separate. Under `accept-unsigned` a manifest is
 * trusted while unverified, and that combination is a reportable condition rather than a silent
 * normal — collapsing the two into one boolean is what would make running without integrity
 * checking invisible.
 */
type TrustDecision =
  | { trusted: true, verified: true }
  | { trusted: true, verified: false, reason: string }
  | { trusted: false, reason: string }

function decideTrust (outcome: VerificationOutcome, policy: ManifestTrustPolicy): TrustDecision {
  if (outcome.verified) return { trusted: true, verified: true }
  if (policy === 'accept-unsigned') return { trusted: true, verified: false, reason: outcome.reason }
  return { trusted: false, reason: outcome.reason }
}

function isManifestTrustPolicy (value: unknown): value is ManifestTrustPolicy {
  return value === 'accept-unsigned' || value === 'require-signature'
}

export {
  DEFAULT_MANIFEST_TRUST,
  unverifiedManifestVerifier,
  decideTrust,
  isManifestTrustPolicy
}

export type {
  ManifestTrustPolicy,
  ManifestVerifier,
  VerificationOutcome,
  TrustDecision
}
