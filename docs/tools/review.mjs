#!/usr/bin/env node
/**
 * Spec Workflow review page (WORKFLOW.md §5.6). No dependencies: Node ≥ 20.
 *
 *   node docs/tools/review.mjs <docsDir> [--since <commit>] [--out review.md]
 *   node docs/tools/review.mjs <docsDir> --approve <document> …
 *
 * Writes, as Markdown, what changed in each architecture document since its `reviewed` commit, or else
 * since --since or the last tag: word diffs of its statements, Design entries and sections, its diagrams
 * with the changed steps and nodes highlighted, and the RFCs that name its changed statements. Also what
 * changed in the sections of docs/README.md on where the project runs and how it is tested, since --since
 * or the last tag.
 * --approve sets `reviewed` of the documents to HEAD.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { analyze, clicksOf, diagramsIn, documentAt, documentItems, fencedBlocks, isScenario, itemChanges, lineItems, parseFrontMatter, prefixOf, reachedFrom, sectionLines, sectionOf, VIEWS } from './check-docs.mjs'

const RECT_COLORS = { added: 'rgba(26,127,55,0.15)', changed: 'rgba(154,103,0,0.15)', removed: 'rgba(207,34,46,0.15)' }
const CLASS_NAMES = { added: 'new', changed: 'changed', removed: 'removed' }
const CLASS_STYLES = { added: 'stroke:#1a7f37,stroke-width:3px', changed: 'stroke:#9a6700,stroke-width:3px', removed: 'stroke:#cf222e,stroke-dasharray:5 5' }
const PRECEDENCE = ['removed', 'changed', 'added']
const ITEM_NOUNS = { statement: ['statement', 'statements'], entry: ['Design entry', 'Design entries'], section: ['section', 'sections'] }
const USAGE = 'usage: review.mjs <docsDir> [--since <commit>] [--out review.md]\n       review.mjs <docsDir> --approve <document> …'

// ─── Git ────────────────────────────────────────────────────────────────────

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

function gitSucceeds (root, args) {
  try { git(root, args); return true } catch { return false }
}

function lastTag (root) {
  try { return git(root, ['describe', '--tags', '--abbrev=0']) } catch { return null }
}

// ─── Word diff ──────────────────────────────────────────────────────────────

const tokensOf = (lines) => lines.flatMap((line, i) => [...(i > 0 ? ['\n'] : []), ...line.split(/\s+/).filter(Boolean)])

/** The longest common subsequence lengths of every pair of suffixes. */
function suffixTable (a, b) {
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
  }
  return table
}

/** The tokens of `b` and the removed tokens of `a`, as `[operation, token]`: same, del or ins. */
function tokenDiff (a, b) {
  const table = suffixTable(a, b)
  const parts = []
  let [i, j] = [0, 0]
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { parts.push(['same', b[j]]); i++; j++ } else if (i < a.length && (j === b.length || table[i + 1][j] >= table[i][j + 1])) { parts.push(['del', a[i]]); i++ } else { parts.push(['ins', b[j]]); j++ }
  }
  return parts
}

const wrapRun = ({ operation, words }) => (operation === 'same' ? words.join(' ') : `<${operation}>${words.join(' ')}</${operation}>`)

/** Runs of one operation within a line, and the line breaks of the new text. */
function runsOf (parts) {
  const runs = []
  for (const [operation, token] of parts) {
    if (token === '\n') { if (operation !== 'del') runs.push('\n'); continue }
    const last = runs.at(-1)
    if (last !== undefined && last !== '\n' && last.operation === operation) last.words.push(token)
    else runs.push({ operation, words: [token] })
  }
  return runs
}

/** The lines of `after`, with the words removed from `before` in `<del>` and those added in `<ins>`. */
function wordDiff (before, after) {
  return runsOf(tokenDiff(tokensOf(before), tokensOf(after))).map(run => (run === '\n' ? '\n' : wrapRun(run))).join(' ').replace(/ ?\n ?/g, '\n')
}

// ─── Highlighting ───────────────────────────────────────────────────────────

const mentions = (text, id) => new RegExp(`(?<![\\w-])${id}(?![\\w-])`).test(text)
const isStep = (text) => /^Note\b/.test(text) || (/(-{1,2}(>>|>|x|\))|<<-{1,2}>>)/.test(text) && text.includes(':'))

