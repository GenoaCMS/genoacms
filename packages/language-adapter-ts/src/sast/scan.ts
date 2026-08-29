import { Project } from 'ts-morph'
import type { SourceFile } from 'ts-morph'
import type { ComponentShape, SecurityRuleDiagnostic } from '@genoacms/internal/languageAdapter'
import {
  noDynamicEvaluation,
  noGlobalScopeAccess,
  noPrototypeManipulation
} from './rules/dynamicExecution.js'
import {
  noModuleImport,
  noDynamicImports,
  noUnrestrictedNetworkCalls
} from './rules/moduleIsolation.js'
import { requireDeclaredBounds } from './rules/declaredBounds.js'

/**
 * Running the ruleset, over the two sources a component has.
 *
 *     author body ──┬──▶ scanBody      ──▶ diagnostics in author coordinates (no offset)
 *                   │
 *                   └──▶ assemble ──▶ scanAssembled ──▶ diagnostics offset by the prologue
 *
 * Most rules read the assembled source, which is what actually compiles. Imports are the exception:
 * the body is wrapped in a function, so a top-level import cannot survive assembly — the parser
 * reports an unexpected token and the rule would see nothing.
 *
 * The split is a coordinate decision as much as a parsing one. A body diagnostic already points at
 * the line the author is looking at, so shifting it by the prologue would move it off the fault.
 */

/**
 * A rule reads the parsed source, and the shape when it needs to know what a parameter *is*.
 *
 * Only `SAST-07` uses the shape — whether a value may size a loop is a fact about the attribute
 * behind the parameter, not about the code. Passed to every rule rather than special-casing one, so
 * adding the next rule that needs it changes nothing here.
 */
type Rule = (sourceFile: SourceFile, shape: ComponentShape) => SecurityRuleDiagnostic[]

/** Read the author's body, where an import is still an import. */
const BODY_RULES: Rule[] = [noModuleImport, noDynamicImports]

/** Read the assembled source, which is what compiles and what runs. */
const ASSEMBLED_RULES: Rule[] = [
  noDynamicEvaluation,
  noGlobalScopeAccess,
  noPrototypeManipulation,
  noUnrestrictedNetworkCalls,
  requireDeclaredBounds
]

/**
 * Parses in memory, with no lib and no `node_modules`.
 *
 * That absence is load-bearing rather than incidental: it is what makes `window` resolve to nothing
 * and therefore read as a free reference, while a component's own `window` resolves to its
 * declaration and is left alone.
 */
const parse = (source: string, name: string): SourceFile =>
  new Project({ useInMemoryFileSystem: true }).createSourceFile(name, source)

const runAll = (
  rules: Rule[], sourceFile: SourceFile, shape: ComponentShape
): SecurityRuleDiagnostic[] => rules.flatMap(rule => rule(sourceFile, shape))

/** Diagnostics already in the author's coordinates. */
const scanBody = (body: string, shape: ComponentShape): SecurityRuleDiagnostic[] =>
  runAll(BODY_RULES, parse(body, 'body.ts'), shape)

/** Diagnostics in assembled coordinates, which the caller maps back. */
const scanAssembled = (source: string, shape: ComponentShape): SecurityRuleDiagnostic[] =>
  runAll(ASSEMBLED_RULES, parse(source, 'component.ts'), shape)

export { scanBody, scanAssembled }
