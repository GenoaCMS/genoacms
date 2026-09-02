import { Node, SyntaxKind } from 'ts-morph'
import type { FunctionDeclaration, Node as TsNode, SourceFile } from 'ts-morph'
import type { ComponentShape, SecurityRuleDiagnostic } from '@genoacms/internal/languageAdapter'
import { violation, locate } from '../nodes.js'

/**
 * What a component may spend, and what it may write to: `SAST-08`, `SAST-09`, `SAST-10`, `SAST-11`.
 *
 * Three of the four **declare a residue** — the part they cannot decide, and which runtime guard
 * carries it:
 *
 *     SAST-08  loops       decides: no exit at all        residue: fuel        (never reached)
 *     SAST-09  recursion   decides: no guard at all       residue: depth       (guard never true)
 *     SAST-10  allocation  decides: nothing, it warns     residue: allocation  (size is runtime)
 *     SAST-11  writes      decides: all of it
 *
 * Whether a `break` is reached, whether a guard ever holds, and how large a computed size turns out
 * to be are undecidable. Saying which guard carries each is what keeps the ruleset from claiming
 * completeness it cannot have.
 */

/** A loop that says it never ends: `while (true)`, `for (;;)`, `do … while (true)`. */
const isInfiniteConstruct = (node: TsNode): boolean => {
  if (Node.isForStatement(node)) return node.getCondition() === undefined
  if (Node.isWhileStatement(node) || Node.isDoStatement(node)) {
    const condition = node.getExpression().getText()
    return condition === 'true' || condition === '1'
  }
  return false
}

/**
 * Whether the loop carries its own way out.
 *
 * A `break` belonging to a *nested* loop does not end this one, so nested loops are excluded before
 * looking. A `return` leaves the component entirely and always counts.
 */
const hasExit = (loop: TsNode): boolean => {
  const nested = loop
    .getDescendants()
    .filter(one => one !== loop && (Node.isForStatement(one) || Node.isWhileStatement(one) || Node.isDoStatement(one)))

  const belongsToThisLoop = (node: TsNode): boolean =>
    !nested.some(inner => inner.getDescendants().includes(node))

  return loop.getDescendantsOfKind(SyntaxKind.BreakStatement).some(belongsToThisLoop) ||
    loop.getDescendantsOfKind(SyntaxKind.ReturnStatement).length > 0
}

/** `SAST-08` — an infinite construct with nothing in it that could end the loop. */
const noUnboundedLoops = (sourceFile: SourceFile): SecurityRuleDiagnostic[] =>
  sourceFile
    .getDescendants()
    .filter(isInfiniteConstruct)
    .filter(loop => !hasExit(loop))
    .map(loop => violation(
      'SAST-08',
      sourceFile,
      loop.getStart(),
      'This loop states no condition and contains nothing that could leave it, so it does not end. ' +
      'Give it a condition, or a break that can be reached.'
    ))

const selfCalls = (fn: FunctionDeclaration) =>
  fn.getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(call => call.getExpression().getText() === fn.getName())

/** Whether anything in the function could stop it before recursing. */
const hasGuard = (fn: FunctionDeclaration): boolean =>
  fn.getDescendantsOfKind(SyntaxKind.IfStatement).length > 0 ||
  fn.getDescendantsOfKind(SyntaxKind.ConditionalExpression).length > 0 ||
  fn.getDescendantsOfKind(SyntaxKind.SwitchStatement).length > 0

/**
 * `SAST-09` — a function that calls itself with nothing that could stop it.
 *
 * A guard makes recursion *undecidable* rather than sound: whether it ever holds is what the depth
 * guard is for. What is decided here is the case with no guard at all, which cannot terminate.
 */
