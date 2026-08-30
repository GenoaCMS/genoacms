import { Project, SyntaxKind } from 'ts-morph'
import type { FunctionDeclaration, SourceFile } from 'ts-morph'
import type { GuardBudgets } from '@genoacms/internal/guards'
import { ENTRY_FUNCTION } from '../emit.js'
import { GUARD_FACTORY, GUARD_INSTANCE, guardRuntime } from './runtime.js'

/**
 * Putting the guard helper into a component's source, before it is compiled and signed.
 *
 *     export default function component (           ← prologue, unchanged
 *       heading: string,
 *     ) {
 *       const __genoa = __genoaGuards({ fuel: … })   ← one line, counted into the prologue
 *     <the author's body, one line lower than they wrote it>
 *     }
 *     function __genoaGuards (budgets) { … }        ← appended, hoisted
 *
 * ## The helper is appended; only the instantiation costs a line
 *
 * A function declaration hoists, so a call inserted inside the body still reaches one declared below
 * it — the helper can go at the end, where it moves nothing. The instantiation cannot: the guards
 * are built per render, so the line has to be inside the function.
 *
 * That one line is paid for exactly, by returning a `prologueLines` one larger than the one that
 * came in. Every author line shifts by the same one, so the subtraction that maps a diagnostic back
 * still lands on the line the author is looking at.
 *
 * ## Merged as an AST, not concatenated
 *
 * What that buys is invisible in this step and is the reason for doing it here: the steps that
 * follow insert calls *inside* the body, where a text edit means recomputing every byte offset after
 * it by hand, and where an AST does it correctly by construction.
 *
 * ## The ceilings are literals, not a parameter
 *
 * They are written into the source before it is compiled, so they are covered by the artifact's
 * signature and cannot be raised by whoever stores the file or serves it. A budget arriving as an
 * argument instead would put the bound outside the signature, where a caller could choose it.
 *
 * No guard *calls* yet: the counters exist and nothing spends them. Inserting the calls is what the
 * steps after this do, one guard family at a time.
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
  /** What the guards for one render are bound to, which is what an injected call is spelled against. */
  guards: string
  /**
   * How many lines now sit above the author's first.
   *
   * The instantiation is a line inside the body, so it moves every line the author wrote down by
   * one. Returned rather than left to the caller to remember: this stage made the edit, so the
   * coordinate consequence of the edit is this stage's to report.
   */
  prologueLines: number
}

/**
 * Parsed in memory with no lib and no `node_modules`, as the ruleset is.
 *
 * Nothing here resolves a type, and an artifact depending on what was installed on the compiling
 * machine would stop being a function of its source.
 */
const parse = (source: string): SourceFile =>
  new Project({ useInMemoryFileSystem: true }).createSourceFile('component.ts', source)

/**
 * The guards for one render, built where the component is entered.
 *
 * **Per call, not per module.** A module-scope binding would be built once however many times the
 * component appears on a page, so twenty placements would share one budget and the twentieth would
 * fail for what the first nineteen spent.
 */
const instantiation = (guards: string, factory: string, ceilings: GuardBudgets): string =>
  `const ${guards} = ${factory}({ fuel: ${ceilings.fuel}, depth: ${ceilings.depth}, ` +
  `allocation: ${ceilings.allocation} })`

/** The emitted entry function, which `assemble` always produces. */
const entryFunctionOf = (file: SourceFile): FunctionDeclaration => {
  const entry = file.getFunction(ENTRY_FUNCTION)
  if (entry === undefined) {
    throw new Error(`guards: the assembled source declares no '${ENTRY_FUNCTION}' to guard`)
  }
  return entry
}

const injectGuards = (
  source: string,
  ceilings: GuardBudgets,
  prologueLines: number
): Injection => {
  const file = parse(source)
  const taken = identifiersIn(file)
  const factory = availableName(taken, GUARD_FACTORY)
  // The chosen factory joins the taken set even though the two preferred names cannot collide
  // today — `__genoaGuards` never suffixes its way to `__genoa`. It is insurance against renaming
  // one of them into the other's family, which nothing else would catch.
  const guards = availableName(new Set([...taken, factory]), GUARD_INSTANCE)

  entryFunctionOf(file).insertStatements(0, instantiation(guards, factory, ceilings))
  file.addStatements(guardRuntime(factory))

  return { source: file.getFullText(), factory, guards, prologueLines: prologueLines + 1 }
}

export { injectGuards, availableName }
export type { Injection }
