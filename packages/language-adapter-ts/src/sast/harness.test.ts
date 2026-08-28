import { describe, it, expect } from 'vitest'
import { harnessFor, violationsIn, diagnosticsIn, attribute } from './harness.js'
import type { Analyze } from './harness.js'
import type { AnalysisResult, Diagnostic } from '@genoacms/internal/languageAdapter'

/**
 * The harness, tested by making it fail.
 *
 * A rule suite is only worth running if its assertions can fail, and the same is true one level up:
 * a harness nobody has watched reject something is a harness nobody has checked. Every test here
 * feeds it a stub analyzer whose answers are wrong on purpose and requires it to notice.
 *
 * This cannot be done with the real adapter, whose answers are correct — which is why `harnessFor`
 * takes the analyze function rather than reaching for the adapter itself.
 */

/** An analyzer that always reports the given diagnostics, whatever it is asked about. */
const always = (...diagnostics: Diagnostic[]): Analyze =>
  (): AnalysisResult => ({ diagnostics })

const security = (rule: 'SAST-01' | 'SAST-10', severity: 'fatal' | 'warning' = 'fatal'): Diagnostic =>
  ({ type: 'security-rule', rule, severity, message: `${rule} fired` })

const language = (rule: string): Diagnostic =>
  ({ type: 'language-rule', rule, severity: 'fatal', message: `${rule} happened` })

/**
 * Runs a generated rule suite and reports what it did, without letting its failures fail this file.
 *
 * `describeRule` calls `describe`/`it`, so its assertions cannot be caught by an ordinary
 * `expect().toThrow()`. What *can* be checked directly is the analyzer's answer, which is what every
 * generated assertion reduces to — so these tests exercise `violationsIn` and the collection-time
 * guards, which is where the harness's own logic lives.
 */

describe('what a fragment is reported to violate', () => {
  it('reports a security rule the analyzer raised', async () => {
    const { violationsIn } = harnessFor(always(security('SAST-01')))

    expect(await violationsIn('eval("1")')).toEqual(['SAST-01'])
  })

  it('reports nothing for a fragment the analyzer accepted', async () => {
    const { violationsIn } = harnessFor(always())

    expect(await violationsIn('return heading')).toEqual([])
  })

  it('does not count a language-rule diagnostic as a violation', async () => {
    // The miscount the diagnostic type exists to prevent: a fragment that failed to compile has not
    // thereby violated a security rule. A harness that counted it would report a ruleset catching
    // things it never looked at.
    const { violationsIn } = harnessFor(always(language('compilation-failed')))

    expect(await violationsIn('this does not parse')).toEqual([])
  })

  it('separates the two kinds rather than discarding one', async () => {
    // Language diagnostics are filtered out of violations, not lost — a rule suite still needs to be
    // able to see that a fragment failed to compile, or it would debug a silent empty result.
    const analyze = always(language('compilation-failed'), security('SAST-01'))
    const { violationsIn, diagnosticsIn } = harnessFor(analyze)

    expect(await violationsIn('x')).toEqual(['SAST-01'])
    expect(await diagnosticsIn('x')).toHaveLength(2)
  })
})

describe('the guard against a half-written rule suite', () => {
  it('refuses a rule with no rejecting cases', () => {
    const { describeRule } = harnessFor(always())

    expect(() => describeRule('SAST-01', { rejects: [], accepts: ['return heading'] }))
      .toThrow(/no rejecting cases/)
  })

  it('refuses a rule with no accepting cases', () => {
    // The half that is actually at risk of being left out, and the one that makes a passing suite
    // mean something. Asserted with its reason, because the message is what a contributor reads.
    const { describeRule } = harnessFor(always())

    expect(() => describeRule('SAST-01', { rejects: ['eval("1")'], accepts: [] }))
      .toThrow(/rejects everything/)
  })

  it('throws while collecting rather than failing inside a test', () => {
    // A failing assertion can be skipped and would then look green. A throw during collection cannot
    // be, which is why the guard is where it is.
    const { describeRule } = harnessFor(always())
    let threw = false

    try {
      describeRule('SAST-01', { rejects: [], accepts: [] })
    } catch {
      threw = true
    }

    expect(threw).toBe(true)
  })

  it('accepts a rule that supplies both halves', () => {
    // Named so the guard is not mistaken for a rule against generating suites at all.
    const { describeRule } = harnessFor(always(security('SAST-01')))

    expect(() => describeRule('SAST-01', { rejects: ['eval("1")'], accepts: ['return heading'] }))
      .not.toThrow()
  })
})

describe('the fragment a rule case describes', () => {
  it('wraps a bare string in a usable shape', async () => {
    let seen: unknown
    const analyze: Analyze = (request) => {
      seen = request
      return { diagnostics: [] }
    }

    await harnessFor(analyze).violationsIn('return heading')

    expect(seen).toMatchObject({ body: 'return heading' })
    expect((seen as { shape: { attributeOrder: string[] } }).shape.attributeOrder).toHaveLength(1)
  })

  it('passes a shape a case supplies instead of the default', async () => {
    // Rules about parameters need their own shape, so a case has to be able to replace it.
    let seen: { shape?: { attributeOrder: string[] } } = {}
    const analyze: Analyze = (request) => {
      seen = request
      return { diagnostics: [] }
    }
    const shape = { attributes: {}, attributeOrder: [] }

    await harnessFor(analyze).violationsIn({ body: 'return null', shape })

    expect(seen.shape?.attributeOrder).toEqual([])
  })
})

describe('the harness bound to the real adapter', () => {
  it('reports no security violations today, because no rule is implemented yet', async () => {
    // The honest baseline. Every rule suite added from here starts from this, and if this ever
    // reported something it would mean a rule fired that nobody wrote.
    expect(await violationsIn('return heading')).toEqual([])
  })

  it('still surfaces the language diagnostics the adapter emits', async () => {
    // Two attributes whose names become one parameter. A language rule, not a security one — which
    // is the distinction the harness has to preserve rather than flatten.
    const first = attribute('attribute-1', 'heading text', 'string')
    const second = attribute('attribute-2', 'heading-text', 'string')

    const diagnostics = await diagnosticsIn({
      body: 'return null',
      shape: {
        attributes: { [first.uid]: first, [second.uid]: second },
        attributeOrder: [first.uid, second.uid]
      }
    })

    expect(diagnostics.length).toBeGreaterThan(0)
    expect(diagnostics.every(one => one.type === 'language-rule')).toBe(true)
  })
})
