import { Node, SyntaxKind } from 'ts-morph'
import type { BindingElement, CallExpression, Node as TsNode, SourceFile } from 'ts-morph'
import type { ComponentShape, SecurityRuleDiagnostic } from '@genoacms/internal/languageAdapter'
import { BRIDGE } from '../../emit.js'
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

/**
 * How far a chain of aliases is followed.
 *
 * Longer than anything written on purpose, and finite so a cycle a parser accepted cannot spin here.
 */
const ALIAS_DEPTH = 8

/**
 * Whether this expression is the bridge, whatever it has been renamed to on the way.
 *
 * **Resolved, not compared by text.** This rule reads the assembled source, so the bridge is the
 * *parameter* of that name — an author's own `const bridge = …` shadows it and is not it. An alias
 * is followed through whatever declaration introduced it, and a name nothing declares at all is
 * treated as the parameter, so the rule still answers when it is handed a bare body.
 *
 * Matching the receiver's text was the first version of this, and `const b = bridge` walked past it.
 */
const isBridge = (node: TsNode, depth = ALIAS_DEPTH): boolean => {
  if (depth === 0 || !Node.isIdentifier(node)) return false

  const declarations = node.getSymbol()?.getDeclarations() ?? []
  if (declarations.length === 0) return node.getText() === BRIDGE

  return declarations.some(declaration => {
    if (Node.isParameterDeclaration(declaration)) return declaration.getName() === BRIDGE
    if (!Node.isVariableDeclaration(declaration)) return false
    const initializer = declaration.getInitializer()
    return initializer !== undefined && isBridge(initializer, depth - 1)
  })
}

/** The name a member access reads, whether it was written with a dot or with brackets. */
const memberName = (node: TsNode): string | undefined => {
  if (Node.isPropertyAccessExpression(node)) return node.getName()
  if (Node.isElementAccessExpression(node)) {
    const argument = node.getArgumentExpression()
    return argument !== undefined && Node.isStringLiteral(argument)
      ? argument.getLiteralText()
      : undefined
  }
  return undefined
}

/** The object a member access reads from. */
const receiverOf = (node: TsNode): TsNode | undefined =>
  Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)
    ? node.getExpression()
    : undefined

/**
 * Whether what is being called is the bridge's `fetch`, however the author got hold of it.
 *
 *     bridge.fetch(url)            the plain spelling
 *     bridge['fetch'](url)         the bracketed one
 *     const b = bridge; b.fetch    the object aliased
 *     const f = bridge.fetch; f    the method aliased
 *     const { fetch } = bridge     the method destructured
 */
const isBridgeFetch = (node: TsNode, depth = ALIAS_DEPTH): boolean => {
  if (depth === 0) return false

  const member = memberName(node)
  if (member !== undefined) {
    const receiver = receiverOf(node)
    return member === 'fetch' && receiver !== undefined && isBridge(receiver, depth - 1)
  }

  if (!Node.isIdentifier(node)) return false
  return (node.getSymbol()?.getDeclarations() ?? []).some(declaration => {
    if (Node.isVariableDeclaration(declaration)) {
      const initializer = declaration.getInitializer()
      return initializer !== undefined && isBridgeFetch(initializer, depth - 1)
    }
    if (Node.isBindingElement(declaration)) return isDestructuredFetch(declaration, depth)
    return false
  })
}

/** `const { fetch } = bridge`, and the renamed form of it. */
const isDestructuredFetch = (element: BindingElement, depth: number): boolean => {
  const read = (element.getPropertyNameNode() ?? element.getNameNode()).getText()
  const declaration = element.getParent()?.getParent()
  if (read !== 'fetch' || declaration === undefined || !Node.isVariableDeclaration(declaration)) {
    return false
  }
  const initializer = declaration.getInitializer()
  return initializer !== undefined && isBridge(initializer, depth - 1)
}

/**
 * A bridge call whose target is written down rather than assembled.
 *
 * The half of the allowlist that is decidable at commit time, and the half worth having: an author
 * asking for an origin nobody allowed learns it where they wrote it, rather than when a page fails
 * in production. A URL built at run time cannot be decided here and is carried by the bridge itself.
 */
const literalTarget = (call: CallExpression): string | undefined => {
  if (!isBridgeFetch(call.getExpression())) return undefined

  const target = call.getArguments()[0]
  if (target === undefined) return undefined
  if (Node.isStringLiteral(target) || Node.isNoSubstitutionTemplateLiteral(target)) {
    return target.getLiteralText()
  }
  return undefined
}

const permitted = (url: string, fetchOrigins: readonly string[]): boolean => {
  try {
    return fetchOrigins.includes(new URL(url).origin)
  } catch {
    return false
  }
}

/** `SAST-05` — no unrestricted network calls, and no bridge call to an origin nobody allowed. */
const noUnrestrictedNetworkCalls = (
  sourceFile: SourceFile,
  _shape: ComponentShape,
  fetchOrigins: readonly string[] = []
): SecurityRuleDiagnostic[] => [
  ...NETWORK.flatMap(name =>
    freeReferences(sourceFile, name).map(id => violation(
      'SAST-05',
      sourceFile,
      id.getStart(),
      `\`${name}\` reaches the network directly. Use the data bridge, which checks a request ` +
      'against the origins this instance allows.'
    ))
  ),
  ...sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
    .flatMap(call => {
      const target = literalTarget(call)
      if (target === undefined || permitted(target, fetchOrigins)) return []
      return [violation(
        'SAST-05',
        sourceFile,
        call.getStart(),
        `This asks the bridge for \`${target}\`, which is not an origin this instance allows. ` +
        (fetchOrigins.length === 0
          ? 'No origin is allowed here yet — an administrator adds one in the security policy.'
          : `Allowed: ${fetchOrigins.join(', ')}.`)
      )]
    })
]

export { noModuleImport, noDynamicImports, noUnrestrictedNetworkCalls }
