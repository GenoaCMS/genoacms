import { Node, SyntaxKind } from 'ts-morph'
import type { FunctionDeclaration, Node as TsNode } from 'ts-morph'

/**
 * Spending fuel: a tick at every loop header and every function the author declared.
 *
 *     for (const row of rows) { __genoa.tick();   ← one per iteration
 *     while (more) { __genoa.tick();
 *     function walk (node) { __genoa.tick();      ← one per call, so recursion is bounded too
 *
 * ## Every function, not only the recursive ones
 *
 * Which functions recurse needs a call graph, and a call graph is what mutual and indirect recursion
 * defeat one at a time. Ticking every function needs no analysis and cannot miss a shape: `a` calling
 * `b` calling `a` spends fuel whether or not anything recognized it as recursion. The cost is that an
 * ordinary helper also spends — a formatter called a thousand times costs a thousand of a million,
 * which is the trade taken deliberately.
 *
 * The component's own entry function is not ticked. It runs once per render against guards built for
 * that render, so the tick could only ever charge one.
 *
 * ## Nothing here adds a line
 *
 * Every tick goes **on the line that already opens the block**, so the author's body occupies exactly
 * the lines it did. That is what lets a diagnostic still be mapped back by subtracting a fixed
 * prologue — the alternative is carrying a line map through the whole pipeline, and every guard family
 * after this one would have to maintain it.
 *
 * A body that is not a block gets one: `while (x) step()` becomes `while (x) { …tick(); step() }`, on
 * the same line.
 *
 * ## The AST chooses the sites; the edits are applied by offset
 *
 * Nothing is found by searching text. What the AST cannot do is insert *without* reformatting, so the
 * positions it reports are applied to the source directly — **last one first**, which is what makes
 * the arithmetic correct: an edit never moves a position that has not been used yet.
 */

/** A replacement of one span of the source. */
interface Edit {
  start: number
  end: number
  text: string
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

/** Opens an existing block on the line the brace is already on. */
const intoBlock = (block: TsNode, tick: string): Edit =>
  ({ start: block.getStart() + 1, end: block.getStart() + 1, text: ` ${tick}` })

/** Wraps a single statement or expression, keeping whatever lines it already spans. */
const around = (node: TsNode, tick: string, returns: boolean): Edit => ({
  start: node.getStart(),
  end: node.getEnd(),
  text: `{ ${tick} ${returns ? 'return ' : ''}${node.getText()} }`
})

const atLoop = (loop: TsNode, tick: string): Edit => {
  const body = (loop as unknown as { getStatement: () => TsNode }).getStatement()
  return Node.isBlock(body) ? intoBlock(body, tick) : around(body, tick, false)
}

/**
 * A function's entry, whichever shape its body takes.
 *
 * An arrow written as an expression has no block to open, so it grows one — and the expression
 * becomes a `return`, which is what it already was.
 */
const atFunctionEntry = (fn: TsNode, tick: string): Edit | undefined => {
  const body = (fn as unknown as { getBody: () => TsNode | undefined }).getBody()
  if (body === undefined) return undefined
  return Node.isBlock(body) ? intoBlock(body, tick) : around(body, tick, true)
}

const isEdit = (edit: Edit | undefined): edit is Edit => edit !== undefined

/**
 * Applies every edit, furthest into the source first.
 *
 * Descending order is the whole reason this is safe: an edit changes only the text after its own
 * start, and every start still to be used is before it.
 */
const applyEdits = (source: string, edits: Edit[]): string =>
  [...edits]
    .sort((one, other) => other.start - one.start)
    .reduce((text, edit) => text.slice(0, edit.start) + edit.text + text.slice(edit.end), source)

/**
 * The source with fuel spent at every site inside the component.
 *
 * Sites are read from the entry function's descendants, so the emitted prologue and the helper — which
 * is appended afterwards — are never instrumented. Guarding the guard would be a component paying for
 * the counting.
 */
const spendFuel = (source: string, entry: FunctionDeclaration, guards: string): string => {
  const tick = `${guards}.tick();`
  const edits = [
    ...descendantsOfKinds(entry, LOOPS).map(loop => atLoop(loop, tick)),
    ...descendantsOfKinds(entry, FUNCTIONS).map(fn => atFunctionEntry(fn, tick)).filter(isEdit)
  ]

  return applyEdits(source, edits)
}

export { spendFuel }
