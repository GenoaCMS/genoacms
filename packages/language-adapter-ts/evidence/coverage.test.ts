import { describe, it, expect } from 'vitest'
import { report, surprisedBy } from './coverage.js'
import type { Outcome } from './coverage.js'
import type { CorpusEntry, Verdict } from './corpus.js'

/**
 * The coverage arithmetic, on fabricated results.
 *
 * **Asserted apart from the live corpus on purpose.** Every real entry passes, so a run against the
 * ruleset exercises only the agreeing path — a report that credited every entry regardless, or that
 * never noticed a disagreement, would produce exactly the same numbers there. This is where a report
 * that lies is caught, and the results below are made up so that it can be.
 */

const entry = (id: string, verdict: Verdict, origin: CorpusEntry['origin'] = 'extension'): CorpusEntry =>
  ({ id, origin, cite: 'fabricated, for this test', body: 'return ""', verdict })

const outcome = (one: CorpusEntry, rules: Outcome['rules']): Outcome => ({ entry: one, rules })

describe('noticing a disagreement', () => {
  it('reports an entry that claims a rule and got nothing', () => {
    const missed = outcome(entry('a', { rejects: 'SAST-01' }), [])

    expect(surprisedBy(missed)).toEqual({ id: 'a', expected: 'SAST-01', got: 'nothing' })
  })

  it('reports an entry rejected by a rule other than the one it claims', () => {
    // Coverage credited to the wrong rule reads as a working rule that never ran.
    const wrong = outcome(entry('b', { rejects: 'SAST-01' }), ['SAST-02'])

    expect(surprisedBy(wrong)).toMatchObject({ id: 'b', expected: 'SAST-01', got: 'SAST-02' })
  })

  it('accepts an entry that also trips another rule', () => {
    // A line can violate more than one, and the ruleset reports both.
    const both = outcome(entry('c', { rejects: 'SAST-04' }), ['SAST-04', 'SAST-06'])

    expect(surprisedBy(both)).toBeUndefined()
  })

  it('reports an entry documented as escaping that a rule now catches', () => {
    // The documentation has gone stale, which is worth failing over: an escape nobody re-checked is
    // how a residual outlives the gap it described.
    const closed = outcome(entry('d', { escapes: 'rule-gap', carriedBy: 'nothing' }), ['SAST-05'])

    expect(surprisedBy(closed)).toMatchObject({ id: 'd', got: 'SAST-05' })
  })

  it('accepts an entry that escapes and was not caught', () => {
    const open = outcome(entry('e', { escapes: 'undecidable', carriedBy: 'the fuel guard' }), [])

    expect(surprisedBy(open)).toBeUndefined()
  })
})

describe('what counts towards coverage', () => {
  const outcomes = [
    outcome(entry('caught', { rejects: 'SAST-01' }), ['SAST-01']),
    outcome(entry('missed', { rejects: 'SAST-02' }), []),
    outcome(entry('escaping', { escapes: 'undecidable', carriedBy: 'the depth guard' }), [])
  ]

  it('counts only entries a rule was expected to reject', () => {
    // An entry the corpus says escapes is not a miss. Counting it would make the ruleset look worse
    // the more honestly the corpus documented its own boundaries.
    expect(report(outcomes).expected).toBe(2)
  })

  it('does not credit an entry that failed', () => {
    expect(report(outcomes).rejected).toBe(1)
  })

  it('lists the disagreement rather than absorbing it', () => {
    expect(report(outcomes).surprises.map(one => one.id)).toEqual(['missed'])
  })

  it('groups escapes by why they escape', () => {
    const undecidable = report(outcomes).escapes.find(one => one.kind === 'undecidable')

    expect(undecidable?.ids).toEqual(['escaping'])
  })

  it('breaks the figure down per rule', () => {
    expect(report(outcomes).byRule).toEqual([
      { rule: 'SAST-01', expected: 1, rejected: 1 },
      { rule: 'SAST-02', expected: 1, rejected: 0 }
    ])
  })
})

describe('keeping the two origins apart', () => {
  const mixed = [
    outcome(entry('ext', { rejects: 'SAST-01' }, 'extension'), ['SAST-01']),
    outcome(entry('pub', { rejects: 'SAST-02' }, 'external'), ['SAST-02'])
  ]

  it('counts each origin on its own', () => {
    expect(report(mixed).byOrigin).toEqual([
      { origin: 'external', expected: 1, rejected: 1 },
      { origin: 'extension', expected: 1, rejected: 1 }
    ])
  })

  it('stops calling the figure extension-only once a published entry exists', () => {
    // The flag is what keeps a secondary figure from being read as the primary evidence.
    expect(report(mixed).extensionOnly).toBe(false)
  })

  it('calls it extension-only while every entry was authored here', () => {
    expect(report([mixed[0]]).extensionOnly).toBe(true)
  })
})
