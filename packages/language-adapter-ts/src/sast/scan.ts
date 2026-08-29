import { Project } from 'ts-morph'
import type { SourceFile } from 'ts-morph'
import type { SecurityRuleDiagnostic } from '@genoacms/internal/languageAdapter'
import {
  noDynamicEvaluation,
  noGlobalScopeAccess,
  noPrototypeManipulation
} from './rules/dynamicExecution.js'

/**
 * Running the security ruleset over an assembled component.
 *
 * One parse, then every rule over the same tree. The rules take a `SourceFile` and return
 * diagnostics; none of them parses, reads configuration, or knows how a component was assembled, so
 * each can be exercised on a fragment on its own.
 *
 * ## Positions are in the assembled source
 *
 * The rules see the body with its emitted signature above it, so a line number here is not the
 * author's. Mapping back is the adapter's job and happens once, where the prologue length is known —
 * the alternative, passing an offset into every rule, would put a coordinate system into code whose
 * subject is entirely different.
 */

/** Every rule in the ruleset that is implemented, in identifier order. */
const RULES: Array<(sourceFile: SourceFile) => SecurityRuleDiagnostic[]> = [
  noDynamicEvaluation,
  noGlobalScopeAccess,
  noPrototypeManipulation
]

/**
 * Parses once and applies every rule.
 *
 * The file is created in memory with no lib and no `node_modules`, which is also what makes a
 * reference to `window` resolve to nothing and therefore read as free. A component declaring its own
 * `window` resolves to that declaration and is left alone.
 */
const scanSource = (source: string): SecurityRuleDiagnostic[] => {
  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile('component.ts', source)
  return RULES.flatMap(rule => rule(sourceFile))
}

export { scanSource }