const noUnboundedRecursion = (sourceFile: SourceFile): SecurityRuleDiagnostic[] =>
  sourceFile
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .filter(fn => selfCalls(fn).length > 0)
    .filter(fn => !hasGuard(fn))
    .map(fn => violation(
      'SAST-09',
      sourceFile,
      fn.getStart(),
      `\`${fn.getName() ?? 'this function'}\` calls itself with nothing that could stop it. Add the ` +
      'condition under which it returns instead of recursing.'
    ))

/** Constructors whose argument is a size rather than a value. */
const SIZED = [
  'Array', 'Uint8Array', 'Uint16Array', 'Uint32Array', 'Int8Array', 'Int16Array', 'Int32Array',
  'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array', 'ArrayBuffer'
]

/** A size nothing can pin down before the component runs. */
const isStaticallyKnown = (argument: TsNode): boolean => Node.isNumericLiteral(argument)

/**
 * `SAST-10` — an allocation whose size is decided while the component runs.
 *
 * **Warns rather than refuses**, and it is the only rule that does. A size is a runtime value, so
 * refusing here would refuse correct components for something nothing can know yet; the allocation
 * guard is what actually holds the line. Reported so the author knows which line the guard will stop.
 */
const boundMemoryAllocation = (sourceFile: SourceFile): SecurityRuleDiagnostic[] => {
  const allocations = [
    ...sourceFile.getDescendantsOfKind(SyntaxKind.NewExpression),
    ...sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
  ].filter(call => SIZED.includes(call.getExpression().getText()))

  return allocations
    .filter(call => {
      const size = call.getArguments()?.[0]
      return size !== undefined && !isStaticallyKnown(size)
    })
    .map(call => ({
      type: 'security-rule' as const,
      rule: 'SAST-10' as const,
      severity: 'warning' as const,
      message:
        `\`${call.getExpression().getText()}\` is given a size decided while the component runs. ` +
        'The allocation guard stops it if it grows past what this instance allows.',
      ...locate(sourceFile, call.getStart())
    }))
}

/** Methods that change the array they are called on rather than returning a new one. */
const MUTATORS = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']

/** The identifier an access chain starts from: `passthrough` in `passthrough.a.b`. */
const rootOf = (node: TsNode): TsNode => {
  let current = node
  while (Node.isPropertyAccessExpression(current) || Node.isElementAccessExpression(current)) {
    current = current.getExpression()
  }
  return current
}

/** Whether an expression is rooted in something the component was handed. */
const isGiven = (node: TsNode): boolean => {
  const root = rootOf(node)
  if (!Node.isIdentifier(root)) return false
  return (root.getSymbol()?.getDeclarations() ?? []).some(Node.isParameterDeclaration)
}

/**
 * `SAST-11` — a component may not write to what it was given.
 *
 * The capability object is shared with the host application and with every sibling on the page; a
 * slot belongs to the renderer. Writing to either makes one component's render depend on what
 * another did, which no signature covers and no page re-render preserves.
 *
 * Rebinding the parameter itself — `cards = []` — is not this: it changes nothing the caller can see.
 */
const noGlobalSideEffects = (sourceFile: SourceFile): SecurityRuleDiagnostic[] => {
  const assignments = sourceFile
    .getDescendantsOfKind(SyntaxKind.BinaryExpression)
    .filter(expression => expression.getOperatorToken().getText().endsWith('='))
    .map(expression => expression.getLeft())
    .filter(target =>
      (Node.isPropertyAccessExpression(target) || Node.isElementAccessExpression(target)) &&
      isGiven(target))

  const mutations = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(call => {
      const callee = call.getExpression()
      return Node.isPropertyAccessExpression(callee) &&
        MUTATORS.includes(callee.getName()) &&
        isGiven(callee.getExpression())
    })

  return [...assignments, ...mutations].map(node => violation(
    'SAST-11',
    sourceFile,
    node.getStart(),
    'This writes to something the component was given rather than to its own state. That value is ' +
    'shared with the application rendering the page and with the other components on it.'
  ))
}

export { noUnboundedLoops, noUnboundedRecursion, boundMemoryAllocation, noGlobalSideEffects }
