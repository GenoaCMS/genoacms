import { join } from 'path'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  defaultBucketId,
  getObject,
  uploadObject,
  deleteInternalObject
} from '$lib/script/storage/storage.server'
import { streamToString } from '$lib/script/utils.server'
import { sign, type DocumentType } from '$lib/script/signing/envelope'
import { readSignedDocument } from '$lib/script/signing/signedDocument.server'
import { getCurrentSigningKey } from '$lib/script/signing/keyResolution.server'
import { loadSecurityPolicy } from '$lib/script/securityPolicy/policy.server'
import {
  assessToken,
  newFamily,
  parseSessionFamily,
  rotated,
  type SessionFamily
} from './session'
import type { JsonValue } from '$lib/script/signing/canonical'

/**
 * Refresh token families in storage: one signed object each.
 *
 * Per-family rather than one document, because a single file would be read-modify-written by every
 * active user on every refresh — the busier the instance, the more its refreshes retry against one
 * another. Here a refresh touches only its own object, and revoking a family is a delete.
 *
 * **Signed like everything else.** An unsigned session store would let anyone who can write the
 * bucket insert a hash and mint themselves a session, which is a more direct route in than forging
 * a manifest.
 */

const sessionsDirectory = join('.genoacms', 'security', 'sessions')
const SESSION_DOCUMENT: DocumentType = 'genoacms.session.v1'

/** 32 bytes of randomness. The token is never stored; only its digest is. */
function generateToken (): string {
  return randomBytes(32).toString('base64url')
}

function familyPath (familyId: string): string {
  return join(sessionsDirectory, `${familyId}.json`)
}

function reference (familyId: string): { bucket: string, name: string } {
  return { bucket: defaultBucketId, name: familyPath(familyId) }
}

async function writeFamily (family: SessionFamily, expected?: string): Promise<void> {
  const envelope = sign(SESSION_DOCUMENT, family as unknown as JsonValue, await getCurrentSigningKey())
  await uploadObject(
    reference(family.familyId),
    JSON.stringify(envelope),
    expected === undefined ? { ifAbsent: true } : { ifVersion: expected }
  )
}

interface LoadedFamily {
  family: SessionFamily
  version?: string
}

/**
 * Reads a family, or `undefined` when it is absent or unusable.
 *
 * A record that fails verification is treated as absent rather than repaired: a session is cheap to
 * re-establish by signing in, so there is nothing to salvage and nothing worth trusting.
 */
async function loadFamily (familyId: string): Promise<LoadedFamily | undefined> {
  let raw: string
  let version: string | undefined
  try {
    const object = await getObject(reference(familyId))
    version = object.version
    raw = await streamToString(object.data)
  } catch {
    return undefined
  }

  let candidate: unknown
  try {
    candidate = JSON.parse(raw)
  } catch {
    return undefined
  }

  const read = await readSignedDocument(candidate, SESSION_DOCUMENT)
  if (!read.ok) return undefined

  const family = parseSessionFamily(read.payload)
  return family === undefined ? undefined : { family, version }
}

interface IssuedSession {
  familyId: string
  token: string
  /** When the family stops being refreshable, so the cookie can be given a matching lifetime. */
  expiresAt: number
}

/** Starts a family. Called once per sign-in. */
async function startSession (subject: string, email: string): Promise<IssuedSession> {
  const { refreshTokenDays } = await loadSecurityPolicy()
  const familyId = randomUUID()
  const token = generateToken()
  const family = newFamily(familyId, subject, email, token, Date.now(), refreshTokenDays)
  await writeFamily(family)
  return { familyId, token, expiresAt: family.expiresAt }
}

type RefreshResult =
  | { outcome: 'refreshed', subject: string, email: string, token: string, expiresAt: number }
  /** The client's own concurrent request; it should adopt the token that superseded its own. */
  | { outcome: 'concurrent', subject: string, email: string, expiresAt: number }
  /** Expired, unknown, or reuse — in every case the client must sign in again. */
  | { outcome: 'rejected', reason: string }

/**
 * Exchanges a refresh token for its successor.
 *
 * **Reuse revokes the family**, which is the point of the mechanism: a token presented after it has
 * been superseded means a copy was kept, and the honest and the dishonest holder cannot be told
 * apart — so neither keeps the session.
 */
async function refreshSession (familyId: string, token: string): Promise<RefreshResult> {
  const loaded = await loadFamily(familyId)
  if (loaded === undefined) return { outcome: 'rejected', reason: 'unknown-session' }

  const verdict = assessToken(loaded.family, token, Date.now())

  if (verdict.outcome === 'concurrent') {
    return {
      outcome: 'concurrent',
      subject: loaded.family.subject,
      email: loaded.family.email,
      expiresAt: loaded.family.expiresAt
    }
  }

  if (verdict.outcome === 'reused') {
    await revokeSession(familyId)
    return { outcome: 'rejected', reason: 'token-reused' }
  }

  if (verdict.outcome !== 'current') {
    // Expired or unknown. Remove the record rather than leaving it to be swept.
    await revokeSession(familyId)
    return { outcome: 'rejected', reason: verdict.outcome }
  }

  const next = generateToken()
  try {
    await writeFamily(rotated(loaded.family, next, Date.now()), loaded.version)
  } catch {
    // Another request rotated first. Its token is now current, and this client will present the
    // superseded one on its next attempt — which the grace window accepts.
    return {
      outcome: 'concurrent',
      subject: loaded.family.subject,
      email: loaded.family.email,
      expiresAt: loaded.family.expiresAt
    }
  }
  return {
    outcome: 'refreshed',
    subject: loaded.family.subject,
    email: loaded.family.email,
    token: next,
    expiresAt: loaded.family.expiresAt
  }
}

/** Ends a family: on sign-out, or on reuse. Absent is success — the outcome is the same. */
async function revokeSession (familyId: string): Promise<void> {
  try {
    await deleteInternalObject(familyPath(familyId))
  } catch {
    // Already gone, or unreachable. Neither is worth failing a sign-out over.
  }
}

export {
  sessionsDirectory,
  SESSION_DOCUMENT,
  startSession,
  refreshSession,
  revokeSession,
  loadFamily
}

export type {
  RefreshResult,
  IssuedSession
}
