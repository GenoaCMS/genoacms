import { join } from 'path'
import { host } from '#lib/script/host.server.js'
import { isNotFound, isPreconditionFailed } from '@genoacms/contracts/storage'
import {
  getInternalObjectStringVersioned,
  uploadInternalObjectJSON
} from '#lib/script/storage/storage.server.js'
import { sign, type DocumentType } from '#lib/script/signing/envelope.js'
import { readRootSignedDocument } from '#lib/script/signing/signedDocument.server.js'
import { getRootSigningKey } from '#lib/script/signing/rootKey.server.js'
import { POLICY_SEQUENCE_SECRET } from '#lib/script/signing/secretNames.js'
import {
  MarkFormatError,
  readMark,
  checkAndAdvanceMark,
  recordMark
} from '#lib/script/signing/sequenceMark.server.js'
import {
  parseSecurityPolicy,
  parseStoredPolicy,
  STRICTEST_ACCESS,
  MIN_ROTATION_DAYS,
  MAX_ROTATION_DAYS,
  MIN_ACCESS_TOKEN_MINUTES,
  MAX_ACCESS_TOKEN_MINUTES,
  type SecurityPolicy,
  type StoredSecurityPolicy
} from './policy'
import type { JsonValue } from '#lib/script/signing/canonical.js'

/**
 * The signed security policy document (POL-1 to POL-3), signed by the root because it governs the
 * subordinate keys.
 */

const policyPath = join('.genoacms', 'security', 'policy.json')
const POLICY_DOCUMENT: DocumentType = 'genoacms.securityPolicy.v2'
const EARLIER_DOCUMENT = 'genoacms.securityPolicy.v1'

/** The stored document as read: trusted, or damaged and why (POL-3). */
type StoredPolicy =
  | { state: 'trusted', policy: StoredSecurityPolicy, version?: string }
  | { state: 'damaged', reason: string, version?: string }

type AccessPolicy = Pick<SecurityPolicy, 'accessTokenMinutes' | 'refreshTokenDays' | 'grantCacheSeconds'>

type GoverningPolicy =
  | { ok: true, policy: SecurityPolicy }
  | { ok: false, reason: string }

interface StoredText {
  text: string
  version?: string
}

const reportedDamage = new Set<string>()

const unreadableMark = (value: string): string =>
  `policy-sequence/unreadable: ${POLICY_SEQUENCE_SECRET} is '${value}'`

/**
 * The policy of the `security` stanza of `genoa.config`. A value out of bounds is refused, never
 * clamped.
 */
function defaultPolicy (): SecurityPolicy {
  const parsed = parseSecurityPolicy({
    subordinateKeyRotationDays: host.security.subordinateKeyRotationDays ?? 90,
    accessTokenMinutes: host.security.accessTokenMinutes ?? 15,
    grantCacheSeconds: host.security.grantCacheSeconds ?? 30,
    refreshTokenDays: host.security.refreshTokenDays ?? 14,
    maxFuel: host.security.maxFuel ?? 1_000_000,
    maxDepth: host.security.maxDepth ?? 100,
    maxAllocation: host.security.maxAllocation ?? 10_000_000,
    fetchOrigins: host.security.fetchOrigins ?? []
  })
  if (!parsed.ok) {
    throw new Error(
      `security-policy/invalid-default: ${parsed.reason}. Check the security stanza in genoa.config ` +
      `(rotation ${MIN_ROTATION_DAYS}-${MAX_ROTATION_DAYS} days, token ${MIN_ACCESS_TOKEN_MINUTES}-${MAX_ACCESS_TOKEN_MINUTES} minutes)`
    )
  }
  return parsed.policy
}

/** POL-1, POL-4: the policy envelope, signed by the given root key. */
async function signedPolicy (policy: StoredSecurityPolicy, signingKey?: Parameters<typeof sign>[2]): Promise<unknown> {
  return sign(POLICY_DOCUMENT, policy as unknown as JsonValue, signingKey ?? await getRootSigningKey())
}

function damaged (reason: string, version?: string): StoredPolicy {
  if (!reportedDamage.has(reason)) {
    reportedDamage.add(reason)
    console.warn(
      `[genoacms:security] ${policyPath} is damaged (${reason}). Sign-in runs on the strictest token ` +
      'lifetimes and publishing is refused until an administrator rewrites the policy on /configuration/security.'
    )
  }
  return version === undefined ? { state: 'damaged', reason } : { state: 'damaged', reason, version }
}

function trusted (policy: StoredSecurityPolicy, version?: string): StoredPolicy {
  return version === undefined ? { state: 'trusted', policy } : { state: 'trusted', policy, version }
}

