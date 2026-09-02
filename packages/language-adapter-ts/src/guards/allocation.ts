import { Node, SyntaxKind } from 'ts-morph'
import type { FunctionDeclaration, Node as TsNode } from 'ts-morph'
import { applyEdits, wrapExpression, isLoop } from './instrument.js'
import type { Edit } from './instrument.js'

/**
 * Charging memory before it is taken.
 *
 *     new Array(__genoa.size(n))              ← the size is charged, then handed to the constructor
 *     out += __genoa.text(row)                ← inside a loop, what the concatenation adds
 *
 * ## Wrapping the argument, not preceding the call
 *
 * A charge emitted *beside* the allocation would either evaluate the size twice — and an author's
 * size can have side effects — or report the memory after it was already taken. Wrapping the argument
 * does neither: one evaluation, and the guard runs first because an argument is evaluated before the
 * call it belongs to.
 *
 * ## What is charged
 *
 * Constructors whose argument is a length rather than a value, and concatenation **inside a loop**.
 * A concatenation outside a loop happens a fixed number of times and cannot grow without bound; one
 * inside a loop is the shape that builds a string until memory runs out.
 *
 * This is `SAST-10`'s residue. The rule warns because a size is a runtime value it cannot decide, and
 * names this guard as what decides it.
 */

/** Constructors whose first argument is a length rather than a value. */
const SIZED = new Set([
  'Array', 'Uint8Array', 'Uint16Array', 'Uint32Array', 'Int8Array', 'Int16Array', 'Int32Array',
  'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array', 'ArrayBuffer'
])

/** The first argument of a sized construction, or nothing when this is not one. */
const sizeArgumentOf = (node: TsNode): TsNode | undefined => {
  if (!Node.isNewExpression(node) && !Node.isCallExpression(node)) return undefined
  if (!SIZED.has(node.getExpression().getText())) return undefined
  return node.getArguments()[0]
}

/**
 * Concatenations that repeat: `out += row` with a loop somewhere above it.
 *
 * Found by asking each concatenation what encloses it, rather than by collecting what each loop
 * contains. A concatenation two loops deep is inside both of them, and gathering per loop would
 * charge it twice.
 */
const concatenationsInLoops = (entry: FunctionDeclaration): TsNode[] =>
  entry.getDescendantsOfKind(SyntaxKind.BinaryExpression)
    .filter(expression => expression.getOperatorToken().getText() === '+=')
    .filter(expression => expression.getFirstAncestor(isLoop) !== undefined)
    .map(expression => expression.getRight())

const allocationEdits = (entry: FunctionDeclaration, guards: string): Edit[] => [
  ...entry.getDescendants()
    .map(sizeArgumentOf)
    .filter((size): size is TsNode => size !== undefined)
    .flatMap(size => wrapExpression(size, `${guards}.size`)),
  ...concatenationsInLoops(entry).flatMap(added => wrapExpression(added, `${guards}.text`))
]

/**
 * The source with every allocation charged.
 *
 * Read from the entry function's descendants, so the helper — appended afterwards — is never charged
 * for the arrays it does not have.
 */
const chargeAllocation = (source: string, entry: FunctionDeclaration, guards: string): string =>
  applyEdits(source, allocationEdits(entry, guards))

export { chargeAllocation }