/** The kind of the strongest change among `marks` that `text` mentions; `undefined` when none. */
function strongestMark (text, marks) {
  const kinds = [...marks].filter(([id]) => mentions(text, id)).map(([, kind]) => kind)
  return PRECEDENCE.find(kind => kinds.includes(kind))
}

function highlightSequence (lines, statements) {
  return lines.flatMap(line => {
    const kind = isStep(line.trim()) ? strongestMark(line, statements) : undefined
    if (kind === undefined) return [line]
    const indent = /^\s*/.exec(line)[0]
    return [`${indent}rect ${RECT_COLORS[kind]}`, `  ${line}`, `${indent}end`]
  })
}

function highlightFlowchart (lines, nodes) {
  const text = lines.join('\n')
  const byKind = new Map()
  for (const [node, kind] of nodes) if (mentions(text, node)) byKind.set(kind, [...(byKind.get(kind) ?? []), node])
  return [...lines, ...[...byKind].flatMap(([kind, ids]) => [`  classDef ${CLASS_NAMES[kind]} ${CLASS_STYLES[kind]}`, `  class ${ids.join(',')} ${CLASS_NAMES[kind]}`])]
}

/** A diagram's lines with the steps that name a marked statement in a `rect`, or its marked nodes in a class (WORKFLOW §5.4). */
function highlight (lines, marks) {
  const type = lines.find(line => line.trim() !== '' && !line.trim().startsWith('%%'))?.trim().split(/\s+/)[0]
  if (type === 'sequenceDiagram') return highlightSequence(lines, marks.statements)
  if (type === 'flowchart' || type === 'graph') return highlightFlowchart(lines, marks.nodes)
  return lines
}

// ─── Changes ────────────────────────────────────────────────────────────────

const isArchitectureDoc = (doc) => ['architecture', 'architecture-index'].includes(doc.front?.type) && doc.front.conforms !== false

/** What changed in `doc` since `base`, as `{ doc, base, isNew, changes }`. */
function documentReview (doc, base) {
  const before = base === null ? null : documentAt(doc, String(base))
  const changes = itemChanges(before === null ? new Map() : documentItems(before, prefixOf(doc)), documentItems(doc, prefixOf(doc)))
  return { doc, base: base === null ? null : String(base), isNew: before === null, changes }
}

function statementMarks (reviews) {
  return new Map(reviews.flatMap(r => r.changes.filter(c => c.kind === 'statement').map(c => [c.key, c.change])))
}

/** The use cases whose entries, scenarios or statements changed: new when the use case itself is new. */
function useCaseMarks (reviews, useCases, statements) {
  const entryChanges = new Map(reviews.flatMap(r => r.changes.filter(c => c.kind === 'entry').map(c => [c.key, c.change])))
  const marks = new Map()
  for (const u of [...useCases.values()].filter(u => !isScenario(u.id))) {
    const scenarioChanged = [...entryChanges.keys()].some(key => isScenario(key) && key.slice(0, -1) === u.id)
    if (entryChanges.get(u.id) === 'added') marks.set(u.id, 'added')
    else if (entryChanges.has(u.id) || scenarioChanged || u.statements.some(id => statements.has(id))) marks.set(u.id, 'changed')
  }
  return marks
}

/** The nodes of a map diagram that lead to a changed document. */
function documentMarks (doc, diagram, reviews) {
  const changed = reviews.filter(r => r.changes.length > 0)
  const kindOf = (path) => {
    const own = changed.find(r => r.doc.path === path)
    if (own !== undefined) return own.isNew ? 'added' : 'changed'
    const reached = reachedFrom(path, reviews.map(r => r.doc))
    return changed.some(r => r.doc.index?.path === path || reached.has(r.doc.path)) ? 'changed' : undefined
  }
  return new Map(clicksOf(doc, diagram).map(click => [click.node, kindOf(click.path)]).filter(([, kind]) => kind !== undefined))
}

// ─── Page ───────────────────────────────────────────────────────────────────