/** POL-1: the stored text, or `undefined` when nothing is stored; any other failure propagates. */
async function readStoredText (): Promise<StoredText | undefined> {
  try {
    return await getInternalObjectStringVersioned(policyPath)
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
}

async function markOrDamage<T> (read: () => Promise<T>, version?: string): Promise<T | StoredPolicy> {
  try {
    return await read()
  } catch (error) {
    if (error instanceof MarkFormatError) return damaged(error.message, version)
    throw error
  }
}

function isStoredPolicy (value: unknown): value is StoredPolicy {
  return typeof value === 'object' && value !== null && 'state' in value
}

/** POL-1: creates the configured policy at sequence 1, only if still nothing is stored. */
async function createConfiguredPolicy (): Promise<StoredPolicy | undefined> {
  const policy: StoredSecurityPolicy = { ...defaultPolicy(), sequence: 1 }
  try {
    await uploadInternalObjectJSON(policyPath, await signedPolicy(policy), { ifAbsent: true })
  } catch (error) {
    if (isPreconditionFailed(error)) return undefined
    throw error
  }
  await recordMark(POLICY_SEQUENCE_SECRET, 1, unreadableMark)
  return trusted(policy)
}

/** POL-1: nothing is stored; damaged once a mark exists, otherwise created. */
async function readAbsent (): Promise<StoredPolicy | undefined> {
  const mark = await markOrDamage(async () => await readMark(POLICY_SEQUENCE_SECRET, unreadableMark))
  if (isStoredPolicy(mark)) return mark
  if (mark > 0) return damaged(`policy-absent: nothing is stored, but the mark is ${mark}`)
  return await createConfiguredPolicy()
}

function parseJSON (text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function isEarlierDocument (candidate: unknown): boolean {
  return typeof candidate === 'object' && candidate !== null && (candidate as { type?: unknown }).type === EARLIER_DOCUMENT
}

/** POL-2: trusted when at or above the mark, raising it; damaged below it. */
async function checkedAgainstMark (policy: StoredSecurityPolicy, version?: string): Promise<StoredPolicy> {
  const verdict = await markOrDamage(
    async () => await checkAndAdvanceMark(POLICY_SEQUENCE_SECRET, policy.sequence, unreadableMark),
    version
  )
  if (isStoredPolicy(verdict)) return verdict
  if (!verdict.ok) return damaged(`policy-rollback: sequence ${verdict.seen} is below the highest seen (${verdict.mark})`, version)
  return trusted(policy, version)
}

/** POL-3: what a stored document is, in the order of its checks. */
async function judge ({ text, version }: StoredText): Promise<StoredPolicy> {
  const candidate = parseJSON(text)
  if (candidate === undefined) return damaged('not JSON', version)
  if (isEarlierDocument(candidate)) {
    return damaged(`policy-needs-migration: the stored policy is ${EARLIER_DOCUMENT}, which this version of core does not read`, version)
  }
  const read = await readRootSignedDocument(candidate, POLICY_DOCUMENT)
  if (!read.ok) return damaged(`signature: ${read.reason}`, version)
  const parsed = parseStoredPolicy(read.payload)
  if (!parsed.ok) return damaged(parsed.reason, version)
  return await checkedAgainstMark(parsed.policy, version)
}

async function readOnce (): Promise<StoredPolicy | undefined> {
  const stored = await readStoredText()
  return stored === undefined ? await readAbsent() : await judge(stored)
}

/** POL-1 to POL-3: the stored policy, trusted or damaged. A failure to read propagates. */
async function readStoredPolicy (): Promise<StoredPolicy> {
  const first = await readOnce()
  if (first !== undefined) return first
  const second = await readOnce()
  if (second === undefined) throw new Error('security-policy/unsettled: the policy was created and removed while it was read')
  return second
}

/** POL-3: the values sign-in reads, the strictest while the policy is damaged. */
async function accessPolicy (): Promise<AccessPolicy> {
  const stored = await readStoredPolicy()
  if (stored.state === 'damaged') return { ...STRICTEST_ACCESS }
  const { accessTokenMinutes, refreshTokenDays, grantCacheSeconds } = stored.policy
  return { accessTokenMinutes, refreshTokenDays, grantCacheSeconds }
}

/** POL-3: the policy everything but sign-in reads, or why there is none to read. */
async function governingPolicy (): Promise<GoverningPolicy> {
  const stored = await readStoredPolicy()
  if (stored.state === 'damaged') return { ok: false, reason: stored.reason }
  const { sequence: _sequence, ...policy } = stored.policy
  return { ok: true, policy }
}

/** POL-2: writes the policy one above the stored sequence and the mark, then records the mark. */
async function writePolicy (policy: SecurityPolicy, stored: StoredPolicy): Promise<StoredSecurityPolicy> {
  const mark = await readMark(POLICY_SEQUENCE_SECRET, unreadableMark)
  const previous = stored.state === 'trusted' ? stored.policy.sequence : 0
  const written: StoredSecurityPolicy = { ...policy, sequence: Math.max(previous, mark) + 1 }
  await uploadInternalObjectJSON(
    policyPath,
    await signedPolicy(written),
    stored.version === undefined ? { ifAbsent: true } : { ifVersion: stored.version }
  )
  await recordMark(POLICY_SEQUENCE_SECRET, written.sequence, unreadableMark)
  return written
}

export {
  policyPath,
  POLICY_DOCUMENT,
  defaultPolicy,
  signedPolicy,
  unreadableMark,
  readStoredPolicy,
  accessPolicy,
  governingPolicy,
  writePolicy
}

export type { StoredPolicy, AccessPolicy, GoverningPolicy }
