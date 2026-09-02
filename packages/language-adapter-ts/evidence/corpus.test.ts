import { describe, it, expect } from 'vitest'
import { SAST_RULES } from '@genoacms/internal/sast'
import type { SastRuleId } from '@genoacms/internal/sast'
import type { ComponentShape } from '@genoacms/internal/languageAdapter'
import adapter from '../src/index.js'
import { corpus, external, extension } from './corpus.js'
import { report, describe as describeVerdict } from './coverage.js'
import type { Outcome } from './coverage.js'

/**
 * Running the bypass corpus against the ruleset.
 *
 * Two different things are checked here, and they are worth keeping apart. **That the corpus is
 * honest**: every entry does what it says, and one that stops doing so fails rather than quietly
 * changing the coverage figure. And **that the corpus is worth measuring against**: it is not
 * allowed to consist only of what the rules already catch.
 */

/** An attribute a bounded loop can be written against, and one that cannot bound anything. */
const shape: ComponentShape = {
  attributes: {
    a: { uid: 'a', name: 'count', type: 'number', schema: { title: 'count' } } as never,
    b: { uid: 'b', name: 'heading', type: 'string', schema: { title: 'heading' } } as never
  },
  attributeOrder: ['a', 'b']
}

const ALLOWED = ['https://api.example.com']

const outcomes: Outcome[] = await Promise.all(corpus.map(async entry => {
  const result = await adapter.analyze({ body: entry.body, shape, fetchOrigins: ALLOWED })
  return {
    entry,
    rules: [...new Set(
      result.diagnostics
        .filter(one => one.type === 'security-rule')
        .map(one => (one as { rule: SastRuleId }).rule)
    )]
  }
}))

const measured = report(outcomes)

describe('the corpus says what happens', () => {
  it.each(outcomes.map(one => [one.entry.id, one] as const))('%s', (_id, outcome) => {
    /*
     * An entry claiming a rule must see **that** rule; it may see others too, because a line can
     * violate more than one and the ruleset reports both — `require("os")` is an import and a
     * computed one, and a loop bounded by an undeclared attribute is also an unbounded allocation.
     * An entry claiming to escape must see nothing at all.
     */
    if ('rejects' in outcome.entry.verdict) {
      expect(outcome.rules).toContain(outcome.entry.verdict.rejects)
    } else {
      expect(outcome.rules).toEqual([])
    }
  })

  it('reports no surprises, which is the only acceptable result', () => {
    expect(measured.surprises).toEqual([])
  })
})

describe('the corpus is worth measuring against', () => {
  it('carries entries the ruleset does not catch', () => {
    // A corpus containing only what the rules catch measures nothing. Suppressing a miss would turn
    // a bounded claim into an unfalsifiable one.
    expect(measured.escapes.flatMap(one => one.ids).length).toBeGreaterThan(0)
  })

  it('carries all three reasons a pattern escapes', () => {
    expect(measured.escapes.filter(one => one.ids.length > 0).map(one => one.kind).sort())
      .toEqual(['by-design', 'rule-gap', 'undecidable'])
  })

  it('reaches a capability through passthrough', () => {
    // Required by name: the boundary the capability channel states rather than hides.
    const byDesign = measured.escapes.find(one => one.kind === 'by-design')

    expect(byDesign?.ids).toContain('capability-the-consumer-granted')
  })

  it('gives every rule in the ruleset something to answer', () => {
    // Coverage over a ruleset with a rule nobody wrote an entry for is coverage of the entries, not
    // of the ruleset.
    const answered = new Set(measured.byRule.map(one => one.rule))
    const declared = Object.keys(SAST_RULES) as SastRuleId[]

    expect(declared.filter(rule => !answered.has(rule))).toEqual([])
  })

  it('gives every entry a citation', () => {
    expect(corpus.filter(entry => entry.cite.trim() === '')).toEqual([])
  })
})

describe('the two origins stay apart', () => {
  it('marks the reported figure as extension-only while no external entry exists', () => {
    // The externally sourced baseline is what makes the figure primary evidence. Until it exists the
    // report says so, rather than presenting a number that looks like it.
    expect(external).toEqual([])
    expect(measured.extensionOnly).toBe(true)
  })

  it('counts every entry under exactly one origin', () => {
    const counted = measured.byOrigin.reduce((total, one) => total + one.expected, 0)

    expect(counted).toBe(measured.expected)
  })

  it('has an extension entry for each of the bypasses found by probing', () => {
    // These were open, were measured open, and were closed. The corpus is where they stay closed.
    const ids = extension.map(one => one.id)

    expect(ids).toEqual(expect.arrayContaining([
      'document-to-window',
      'arguments-reaches-a-reserved-parameter',
      'bridge-aliased-first'
    ]))
  })
})

describe('what the ruleset scores', () => {
  it('rejects everything the corpus expects it to', () => {
    expect(measured.rejected).toBe(measured.expected)
  })

  it('describes a verdict in words, for the report', () => {
    expect(describeVerdict(corpus[0])).toMatch(/SAST-|escapes/)
  })
})