const plural = (count, [one, many]) => `${count} ${count === 1 ? one : many}`
const quoted = (text) => text.split('\n').map(line => (line === '' ? '>' : `> ${line}`))
const fenced = (lines) => ['```mermaid', ...lines, '```']
const posixPath = (path) => path.split(sep).join('/')

/** The lines of an item a reviewer reads as text: without fenced blocks, without `Test:` and `State:`, trimmed. */
function proseOf (item) {
  const blocks = fencedBlocks(item.lines)
  const kept = item.lines.filter((line, i) => !blocks.some(b => i >= b.start && i <= b.end) && !(item.kind === 'statement' && /^- (Test|State):/.test(line)))
  while (kept.length > 0 && kept.at(-1).trim() === '') kept.pop()
  while (kept.length > 0 && kept[0].trim() === '') kept.shift()
  return kept
}

function renderChange (change) {
  const text = change.change === 'changed' ? wordDiff(proseOf(change.before), proseOf(change.after)) : proseOf(change.after ?? change.before).join('\n')
  return [`**${change.key}**, ${change.change}:`, '', ...quoted(text), '']
}

/** The diagrams of `doc` worth seeing: those of changed items, of scenarios naming a changed statement, and those with a marked node. */
function shownDiagrams (doc, review, marks, affected) {
  const owners = lineItems(doc)
  const changed = new Set(review.changes.filter(c => c.change !== 'removed').map(c => c.key))
  return doc.diagrams.filter(d => d.end < doc.raw.length).map(d => ({ key: owners[d.start], lines: doc.raw.slice(d.start + 1, d.end) }))
    .filter(d => changed.has(d.key) || affected.has(d.key) || highlight(d.lines, marks).length !== d.lines.length)
}

function renderDiagrams (diagrams, marks) {
  return diagrams.flatMap(d => [`*${d.key ?? 'Diagram'}*`, '', ...fenced(highlight(d.lines, marks)), ''])
}

function renderRfcs (rfcs, ids, link) {
  const naming = rfcs.map(rfc => ({ rfc, named: ids.filter(id => mentions(rfc.raw.join('\n'), id)) })).filter(r => r.named.length > 0)
  if (naming.length === 0) return []
  return ['**RFCs**', '', ...naming.map(({ rfc, named }) => `- [RFC-${String(rfc.front.number).padStart(4, '0')}: ${rfc.front.title}](${link(rfc.path)}), ${rfc.front.status}: ${named.join(', ')}`), '']
}

function summaryOf (review, name, affected) {
  const counts = Object.entries(ITEM_NOUNS).map(([kind, nouns]) => [review.changes.filter(c => c.kind === kind).length, nouns]).filter(([count]) => count > 0)
  const since = review.base === null ? 'since its first version' : `since ${review.base}`
  if (counts.length === 0) return `<b>${name}</b>: no change; ${plural(affected.size, ['scenario names', 'scenarios name'])} a changed statement`
  return `<b>${name}</b>: ${counts.map(([count, nouns]) => plural(count, nouns)).join(', ')} changed ${since}`
}

function renderDocument (review, context) {
  const { doc } = review
  const affected = new Set([...context.useCases.values()].filter(u => u.doc === doc && isScenario(u.id) && u.named.some(id => context.marks.statements.has(id))).map(u => u.id))
  const statementIds = review.changes.filter(c => c.kind === 'statement').map(c => c.key)
  return [
    '<details>', `<summary>${summaryOf(review, posixPath(relative(context.docsDir, doc.path)), affected)}</summary>`, '',
    ...review.changes.flatMap(renderChange),
    ...renderDiagrams(shownDiagrams(doc, review, context.marks, affected), context.marks),
    ...renderRfcs(context.rfcs, statementIds, context.link),
    '</details>', ''
  ]
}

const isAffecting = (review, context) => review.changes.length > 0 || [...context.useCases.values()].some(u => u.doc === review.doc && isScenario(u.id) && u.named.some(id => context.marks.statements.has(id)))

