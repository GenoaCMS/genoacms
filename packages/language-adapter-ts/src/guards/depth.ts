import type { FunctionDeclaration } from 'ts-morph'
import { applyEdits, wrapBody, functionsIn, functionBodyOf } from './instrument.js'
import type { Edit } from './instrument.js'

/**
 * Bounding how deep a component's calls nest.
 *
 *     function walk (node) { __genoa.enter(); try { … } finally { __genoa.exit(); } }
 *
 * ## Why this is not what fuel already does
 *
 * Fuel counts calls; depth counts calls **that have not returned yet**. A component that calls a
 * formatter a million times spends a million fuel and never nests more than one deep, and one that
 * recurses a hundred deep spends a hundred fuel. The two bound different things, and only depth is
 * what stands between runaway recursion and the engine's own stack — which is not a place to find out.
 *
 * ## The exit has to be in a `finally`
 *
 * A component that throws inside a nested call must still give the level back. Without the `finally`,
 * a caught exception would leave the counter permanently raised, and a component that recovers from
 * an error in a loop would trip the depth guard for something it already handled.
 *
 * The helper floors its counter at zero for the mirror of this: an unwind can pass `enter`s whose
 * `exit` already ran.
 *
 * ## After fuel, never beside it
 *
 * Both passes wrap the same bodies, so they cannot be computed against one parse: an arrow written as
 * an expression would be given a block twice, each wrapping the other's `return`. Fuel runs first and
 * this reads the result, by which time every body is already a block.
 */

const depthEdits = (entry: FunctionDeclaration, guards: string): Edit[] =>
  functionsIn(entry).flatMap(fn => {
    const body = functionBodyOf(fn)
    return body === undefined
      ? []
      : wrapBody(body, `${guards}.enter(); try {`, `} finally { ${guards}.exit(); }`)
  })

/**
 * The source with every declared function accounting for the level it occupies.
 *
 * The component's own entry function is left alone, as with fuel: it is the level everything else is
 * measured from, and the guards it runs against were built for this render.
 */
const boundDepth = (source: string, entry: FunctionDeclaration, guards: string): string =>
  applyEdits(source, depthEdits(entry, guards))

export { boundDepth }
