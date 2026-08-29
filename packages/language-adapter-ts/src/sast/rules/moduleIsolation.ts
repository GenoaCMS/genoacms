import { Node, SyntaxKind } from 'ts-morph'
import type { CallExpression, SourceFile } from 'ts-morph'
import type { SecurityRuleDiagnostic } from '@genoacms/internal/languageAdapter'
import { violation, freeReferences, callsTo } from '../nodes.js'

/**
 * Module and network isolation: `SAST-04`, `SAST-05`, `SAST-06`.
 *
 * These rules read the author's **body**, not the assembled source:
 *
 *     body ──▶ assemble ──▶ function (body) { ... }
 *       │                        │
 *       │                        └─ a top-level import cannot exist here; the parser
 *       │                           reports an unexpected token and the rule sees nothing
 *       └─ imports are where the author wrote them, in author coordinates already
 *
 * Whether that is true is a fact about TypeScript rather than about components, which is why
 * `SAST-04` bans importing outright instead of dividing its cases by form.
 */

/**
 * `SAST-04` — a component may not import.
 *
 * The ban is total because what the CMS signs is what a visitor executes, with no isolate around it.
 * An import would make the signature attest to code the author never wrote, and would make the
 * artifact depend on whatever happened to be installed on the machine that compiled it.
 *
 * `import type` is not a fault: types are erased before anything is emitted, so a type import puts
 * nothing in the artifact and cannot change what runs.
 */
const noModuleImport = (sourceFile: SourceFile): SecurityRuleDiagnostic[] => {
  const declared = [...sourceFile.getImportDeclarations(), ...sourceFile.getExportDeclarations()]
    .filter(declaration => !declaration.isTypeOnly())
    .filter(declaration => declaration.getModuleSpecifier() !== undefined)
    .map(declaration => violation(
      'SAST-04',
      sourceFile,
      declaration.getStart(),
      `A component cannot import. \`${declaration.getModuleSpecifierValue() ?? ''}\` would become ` +
      'part of a signed artifact without having been written or reviewed by anyone.'
    ))

  return [...declared, ...runtimeLoads(sourceFile).map(call => violation(
    'SAST-04',
    sourceFile,
    call.getStart(),
    `A component cannot import. \`${specifierText(call)}\` would become part of a signed artifact ` +
    'without having been written or reviewed by anyone.'
  ))]
}

/**
 * `import(...)` and `require(...)`, whatever the specifier turns out to be.
 *
 * `import` is a keyword and cannot be shadowed. `require` is an ordinary identifier and can be, so
 * it is resolved rather than matched by text — a component declaring its own `require` helper is
 * calling that, not loading a module.
 */
const runtimeLoads = (sourceFile: SourceFile): CallExpression[] => [
  ...sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(call => call.getExpression().getKind() === SyntaxKind.ImportKeyword),
  ...callsTo(sourceFile, 'require')
]

/** Reported as written rather than resolved: a computed specifier has no value until it runs. */
const specifierText = (call: CallExpression): string =>
  call.getArguments()[0]?.getText() ?? '<computed>'

/**
 * `SAST-06` — no dynamic or computed imports.
 *
 * Overlaps `SAST-04` on every line it fires, and is kept apart because it is a different fault: this
 * is the form that reaches the network or the file system **at run time, after the artifact was
 * signed**. A line violating both reports both, since both are true of it.
 */
const noDynamicImports = (sourceFile: SourceFile): SecurityRuleDiagnostic[] =>
  runtimeLoads(sourceFile).map(call => violation(
    'SAST-06',
    sourceFile,
    call.getStart(),
    `\`${specifierText(call)}\` is resolved while the component runs, so what executes is decided ` +
    'after the artifact was signed.'
  ))

/**
 * The primitives that reach the network directly.
 *
 * Not a ban on fetching. It is a ban on fetching *unmediated*: the sanctioned route is the data
 * bridge, which validates a target against an allowlist the instance signs.
 */
const NETWORK = ['fetch', 'XMLHttpRequest', 'WebSocket']

/** `SAST-05` — no unrestricted network calls. */
const noUnrestrictedNetworkCalls = (sourceFile: SourceFile): SecurityRuleDiagnostic[] =>
  NETWORK.flatMap(name =>
    freeReferences(sourceFile, name).map(id => violation(
      'SAST-05',
      sourceFile,
      id.getStart(),
      `\`${name}\` reaches the network directly. Use the data bridge, which checks a request ` +
      'against the origins this instance allows.'
    ))
  )

export { noModuleImport, noDynamicImports, noUnrestrictedNetworkCalls }
