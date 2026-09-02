import type { FunctionDeclaration } from 'ts-morph'
import {
  applyEdits,
  wrapBody,
  loopsIn,
  functionsIn,
  loopBodyOf,
  functionBodyOf
} from './instrument.js'
import type { Edit } from './instrument.js'

/**
 * Spending fuel: a tick at every loop header and every function the author declared.
 *
 *     for (const row of rows) { __genoa.tick();   ← one per iteration
 *     while (more) { __genoa.tick();
 *     function walk (node) { __genoa.tick();      ← one per call, so recursion is bounded too
 *
 * ## Every function, not only the recursive ones
 *
 * Which functions recurse needs a call graph, and a call graph is what mutual and indirect recursion
 * defeat one shape at a time. Ticking every function needs no analysis and cannot miss a shape: `a`
 * calling `b` calling `a` spends fuel whether or not anything recognized it as recursion. The cost is
 * that an ordinary helper also spends — a formatter called a thousand times costs a thousand of a
 * million, which is the trade taken deliberately.
 *
 * The component's own entry function is not ticked. It runs once per render against guards built for
 * that render, so the tick could only ever charge one.
 *
 * Where the calls go, and why none of them costs a line, is `instrument.ts`.
 */

const fuelEdits = (entry: FunctionDeclaration, tick: string): Edit[] => [
  ...loopsIn(entry).flatMap(loop => wrapBody(loopBodyOf(loop), tick, '')),
  ...functionsIn(entry).flatMap(fn => {
    const body = functionBodyOf(fn)
    return body === undefined ? [] : wrapBody(body, tick, '')
  })
]

/**
 * The source with fuel spent at every site inside the component.
 *
 * Sites are read from the entry function's descendants, so the emitted prologue and the helper — which
 * is appended afterwards — are never instrumented. Guarding the guard would be a component paying for
 * the counting.
 */
const spendFuel = (source: string, entry: FunctionDeclaration, guards: string): string =>
  applyEdits(source, fuelEdits(entry, `${guards}.tick();`))

export { spendFuel }
