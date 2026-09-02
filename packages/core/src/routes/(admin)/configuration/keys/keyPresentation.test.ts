import { describe, it, expect } from 'vitest'
import { SOON_MS, stateBadge, rotationStanding, rotationExplanation } from './keyPresentation'

/**
 * The wording of the key states.
 *
 * Not styling assertions — what is checked is that the screen tells an administrator the
 * *consequence* of a state, since the distinction between superseded and revoked is the one thing
 * about this screen that is easy to get wrong and expensive to get wrong.
 */

describe('state badges', () => {
  it('says a superseded key still verifies', () => {
    // The whole reason routine rotation is safe, and the reason rotation is no answer to a leak.
    expect(stateBadge('superseded').title).toMatch(/still verifies/i)
  })

  it('says a revoked key rejects even signatures made before it was revoked', () => {
    // Administrators reach for revocation expecting it to apply from now on. It does not, and being
    // told afterwards is too late to matter.
    expect(stateBadge('revoked').title).toMatch(/before revocation/i)
  })

  it('distinguishes all three states by label', () => {
    const labels = (['current', 'superseded', 'revoked'] as const).map(state => stateBadge(state).label)

    expect(new Set(labels).size).toBe(3)
  })
})

describe('rotation standing', () => {
  const due = Date.parse('2026-08-20T12:00:00Z')

  it('is overdue from the moment it falls due, inclusive', () => {
    expect(rotationStanding(due, due)).toBe('overdue')
    expect(rotationStanding(due, due + 1)).toBe('overdue')
  })

  it('warns inside the last week and not before it', () => {
    expect(rotationStanding(due, due - SOON_MS)).toBe('due-soon')
    expect(rotationStanding(due, due - SOON_MS - 1)).toBe('scheduled')
  })

  it('explains overdue as ordinary rather than as a failure', () => {
    // Rotation fires when a key is next used, so a quiet instance is legitimately past its interval.
    expect(rotationExplanation('overdue')).toMatch(/next signature/i)
  })
})
