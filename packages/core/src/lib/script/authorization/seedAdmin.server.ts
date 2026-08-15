import { config } from '@genoacms/cloudabstraction'

const { adminSubject } = config.security

if (!adminSubject) throw new Error('missing-admin-subject')

/**
 * The Tier-1 seed authority.
 *
 * Authorization manifests live in the primary bucket and are themselves protected by keys
 * whose administration the manifests govern — a circular dependency. It is broken by making
 * `genoa.config` the root of authority: the seed administrator is resolved here, without
 * reading any manifest, so there is always one identity that can act on an instance whose
 * manifests are absent, malformed, or unverified.
 */
function isSeedAdmin (subject: string): boolean {
  return subject === adminSubject
}

export {
  isSeedAdmin
}
