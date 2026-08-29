import { Project } from 'ts-morph'
import type { SourceFile } from 'ts-morph'
import type { SecurityRuleDiagnostic } from '@genoacms/internal/languageAdapter'
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

type Rule = (sourceFile: SourceFile) => SecurityRuleDiagnostic[]

/** Read the author's body, where an import is still an import. */
const BODY_RULES: Rule[] = [noModuleImport, noDynamicImports]

/** Read the assembled source, which is what compiles and what runs. */
const ASSEMBLED_RULES: Rule[] = [
  noDynamicEvaluation,
  noGlobalScopeAccess,
  noPrototypeManipulation,
  noUnrestrictedNetworkCalls
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

const runAll = (rules: Rule[], sourceFile: SourceFile): SecurityRuleDiagnostic[] =>
  rules.flatMap(rule => rule(sourceFile))

/** Diagnostics already in the author's coordinates. */
const scanBody = (body: string): SecurityRuleDiagnostic[] =>
  runAll(BODY_RULES, parse(body, 'body.ts'))

/** Diagnostics in assembled coordinates, which the caller maps back. */
const scanAssembled = (source: string): SecurityRuleDiagnostic[] =>
  runAll(ASSEMBLED_RULES, parse(source, 'component.ts'))

export { scanBody, scanAssembled }
