import { describe, it, expect } from 'vitest'
import { Project, SyntaxKind } from 'ts-morph'
import type { Node as TsNode } from 'ts-morph'
import { applyEdits, wrapBody, functionsIn, functionBodyOf, loopsIn, loopBodyOf } from './instrument.js'
import type { Edit } from './instrument.js'

/**
 * The placement machinery on its own terms.
 *
 * Asserted here rather than only through fuel and depth, because those two happen to call it in a
 * way that hides some of what it has to get right: fuel's epilogue is empty, and by the time depth
 * runs no body is empty. Neither of those is a rule anything enforces, and shared code that is only
 * correct for its current callers is a trap for the next one.
 */

const parse = (source: string) =>
  new Project({ useInMemoryFileSystem: true }).createSourceFile('probe.ts', source)

/** The source with `pre` and `post` wrapped around every function body in it. */
const wrapped = (source: string, pre: string, post: string): string => {
  const file = parse(source)
  const bodies = functionsIn(file).map(functionBodyOf).filter((one): one is TsNode => one !== undefined)
  return applyEdits(source, bodies.flatMap(body => wrapBody(body, pre, post)))
}

/**
 * Whether the text is syntactically well formed.
 *
 * Syntactic diagnostics only. These snippets name identifiers nothing declares, which is a semantic
 * complaint and not the question — the question is whether the braces balanced.
 */
const parses = (source: string): boolean => {
  const file = parse(source)
  return file.getProject().getProgram().compilerObject.getSyntacticDiagnostics(file.compilerNode)
    .length === 0
}

describe('a body with braces', () => {
  it('puts the two pieces just inside them', () => {
    expect(wrapped('function f () { work() }', 'PRE', 'POST'))
      .toBe('function f () { PRE work() POST }')
  })

  it('puts them on the lines the braces are already on', () => {
    const source = 'function f () {\n  work()\n}'

    expect(wrapped(source, 'PRE', 'POST').split('\n').length).toBe(source.split('\n').length)
  })
})

describe('a body with nothing in it', () => {
  /*
   * The one place a body's opening and closing offsets are the same character. Two edits there would
   * have to be ordered against each other, and the wrong order emits `{} POST PRE`.
   */
  it('keeps the two pieces in the order they were given', () => {
    expect(wrapped('function f () {}', 'PRE', 'POST')).toBe('function f () { PRE POST }')
  })

  it('still parses when the pieces are a try and its finally', () => {
    const result = wrapped('function f () {}', 'enter(); try {', '} finally { exit(); }')

    expect(parses(result)).toBe(true)
  })
})

describe('a body that is one expression', () => {
  it('grows braces and a return', () => {
    expect(wrapped('const f = () => 1', 'PRE', 'POST')).toBe('const f = () => { PRE return 1 POST }')
  })

  it('grows braces without a return when it is a statement', () => {
    const file = parse('while (x) step()')
    const body = loopBodyOf(loopsIn(file)[0])

    expect(applyEdits('while (x) step()', wrapBody(body, 'PRE', 'POST')))
      .toBe('while (x) { PRE step() POST }')
  })
})

describe('two edits on one offset', () => {
  it('leaves the enclosing one outside the enclosed one', () => {
    // Invisible through fuel and depth, because every edit in one pass carries the same text. The
    // contract is not that, and a later caller wrapping two things differently would depend on it.
    const edits: Edit[] = [
      { at: 3, text: ' INNER', ownerStart: 2 },
      { at: 3, text: ' OUTER', ownerStart: 1 }
    ]

    expect(applyEdits('abc', edits)).toBe('abc INNER OUTER')
  })

  it('does not care which order they were collected in', () => {
    const inner: Edit = { at: 3, text: ' INNER', ownerStart: 2 }
    const outer: Edit = { at: 3, text: ' OUTER', ownerStart: 1 }

    expect(applyEdits('abc', [outer, inner])).toBe(applyEdits('abc', [inner, outer]))
  })
})

describe('a body inside another body', () => {
  it('wraps both, without either rewriting the other', () => {
    expect(wrapped('const f = () => xs.map(x => x * 2)', 'PRE', 'POST'))
      .toBe('const f = () => { PRE return xs.map(x => { PRE return x * 2 POST }) POST }')
  })

  it('nests correctly when both end at the same character', () => {
    // `() => x => 1` closes both arrows on one offset, and the enclosing one has to end up outside.
    expect(wrapped('const f = () => (x: number) => x', 'PRE', 'POST'))
      .toBe('const f = () => { PRE return (x: number) => { PRE return x POST } POST }')
  })

  it('still parses with a try and its finally at both levels', () => {
    const result = wrapped('const f = () => (x: number) => x', 'enter(); try {', '} finally { exit(); }')

    expect(parses(result)).toBe(true)
  })
})
