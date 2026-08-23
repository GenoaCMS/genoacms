import { describe, it, expect } from 'vitest'
import adapter from './index.js'

/**
 * The adapter's own behavior, asserted where it lives.
 *
 * The CMS has its own tests for what it does with the result — merging, preserving uids, raising a
 * fatal diagnostic as an error. What is checked here is the part only this package can be asked
 * about: reading a source file, and saying what is wrong with one.
 *
 * Component sources declare their attribute types as generic interfaces because the analyzer reads
 * a parameter's *resolved* type text: a `type` alias resolves to its right-hand side and stops being
 * recognizable as an attribute at all.
 */

const PREAMBLE = `
interface BooleanAttribute<Default> { _brand: Default }
interface NumberAttribute<Min, Max, Step, DecimalPlaces, Default> { _brand: Min }
interface StringAttribute<Pattern, MaxLength, Default> { _brand: Pattern }
`

const analyze = (body: string, entryFunction = 'Component') =>
  adapter.analyze({ source: PREAMBLE + body, entryFunction }) as {
    attributes: Record<string, { type: string, name: string }>
    diagnostics: Array<{ severity: string, rule: string, message: string, line?: number }>
  }

describe('deriving attributes', () => {
  it('reports one attribute per parameter, keyed by parameter name', () => {
    const result = analyze('function Component (heading: StringAttribute<".*", 120, "hi">, on: BooleanAttribute<true>) {}')

    expect(Object.keys(result.attributes)).toEqual(['heading', 'on'])
    expect(result.diagnostics).toEqual([])
  })

  it('takes a component with no parameters', () => {
    const result = analyze('function Component () {}')

    expect(result.attributes).toEqual({})
    expect(result.diagnostics).toEqual([])
  })
})

describe('saying what is wrong', () => {
  it('reports a missing entry function rather than throwing', () => {
    // Throwing was the old behavior, and it belongs to the CMS: an adapter describes a source file,
    // and the caller decides what a description costs.
    const result = analyze('function Other () {}')

    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]).toMatchObject({ severity: 'fatal', rule: 'missing-entry-function' })
    expect(result.diagnostics[0].message).toContain('Component')
    expect(result.attributes).toEqual({})
  })

  it('locates an unrecognized parameter type', () => {
    // Locating it is the point. A refusal an author cannot place is a refusal without a reason, and
    // the commit it blocks becomes a guess.
    const result = analyze('function Component (x: number) {}')

    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0]).toMatchObject({ severity: 'fatal', rule: 'unknown-attribute-type' })
    expect(result.diagnostics[0].message).toContain("'x'")
    expect(result.diagnostics[0].line).toBeGreaterThan(0)
  })

  it('keeps analyzing the parameters it does understand', () => {
    // One bad parameter must not cost the diagnostics for the rest of the file, which is what an
    // author needs in order to fix it in one pass rather than one error at a time.
    const result = analyze('function Component (good: BooleanAttribute<true>, bad: number) {}')

    expect(Object.keys(result.attributes)).toEqual(['good'])
    expect(result.diagnostics).toHaveLength(1)
  })
})

describe('compiling', () => {
  // What compilation emits and what it refuses is asserted in `compile.test.ts`. What matters here
  // is that the adapter reaches it at all.
  it('compiles through the adapter', async () => {
    const result = await adapter.compileBundle({
      source: 'export function Component (heading: string) { return heading }',
      entryFunction: 'Component',
      platform: 'web-esmodule'
    })

    expect(result.diagnostics).toEqual([])
    expect(result.executableCode).toContain('function Component')
  })
})

describe('the adapter itself', () => {
  it('declares the language it reads and the platforms it targets', () => {
    expect(adapter.language).toBe('typescript')
    expect(adapter.platforms).toContain('web-esmodule')
  })
})
