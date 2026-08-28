import { describe, it, expect } from 'vitest'
import { SAST_RULES, SAST_RULE_IDS, isSastRuleId, sastRule } from './sast.js'

/**
 * The ruleset table, against a spelled-out list.
 *
 * The table in `sast.js` and the `SastRuleId` union in `sast.d.ts` are **two statements of one
 * list**, which is what hand-written declarations over plain JavaScript cost. This is the check that
 * keeps them honest from both ends: a rule added to one and not the other fails here rather than
 * drifting quietly.
 *
 * The list below is deliberately **written out by hand** rather than derived from the table. Deriving
 * it would make the test a tautology — it would pass for any table, including an empty one — which is
 * the failure this block has already met twice and is the whole reason for the assertion.
 */

/** Every rule the ruleset defines, transcribed from the specification rather than from the code. */
const SPECIFIED = [
  'SAST-01', 'SAST-02', 'SAST-03',
  'SAST-04', 'SAST-05', 'SAST-06',
  'SAST-07', 'SAST-08', 'SAST-09', 'SAST-10',
  'SAST-11'
]

describe('the ruleset matches the specification', () => {
  it('contains exactly the rules the specification defines', () => {
    expect(SAST_RULE_IDS).toEqual(SPECIFIED)
  })

  it('does not define SAST-12, which was withdrawn', () => {
    // Not merely absent: asserted, because the rule was specified, is still recorded as a
    // struck-through row, and re-adding it would silently inflate every coverage report.
    expect(isSastRuleId('SAST-12')).toBe(false)
  })

  it('gives every rule an id matching the key it is stored under', () => {
    for (const [key, rule] of Object.entries(SAST_RULES)) expect(rule.id).toBe(key)
  })

  it('gives every rule a name, a group, a severity and an enforcement', () => {
    for (const rule of Object.values(SAST_RULES)) {
      expect(rule.name).toMatch(/^[A-Z][A-Za-z]+$/)
      expect(['dynamic-execution', 'module-isolation', 'algorithmic-complexity', 'component-contract'])
        .toContain(rule.group)
      expect(['CRITICAL', 'HIGH', 'MEDIUM']).toContain(rule.severity)
      expect(['fatal', 'warning']).toContain(rule.enforcement)
      expect(rule.description.length).toBeGreaterThan(20)
    }
  })

  it('names every rule distinctly', () => {
    const names = Object.values(SAST_RULES).map(rule => rule.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('severity and enforcement are different questions', () => {
  it('warns rather than rejects for SAST-10, the only rule that does', () => {
    // The case that keeps the two apart. Allocation size is a runtime value, so rejecting at commit
    // would refuse correct components for a fact nothing can know yet.
    const warning = Object.values(SAST_RULES).filter(rule => rule.enforcement === 'warning')
    expect(warning.map(rule => rule.id)).toEqual(['SAST-10'])
  })

  it('does not let severity decide enforcement', () => {
    // SAST-10 is MEDIUM and warns; SAST-11 is MEDIUM and rejects. If enforcement were ever derived
    // from severity this pair would be the first thing to break.
    expect(sastRule('SAST-10').severity).toBe(sastRule('SAST-11').severity)
    expect(sastRule('SAST-10').enforcement).not.toBe(sastRule('SAST-11').enforcement)
  })
})

describe('the rules that do not decide their own question', () => {
  it('names a runtime guard for exactly the three with undecidable residue', () => {
    // The honest half of what the ruleset claims: these rules reject what is decidable and say which
    // carries the rest. A rule losing its residue would be claiming a completeness it cannot have.
    const withResidue = Object.values(SAST_RULES)
      .filter(rule => rule.residue !== undefined)
      .map(rule => [rule.id, rule.residue])

    expect(withResidue).toEqual([
      ['SAST-08', 'fuel'],
      ['SAST-09', 'depth'],
      ['SAST-10', 'allocation']
    ])
  })

  it('leaves residue absent on rules that decide completely at commit time', () => {
    expect(sastRule('SAST-01').residue).toBeUndefined()
    expect(sastRule('SAST-04').residue).toBeUndefined()
  })
})

describe('looking a rule up', () => {
  it('recognizes an identifier the ruleset defines', () => {
    expect(isSastRuleId('SAST-01')).toBe(true)
  })

  it.each([['sast-01'], ['SAST-1'], ['SAST-99'], [''], [null], [undefined], [{}]])(
    'refuses %o', (value) => {
      expect(isSastRuleId(value)).toBe(false)
    }
  )

  it('throws for an unknown identifier rather than returning undefined', () => {
    // A caller always has a rule it believes in; an unknown one is a programming error. Returning
    // undefined would let a coverage report skip a rule it could not resolve and still look complete.
    expect(() => sastRule('SAST-99')).toThrow(/unknown SAST rule/)
  })

  it('cannot be mutated through the exported table', () => {
    expect(Object.isFrozen(SAST_RULES)).toBe(true)
  })
})
