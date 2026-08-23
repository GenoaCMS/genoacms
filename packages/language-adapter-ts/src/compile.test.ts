import { describe, it, expect } from 'vitest'
import { compileToWebEsModule } from './compile.js'

/**
 * Compiling a component, asserted where the compiler lives.
 *
 * Nothing here starts the CMS, reaches a bucket, reads configuration or signs anything. The target
 * is passed in, as it is in production — what a consumer does with the output belongs to the SDK's
 * tests, and what the commit path does with a refusal belongs to the CMS's.
 */

const TARGET = 'es2020'

const compile = async (source: string, target = TARGET) =>
  await compileToWebEsModule(source, 'web-esmodule', target)

const rules = (result: { diagnostics: Array<{ rule: string }> }) =>
  result.diagnostics.map(diagnostic => diagnostic.rule)

describe('emitting a module', () => {
  it('strips the types and keeps the code', async () => {
    const result = await compile('export function Component (heading: string): string { return heading }')

    expect(result.diagnostics).toEqual([])
    expect(result.executableCode).toContain('function Component')
    expect(result.executableCode).not.toContain(': string')
  })

  it('emits an ES module, not CommonJS', async () => {
    const result = await compile('export const answer = 42\n')

    expect(result.executableCode).toContain('export')
    expect(result.executableCode).not.toContain('module.exports')
  })

  it('lowers to the target it is given', async () => {
    // The target decides what the output may contain. `??=` exists in ES2021, so ES2020 has to
    // rewrite it and ES2022 has no reason to.
    const source = 'export function Component (o: Record<string, number>) { o.a ??= 1; return o }'
    const old = await compile(source, 'es2020')
    const modern = await compile(source, 'es2022')

    expect(old.executableCode).not.toContain('??=')
    expect(modern.executableCode).toContain('??=')
  })

  it('produces the same bytes for the same source', async () => {
    // What is signed is the output. If compiling twice gave two results, an executable could not be
    // written once and cached against its commit, because a rebuild would not verify.
    const source = 'export function Component (n: number) { return n * 2 }'
    const [first, second] = await Promise.all([compile(source), compile(source)])

    expect(second.executableCode).toBe(first.executableCode)
  })
})

describe('refusing imports', () => {
  it('refuses a package import, and locates it', async () => {
    const result = await compile('import { format } from "date-fns"\nexport const a = 1')

    expect(rules(result)).toEqual(['import-not-allowed'])
    expect(result.executableCode).toBeUndefined()
    expect(result.diagnostics[0].message).toContain('date-fns')
    expect(result.diagnostics[0].line).toBe(1)
  })

  it('refuses a re-export from another module', async () => {
    const result = await compile('export { helper } from "./other"')

    expect(rules(result)).toEqual(['import-not-allowed'])
  })

  it('refuses a dynamic import, which would fetch after the artifact was signed', async () => {
    const result = await compile('export async function Component () { return await import("./late") }')

    expect(rules(result)).toEqual(['import-not-allowed'])
    expect(result.diagnostics[0].message).toContain('./late')
  })

  it('refuses require', async () => {
    const result = await compile('const fs = require("node:fs")\nexport const a = 1')

    expect(rules(result)).toEqual(['import-not-allowed'])
  })

  it('reports every import, not just the first', async () => {
    // An author fixing one import at a time re-commits once per import. The whole file is analyzed
    // anyway, so there is no reason to hand back one problem at a time.
    const result = await compile('import a from "one"\nimport b from "two"\nexport const c = 1')

    expect(rules(result)).toEqual(['import-not-allowed', 'import-not-allowed'])
    expect(result.diagnostics.map(diagnostic => diagnostic.line)).toEqual([1, 2])
  })

  it('allows a type-only import, which puts nothing in the artifact', async () => {
    const result = await compile('import type { Thing } from "./types"\nexport const a: Thing = 1 as Thing')

    expect(result.diagnostics).toEqual([])
    expect(result.executableCode).not.toContain('./types')
  })

  it('refuses a mixed import even though part of it is a type', async () => {
    const result = await compile('import { type A, b } from "./mixed"\nexport const c = b')

    expect(rules(result)).toEqual(['import-not-allowed'])
  })
})

describe('refusing what cannot be published', () => {
  it('refuses a source that compiles to nothing', async () => {
    const result = await compile('// a component that forgot to be one\n')

    expect(rules(result)).toContain('empty-executable')
    expect(result.executableCode).toBeUndefined()
  })

  it('refuses a platform it does not target, before compiling anything', async () => {
    const result = await compileToWebEsModule('export const a = 1', 'native-dex' as 'web-esmodule', TARGET)

    expect(rules(result)).toEqual(['unsupported-platform'])
    expect(result.diagnostics[0].message).toContain('native-dex')
  })

  it('reports a syntax error as a diagnostic rather than throwing', async () => {
    const result = await compile('export function Component ( {')

    expect(rules(result)).toContain('compilation-failed')
    expect(result.executableCode).toBeUndefined()
    expect(result.diagnostics[0].line).toBeGreaterThan(0)
  })
})
