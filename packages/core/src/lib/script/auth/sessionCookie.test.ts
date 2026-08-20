import { describe, it, expect } from 'vitest'
import { packSessionCookie, unpackSessionCookie } from './sessionCookie'

/**
 * Packing exists because some hosts forward one cookie and strip the rest, so the cases that matter
 * are the ones where a cookie arrives damaged: every such request must come out anonymous rather
 * than throwing, because a request that cannot be authenticated still has to be served.
 */

const SESSION = {
  accessToken: 'header.payload.signature',
  refreshToken: 'kZ3rW9x2Qf8bN1pL7vT4yH6sA0dG5jM8cE2uR3iO1wY',
  familyId: '8f14e45f-ceea-467a-9b1e-7a12c0e7a1d4'
}

describe('packing', () => {
  it('round-trips a full session', () => {
    expect(unpackSessionCookie(packSessionCookie(SESSION))).toEqual(SESSION)
  })

  it('round-trips a session with no refresh half', () => {
    const packed = packSessionCookie({ accessToken: SESSION.accessToken })
    expect(unpackSessionCookie(packed)).toEqual({ accessToken: SESSION.accessToken })
  })

  it('produces a value that is safe in a cookie', () => {
    const packed = packSessionCookie(SESSION)
    // base64url: no separators a Set-Cookie header would treat as structure.
    expect(packed).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('stays far inside the 4096-byte cookie limit', () => {
    // The reason this design is possible at all: the same arithmetic ruled out an ML-DSA-signed
    // token, which was 4660 characters before any packing.
    expect(packSessionCookie(SESSION).length).toBeLessThan(1_000)
  })

  it('survives a JWT containing characters that need encoding', () => {
    const session = { ...SESSION, accessToken: 'a.b.c+/=' }
    expect(unpackSessionCookie(packSessionCookie(session))).toEqual(session)
  })
})

describe('a cookie we cannot read', () => {
  const anonymous = [
    ['absent', undefined],
    ['empty', ''],
    ['not base64url', '!!!not-a-cookie!!!'],
    ['base64url but not JSON', Buffer.from('plain text', 'utf8').toString('base64url')],
    ['JSON but not an object', Buffer.from('[1,2,3]', 'utf8').toString('base64url')],
    ['null', Buffer.from('null', 'utf8').toString('base64url')],
    ['an object with no access token', Buffer.from('{"r":"x","f":"y"}', 'utf8').toString('base64url')],
    ['an empty access token', Buffer.from('{"a":""}', 'utf8').toString('base64url')],
    ['a non-string access token', Buffer.from('{"a":42}', 'utf8').toString('base64url')]
  ] as const

  it.each(anonymous)('treats %s as no session', (_name, value) => {
    expect(unpackSessionCookie(value)).toBeUndefined()
  })

  it('treats a truncated cookie as no session rather than throwing', () => {
    const packed = packSessionCookie(SESSION)
    // Proxies and size limits truncate; this must not surface as a 500.
    for (let length = 1; length < packed.length; length += 7) {
      expect(() => unpackSessionCookie(packed.slice(0, length))).not.toThrow()
    }
  })

  it('treats a stale three-cookie session as no session', () => {
    // Before this format the cookie held a bare JWT. Those sign in once more; nothing is lost.
    expect(unpackSessionCookie('header.payload.signature')).toBeUndefined()
  })
})

describe('a half-present refresh pair', () => {
  it('is dropped when the family identifier is missing', () => {
    const packed = Buffer.from('{"a":"token","r":"refresh"}', 'utf8').toString('base64url')
    // A refresh token naming no family cannot be looked up, so carrying it would only produce a
    // renewal attempt guaranteed to fail.
    expect(unpackSessionCookie(packed)).toEqual({ accessToken: 'token' })
  })

  it('is dropped when the refresh token is missing', () => {
    const packed = Buffer.from('{"a":"token","f":"family"}', 'utf8').toString('base64url')
    expect(unpackSessionCookie(packed)).toEqual({ accessToken: 'token' })
  })
})
