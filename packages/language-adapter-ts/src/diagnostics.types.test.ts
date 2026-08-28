import { describe, it, expect } from 'vitest'
import { SAST_RULES, isSastRuleId } from '@genoacms/internal/sast'
import type { Diagnostic } from '@genoacms/internal/languageAdapter'

/**
 * The diagnostic union, checked where it is actually enforced: at compile time.
 *
 * `Diagnostic` became a union discriminated on `type` so that a **compiler failure cannot be
 * mistaken for a security rule that fired**. Coverage is reported as rules rejected over rules
 * attempted, so a run where the compiler died six times would otherwise have counted six rejections
 * and reported a ruleset working better than it does.
 *
 * A runtime test cannot check that. The `@ts-expect-error` assertions below **fail `tsc` if the
 * error they claim does not occur** — so this file is a test of the type, run by the typechecker,
 * and the `it` blocks exist so a reader finds it where the other tests are.
 *
 * `@genoacms/internal` is plain JavaScript with hand-written declarations and has no compile step of
 * its own, so this lives in the first package that typechecks against the contract.
 */

describe('a security-rule diagnostic', () => {
  it('accepts an identifier the ruleset defines', () => {
    const diagnostic: Diagnostic = {
      type: 'security-rule',
      rule: 'SAST-01',
      severity: 'fatal',
      message: 'eval() is not available to a component.',
      line: 3,
      column: 11
    }

    expect(diagnostic.rule).toBe('SAST-01')
    expect(isSastRuleId(diagnostic.rule)).toBe(true)
  })

  it('rejects an identifier the ruleset does not define', () => {
    const diagnostic: Diagnostic = {
      type: 'security-rule',
      // @ts-expect-error — 'compilation-failed' is an adapter failure, not a rule of the ruleset.
      // This is the miscount the union exists to prevent, and it must not typecheck.
      rule: 'compilation-failed',
      severity: 'fatal',
      message: 'the compiler failed'
    }

    expect(diagnostic.type).toBe('security-rule')
  })

  it('rejects a withdrawn rule', () => {
    const diagnostic: Diagnostic = {
      type: 'security-rule',
      // @ts-expect-error — SAST-12 was withdrawn on 28 August 2026. Re-adding it would silently
      // inflate every coverage report, so the type refuses it rather than the reviewer having to.
      rule: 'SAST-12',
      severity: 'fatal',
      message: 'withdrawn'
    }

    expect(diagnostic.type).toBe('security-rule')
  })
})

describe('a language-rule diagnostic', () => {
  it('accepts any identifier the adapter chooses', () => {
    // Open by design: these identifiers belong to the adapter that emitted them, and a second
    // language fails in ways this one has no name for.
    const diagnostic: Diagnostic = {
      type: 'language-rule',
      rule: 'compilation-failed',
      severity: 'fatal',
      message: 'Unexpected token'
    }

    expect(isSastRuleId(diagnostic.rule)).toBe(false)
  })

  it('carries no type that would let it be counted as a rule violation', () => {
    const diagnostics: Diagnostic[] = [
      { type: 'language-rule', rule: 'compilation-failed', severity: 'fatal', message: 'boom' },
      { type: 'security-rule', rule: 'SAST-02', severity: 'fatal', message: 'globalThis' }
    ]

    // What a coverage report does, expressed once here so the intent is recorded with the type rather than only
    // in the plan: coverage counts security rules and nothing else.
    const violations = diagnostics.filter(one => one.type === 'security-rule')
    expect(violations.map(one => one.rule)).toEqual(['SAST-02'])
  })
})

describe('the ruleset a diagnostic can name', () => {
  it('is the eleven rules of the ruleset', () => {
    expect(Object.keys(SAST_RULES)).toHaveLength(11)
  })
})
