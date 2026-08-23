import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
  assessToken,
  hashToken,
  newFamily,
  rotated,
  parseSessionFamily,
  DEFAULT_GRACE_SECONDS,
  type SessionFamily
} from './session'

const NOW = 1_700_000_000_000
const family = (): SessionFamily => newFamily('fam-1', 'subject-1', 'admin@example.com', 'token-a', NOW, 14)

describe('hashToken', () => {
  it('stores a digest, not the token', () => {
    expect(hashToken('token-a')).not.toContain('token-a')
  })

  it('agrees with an independent SHA-256', () => {
    const expected = createHash('sha256').update('token-a', 'utf8').digest('hex')
    expect(hashToken('token-a')).toBe(expected)
  })

  it('never records the token itself in a family', () => {
    // Reading the session store must not yield anything usable.
    expect(JSON.stringify(family())).not.toContain('token-a')
  })
})

describe('the current token', () => {
  it('is accepted', () => {
    expect(assessToken(family(), 'token-a', NOW)).toEqual({ outcome: 'current' })
  })

  it('is rejected once the family has expired', () => {
    const expired = { ...family(), expiresAt: NOW - 1 }
    expect(assessToken(expired, 'token-a', NOW)).toEqual({ outcome: 'expired' })
  })

  it('is rejected after its lifetime elapses', () => {
    const fifteenDays = NOW + 15 * 24 * 60 * 60 * 1_000
    expect(assessToken(family(), 'token-a', fifteenDays)).toEqual({ outcome: 'expired' })
  })
})

describe('rotation', () => {
  it('makes the successor current and retains its predecessor', () => {
    const next = rotated(family(), 'token-b', NOW + 1_000)
    expect(assessToken(next, 'token-b', NOW + 1_000)).toEqual({ outcome: 'current' })
    expect(next.previousHash).toBe(hashToken('token-a'))
    expect(next.generation).toBe(2)
  })

  it('does not reset the expiry, so a session cannot be extended indefinitely', () => {
    // Otherwise refreshing forever would make a "14 day" session unbounded.
    const next = rotated(family(), 'token-b', NOW + 1_000)
    expect(next.expiresAt).toBe(family().expiresAt)
  })
})

describe('concurrent requests are not theft', () => {
  // A page load issues several requests at once; if the access token has just expired they all
  // present the same refresh token. Strict single-use would revoke the family on every navigation.
  const afterRotation = () => rotated(family(), 'token-b', NOW + 1_000)

  it('accepts the immediately previous token inside the grace window', () => {
    expect(assessToken(afterRotation(), 'token-a', NOW + 2_000))
      .toEqual({ outcome: 'concurrent' })
  })

  it('accepts it at the edge of the window', () => {
    const edge = NOW + 1_000 + DEFAULT_GRACE_SECONDS * 1_000
    expect(assessToken(afterRotation(), 'token-a', edge)).toEqual({ outcome: 'concurrent' })
  })

  it('treats it as reuse once the window has passed', () => {
    const past = NOW + 1_000 + DEFAULT_GRACE_SECONDS * 1_000 + 1
    expect(assessToken(afterRotation(), 'token-a', past)).toEqual({ outcome: 'reused' })
  })

  it('honors a configured window', () => {
    expect(assessToken(afterRotation(), 'token-a', NOW + 3_000, 1)).toEqual({ outcome: 'reused' })
    expect(assessToken(afterRotation(), 'token-a', NOW + 3_000, 60)).toEqual({ outcome: 'concurrent' })
  })
})

describe('reuse detection', () => {
  it('flags a token two generations old, whatever the window', () => {
    // Retained across a rotation: no concurrency explains this.
    const twice = rotated(rotated(family(), 'token-b', NOW + 1_000), 'token-c', NOW + 2_000)
    expect(assessToken(twice, 'token-a', NOW + 2_100)).toEqual({ outcome: 'reused' })
  })

  it('flags a token that never belonged to the family', () => {
    expect(assessToken(family(), 'token-forged', NOW)).toEqual({ outcome: 'reused' })
  })

  it('checks expiry before reuse, so an old token in a dead family reads as expired', () => {
    const expired = { ...rotated(family(), 'token-b', NOW + 1_000), expiresAt: NOW - 1 }
    expect(assessToken(expired, 'token-a', NOW)).toEqual({ outcome: 'expired' })
  })
})

describe('parseSessionFamily', () => {
  it('round-trips a family through JSON', () => {
    const stored = JSON.parse(JSON.stringify(rotated(family(), 'token-b', NOW + 1_000)))
    expect(parseSessionFamily(stored)).toEqual(rotated(family(), 'token-b', NOW + 1_000))
  })

  it('omits the optional fields on a fresh family rather than setting them null', () => {
    const parsed = parseSessionFamily(JSON.parse(JSON.stringify(family())))
    expect(parsed).not.toHaveProperty('previousHash')
    expect(parsed).not.toHaveProperty('rotatedAt')
  })

  it.each([
    ['not an object', 'a string'],
    ['null', null],
    ['empty', {}],
    ['generation zero', { ...family(), generation: 0 }],
    ['unexpected field', { ...family(), admin: true }],
    ['missing subject', { ...family(), subject: undefined }]
  ])('rejects %s', (_label, payload) => {
    expect(parseSessionFamily(payload)).toBeUndefined()
  })
})
