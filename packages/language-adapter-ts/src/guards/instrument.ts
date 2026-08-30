import { Node, SyntaxKind } from 'ts-morph'
import type { Node as TsNode } from 'ts-morph'

/**
 * Putting guard calls into a component's source without moving anything the author wrote.
 *
 * Shared by every guard family, because they all face the same two problems: where a call goes, and
 * how to place several without them interfering.
 *
 * ## Insertions only, never replacements
 *
 * Every edit is a **point insertion**. An edit that replaced a span would work for one site and
 * corrupt the source for two: a nested function's edit lands inside the outer function's span, so
 * replacing that span with the text it had before discards the inner edit — or, worse, splices over
 * it and emits something that does not parse.
 *
 * A point insertion cannot do that. It touches no other site's text, so a body that needs braces
 * gets them as two inserts, one at each end, and whatever is inside is instrumented independently.
 *
 *     () => xs.map(x => x * 2)
 *     └───┬───┘   └────┬────┘
 *      outer          inner        both instrumented; neither rewrites the other
 *
 * ## Order: furthest into the source first
 *
 * Applied back to front, an edit never moves a position that has not been used yet, so no offset is
 * ever recomputed.
 *
 * Two edits can still land on the **same** offset, when an outer body ends exactly where an inner one
 * does — `() => x => 1` closes both arrows at the same character. Text inserted later ends up to the
 * left of text inserted earlier, so the enclosing edit goes first and the enclosed one ends up inside
 * it. An empty body would be the one case where a body's own opening and closing offsets coincide, and
 * it is given a single edit instead, so that case does not arise.
 *
 * ## No new lines
 *
 * Everything is placed on a line that already exists — beside the brace that opens a block, or beside
 * the one that closes it. The author's body therefore occupies exactly the lines they wrote, and a
 * diagnostic is mapped back by subtracting a fixed prologue rather than consulting a line map that
 * every guard family would have to maintain correctly.
 */

/** One insertion, and enough about its owner to order it against a coincident one. */
interface Edit {
  at: number
  text: string
  /** Where the construct being instrumented begins, which is what says who encloses whom. */
  ownerStart: number
}

const LOOPS = [
  SyntaxKind.ForStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.WhileStatement,
  SyntaxKind.DoStatement
]

const FUNCTIONS = [
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.ArrowFunction,
  SyntaxKind.MethodDeclaration
]

const descendantsOfKinds = (node: TsNode, kinds: SyntaxKind[]): TsNode[] =>
  kinds.flatMap(kind => node.getDescendantsOfKind(kind) as TsNode[])

/** The loops inside a component, in no particular order. */
const loopsIn = (node: TsNode): TsNode[] => descendantsOfKinds(node, LOOPS)

/** Every function the author declared inside a component, in any of the ways one can be written. */
const functionsIn = (node: TsNode): TsNode[] => descendantsOfKinds(node, FUNCTIONS)

/** What a loop repeats. */
const loopBodyOf = (loop: TsNode): TsNode =>
  (loop as unknown as { getStatement: () => TsNode }).getStatement()

/** What a function runs, or nothing for a declaration that has no body. */
const functionBodyOf = (fn: TsNode): TsNode | undefined =>
  (fn as unknown as { getBody: () => TsNode | undefined }).getBody()

/**
 * Wraps a body in `preamble` and `epilogue`, giving it braces if it has none.
 *
 * A block already has the braces, so the two go just inside them. Anything else is a single statement
 * or a single expression, and gets a block built around it — an expression additionally becomes a
 * `return`, which is what an arrow's expression body already was.
 */
const wrapBody = (body: TsNode, preamble: string, epilogue: string): Edit[] => {
  const ownerStart = body.getStart()

  if (Node.isBlock(body)) {
    const inside = { start: body.getStart() + 1, end: body.getEnd() - 1 }
    // An empty block is the one place a body's two offsets are the same one. Written as a single
    // edit so that nothing downstream has to decide which of them comes first.
    return inside.start === inside.end
      ? [{ at: inside.start, text: ` ${preamble} ${epilogue} `, ownerStart }]
      : [
          { at: inside.start, text: ` ${preamble}`, ownerStart },
          { at: inside.end, text: `${epilogue} `, ownerStart }
        ]
  }

  const returns = Node.isStatement(body) ? '' : 'return '
  return [
    { at: body.getStart(), text: `{ ${preamble} ${returns}`, ownerStart },
    { at: body.getEnd(), text: ` ${epilogue} }`, ownerStart }
  ]
}

/**
 * Furthest into the source first, and enclosing before enclosed.
 *
 * Later-applied text ends up to the left of earlier-applied text at the same offset, so putting the
 * enclosing edit first is what leaves the enclosed one inside it.
 */
const inApplicationOrder = (one: Edit, other: Edit): number =>
  one.at !== other.at ? other.at - one.at : one.ownerStart - other.ownerStart

const applyEdits = (source: string, edits: Edit[]): string =>
  [...edits]
    .sort(inApplicationOrder)
    .reduce((text, edit) => text.slice(0, edit.at) + edit.text + text.slice(edit.at), source)

export { applyEdits, wrapBody, loopsIn, functionsIn, loopBodyOf, functionBodyOf }
export type { Edit }
