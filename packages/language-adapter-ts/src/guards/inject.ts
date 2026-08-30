import { Project, SyntaxKind } from 'ts-morph'
import type { SourceFile } from 'ts-morph'
import { GUARD_FACTORY, guardRuntime } from './runtime.js'

/**
 * Putting the guard helper into a component's source, before it is compiled and signed.
 *
 *     export default function component (      ← prologue, unchanged
 *       heading: string,
 *     ) {
 *     <the author's body, at the lines they wrote it on>
 *     }
 *     function __genoaGuards (budgets) { … }   ← appended here
 *
 * ## Appended, so the author's lines do not move
 *
 * A function declaration hoists, so a call inserted inside the body still reaches one declared below
 * it. That is what makes appending possible, and appending is what keeps the promise the adapter
 * makes about diagnostics: a fault is reported at the line the author is looking at, and every
 * position is already fixed by the time the helper arrives. Inserting at the top would shift the
 * body by however many lines the helper happens to be, and every diagnostic with it.
 *
 * ## Merged as an AST, not concatenated
 *
 * What that buys is invisible in this step and is the reason for doing it here: the steps that
 * follow insert calls *inside* the body, where a text edit means recomputing every byte offset after
 * it by hand, and where an AST does it correctly by construction.
 *
 * ## Injecting nothing, deliberately
 *
 * No guard calls and no instantiation — there are no budgets to instantiate with until they are
 * resolved from the signed policy. This stage proves the pipeline and the coordinates before
 * anything depends on them being right.
 */

const identifiersIn = (file: SourceFile): Set<string> =>
  new Set(file.getDescendantsOfKind(SyntaxKind.Identifier).map(identifier => identifier.getText()))

/**
 * A name the source does not use, starting from the preferred one.
 *
 * The author's body shares a scope with the helper, so a body declaring `__genoaGuards` would shadow
 * it and the component would run against its own idea of what a guard is. Renaming rather than
 * refusing: there is nothing the author did wrong and nothing they could act on, and a name they
 * cannot predict is a name they cannot shadow.
 *
 * Derived from the source alone, so the same component still compiles to the same bytes.
 */
const availableName = (taken: Set<string>, preferred: string): string => {
  if (!taken.has(preferred)) return preferred
  let suffix = 1
  while (taken.has(`${preferred}_${suffix}`)) suffix += 1
  return `${preferred}_${suffix}`
}

interface Injection {
  source: string
  /** What the helper ended up called: the steps that insert calls have to spell the same name. */
  factory: string
}

/**
 * Parsed in memory with no lib and no `node_modules`, as the ruleset is.
 *
 * Nothing here resolves a type, and an artifact depending on what was installed on the compiling
 * machine would stop being a function of its source.
 */
const parse = (source: string): SourceFile =>
  new Project({ useInMemoryFileSystem: true }).createSourceFile('component.ts', source)

const injectGuards = (source: string): Injection => {
  const file = parse(source)
  const factory = availableName(identifiersIn(file), GUARD_FACTORY)

  file.addStatements(guardRuntime(factory))

  return { source: file.getFullText(), factory }
}

export { injectGuards, availableName }
export type { Injection }
