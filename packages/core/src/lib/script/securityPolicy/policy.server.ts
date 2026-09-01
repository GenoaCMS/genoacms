import { join } from 'path'
import { config } from '@genoacms/cloudabstraction'
import { isPreconditionFailed } from '@genoacms/cloudabstraction/storage'
import {
  getInternalObjectStringVersioned,
  uploadInternalObjectJSON
} from '$lib/script/storage/storage.server'
import { sign, type DocumentType } from '$lib/script/signing/envelope'
import { readRootSignedDocument } from '$lib/script/signing/signedDocument.server'
import { getRootSigningKey } from '$lib/script/signing/rootKey.server'
import {
  parseSecurityPolicy,
  MIN_ROTATION_DAYS,
  MAX_ROTATION_DAYS,
  MIN_ACCESS_TOKEN_MINUTES,
  MAX_ACCESS_TOKEN_MINUTES,
  type SecurityPolicy
} from './policy'
import type { JsonValue } from '$lib/script/signing/canonical'

/**
 * The signed security policy document.
 *
 * Follows the pattern the manifests and the key registry established — one signed document per
 * governing permission, created with its defaults at first start, so "not yet configured" is never
 * a state. Tier-1 `genoa.config` supplies the defaults; this document holds the live values.
 *
 * **Signed by the root, not by a subordinate.** This document governs the subordinate keys: it says
 * when they rotate, and will say what ceilings constrain the code they sign. A subordinate signing
 * it could rewrite the rule that retires it. That it also removes a circularity — deciding whether
 * to rotate reads the policy, and writing the policy would need a key — is a convenience, not the
 * reason.
 */

const policyPath = join('.genoacms', 'security', 'policy.json')
const POLICY_DOCUMENT: DocumentType = 'genoacms.securityPolicy.v1'

/**
 * The defaults an instance starts from, taken from Tier-1 configuration.
 *
 * A misconfigured default is rejected rather than silently clamped: an operator who wrote 5000 days
 * meant something, and quietly turning it into 365 would leave the instance behaving differently
 * from the file its administrator is reading.
 */
function defaultPolicy (): SecurityPolicy {
  const parsed = parseSecurityPolicy({
    subordinateKeyRotationDays: config.security.subordinateKeyRotationDays ?? 90,
    accessTokenMinutes: config.security.accessTokenMinutes ?? 15,
    grantCacheSeconds: config.security.grantCacheSeconds ?? 30,
    refreshTokenDays: config.security.refreshTokenDays ?? 14,
    maxFuel: config.security.maxFuel ?? 1_000_000,
    maxDepth: config.security.maxDepth ?? 100,
    maxAllocation: config.security.maxAllocation ?? 10_000_000
  })
  if (!parsed.ok) {
    throw new Error(
      `security-policy/invalid-default: ${parsed.reason}. Check the security stanza in genoa.config ` +
      `(rotation ${MIN_ROTATION_DAYS}-${MAX_ROTATION_DAYS} days, token ${MIN_ACCESS_TOKEN_MINUTES}-${MAX_ACCESS_TOKEN_MINUTES} minutes)`
    )
  }
  return parsed.policy
}

function toPayload (policy: SecurityPolicy): JsonValue {
  return policy as unknown as JsonValue
}

async function writePolicy (policy: SecurityPolicy, expected?: string): Promise<void> {
  const envelope = sign(POLICY_DOCUMENT, toPayload(policy), await getRootSigningKey())
  await uploadInternalObjectJSON(
    policyPath,
    envelope,
    expected === undefined ? { ifAbsent: true } : { ifVersion: expected }
  )
}

async function createDefaultPolicy (): Promise<SecurityPolicy> {
  const policy = defaultPolicy()
  try {
    await writePolicy(policy)
  } catch (error) {
    // Another instance created it first; its document is as good as ours would have been.
    if (!isPreconditionFailed(error)) throw error
  }
  return policy
}

/**
 * Loads the policy, creating it from Tier-1 defaults when absent.
 *
 * A document that fails verification **falls back to the defaults rather than being replaced**.
 * The manifests are replaced because an empty one grants nothing, so replacing fails closed; a
 * policy has no equivalent — silently reverting a rotation interval or a guard ceiling to its
 * default would relax a setting an administrator deliberately tightened. Falling back keeps the
 * instance running on known-safe values while leaving the document alone to be inspected.
 */
/** The stored document as read, and everything about it an administrator would need to act. */
interface StoredPolicy {
  policy: SecurityPolicy
  /**
   * The storage version a conditional write must quote.
   *
   * Absent when no document was read at all, which is the one case a write may create rather than
   * replace. Present even for a document that failed to parse — replacing something unreadable is
   * still replacing a particular thing, and a blind write would clobber whatever arrived meanwhile.
   */
  version?: string
  /** Why the stored document is not the one in use, when it is not. */
  degraded?: string
}

/**
 * Reads the document, and says what it found.
 *
 * The one read path. `loadSecurityPolicy` takes the policy from it and discards the rest, which is
 * all the CMS itself needs; an administration screen needs the version to write conditionally and
 * the reason to say why it is showing defaults. Two reads would be two chances to disagree about
 * what the stored document says.
 */
async function readStoredPolicy (): Promise<StoredPolicy> {
  let stored: { text: string, version?: string }
  try {
    stored = await getInternalObjectStringVersioned(policyPath)
  } catch {
    return { policy: await createDefaultPolicy() }
  }

  const refuse = (reason: string): StoredPolicy => {
    console.warn(
      `[genoacms:security] ${policyPath} rejected (${reason}); running on configured defaults. ` +
      'The document is left in place for inspection and is not overwritten.'
    )
    return { policy: defaultPolicy(), version: stored.version, degraded: reason }
  }

  let candidate: unknown
  try {
    candidate = JSON.parse(stored.text)
  } catch {
    return refuse('not JSON')
  }

  const read = await readRootSignedDocument(candidate, POLICY_DOCUMENT)
  if (!read.ok) return refuse(read.reason)

  const parsed = parseSecurityPolicy(read.payload)
  if (!parsed.ok) return refuse(parsed.reason)

  return { policy: parsed.policy, version: stored.version }
}

async function loadSecurityPolicy (): Promise<SecurityPolicy> {
  return (await readStoredPolicy()).policy
}

export {
  policyPath,
  readStoredPolicy,
  POLICY_DOCUMENT,
  defaultPolicy,
  loadSecurityPolicy,
  writePolicy,
  createDefaultPolicy
}

export type { StoredPolicy }
