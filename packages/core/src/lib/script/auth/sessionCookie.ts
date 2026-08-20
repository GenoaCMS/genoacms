/**
 * The session as a single cookie value.
 *
 * Three values with three lifetimes — a short-lived access token, the refresh token that renews it,
 * and the family the refresh token belongs to — but they cannot travel as three cookies. Firebase
 * Hosting and Google Cloud CDN forward only a cookie named `__session` and strip the rest, so a
 * split session arrives at the backend with two of its parts missing. Renewal then fails with
 * nothing to explain it: the user is signed out at every access-token expiry.
 *
 * **Not signed as a whole, deliberately.** A tampered access token fails `jwtVerify`, and a tampered
 * refresh token or family identifier fails to match a stored record. A signature over the envelope
 * would cost a verification on every request to detect nothing that is not already detected.
 *
 * Size is not a constraint: an HS256 JWT of a few hundred bytes, a 43-character token and a
 * 36-character identifier sit far inside the 4096-byte cookie limit.
 */

interface SessionCookie {
  /** The access token. Identity only; grants are resolved per request. */
  accessToken: string
  /** The current refresh token. Absent once a session is not renewable. */
  refreshToken?: string
  familyId?: string
}

/** Short keys because this is written to a length-limited cookie, not read by people. */
interface PackedSession {
  a: string
  r?: string
  f?: string
}

function base64urlEncode (text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url')
}

function base64urlDecode (encoded: string): string {
  return Buffer.from(encoded, 'base64url').toString('utf8')
}

function packSessionCookie (session: SessionCookie): string {
  const packed: PackedSession = { a: session.accessToken }
  if (session.refreshToken !== undefined) packed.r = session.refreshToken
  if (session.familyId !== undefined) packed.f = session.familyId
  return base64urlEncode(JSON.stringify(packed))
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

/**
 * Reads a cookie value, or `undefined` when it is not one of ours.
 *
 * Truncation, a stale three-cookie session from before this format, and outright garbage all land
 * here, and all mean the same thing: the request is anonymous. Never throws — a malformed cookie is
 * a routine condition, and a request that cannot be authenticated must still be served.
 */
function unpackSessionCookie (value: string | undefined): SessionCookie | undefined {
  if (value === undefined || value.length === 0) return undefined

  let parsed: unknown
  try {
    parsed = JSON.parse(base64urlDecode(value))
  } catch {
    return undefined
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  const { a, r, f } = parsed as Record<string, unknown>
  if (!isNonEmptyString(a)) return undefined

  const session: SessionCookie = { accessToken: a }
  // The refresh half is optional and only useful whole: an identifier without its token names a
  // family we cannot prove anything about, and a token without one names no family at all.
  if (isNonEmptyString(r) && isNonEmptyString(f)) {
    session.refreshToken = r
    session.familyId = f
  }
  return session
}

export {
  packSessionCookie,
  unpackSessionCookie
}

export type {
  SessionCookie
}