/** The documents in the order of the system diagram, each followed by what its Overview or Role links, then the others by path. */
function mapOrder (docs, index) {
  const ordered = []
  const visit = (doc, diagrams) => {
    for (const click of diagrams.flatMap(d => clicksOf(doc, d))) {
      const target = docs.find(d => d.path === click.path)
      if (target === undefined || ordered.includes(target)) continue
      ordered.push(target)
      const map = sectionOf(target, 3, target.front.type === 'architecture-index' ? 'Overview' : 'Role')
      if (map !== undefined) visit(target, diagramsUnder(target, map))
    }
  }
  const system = index === undefined ? undefined : sectionOf(index, 2, 'System')
  if (system !== undefined) visit(index, diagramsUnder(index, system))
  return [...ordered, ...docs.filter(d => !ordered.includes(d)).sort((a, b) => a.path.localeCompare(b.path))]
}

const diagramsUnder = (doc, heading) => diagramsIn(doc, heading).filter(d => d.end < doc.raw.length)

function renderSystem (index, reviews) {
  const system = index === undefined ? undefined : sectionOf(index, 2, 'System')
  if (system === undefined) return []
  return diagramsUnder(index, system).flatMap(d => {
    const lines = index.raw.slice(d.start + 1, d.end)
    return [...fenced(highlight(lines, { statements: new Map(), nodes: documentMarks(index, d, reviews) })), '']
  })
}

/** The lines of a section of the index, without comments; `null` when it has none. */
function viewLines (doc, name) {
  const heading = doc === null ? undefined : sectionOf(doc, 2, name)
  if (heading === undefined) return null
  const { start, end } = sectionLines(doc, heading)
  return doc.raw.slice(start, end).join('\n').replace(/<!--[\s\S]*?-->/g, '').split('\n')
}

const isSameText = (a, b) => a.join(' ').replace(/\s+/g, ' ').trim() === b.join(' ').replace(/\s+/g, ' ').trim()
const diagramsOfLines = (lines) => fencedBlocks(lines).map(block => lines.slice(block.start + 1, block.end))

function renderViewProse (before, after) {
  const [was, now] = [proseOf({ lines: before ?? [], kind: 'section' }), proseOf({ lines: after ?? [], kind: 'section' })]
  if (isSameText(was, now)) return []
  return [...quoted(wordDiff(was, now)), '']
}

function renderViewDiagrams (before, after) {
  const [was, now] = [diagramsOfLines(before ?? []), diagramsOfLines(after ?? [])]
  if (isSameText(was.flat(), now.flat())) return []
  const titled = (title, diagrams) => (diagrams.length === 0 ? [] : [`*${title}*`, '', ...diagrams.flatMap(d => [...fenced(d), ''])])
  return [...titled('Before', was), ...titled('Now', now)]
}

/** What changed in a section of the index, as a reader of the page needs it: a word diff of its prose, and its diagrams before and now. */
function renderView (name, before, after) {
  if (isSameText(before ?? [], after ?? [])) return []
  const change = before === null ? 'added' : after === null ? 'removed' : 'changed'
  return [`**${name}**, ${change}:`, '', ...renderViewProse(before, after), ...renderViewDiagrams(before, after)]
}

/** The sections of the index on where the project runs and how it is tested, compared with `base` (WORKFLOW §5.6). */
function renderViews (index, base) {
  if (index === undefined || base === null) return []
  const before = documentAt(index, String(base))
  const changes = Object.keys(VIEWS).flatMap(name => renderView(name, viewLines(before, name), viewLines(index, name)))
  return changes.length === 0 ? [] : [`## docs/README.md, since ${base}`, '', ...changes]
}

