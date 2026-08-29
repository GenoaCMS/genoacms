import { Node, SyntaxKind } from 'ts-morph'
import type {
  CallExpression,
  FunctionDeclaration,
  Identifier,
  NewExpression,
  SourceFile
} from 'ts-morph'
import type { ComponentShape, SecurityRuleDiagnostic } from '@genoacms/internal/languageAdapter'
import { PASSTHROUGH_PARAMETER } from '@genoacms/internal/languageAdapter'
import type { Attribute } from '@genoacms/internal/attributes'
import { violation, locate, parameterReferences } from '../nodes.js'
import { identifierFor } from '../../emit.js'

/**
 * `SAST-07` — a value that decides how much work happens must say how much it can be.
 *
 *                                    ┌─ loop condition      for (…; i < n; …)
 *     numeric value ──▶ reaches ─────┼─ allocation size     new Array(n)
 *                                    └─ recursion bound     walk(n - 1)  inside walk
 *
 *                       declared maximum?  ──yes──▶ silent
 *                              │
 *                              └──no──▶  from an attribute  ──▶ fatal
 *                                        from passthrough   ──▶ warning, carried by the runtime guard
 *
 * ## Rejecting rather than inferring
 *
 * An earlier design had the analyzer work out a bound and write it into the attribute's schema. That
 * is gone twice over: inferring one is undecidable under aliasing and arithmetic, and writing it back
 * would silently change the component's **public contract** to a value the author never chose.
 *
 * ## What it does not decide
 *
 * Recursion is detected only where a function calls **itself**. Mutual recursion through two or more
 * functions needs a call graph, and is left to the runtime depth guard. Saying so matters more than
 * it might seem: a rule quietly covering less than its name claims would report coverage it has not
 * earned, which is worse than one that underperforms openly.
 */

/** Anything the author can build a large allocation with, by size. */
const SIZED_CONSTRUCTORS = [
  'Array', 'Uint8Array', 'Uint16Array', 'Uint32Array', 'Int8Array', 'Int16Array', 'Int32Array',
  'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array', 'ArrayBuffer'
]

/** The numeric attributes, by the parameter name each becomes, with whether a maximum was declared. */
const numericParameters = (shape: ComponentShape): Map<string, { name: string, bounded: boolean }> => {
  const found = new Map<string, { name: string, bounded: boolean }>()

  for (const reference of shape.attributeOrder) {
    const attribute = shape.attributes[reference] as Attribute | undefined
    if (attribute === undefined || attribute.type !== 'number') continue

    const name = attribute.schema.title ?? ''
    const identifier = identifierFor(name)
    if (identifier === undefined) continue

    // Only an upper limit constrains a loop count or an allocation. A minimum is validation.
    const bounded = typeof (attribute.schema as { maximum?: unknown }).maximum === 'number'
    found.set(identifier, { name, bounded })
  }

  return found
}

/** Whether a node sits anywhere inside `container`. */
const isWithin = (node: Node, container: Node): boolean => {
  let current: Node | undefined = node
  while (current !== undefined) {
    if (current === container) return true
    current = current.getParent()
  }
  return false
}

/** The loop whose *condition or step* this reference decides, if any. */
const controlsALoop = (reference: Node): boolean =>
  reference.getAncestors().some(ancestor => {
    const deciding: Array<Node | undefined> = Node.isForStatement(ancestor)
      ? [ancestor.getCondition(), ancestor.getIncrementor()]
      : Node.isWhileStatement(ancestor) || Node.isDoStatement(ancestor)
          ? [ancestor.getExpression()]
          : []
    return deciding.some(part => part !== undefined && isWithin(reference, part))
  })

/** Whether this reference is an argument deciding how much memory to reserve. */
const sizesAnAllocation = (reference: Node): boolean =>
  reference.getAncestors().filter(
    (ancestor): ancestor is CallExpression | NewExpression =>
      Node.isCallExpression(ancestor) || Node.isNewExpression(ancestor)
  ).some(call => {
    const callee = call.getExpression()
    // `x.repeat(n)` builds a string n times as long, which is an allocation by another name.
    if (Node.isPropertyAccessExpression(callee) && callee.getName() === 'repeat') {
      return (call.getArguments() ?? []).some(argument => isWithin(reference, argument))
    }
    if (!SIZED_CONSTRUCTORS.includes(callee.getText())) return false
    return (call.getArguments() ?? []).some(argument => isWithin(reference, argument))
  })

