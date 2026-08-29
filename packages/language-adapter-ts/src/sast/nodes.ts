import { Node, SyntaxKind } from 'ts-morph'
import type { CallExpression, Identifier, SourceFile } from 'ts-morph'
import type { SecurityRuleDiagnostic } from '@genoacms/internal/languageAdapter'
import { sastRule, type SastRuleId } from '@genoacms/internal/sast'

/**
 * What the rules share: finding a reference, and reporting one.
 *
 * ## A free identifier is the unit the rules are written against
 *
 * Banning the **name** is what makes aliasing fall out for nothing. `const e = eval; e('...')`
 * cannot be written without mentioning `eval`, so flagging the mention catches the alias at the
 * point it is created — no dataflow analysis, and no way to launder the reference through a
 * variable.
 *
 * What that leaves is *computed* access, `globalThis['ev' + 'al']`, which no static rule can resolve
 * in general. It is covered here by a different route: `globalThis` is itself banned, so the object
 * you would compute a property on cannot be named in the first place.
 *
 * ## Local declarations resolve, and that is deliberate
 *
 * A name is only a reference to a global if nothing in the component declares it. Resolving through
 * the symbol rather than collecting declared names in a set matters for a security rule: a set is
 * scope-insensitive, so `function unused (window) {}` anywhere in the file would exempt every other
 * use of `window` in it. That is an evasion, and it is the reason this asks the type checker where
 * each individual use resolves to.
 */

/** Turns a node position into the 1-based line and column an editor shows. */
const locate = (
  sourceFile: SourceFile,
  position: number
): Pick<SecurityRuleDiagnostic, 'line' | 'column'> => {
  const { line, column } = sourceFile.getLineAndColumnAtPos(position)
  return { line, column }
}

const violation = (
  id: SastRuleId,
  sourceFile: SourceFile,
  position: number,
  message: string
): SecurityRuleDiagnostic => ({
  type: 'security-rule',
  rule: id,
  severity: sastRule(id).enforcement,
  message,
  ...locate(sourceFile, position)
})

/** `foo.bar` — `bar` names a property of `foo`, not whatever `bar` means on its own. */
const isPropertyName = (id: Identifier): boolean => {
  const parent = id.getParent()
  return Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id
}

/** `{ window: 1 }` — the key is a property name. `{ window }` is *not*, it is a reference. */
const isPropertyKey = (id: Identifier): boolean => {
  const parent = id.getParent()
  return Node.isPropertyAssignment(parent) && parent.getNameNode() === id
}

/** The name being introduced by a declaration, rather than a use of one. */
const isDeclarationName = (id: Identifier): boolean => {
  const parent = id.getParent()
  if (parent === undefined) return false
  if (Node.isVariableDeclaration(parent) || Node.isParameterDeclaration(parent)) {
    return parent.getNameNode() === id
  }
  if (Node.isFunctionDeclaration(parent) || Node.isClassDeclaration(parent)) {
    return parent.getNameNode() === id
  }
  if (Node.isBindingElement(parent)) return parent.getNameNode() === id
  if (Node.isImportSpecifier(parent) || Node.isImportClause(parent)) return true
  return false
}

/** Whether anything in the component itself declares this name. */
const resolvesLocally = (id: Identifier, sourceFile: SourceFile): boolean => {
  const declarations = id.getSymbol()?.getDeclarations() ?? []
  return declarations.some(declaration => declaration.getSourceFile() === sourceFile)
}

/**
 * Every use of `name` that refers to something the component did not declare.
 *
 * Declaration sites are excluded so that a component declaring its own `process` is reported where
 * it *uses* the global, and never for the local. Uses of that local resolve to it and are not
 * reported at all.
 */
const freeReferences = (sourceFile: SourceFile, name: string): Identifier[] =>
  sourceFile
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter(id => id.getText() === name)
    .filter(id => !isPropertyName(id) && !isPropertyKey(id) && !isDeclarationName(id))
    .filter(id => !resolvesLocally(id, sourceFile))

/**
 * Calls where `name` is the thing being *called*, not merely mentioned.
 *
 * Both rules that use this were wrong without it, in the same way: matching the text of an
 * identifier reports `register('tick', setTimeout)` as deferred evaluation, and a component's own
 * `require` helper as a module load. The name has to resolve to nothing local *and* be the callee.
 */
const callsTo = (sourceFile: SourceFile, name: string): CallExpression[] =>
  freeReferences(sourceFile, name).flatMap(id => {
    const parent = id.getParent()
    return parent !== undefined && Node.isCallExpression(parent) && parent.getExpression() === id
      ? [parent]
      : []
  })

/**
 * The property name an access reads, when it can be read statically.
 *
 * Covers `a.b` and `a['b']` alike, because the two are the same access written differently and a
 * rule that caught only the first would be a rule authors route around by adding brackets.
 * A computed key that is not a literal returns `undefined`: unresolvable rather than absent.
 */
const accessedName = (node: Node): string | undefined => {
  if (Node.isPropertyAccessExpression(node)) return node.getName()
  if (Node.isElementAccessExpression(node)) {
    const argument = node.getArgumentExpression()
    if (argument !== undefined && Node.isStringLiteral(argument)) return argument.getLiteralValue()
  }
  return undefined
}

/** Every `x.name` and `x['name']` in the file, whatever `x` is. */
const accessesNamed = (sourceFile: SourceFile, name: string): Node[] => [
  ...sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression),
  ...sourceFile.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)
].filter(node => accessedName(node) === name)

/** The text of what is being accessed: `document` in `document.cookie`. */
const accessTargetText = (node: Node): string => {
  if (Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) {
    return node.getExpression().getText()
  }
  return ''
}

export {
  locate,
  violation,
  freeReferences,
  callsTo,
  accessedName,
  accessesNamed,
  accessTargetText,
  resolvesLocally
}