/** The review page of `docsDir` (WORKFLOW §5.6): each document compared with its `reviewed` commit, or else with `since` or the last tag. */
function reviewPage (docsDir, { since = null, out = null } = {}) {
  const analysis = analyze(docsDir)
  const fallback = since ?? lastTag(dirname(resolve(docsDir)))
  const index = analysis.docs.find(d => d.front?.type === 'docs-index')
  const reviews = mapOrder(analysis.docs.filter(isArchitectureDoc), index).map(doc => documentReview(doc, doc.front.reviewed ?? fallback))
  const statements = statementMarks(reviews)
  const outDir = out === null ? process.cwd() : dirname(resolve(out))
  const context = {
    docsDir: resolve(docsDir),
    useCases: analysis.useCases,
    marks: { statements, nodes: useCaseMarks(reviews, analysis.useCases, statements) },
    rfcs: analysis.docs.filter(d => d.front?.type === 'rfc' && d.front.status !== 'withdrawn'),
    link: (path) => encodeURI(posixPath(relative(outDir, path)))
  }
  const shown = reviews.filter(r => isAffecting(r, context))
  const intro = `Each document is compared with its \`reviewed\` commit, or else with ${fallback === null ? 'its first version' : fallback}. Approve one with \`node docs/tools/review.mjs docs --approve <document>\`.`
  const views = renderViews(index, fallback)
  if (shown.length === 0 && views.length === 0) return ['# Review', '', intro, '', 'No document changed since its review.', ''].join('\n')
  const documents = shown.length === 0 ? [] : ['## Documents', '', ...shown.flatMap(r => renderDocument(r, context))]
  return ['# Review', '', intro, '', '## System', '', ...renderSystem(index, reviews), ...views, ...documents].join('\n')
}

// ─── Approval ───────────────────────────────────────────────────────────────

/** `text` with its front matter key `reviewed` set to `commit`. */
function withReviewed (text, commit) {
  const lines = text.split('\n')
  const end = lines.indexOf('---', 1)
  const at = lines.findIndex((line, i) => i > 0 && i < end && line.startsWith('reviewed:'))
  if (at >= 0) lines[at] = `reviewed: ${commit}`
  else lines.splice(end, 0, `reviewed: ${commit}`)
  return lines.join('\n')
}

function approvalProblem (path, root) {
  if (!existsSync(path)) return 'does not exist'
  const type = parseFrontMatter(readFileSync(path, 'utf-8').split('\n'))?.data.type
  if (type !== 'architecture' && type !== 'architecture-index') return 'is not an architecture document'
  const tracked = gitSucceeds(root, ['ls-files', '--error-unmatch', path])
  if (!tracked || !gitSucceeds(root, ['diff', '--quiet', 'HEAD', '--', path])) return 'has changes that are not committed: commit them, then approve'
  return null
}

/** Sets `reviewed` of each document to HEAD (WORKFLOW §5.6), unless it is not committed. */
function approve (docsDir, paths) {
  const root = dirname(resolve(docsDir))
  const head = git(root, ['rev-parse', '--short', 'HEAD'])
  const result = { approved: [], errors: [] }
  for (const path of paths.map(p => resolve(p))) {
    const name = posixPath(relative(resolve(docsDir), path))
    const problem = approvalProblem(path, root)
    if (problem !== null) { result.errors.push(`${name} ${problem}`); continue }
    writeFileSync(path, withReviewed(readFileSync(path, 'utf-8'), head))
    result.approved.push(`${name} reviewed at ${head}`)
  }
  return result
}

// ─── Command line ───────────────────────────────────────────────────────────

function parseArguments (args) {
  const options = { docsDir: args[0], since: null, out: null, approve: null }
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--since') options.since = args[++i] ?? null
    else if (args[i] === '--out') options.out = args[++i] ?? null
    else if (args[i] === '--approve') options.approve = args.slice(i + 1)
    else return null
    if (options.approve !== null) break
  }
  const valid = options.docsDir !== undefined && (options.approve === null || options.approve.length > 0)
  return valid ? options : null
}

function main () {
  const options = parseArguments(process.argv.slice(2))
  if (options === null) { console.error(USAGE); process.exit(2) }
  if (!existsSync(options.docsDir)) { console.error(`${options.docsDir} does not exist`); process.exit(2) }
  if (options.since !== null && !gitSucceeds(dirname(resolve(options.docsDir)), ['rev-parse', '--verify', `${options.since}^{commit}`])) { console.error(`${options.since} is not a commit`); process.exit(2) }
  if (options.approve !== null) {
    const { approved, errors } = approve(options.docsDir, options.approve)
    for (const line of approved) console.log(line)
    for (const line of errors) console.error(line)
    process.exit(errors.length > 0 ? 1 : 0)
  }
  const page = reviewPage(options.docsDir, options)
  if (options.out === null) process.stdout.write(page)
  else { writeFileSync(options.out, page); console.log(`wrote ${options.out}`) }
}

export { approve, highlight, reviewPage, wordDiff }

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