/**
 * Whether this reference is an argument to the function it is written inside.
 *
 * The ordinary recursive shape, and the boundary of what this rule decides. Two functions calling
 * each other are not detected here.
 */
/** An argument to a call on a self-recursive function: the depth it is asked to start from. */
const seedsRecursion = (reference: Node): boolean =>
  reference.getAncestors().filter(Node.isCallExpression).some(call => {
    if (!call.getArguments().some(argument => isWithin(reference, argument))) return false
    const callee = call.getExpression()
    if (!Node.isIdentifier(callee)) return false

    return call
      .getSourceFile()
      .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
      .filter(fn => fn.getName() === callee.getText())
      .some(callsItself)
  })

const callsItself = (fn: FunctionDeclaration): boolean => {
  const name = fn.getName()
  if (name === undefined) return false
  return fn
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .some(call => call.getExpression().getText() === name)
}

/**
 * Whether the reference decides when a self-recursive function stops.
 *
 * Two shapes, and both are ordinary:
 *
 *     function walk (i) { if (i >= count) return 0; return walk(i + 1) }   ← inside the guard
 *     return String(walk(count))                                          ← the seed it starts from
 */
const boundsRecursion = (reference: Node): boolean =>
  seedsRecursion(reference) ||
  reference.getAncestors().filter(Node.isFunctionDeclaration).filter(callsItself).some(fn => {
    const inSelfCall = fn
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter(call => call.getExpression().getText() === fn.getName())
      .some(call => call.getArguments().some(argument => isWithin(reference, argument)))

    const inGuard = [
      ...fn.getDescendantsOfKind(SyntaxKind.IfStatement).map(one => one.getExpression()),
      ...fn.getDescendantsOfKind(SyntaxKind.ConditionalExpression).map(one => one.getCondition())
    ].some(condition => isWithin(reference, condition))

    return inSelfCall || inGuard
  })

const POSITIONS: Array<[(reference: Node) => boolean, string]> = [
  [controlsALoop, 'decides how many times a loop runs'],
  [sizesAnAllocation, 'decides how much memory is reserved'],
  [boundsRecursion, 'decides how deep a recursion goes']
]

/** The first bound position this reference occupies, described for the author. */
const boundPosition = (reference: Identifier): string | undefined =>
  POSITIONS.find(([occupies]) => occupies(reference))?.[1]

/** References to `passthrough`, read through any property: `passthrough.limit`, `passthrough['n']`. */
const passthroughReads = (sourceFile: SourceFile): Identifier[] =>
  parameterReferences(sourceFile, PASSTHROUGH_PARAMETER)

const requireDeclaredBounds = (
  sourceFile: SourceFile,
  shape: ComponentShape
): SecurityRuleDiagnostic[] => {
  const numeric = numericParameters(shape)
  const found: SecurityRuleDiagnostic[] = []

  for (const [identifier, attribute] of numeric) {
    if (attribute.bounded) continue
    for (const reference of parameterReferences(sourceFile, identifier)) {
      const position = boundPosition(reference)
      if (position === undefined) continue
      found.push(violation(
        'SAST-07',
        sourceFile,
        reference.getStart(),
        `\`${identifier}\` ${position}, and the attribute "${attribute.name}" declares no maximum. ` +
        'Give it one in the registrar — a bound is never inferred, because inferring it would change ' +
        'what the component accepts to a value nobody chose.'
      ))
    }
  }

  // A capability has no schema to declare a maximum on, so this cannot be a refusal. Reported so the
  // author knows the bound is a runtime one, carried by the injected guards rather than by this rule.
  for (const reference of passthroughReads(sourceFile)) {
    const position = boundPosition(reference)
    if (position === undefined) continue
    found.push({
      type: 'security-rule',
      rule: 'SAST-07',
      severity: 'warning',
      message:
        `A value from \`${PASSTHROUGH_PARAMETER}\` ${position}. It comes from the consuming ` +
        'application and has no schema to bound it, so the limit is enforced while the component ' +
        'runs rather than before it is published.',
      ...locate(sourceFile, reference.getStart())
    })
  }

  return found
}

export { requireDeclaredBounds, numericParameters }
