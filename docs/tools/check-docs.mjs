#!/usr/bin/env node
/**
 * Spec Workflow documentation checker (WORKFLOW.md §9). No dependencies: Node ≥ 20.
 * `analyze` also returns the statements, for check-results.mjs.
 *
 *   node docs/tools/check-docs.mjs [docsDir]
 *
 * Prints `path:line: rule: message` for every error and warning, and exits 1 when there is an error.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative, dirname, resolve, basename, sep } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const SKIPPED_DIRS = new Set(['templates', 'tools'])
const CATEGORIES = 'UDFSQJ'
const RFC_SECTIONS = ['Summary', 'Files', 'Specification', 'Non-goals', 'Tests', 'Steps', 'Verification', 'Critique']
const PARTS = ['Design', 'Specification']
const DESIGN_SECTIONS = {
  architecture: ['Role', 'Decisions', 'Findings', 'History', 'Verification'],
  'architecture-index': ['Overview', 'Documents', 'Decisions', 'History', 'Register']
}
const CRITIQUE_PARAGRAPHS = ['**Pros**', '**Cons & trade-offs**', '**Blindspots & missed edge cases**']
const KEYS = {
  workflow: { required: ['version'], optional: [] },
  'docs-index': { required: ['workflow', 'levels', 'scenario-levels'], optional: ['sources', 'audit-from', 'prefix'] },
  architecture: { required: ['title', 'codes', 'verified'], optional: ['prefix', 'conforms', 'reviewed'] },
  'architecture-index': { required: ['title', 'prefix', 'codes', 'verified'], optional: ['conforms', 'reviewed'] },
  'rfc-index': { required: [], optional: [] },
  map: { required: [], optional: [] },
  rfc: { required: ['number', 'title', 'status', 'commit-subject'], optional: ['commits', 'depends', 'architecture', 'sections', 'changes', 'audit'] }
}
const COMMIT_KEYS = new Set(['commits', 'verified', 'reviewed'])
const RFC_STATUSES = ['draft', 'auditing', 'implemented', 'withdrawn']
const WITH_COMMITS = ['auditing', 'implemented']
const STATEMENT_HEADING = /^(~~)?([A-Z]+)-(\d+) · (.+?)(~~)?$/
const STATE_VALUE = /^(new \((RFC-\d{4}|no RFC yet)\)|removed \(RFC-\d{4}\))$/
const TEST_FILES = /^`[^`]+`(, `[^`]+`)*$/
const TEST_UNVERIFIED = /^unverified( \(.+\))?$/
const TEST_PARTIAL = / \(unverified: .+\)$/
const CHANGE_KINDS = ['breaking', 'added', 'compatible', 'editorial']
const CHANGE = /^([A-Z]+-\d+) (\S+)$/
const LEVEL_NAME = /^[a-z][a-z0-9-]*$/
const FENCE = /^\s*(`{3,}|~{3,})(.*)$/
const DIAGRAM_TYPES = new Set([
  'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'stateDiagram-v2', 'erDiagram',
  'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment', 'journey', 'gantt', 'pie', 'mindmap',
  'timeline', 'gitGraph', 'quadrantChart', 'requirementDiagram', 'sankey-beta', 'xychart-beta', 'block-beta',
  'packet-beta', 'architecture-beta', 'kanban', 'radar-beta'
])
const FLOWCHART_DIRECTIONS = new Set(['TB', 'TD', 'BT', 'LR', 'RL'])
const SUBGRAPHS = { open: ['subgraph'], middle: {} }
const KEYWORD_BLOCKS = {
  flowchart: SUBGRAPHS,
  graph: SUBGRAPHS,
  sequenceDiagram: { open: ['alt', 'opt', 'loop', 'par', 'critical', 'break', 'rect', 'box'], middle: { else: 'alt', and: 'par', option: 'critical' } }
}
const BRACED_TYPES = new Set(['classDiagram', 'erDiagram', 'stateDiagram', 'stateDiagram-v2'])

// ─── Reporting ──────────────────────────────────────────────────────────────

function createReport () {
  const entries = []
  const add = (level) => (file, line, rule, message) => { entries.push({ level, file, line, rule, message }) }
  return { entries, error: add('error'), warning: add('warning') }
}

function printReport (report, root) {
  for (const e of report.entries) console.log(`${relative(root, e.file) || e.file}:${e.line}: ${e.level}: ${e.rule}: ${e.message}`)
  const errors = report.entries.filter(e => e.level === 'error').length
  const warnings = report.entries.length - errors
  console.log(`${errors} error(s), ${warnings} warning(s)`)
  return errors
}

// ─── Reading ────────────────────────────────────────────────────────────────

function listMarkdown (dir, top = dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return dir === top && SKIPPED_DIRS.has(name) ? [] : listMarkdown(path, top)
    return name.endsWith('.md') ? [path] : []
  }).sort()
}

/** Splits `a, "b, c", d` at the commas outside quotes. */
function splitList (inner) {
  const items = ['']
  let quote = null
  for (const char of inner) {
    if (quote === null && char === ',') { items.push(''); continue }
    if (quote === null && (char === '"' || char === "'")) quote = char
    else if (char === quote) quote = null
    items[items.length - 1] += char
  }
  return items
}

const unquoted = (value) => value.replace(/^(['"])(.*)\1$/, '$2')

/** A front matter value; `asText` keeps scalars as text, for keys that hold commits. */
function parseValue (raw, asText = false) {
  const value = raw.trim()
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    return inner === '' ? [] : splitList(inner).map(item => parseValue(item, asText))
  }
  if (asText) return unquoted(value)
  if (value === 'true' || value === 'false') return value === 'true'
  if (/^-?\d+$/.test(value)) return Number(value)
  return unquoted(value)
}

/** `---` front matter of `key: value` lines; `null` when absent. */
function parseFrontMatter (lines) {
  if (lines[0] !== '---') return null
  const end = lines.indexOf('---', 1)
  if (end < 0) return null
  const data = {}
  for (const line of lines.slice(1, end)) {
    const at = line.indexOf(':')
    const key = line.slice(0, at).trim()
    if (at > 0) data[key] = parseValue(line.slice(at + 1), COMMIT_KEYS.has(key))
  }
  return { data, bodyStart: end + 1 }
}

/** Fenced code blocks as `{ language, start, end }`: the lines of the opening and the closing fence, or the end of an unclosed one. */
function fencedBlocks (lines) {
  const blocks = []
  let open = null
  lines.forEach((line, i) => {
    const fence = FENCE.exec(line)
    if (open === null && fence !== null) open = { marker: fence[1], language: fence[2].trim().split(/\s+/)[0], start: i }
    else if (open !== null && fence !== null && closes(open.marker, fence)) { blocks.push({ language: open.language, start: open.start, end: i }); open = null }
  })
  if (open !== null) blocks.push({ language: open.language, start: open.start, end: lines.length })
  return blocks
}

const insideBlock = (blocks, i) => blocks.some(b => i >= b.start && i <= b.end)

/** Lines with fenced code blocks blanked, so nothing inside them counts as structure. */
function withoutFences (lines, blocks = fencedBlocks(lines)) {
  return lines.map((line, i) => (insideBlock(blocks, i) ? '' : line))
}

/** The lines checked for references: fenced blocks blanked, except the content of diagrams (WORKFLOW §5.4). */
function withDiagrams (lines, raw, diagrams) {
  const restored = [...lines]
  for (const d of diagrams) for (let i = d.start + 1; i < d.end; i++) restored[i] = raw[i]
  return restored
}

/** CommonMark: a fence closes with the same character, at least as long, and nothing after it. */
const closes = (open, [, marker, rest]) => marker[0] === open[0] && marker.length >= open.length && rest.trim() === ''

function parseHeadings (lines) {
  return lines.flatMap((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    return match ? [{ level: match[1].length, text: match[2], line: index }] : []
  })
}

function readDocument (path, text = readFileSync(path, 'utf-8')) {
  const raw = text.split('\n')
  const front = parseFrontMatter(raw)
  const bodyStart = front?.bodyStart ?? 0
  const blocks = fencedBlocks(raw)
  const lines = withoutFences(raw, blocks).map((line, i) => (i < bodyStart ? '' : line))
  const diagrams = blocks.filter(b => b.language === 'mermaid' && b.start >= bodyStart)
  return { path, raw, lines, references: withDiagrams(lines, raw, diagrams), diagrams, front: front?.data ?? null, headings: parseHeadings(lines) }
}

// ─── Front matter ───────────────────────────────────────────────────────────

function checkKeys (doc, report) {
  const spec = KEYS[doc.front.type]
  if (spec === undefined) return report.error(doc.path, 1, 'front-matter', `unknown type '${doc.front.type}'`)
  const allowed = new Set(['type', ...spec.required, ...spec.optional])
  for (const key of Object.keys(doc.front)) if (!allowed.has(key)) report.error(doc.path, 1, 'front-matter', `unknown key '${key}' for type ${doc.front.type}`)
  const relaxed = doc.front.conforms === false ? ['title'] : spec.required
  for (const key of relaxed) if (doc.front[key] === undefined) report.error(doc.path, 1, 'front-matter', `missing key '${key}'`)
}

function checkPrefix (doc, report) {
  if (doc.front.prefix !== undefined && !/^[A-Z]+$/.test(doc.front.prefix)) report.error(doc.path, 1, 'front-matter', 'prefix must be capital letters')
}

function checkArchitectureKeys (doc, report) {
  const inDirectory = doc.index !== undefined
  if (inDirectory && doc.front.prefix !== undefined) report.error(doc.path, 1, 'front-matter', 'a document in a directory takes its prefix from the index; remove `prefix`')
  if (!inDirectory && doc.front.type === 'architecture' && doc.front.conforms !== false && doc.front.prefix === undefined) report.error(doc.path, 1, 'front-matter', "missing key 'prefix'")
  checkPrefix(doc, report)
  if (doc.front.codes !== undefined && (!Array.isArray(doc.front.codes) || doc.front.codes.some(c => !/^[A-Z]+$/.test(c)))) report.error(doc.path, 1, 'front-matter', 'codes must be a list of capital-letter codes')
  if (doc.front.conforms !== undefined && doc.front.conforms !== false) report.error(doc.path, 1, 'front-matter', 'conforms may only be false')
}

function checkRfcKeys (doc, report) {
  const f = doc.front
  if (!RFC_STATUSES.includes(f.status)) report.error(doc.path, 1, 'rfc', `status must be one of ${RFC_STATUSES.join(', ')}`)
  if (WITH_COMMITS.includes(f.status) && !(Array.isArray(f.commits) && f.commits.length > 0)) report.error(doc.path, 1, 'rfc', 'an auditing or implemented RFC lists its commits')
  if (f.sections !== undefined && f.sections !== 'legacy') report.error(doc.path, 1, 'rfc', 'sections may only be legacy')
  const expected = Number(basename(doc.path).slice(0, 4))
  if (f.number !== expected) report.error(doc.path, 1, 'rfc', `number ${f.number} does not match the file name (${expected})`)
}

function checkFrontMatter (doc, report) {
  if (doc.front === null) return report.error(doc.path, 1, 'front-matter', 'missing front matter')
  checkKeys(doc, report)
  if (doc.front.type === 'architecture' || doc.front.type === 'architecture-index') checkArchitectureKeys(doc, report)
  if (doc.front.type === 'rfc') checkRfcKeys(doc, report)
  if (doc.front.type === 'docs-index') checkPrefix(doc, report)
}

function checkUniqueDeclarations (docs, report) {
  const seen = new Map()
  const claim = (kind, value, doc) => {
    const key = `${kind}:${value}`
    if (seen.has(key)) report.error(doc.path, 1, 'front-matter', `${kind} ${value} is also declared by ${seen.get(key)}`)
    else seen.set(key, relative(dirname(doc.path), doc.path))
  }
  for (const doc of docs) {
    if (doc.front?.prefix !== undefined) claim('prefix', doc.front.prefix, doc)
    for (const code of Array.isArray(doc.front?.codes) ? doc.front.codes : []) claim('code', code, doc)
  }
}

/** The `levels` of docs/README.md (WORKFLOW §6.2); `null` when there is none to check against. */
function declaredLevels (docs, report) {
  const index = docs.find(d => d.front?.type === 'docs-index')
  const levels = index?.front?.levels
  if (levels === undefined) return null
  if (!Array.isArray(levels) || levels.length === 0 || levels.some(l => !LEVEL_NAME.test(String(l)))) {
    report.error(index.path, 1, 'front-matter', 'levels must be a non-empty list of lowercase level names')
    return null
  }
  return levels.map(String)
}

/** The `audit-from` of docs/README.md (WORKFLOW §8.2); `null` when audits are not checked. */
function auditFrom (docs, report) {
  const index = docs.find(d => d.front?.type === 'docs-index')
  if (index === undefined) return null
  const from = index.front['audit-from']
  if (from === undefined) { report.warning(index.path, 1, 'front-matter', 'audit-from is not set: the audits of implemented RFCs are not checked (WORKFLOW §8.2)'); return null }
  if (!Number.isInteger(from) || from < 1) { report.error(index.path, 1, 'front-matter', 'audit-from must be an RFC number'); return null }
  return from
}

/** The `scenario-levels` of docs/README.md (WORKFLOW §5.4); `null` when statements are not checked against scenarios. */
function scenarioLevels (docs, levels, report) {
  const index = docs.find(d => d.front?.type === 'docs-index')
  if (index === undefined) return null
  const declared = index.front['scenario-levels']
  if (declared === undefined) return null
  if (!Array.isArray(declared) || declared.some(l => !(levels ?? []).includes(String(l)))) { report.error(index.path, 1, 'front-matter', 'scenario-levels must be a list of levels from levels'); return null }
  return declared.map(String)
}

function checkWorkflowVersion (docs, report) {
  const workflow = docs.find(d => d.front?.type === 'workflow')
  const index = docs.find(d => d.front?.type === 'docs-index')
  if (index === undefined) return report.error(docs[0]?.path ?? '.', 1, 'layout', 'docs/README.md with type docs-index is missing')
  if (workflow === undefined) return report.error(index.path, 1, 'layout', 'docs/WORKFLOW.md is missing')
  if (String(index.front.workflow) !== String(workflow.front.version)) report.error(index.path, 1, 'front-matter', `workflow ${index.front.workflow} does not match WORKFLOW.md ${workflow.front.version}`)
}

// ─── Structure ──────────────────────────────────────────────────────────────

const childrenOf = (doc, parent, level) => {
  const end = doc.headings.find(h => h.line > parent.line && h.level <= parent.level)?.line ?? doc.lines.length
  return doc.headings.filter(h => h.line > parent.line && h.line < end && h.level === level)
}

const sectionLines = (doc, heading) => {
  const end = doc.headings.find(h => h.line > heading.line && h.level <= heading.level)?.line ?? doc.lines.length
  return { start: heading.line + 1, end, lines: doc.lines.slice(heading.line + 1, end) }
}

function checkInOrder (doc, found, required, where, report) {
  const names = found.map(h => h.text)
  let cursor = -1
  for (const name of required) {
    const at = names.indexOf(name)
    if (at < 0) report.error(doc.path, (found[0]?.line ?? 0) + 1, 'structure', `${where}: missing section '${name}'`)
    else if (at < cursor) report.error(doc.path, found[at].line + 1, 'structure', `${where}: '${name}' is out of order (expected ${required.join(', ')})`)
    else cursor = at
  }
}

function checkParts (doc, report) {
  const titles = doc.headings.filter(h => h.level === 1)
  if (titles.length !== 1) report.error(doc.path, (titles[1]?.line ?? 0) + 1, 'structure', `exactly one # title expected, found ${titles.length}`)
  const parts = doc.headings.filter(h => h.level === 2)
  const critique = parts.find(p => p.text === 'Critique')
  if (critique !== undefined) report.error(doc.path, critique.line + 1, 'structure', 'an architecture document holds no ## Critique: critiques live in RFCs (WORKFLOW §5.1)')
  else if (parts.map(p => p.text).join('|') !== PARTS.join('|')) report.error(doc.path, (parts[0]?.line ?? 0) + 1, 'structure', `## parts must be exactly ${PARTS.join(', ')}, found ${parts.map(p => p.text).join(', ') || 'none'}`)
  return Object.fromEntries(parts.map(p => [p.text, p]))
}

function checkStructure (doc, report) {
  const parts = checkParts(doc, report)
  if (parts.Design !== undefined) checkInOrder(doc, childrenOf(doc, parts.Design, 3), DESIGN_SECTIONS[doc.front.type], 'Design', report)
  return parts
}

function checkRfcSections (doc, report) {
  const found = doc.headings.filter(h => h.level === 2)
  if (found.map(h => h.text).join('|') !== RFC_SECTIONS.join('|')) report.error(doc.path, (found[0]?.line ?? 0) + 1, 'structure', `## sections must be exactly ${RFC_SECTIONS.join(', ')}`)
}

function checkRfcCritique (doc, report) {
  const critique = doc.headings.find(h => h.level === 2 && h.text === 'Critique')
  if (critique === undefined) return
  const { lines } = sectionLines(doc, critique)
  for (const paragraph of CRITIQUE_PARAGRAPHS) if (!lines.some(l => l.trim() === paragraph)) report.error(doc.path, critique.line + 1, 'critique', `the Critique lacks ${paragraph}`)
}

// ─── Statements ─────────────────────────────────────────────────────────────

function statementFields (doc, heading) {
  const { lines, start } = sectionLines(doc, heading)
  const field = (name) => {
    const at = lines.findIndex(l => l.startsWith(`- ${name}:`))
    return at < 0 ? undefined : { value: lines[at].slice(name.length + 3).trim(), line: start + at }
  }
  return { test: field('Test'), state: field('State'), level: field('Level') }
}

/** The `- Test:` value (WORKFLOW §6.1) as `{ kind, files }`, or `null` when it has none of the forms. */
function parseTest (value) {
  if (value === 'none yet') return { kind: 'none yet', files: [] }
  if (TEST_UNVERIFIED.test(value)) return { kind: 'unverified', files: [] }
  const list = value.replace(TEST_PARTIAL, '')
  if (!TEST_FILES.test(list)) return null
  return { kind: 'files', files: [...list.matchAll(/`([^`]+)`/g)].map(m => m[1]) }
}

const stateOf = (state) => state?.value.startsWith('removed') ? 'removed' : state?.value.startsWith('new') ? 'new' : 'current'

/** A statement ID as a whole token: `SEC-1` matches in `SEC-1:` but not in `SEC-12`. */
const idToken = (id) => new RegExp(`(?<![A-Za-z0-9-])${id.replace('-', '[-_]')}(?![0-9])`)

const isFile = (path) => existsSync(path) && statSync(path).isFile()

/** The statement's normative text: its body without the `Test:`, `State:` and `Level:` lines, whitespace collapsed. */
function statementText (doc, heading) {
  const { start, end } = sectionLines(doc, heading)
  return doc.raw.slice(start, end).filter(line => !/^- (Test|State|Level):/.test(line)).join(' ').replace(/\s+/g, ' ').trim()
}

function checkTestLine (doc, heading, id, test, state, report) {
  if (test === undefined || test.value === '') return report.error(doc.path, heading.line + 1, 'statement', `${id} has no '- Test:' line`)
  const parsed = parseTest(test.value)
  if (parsed === null) report.error(doc.path, test.line + 1, 'statement', `${id}: '- Test: ${test.value}' is none of the forms in WORKFLOW §6.1`)
  if (parsed?.kind === 'none yet' && stateOf(state) !== 'new') report.error(doc.path, test.line + 1, 'statement', "'none yet' is only for a statement with State new")
  return parsed
}

/** Each named test file exists and carries the statement's ID (WORKFLOW §6.2). */
function checkTestFiles (doc, statement, testLine, root, report) {
  for (const file of statement.test.files) {
    const path = join(root, file)
    if (!isFile(path)) report.error(doc.path, testLine + 1, 'test', `${file} does not exist`)
    else if (!idToken(statement.id).test(readFileSync(path, 'utf-8'))) report.error(doc.path, testLine + 1, 'test', `${file} has no test carrying ${statement.id}`)
  }
}

const WANTED_LEVELS = /^(.*?)\s*\(wanted ([^:)]+): [^)]+\)$/
const levelNames = (text) => text.split(',').map(name => name.trim())

/** The required and wanted levels of a `- Level:` line (WORKFLOW §6.1), each one declared in docs/README.md. */
function checkLevelLine (doc, heading, id, level, declared, report) {
  if (level === undefined || level.value === '') { report.error(doc.path, heading.line + 1, 'statement', `${id} has no '- Level:' line`); return { levels: [], wanted: [] } }
  const match = WANTED_LEVELS.exec(level.value)
  const levels = levelNames(match?.[1] ?? level.value)
  const wanted = match === null ? [] : levelNames(match[2])
  for (const name of wanted.filter(w => levels.includes(w))) report.error(doc.path, level.line + 1, 'statement', `${id}: level ${name} is both required and wanted`)
  for (const name of [...levels, ...wanted]) {
    if (!LEVEL_NAME.test(name)) report.error(doc.path, level.line + 1, 'statement', `${id}: '${name}' is not a level name`)
    else if (declared !== null && !declared.includes(name)) report.error(doc.path, level.line + 1, 'statement', `${id}: level ${name} is not declared in docs/README.md levels`)
  }
  return { levels, wanted }
}

function checkStatement (doc, heading, context, report) {
  const match = STATEMENT_HEADING.exec(heading.text)
  if (match === null) return report.error(doc.path, heading.line + 1, 'statement', `'${heading.text}' is not '<CODE>-<n> · <title>'`)
  const [, struckOpen, code, number] = match
  const id = `${code}-${number}`
  if (!(doc.front.codes ?? []).includes(code)) report.error(doc.path, heading.line + 1, 'statement', `code ${code} is not declared in codes`)
  const { test, state, level } = statementFields(doc, heading)
  if (state !== undefined && !STATE_VALUE.test(state.value)) report.error(doc.path, state.line + 1, 'statement', `invalid State '${state.value}'`)
  if ((struckOpen !== undefined) !== (stateOf(state) === 'removed')) report.error(doc.path, heading.line + 1, 'statement', 'a removed statement is struck through, and only a removed one')
  const statement = { id, title: match[4], doc, line: heading.line, state: stateOf(state), text: statementText(doc, heading), test: checkTestLine(doc, heading, id, test, state, report), levels: [], wanted: [] }
  if (statement.state !== 'removed') Object.assign(statement, checkLevelLine(doc, heading, id, level, context.levels, report))
  if (statement.test?.kind === 'files' && statement.state !== 'removed') checkTestFiles(doc, statement, test.line, context.root, report)
  return statement
}

function checkSpecification (doc, specification, context, report) {
  const statements = doc.headings.filter(h => h.level === 4 && h.line > specification.line && h.line < sectionLines(doc, specification).end)
  const { lines } = sectionLines(doc, specification)
  if (statements.length === 0 && !lines.some(l => l.trim() === 'None.')) report.error(doc.path, specification.line + 1, 'statement', "a Specification without statements says 'None.'")
  return statements.map(h => checkStatement(doc, h, context, report)).filter(s => s !== undefined)
}

// ─── Diagrams ───────────────────────────────────────────────────────────────

const isMermaidComment = (line) => line.startsWith('%%')

/** The diagram's lines after its `---` configuration, with line numbers, without blanks and comments. */
function diagramLines (doc, diagram) {
  const lines = doc.raw.slice(diagram.start + 1, diagram.end).map((text, i) => ({ text: text.trim(), line: diagram.start + 1 + i }))
  const configEnd = lines[0]?.text === '---' ? lines.findIndex((l, i) => i > 0 && l.text === '---') : -1
  return lines.slice(configEnd + 1).filter(l => l.text !== '' && !isMermaidComment(l.text))
}

const firstWord = (text) => text.split(/[\s;]+/)[0]

/** The diagram type and, for a flowchart, its direction (WORKFLOW §5.4); `null` when the declaration is invalid. */
function checkDeclaration (doc, declaration, report) {
  const [type, direction] = declaration.text.replace(/;$/, '').split(/\s+/)
  if (!DIAGRAM_TYPES.has(type)) { report.error(doc.path, declaration.line + 1, 'diagram', `'${type}' is not a Mermaid diagram type`); return null }
  if ((type === 'flowchart' || type === 'graph') && direction !== undefined && !FLOWCHART_DIRECTIONS.has(direction)) report.error(doc.path, declaration.line + 1, 'diagram', `'${direction}' is not a flowchart direction`)
  return type
}

/** Blocks opened by a keyword and closed by `end`, such as `alt … else … end` and `subgraph … end`. */
function checkKeywordBlocks (doc, lines, blocks, report) {
  const open = []
  for (const { text, line } of lines) {
    const word = firstWord(text)
    if (blocks.open.includes(word)) open.push({ word, line })
    else if (word === 'end' && open.pop() === undefined) report.error(doc.path, line + 1, 'diagram', "'end' closes no block")
    else if (Object.hasOwn(blocks.middle, word) && open.at(-1)?.word !== blocks.middle[word]) report.error(doc.path, line + 1, 'diagram', `'${word}' is outside an '${blocks.middle[word]}' block`)
  }
  for (const block of open) report.error(doc.path, block.line + 1, 'diagram', `'${block.word}' is not closed with 'end'`)
}

/** Blocks opened by a line ending in `{` and closed by a line `}`, as in class, entity and state diagrams. */
function checkBracedBlocks (doc, lines, report) {
  const open = []
  for (const { text, line } of lines) {
    const unquoted = text.replace(/"[^"]*"/g, '""')
    if (unquoted.endsWith('{')) open.push(line)
    else if (unquoted === '}' && open.pop() === undefined) report.error(doc.path, line + 1, 'diagram', "'}' closes no block")
  }
  for (const line of open) report.error(doc.path, line + 1, 'diagram', "'{' is not closed with '}'")
}

/** A Mermaid diagram declares a known type, and its blocks open and close. Not a full parse (WORKFLOW §5.4). */
function checkDiagram (doc, diagram, report) {
  if (diagram.end === doc.raw.length) return report.error(doc.path, diagram.start + 1, 'diagram', 'the mermaid block is not closed')
  const [declaration, ...body] = diagramLines(doc, diagram)
  if (declaration === undefined) return report.error(doc.path, diagram.start + 1, 'diagram', 'the mermaid block is empty')
  const type = checkDeclaration(doc, declaration, report)
  if (KEYWORD_BLOCKS[type] !== undefined) checkKeywordBlocks(doc, body, KEYWORD_BLOCKS[type], report)
  if (BRACED_TYPES.has(type)) checkBracedBlocks(doc, body, report)
}

const diagramsIn = (doc, heading) => {
  const { start, end } = sectionLines(doc, heading)
  return doc.diagrams.filter(d => d.start >= start && d.start < end)
}

const VIEWS = { Placement: 'where each artifact runs', 'Testing and release': 'what each test level runs against' }

/** docs/README.md shows the system under `## System`, and each architecture index in its `Overview` (WORKFLOW §5.4). */
function checkSystemDiagram (doc, report) {
  const [level, name] = doc.front.type === 'docs-index' ? [2, 'System'] : [3, 'Overview']
  const section = doc.headings.find(h => h.level === level && h.text === name)
  if (section === undefined && doc.front.type === 'docs-index') return report.error(doc.path, 1, 'diagram', 'docs/README.md has no ## System section with the system diagram (WORKFLOW §5.4)')
  if (section !== undefined && diagramsIn(doc, section).length === 0) report.error(doc.path, section.line + 1, 'diagram', `${name} has no diagram of the system (WORKFLOW §5.4)`)
}

const saysSomething = (doc, section) => section !== undefined && (diagramsIn(doc, section).length > 0 || sectionLines(doc, section).lines.join('\n').replace(/<!--[\s\S]*?-->/g, '').trim() !== '')

/** docs/README.md says where each artifact runs and what each test level runs against, in a diagram or a sentence (WORKFLOW §5.4). */
function checkViews (doc, report) {
  for (const name of Object.keys(VIEWS)) {
    const section = sectionOf(doc, 2, name)
    if (!saysSomething(doc, section)) report.warning(doc.path, section === undefined ? 1 : section.line + 1, 'views', `docs/README.md does not say ${VIEWS[name]}: add ## ${name}, a diagram or a sentence (WORKFLOW §5.4)`)
  }
  const testing = sectionOf(doc, 2, 'Testing and release')
  if (saysSomething(doc, testing)) checkLevelsNamed(doc, testing, report)
}

/** `## Testing and release` names each level of `levels` (WORKFLOW §5.4). */
function checkLevelsNamed (doc, testing, report) {
  const { start, end } = sectionLines(doc, testing)
  const text = doc.raw.slice(start, end).join('\n').replace(/<!--[\s\S]*?-->/g, '')
  for (const level of (Array.isArray(doc.front.levels) ? doc.front.levels : []).map(String)) {
    if (!new RegExp(`\\b${level}\\b`, 'i').test(text)) report.warning(doc.path, testing.line + 1, 'views', `## Testing and release does not name the ${level} level and what it runs against (WORKFLOW §5.4)`)
  }
}

/** Each term of the `## Glossary` of docs/README.md is defined once (WORKFLOW §5.5). */
function checkGlossary (doc, report) {
  const glossary = doc.headings.find(h => h.level === 2 && h.text === 'Glossary')
  if (glossary === undefined) return
  const { start, lines } = sectionLines(doc, glossary)
  const seen = new Map()
  lines.forEach((line, i) => {
    const term = /^\|\s*\*\*(.+?)\*\*\s*\|/.exec(line)?.[1].toLowerCase()
    if (term === undefined) return
    if (seen.has(term)) report.error(doc.path, start + i + 1, 'glossary', `'${term}' is already defined at line ${seen.get(term)}`)
    else seen.set(term, start + i + 1)
  })
}

/** A diagram is never normative, so the Specification holds none (WORKFLOW §5.4). */
function checkDiagramPlacement (doc, specification, report) {
  const end = sectionLines(doc, specification).end
  for (const diagram of doc.diagrams.filter(d => d.start > specification.line && d.start < end)) {
    report.error(doc.path, diagram.start + 1, 'diagram', 'a diagram is not normative: it belongs in the Design, not in the Specification (WORKFLOW §5.4)')
  }
}

// ─── Maps ───────────────────────────────────────────────────────────────────

const CLICK = /^click\s+([\w-]+)\s+(?:href\s+)?"([^"]+)"/
const FLOWCHART_STATEMENTS = new Set(['subgraph', 'end', 'click', 'classDef', 'class', 'style', 'linkStyle', 'direction'])
const LINK = /\s*<?(?:-{2,}|={2,}|-\.+-)(?:>|-)?(?:[ox](?=\s))?\s*/
const LINK_TEXT = /(?:--|==|-\.)\s+[^\s>=.-][^>]*?\s+(?:-->|---|==>|===|\.->|\.-)/g

/** The `click` links of a diagram as `{ node, target, path, line }`; `path` is `null` for a URL. */
function clicksOf (doc, diagram) {
  return diagramLines(doc, diagram).flatMap(({ text, line }) => {
    const match = CLICK.exec(text)
    return match === null ? [] : [{ node: match[1], target: match[2], line, path: isUrl(match[2]) ? null : targetPath(doc, match[2]) }]
  })
}

/** A flowchart line without its labels and node shapes: `a[A] -->|x| b((B))` becomes `a --> b`. */
function withoutLabels (text) {
  let bare = text.replace(/"[^"]*"/g, '').replace(/\|[^|]*\|/g, '').replace(/:::[\w-]+/g, '').replace(LINK_TEXT, ' --> ')
  for (let previous = null; previous !== bare;) { previous = bare; bare = bare.replace(/\[[^[\]]*\]|\([^()]*\)|\{[^{}]*\}/g, '') }
  return bare
}

const nodeIds = (segment) => segment.split('&').map(part => /^[\w-]+/.exec(part.trim())?.[0]).filter(Boolean)

/** The edges of a flowchart as node ID pairs, and the subgraph each node is drawn in. */
function flowchartOf (doc, diagram) {
  const edges = []
  const parents = new Map()
  const open = []
  for (const { text } of diagramLines(doc, diagram).slice(1)) {
    const word = firstWord(text)
    if (word === 'subgraph') { const id = nodeIds(text.slice(word.length))[0]; if (id !== undefined) { parents.set(id, open.at(-1)); open.push(id) } continue }
    if (word === 'end') { open.pop(); continue }
    if (FLOWCHART_STATEMENTS.has(word)) continue
    const segments = withoutLabels(text).split(LINK).map(nodeIds)
    for (const id of segments.flat()) if (!parents.has(id)) parents.set(id, open.at(-1))
    segments.forEach((from, i) => { for (const a of from) for (const b of segments[i + 1] ?? []) edges.push([a, b]) })
  }
  return { edges, parents }
}

/** A node and the subgraphs around it. */
function enclosing (node, parents) {
  const chain = []
  for (let at = node; at !== undefined; at = parents.get(at)) chain.push(at)
  return chain
}

function areJoined (flowchart, a, b) {
  const [upA, upB] = [enclosing(a, flowchart.parents), enclosing(b, flowchart.parents)]
  return flowchart.edges.some(([x, y]) => (upA.includes(x) && upB.includes(y)) || (upA.includes(y) && upB.includes(x)))
}

const sectionOf = (doc, level, name) => doc.headings.find(h => h.level === level && h.text === name)

/** The diagrams of a document that belong to the map (WORKFLOW §5.4). */
function mapDiagramsOf (doc) {
  const names = { 'docs-index': [2, ['System', 'Placement', 'Testing and release']], 'architecture-index': [3, ['Overview']], architecture: [3, ['Role']] }[doc.front?.type]
  if (names === undefined) return []
  return names[1].map(name => sectionOf(doc, names[0], name)).filter(Boolean).flatMap(heading => diagramsIn(doc, heading))
}

/** The clicks of a map diagram whose node the diagram draws. */
function drawnClicks (doc, diagram) {
  const clicks = clicksOf(doc, diagram)
  if (!isFlowchart(doc, diagram)) return clicks
  const { parents } = flowchartOf(doc, diagram)
  return clicks.filter(click => parents.has(click.node))
}

/** The paths of the documents reached from `start` through the `click` links of the map's diagrams, `start` included. */
function reachedFrom (start, docs) {
  const reached = new Set()
  const pending = [start]
  while (pending.length > 0) {
    const path = pending.pop()
    const doc = docs.find(d => d.path === path)
    if (doc === undefined || reached.has(path)) continue
    reached.add(path)
    pending.push(...mapDiagramsOf(doc).flatMap(d => drawnClicks(doc, d)).map(click => click.path).filter(Boolean))
  }
  return reached
}

/** The diagrams that map documents (WORKFLOW §5.4): the system diagram, each index's Overview, and each Role that links documents. */
function mapsOf (docs) {
  const system = docs.filter(d => d.front?.type === 'docs-index').map(doc => ({ doc, name: 'system', heading: sectionOf(doc, 2, 'System') }))
  const overviews = docs.filter(d => d.front?.type === 'architecture-index' && conforms(d)).map(doc => ({ doc, name: 'Overview', heading: sectionOf(doc, 3, 'Overview') }))
  const roles = docs.filter(d => d.front?.type === 'architecture' && conforms(d)).map(doc => ({ doc, name: 'Role', heading: sectionOf(doc, 3, 'Role') }))
  return [...system, ...overviews, ...roles].filter(map => map.heading !== undefined)
    .map(map => ({ ...map, diagrams: diagramsIn(map.doc, map.heading).filter(d => map.name !== 'Role' || drawnClicks(map.doc, d).length > 0) }))
    .filter(map => map.diagrams.length > 0)
}

/** Every top-level document and index is reached from docs/README.md (WORKFLOW §5.4). */
function checkReached (docs, report) {
  const members = docs.filter(d => conforms(d) && (d.front.type === 'architecture-index' || d.index === undefined))
  for (const index of docs.filter(d => d.front?.type === 'docs-index')) {
    const reached = reachedFrom(index.path, docs)
    const at = sectionOf(index, 2, 'System')
    for (const member of members.filter(m => !reached.has(m.path))) {
      report.warning(index.path, (at?.line ?? 0) + 1, 'map', `${relative(dirname(index.path), member.path)} is not on the map: no chain of click links from docs/README.md reaches it (WORKFLOW §5.4)`)
    }
  }
}

/** Every document of a directory is on the Overview of its index (WORKFLOW §5.4). */
function checkOverviewMembers (map, docs, report) {
  const linked = new Set(map.diagrams.flatMap(d => drawnClicks(map.doc, d)).map(click => click.path))
  for (const member of docs.filter(d => d.index === map.doc && conforms(d) && !linked.has(d.path))) {
    report.warning(map.doc.path, map.heading.line + 1, 'map', `${relative(dirname(map.doc.path), member.path)} is not on the Overview diagram: no node links to it (WORKFLOW §5.4)`)
  }
}

/** Each scenario with the documents it spans: its own, and those of the statements it names, by path. */
function scenarioSpans (useCases, statements) {
  return [...useCases.values()].filter(u => isScenario(u.id)).map(scenario => {
    const docs = new Set([...(isArchitecture(scenario.doc) ? [scenario.doc] : []), ...scenario.named.map(id => statements.get(id)?.doc).filter(Boolean)])
    return { id: scenario.id, docs: [...docs].sort((a, b) => a.path.localeCompare(b.path)) }
  })
}

const pairsOf = (list) => list.flatMap((a, i) => list.slice(i + 1).map(b => [a, b]))

function checkMapEdges (map, diagram, spans, docs, report) {
  const clicks = clicksOf(map.doc, diagram).filter(c => c.path !== null)
  const leadsTo = (click, doc) => reachedFrom(click.path, docs).has(doc.path)
  const nodeOf = (doc) => (clicks.find(c => c.path === doc.path) ?? clicks.find(c => c.path === doc.index?.path) ?? clicks.find(c => leadsTo(c, doc)))?.node
  const flowchart = flowchartOf(map.doc, diagram)
  const reported = new Set()
  for (const { id, docs } of spans) {
    for (const [a, b] of pairsOf(docs)) {
      const [nodeA, nodeB] = [nodeOf(a), nodeOf(b)]
      const key = [nodeA, nodeB].sort().join(' ')
      if (nodeA === undefined || nodeB === undefined || nodeA === nodeB || reported.has(key) || areJoined(flowchart, nodeA, nodeB)) continue
      reported.add(key)
      const name = (doc) => relative(dirname(map.doc.path), doc.path)
      report.warning(map.doc.path, diagram.start + 1, 'map', `scenario ${id} joins ${name(a)} and ${name(b)}, and the ${map.name} diagram has no edge between ${nodeA} and ${nodeB}`)
    }
  }
}

const isFlowchart = (doc, diagram) => ['flowchart', 'graph'].includes(firstWord(diagramLines(doc, diagram)[0]?.text ?? ''))

/** Every document is on its map, and two documents a scenario joins are joined on it (WORKFLOW §5.4). */
function checkMaps (docs, useCases, statements, report) {
  const spans = scenarioSpans(useCases, statements)
  checkReached(docs, report)
  for (const map of mapsOf(docs)) {
    if (map.name === 'Overview') checkOverviewMembers(map, docs, report)
    for (const diagram of map.diagrams.filter(d => isFlowchart(map.doc, d))) checkMapEdges(map, diagram, spans, docs, report)
  }
}

// ─── MAP.md ─────────────────────────────────────────────────────────────────

const MAP_FILE = 'MAP.md'
const compareIds = (a, b) => a.localeCompare(b, 'en', { numeric: true })
const byPath = (a, b) => a.path.localeCompare(b.path)
const mermaidText = (text) => `"${String(text).replace(/"/g, '#quot;')}"`
const tableCell = (text) => text.replace(/\|/g, '\\|')
const fenced = (lines) => ['```mermaid', ...lines, '```']

/** The cells of a table row, by the names of its table's header row. */
function rowCells (doc, line) {
  let header = line
  while (header > 0 && doc.lines[header - 1].startsWith('|')) header--
  const cells = (i) => doc.lines[i].trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim())
  const values = cells(line)
  return Object.fromEntries(cells(header).map((name, i) => [name, values[i] ?? '']))
}

/** The use cases defined by table rows, as `{ id, doc, name, actors }`, by document and ID. */
function useCaseRows (useCases) {
  return [...useCases.values()].filter(u => !isScenario(u.id) && u.doc.lines[u.line].startsWith('|')).map(u => {
    const cells = rowCells(u.doc, u.line)
    return { id: u.id, doc: u.doc, name: cells['Use case'] || u.id, actors: (cells.Actors ?? '').split(',').map(a => a.trim()).filter(Boolean) }
  }).sort((a, b) => byPath(a.doc, b.doc) || compareIds(a.id, b.id))
}

function actorDiagram (actor, rows, link) {
  const docs = [...new Set(rows.map(r => r.doc))]
  return fenced([
    'flowchart LR',
    `  actor[${mermaidText(actor)}]`,
    ...docs.flatMap((doc, i) => [`  subgraph doc${i + 1} [${mermaidText(doc.front.title ?? 'Flows')}]`, ...rows.filter(r => r.doc === doc).map(r => `    ${r.id}([${mermaidText(r.name)}])`), '  end']),
    `  actor --- ${rows.map(r => r.id).join(' & ')}`,
    ...rows.map(r => `  click ${r.id} "${link(r.doc)}"`)
  ])
}

function useCasesByActor (useCases, link) {
  const rows = useCaseRows(useCases)
  const actors = [...new Set(rows.flatMap(r => r.actors))].sort((a, b) => a.localeCompare(b))
  if (actors.length === 0) return ['No use case names an actor.', '']
  return actors.flatMap(actor => [`### ${actor}`, '', ...actorDiagram(actor, rows.filter(r => r.actors.includes(actor)), link), ''])
}

function statementTable (statements, useCases, link) {
  const namedBy = (id) => [...useCases.values()].filter(u => u.named.includes(id)).map(u => u.id).sort(compareIds)
  const rows = [...statements.values()].filter(s => s.state !== 'removed').sort((a, b) => compareIds(a.id, b.id)).map(s => {
    const title = tableCell(`${s.id} · ${s.title}${s.state === 'new' ? ' (new)' : ''}`)
    return `| ${title} | ${s.levels.join(', ')} | ${namedBy(s.id).join(', ') || '—'} | [${link(s.doc)}](${encodeURI(link(s.doc))}) |`
  })
  return rows.length === 0 ? ['None.', ''] : ['| Statement | Levels | Named by | Document |', '| :-- | :-- | :-- | :-- |', ...rows, '']
}

const hasLevelGap = (statement) => statement.state === 'current' && (statement.wanted.length > 0 || statement.test?.kind !== 'files')

function levelCell (statement, level) {
  if (statement.wanted.includes(level)) return 'wanted'
  if (!statement.levels.includes(level)) return ''
  return statement.test?.kind === 'files' ? 'required' : 'unverified'
}

/** The statements below the levels that apply to them, against every level of the project (WORKFLOW §5.7). */
function levelTable (statements, levels, link) {
  const rows = [...statements.values()].filter(hasLevelGap).sort((a, b) => compareIds(a.id, b.id)).map(s =>
    `| ${tableCell(`${s.id} · ${s.title}`)} | ${levels.map(level => levelCell(s, level)).join(' | ')} | [${link(s.doc)}](${encodeURI(link(s.doc))}) |`)
  if (rows.length === 0) return ['None.', '']
  return [`| Statement | ${levels.join(' | ')} | Document |`, `| :-- | ${levels.map(() => ':--').join(' | ')} | :-- |`, ...rows, '']
}

/** Pairs of documents with the scenarios that join them, by path. */
function joinedDocuments (spans) {
  const joined = new Map()
  for (const { id, docs } of spans) {
    for (const [a, b] of pairsOf(docs)) {
      const key = `${a.path}\0${b.path}`
      if (!joined.has(key)) joined.set(key, { a, b, scenarios: [] })
      joined.get(key).scenarios.push(id)
    }
  }
  return [...joined.values()].sort((x, y) => byPath(x.a, y.a) || byPath(x.b, y.b))
}

function collaborationDiagram (spans, link) {
  const joined = joinedDocuments(spans)
  if (joined.length === 0) return ['No scenario spans two documents.', '']
  const docs = [...new Set(joined.flatMap(j => [j.a, j.b]))].sort(byPath)
  const node = (doc) => `doc${docs.indexOf(doc) + 1}`
  return [...fenced([
    'flowchart LR',
    ...docs.map(doc => `  ${node(doc)}[${mermaidText(doc.front.title)}]`),
    ...joined.map(j => `  ${node(j.a)} ---|${j.scenarios.sort(compareIds).join(', ')}| ${node(j.b)}`),
    ...docs.map(doc => `  click ${node(doc)} "${link(doc)}"`)
  ]), '']
}

/** docs/MAP.md, generated from the analysis of `docsDir` (WORKFLOW §5.7). */
function renderMap ({ statements, useCases, levels }, docsDir) {
  const link = (doc) => relative(docsDir, doc.path).split(sep).join('/')
  return [
    '---', 'type: map', '---', '', '# Map', '',
    '<!-- Generated by node docs/tools/map.mjs docs. Do not edit: check-docs reports a stale map (WORKFLOW §5.7). -->', '',
    '## Use cases by actor', '', ...useCasesByActor(useCases, link),
    '## Statements', '', ...statementTable(statements, useCases, link),
    '## Levels', '', ...levelTable(statements, levels, link),
    '## Collaboration', '', ...collaborationDiagram(scenarioSpans(useCases, statements), link)
  ].join('\n')
}

/** A committed MAP.md is what map.mjs writes (WORKFLOW §5.7). */
function checkMapFile (docs, docsDir, analysis, report) {
  const map = docs.find(d => d.path === join(docsDir, MAP_FILE))
  if (map !== undefined && map.raw.join('\n') !== renderMap(analysis, docsDir)) report.error(map.path, 1, 'map', `${MAP_FILE} is stale: run node docs/tools/map.mjs docs (WORKFLOW §5.7)`)
}

// ─── IDs ────────────────────────────────────────────────────────────────────

const idPattern = (prefixes) => `(?:${[...prefixes].sort((a, b) => b.length - a.length).join('|')})[${CATEGORIES}]\\d+[a-z]?`
const baseId = (id) => id.replace(/[a-z]$/, '')

function registerRange (doc) {
  const register = doc.headings.find(h => h.level === 3 && h.text === 'Register')
  return register === undefined ? null : sectionLines(doc, register)
}

const inRange = (range, i) => range !== null && i >= range.start && i < range.end

/** The entries `doc` defines, as `{ id, line }`: a table row or a bold paragraph starting with the ID, outside the register (WORKFLOW §5.3). */
function definitionsIn (doc, prefixes) {
  if (prefixes.size === 0) return []
  const pattern = idPattern(prefixes)
  const row = new RegExp(`^\\|\\s*(${pattern})\\s*\\|`)
  const bold = new RegExp(`^(?:- )?\\*\\*(${pattern})[.,:\\s]`)
  const register = registerRange(doc)
  return doc.lines.flatMap((line, i) => {
    const id = inRange(register, i) ? undefined : (row.exec(line) ?? bold.exec(line))?.[1]
    return id === undefined ? [] : [{ id, line: i }]
  })
}

function collectDefinitions (doc, prefixes, report, definitions) {
  for (const { id, line } of definitionsIn(doc, prefixes)) {
    if (definitions.has(id)) report.error(doc.path, line + 1, 'id', `${id} is already defined at ${definitions.get(id).where}`)
    else definitions.set(id, { doc, line, where: `${relative(dirname(doc.path), doc.path)}:${line + 1}` })
  }
}

/** Register rows are checked by checkRegister, so the mention scan skips them. */
function checkMentions (doc, pattern, known, rule, report) {
  const register = registerRange(doc)
  const lines = doc.references.map((line, i) => (inRange(register, i) ? '' : line))
  scanReferences(doc.path, lines, pattern, id => (known(id) ? null : 'is not defined'), rule, report)
}

/** Reports each token of `pattern` in `lines` for which `problemOf` returns a problem. */
function scanReferences (path, lines, pattern, problemOf, rule, report) {
  const regex = new RegExp(`(?<![A-Za-z0-9-])(${pattern})(?![A-Za-z0-9])`, 'g')
  lines.forEach((line, i) => {
    for (const [, id] of line.matchAll(regex)) {
      const problem = problemOf(id)
      if (problem !== null) report.error(path, i + 1, rule, `${id} ${problem}`)
    }
  })
}

function checkRegister (index, members, definitions, report) {
  const range = registerRange(index)
  if (range === null) return
  const listed = new Map()
  const row = new RegExp(`^\\|\\s*([A-Z]+[${CATEGORIES}]\\d+)\\s*\\|`)
  range.lines.forEach((line, i) => { const id = row.exec(line)?.[1]; if (id !== undefined) listed.set(id, range.start + i) })
  const inDirectory = new Set([...definitions].filter(([, d]) => members.includes(d.doc)).map(([id]) => baseId(id)))
  for (const id of inDirectory) if (!listed.has(id)) report.error(index.path, range.start, 'register', `${id} is defined but not in the register`)
  for (const [id, line] of listed) if (!inDirectory.has(id)) report.error(index.path, line + 1, 'register', `${id} is in the register but not defined`)
}

// ─── Links ──────────────────────────────────────────────────────────────────

/** GitHub-style heading anchor. */
function slug (text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')
}

function anchorsOf (path, cache) {
  if (!cache.has(path)) {
    const counts = new Map()
    const anchors = new Set()
    for (const h of parseHeadings(withoutFences(readFileSync(path, 'utf-8').split('\n')))) {
      const base = slug(h.text.replace(/`/g, ''))
      const n = counts.get(base) ?? 0
      anchors.add(n === 0 ? base : `${base}-${n}`)
      counts.set(base, n + 1)
    }
    cache.set(path, anchors)
  }
  return cache.get(path)
}

const isUrl = (target) => /^[a-z]+:/i.test(target)

/** The file a relative link of `doc` points to. */
function targetPath (doc, target) {
  const file = target.split('#')[0]
  return file === '' ? doc.path : resolve(dirname(doc.path), decodeURI(file))
}

function checkTarget (doc, target, line, cache, report) {
  if (isUrl(target)) return
  const path = targetPath(doc, target)
  const anchor = target.split('#')[1]
  if (!existsSync(path)) report.error(doc.path, line + 1, 'link', `${target} does not exist`)
  else if (anchor !== undefined && path.endsWith('.md') && !anchorsOf(path, cache).has(anchor)) report.error(doc.path, line + 1, 'link', `${target}: no heading with anchor #${anchor}`)
}

/** Markdown links, and the `click` links of diagrams, resolve (WORKFLOW §5.4, §9). */
function checkLinks (doc, cache, report) {
  const link = /\[[^\]]*\]\((?:<([^<>\n]+)>|([^)\s]+))\)/g
  doc.lines.forEach((line, i) => {
    for (const [, bracketed, bare] of line.replace(/`[^`]*`/g, '').matchAll(link)) checkTarget(doc, bracketed ?? bare, i, cache, report)
  })
  for (const click of doc.diagrams.flatMap(d => clicksOf(doc, d))) checkTarget(doc, click.target, click.line, cache, report)
}

// ─── Git ────────────────────────────────────────────────────────────────────

function gitSucceeds (args, cwd) {
  try {
    execFileSync('git', args, { cwd, stdio: 'ignore' })
    return true
  } catch { return false }
}

/** 'unknown', 'outside' the history of HEAD, or 'ancestor' of it. */
function commitPlace (hash, cwd) {
  if (!gitSucceeds(['cat-file', '-e', `${hash}^{commit}`], cwd)) return 'unknown'
  return gitSucceeds(['merge-base', '--is-ancestor', hash, 'HEAD'], cwd) ? 'ancestor' : 'outside'
}

function checkCommits (doc, report) {
  for (const hash of Array.isArray(doc.front.commits) ? doc.front.commits : []) {
    const place = commitPlace(String(hash), dirname(doc.path))
    if (place === 'unknown') report.error(doc.path, 1, 'rfc', `commit ${hash} is not known to git`)
    if (place === 'outside') report.error(doc.path, 1, 'rfc', `commit ${hash} is not in the history of HEAD: squashed or rebased? (WORKFLOW §8.3)`)
  }
}

/** Every RFC is listed in the `rfc-index` of its own directory (§3). */
function checkRfcIndex (docs, report) {
  const indexes = docs.filter(d => d.front?.type === 'rfc-index')
  for (const rfc of docs.filter(d => d.front?.type === 'rfc')) {
    const index = indexes.find(i => dirname(i.path) === dirname(rfc.path))
    if (index === undefined) report.error(rfc.path, 1, 'rfc', 'README.md with type rfc-index is missing in this directory')
    else if (!index.lines.join('\n').includes(`(${basename(rfc.path)})`)) report.error(index.path, 1, 'rfc', `${basename(rfc.path)} is not listed`)
  }
}

/** RFC numbers are one sequence across every RFC directory of the project (§3). */
function checkRfcNumbers (docs, report) {
  const seen = new Map()
  for (const rfc of docs.filter(d => d.front?.type === 'rfc' && Number.isInteger(d.front.number))) {
    const other = seen.get(rfc.front.number)
    if (other === undefined) seen.set(rfc.front.number, rfc)
    else report.warning(rfc.path, 1, 'rfc', `number ${rfc.front.number} is also used by ${relative(dirname(rfc.path), other.path)}`)
  }
}

// ─── Orchestration ──────────────────────────────────────────────────────────

/** Attaches each directory document to its index, so it can inherit the prefix. */
function linkIndexes (docs) {
  const indexes = docs.filter(d => d.front?.type === 'architecture-index')
  for (const doc of docs) {
    if (doc.front?.type !== 'architecture') continue
    doc.index = indexes.find(i => dirname(i.path) === dirname(doc.path))
  }
  return indexes
}

const prefixOf = (doc) => doc.front?.prefix ?? doc.index?.front?.prefix
const isArchitecture = (doc) => doc.front?.type === 'architecture' || doc.front?.type === 'architecture-index'
const conforms = (doc) => isArchitecture(doc) && doc.front.conforms !== false
const hasCheckedDiagrams = (doc) => doc.front !== null && doc.front.type !== 'workflow' && !(isArchitecture(doc) && !conforms(doc))

/** Statements of the conforming documents, by ID: `{ id, doc, line, state, test }`. */
function checkArchitecture (docs, context, report) {
  const statements = new Map()
  for (const doc of docs.filter(conforms)) {
    const parts = checkStructure(doc, report)
    if (parts.Specification === undefined) continue
    checkDiagramPlacement(doc, parts.Specification, report)
    if (doc.front.type === 'architecture-index') checkSystemDiagram(doc, report)
    for (const s of checkSpecification(doc, parts.Specification, context, report)) {
      if (statements.has(s.id)) report.error(doc.path, s.line + 1, 'statement', `${s.id} is already defined in ${relative(dirname(doc.path), statements.get(s.id).doc.path)}`)
      else statements.set(s.id, s)
    }
  }
  for (const doc of docs.filter(d => isArchitecture(d) && !conforms(d))) report.warning(doc.path, 1, 'conforms', 'not yet restructured (conforms: false)')
  return statements
}

/** The documents that define entries: the conforming architecture documents, and docs/README.md for its flows (WORKFLOW §5.4). */
const definesEntries = (doc) => conforms(doc) || doc.front?.type === 'docs-index'

/** docs/README.md defines only the entries of its own prefix; an architecture document, those of every prefix. */
const definingPrefixes = (doc, prefixes) => (doc.front.type === 'docs-index' ? new Set([doc.front.prefix].filter(Boolean)) : prefixes)

function checkIds (docs, statements, report) {
  const prefixes = new Set(docs.filter(definesEntries).map(prefixOf).filter(p => p !== undefined))
  const definitions = new Map()
  for (const doc of docs.filter(definesEntries)) collectDefinitions(doc, definingPrefixes(doc, prefixes), report, definitions)
  for (const index of docs.filter(d => d.front?.type === 'architecture-index' && conforms(d))) {
    checkRegister(index, docs.filter(d => d.index === index || d === index), definitions, report)
  }
  const codes = [...new Set([...statements.keys()].map(id => id.split('-')[0]))]
  const scanned = docs.filter(d => d.front?.type !== 'workflow')
  for (const doc of scanned) {
    if (prefixes.size > 0) checkMentions(doc, idPattern(prefixes), id => isDefined(definitions, id), 'id', report)
    if (codes.length > 0) checkMentions(doc, `(?:${codes.join('|')})-\\d+`, id => statements.has(id), 'statement', report)
  }
  const useCases = collectUseCases(definitions, codes)
  checkUseCases(useCases, statements, report)
  return { prefixes, definitions, useCases }
}

const isDefined = (definitions, id) => definitions.has(id) || definitions.has(baseId(id))

// ─── Use cases ──────────────────────────────────────────────────────────────

const isUseCase = (id) => /J\d+[a-z]?$/.test(id)
const isScenario = (id) => /[a-z]$/.test(id)

/** The lines that name an entry's statements: its table row, or its paragraph and its diagrams up to the next entry or heading. */
function entryLines (doc, line, starts) {
  if (doc.lines[line].startsWith('|')) return [doc.lines[line]]
  const end = Math.min(doc.headings.find(h => h.line > line)?.line ?? doc.lines.length, ...starts.filter(s => s > line))
  const blank = doc.lines.findIndex((l, i) => i > line && l.trim() === '')
  const paragraph = doc.lines.slice(line, blank < 0 ? end : Math.min(blank, end))
  const diagrams = doc.diagrams.filter(d => d.start > line && d.start < end).flatMap(d => doc.raw.slice(d.start + 1, d.end))
  return [...paragraph, ...diagrams]
}

function namedStatements (lines, codes) {
  if (codes.length === 0) return []
  const regex = new RegExp(`(?<![A-Za-z0-9-])((?:${codes.join('|')})-\\d+)(?![A-Za-z0-9])`, 'g')
  return [...new Set(lines.flatMap(line => [...line.matchAll(regex)].map(m => m[1])))]
}

/**
 * Use cases and scenarios as `{ id, doc, line, named, statements }`, by ID: `named` are the statements of the
 * entry itself, and `statements` those of a use case together with its scenarios (WORKFLOW §5.4).
 */
function collectUseCases (definitions, codes) {
  const starts = (doc) => [...definitions.values()].filter(d => d.doc === doc).map(d => d.line)
  const entry = (id, d) => {
    const named = namedStatements(entryLines(d.doc, d.line, starts(d.doc)), codes)
    return [id, { id, doc: d.doc, line: d.line, named, statements: named }]
  }
  const useCases = new Map([...definitions].filter(([id]) => isUseCase(id)).map(([id, d]) => entry(id, d)))
  for (const scenario of [...useCases.values()].filter(u => isScenario(u.id))) {
    const useCase = useCases.get(baseId(scenario.id))
    if (useCase !== undefined) useCase.statements = [...new Set([...useCase.statements, ...scenario.statements])]
  }
  return useCases
}

/** The current statements verified at one of `levels` that no scenario names (WORKFLOW §5.4). */
function statementsWithoutScenario (statements, useCases, levels) {
  if (levels === null) return []
  const named = new Set([...useCases.values()].filter(u => isScenario(u.id)).flatMap(u => u.named))
  return [...statements.values()].filter(s => s.state === 'current' && s.levels.some(l => levels.includes(l)) && !named.has(s.id))
}

function checkScenarioCoverage (statements, useCases, levels, report) {
  const missing = statementsWithoutScenario(statements, useCases, levels)
  for (const s of missing) report.error(s.doc.path, s.line + 1, 'use-case', `${s.id} is verified at ${s.levels.filter(l => levels.includes(l)).join(', ')}, and no scenario names it`)
  return missing.map(s => s.id)
}

/** Each use case and scenario names a statement and no removed one, and a scenario's use case is defined. */
function checkUseCases (useCases, statements, report) {
  for (const entry of useCases.values()) {
    const at = [entry.doc.path, entry.line + 1, 'use-case']
    if (isScenario(entry.id) && !useCases.has(baseId(entry.id))) report.error(...at, `${entry.id} is a scenario of ${baseId(entry.id)}, which is not defined`)
    if (entry.statements.length === 0) report.error(...at, `${entry.id} names no statement`)
    for (const id of entry.named.filter(id => statements.get(id)?.state === 'removed')) report.error(...at, `${entry.id} names ${id}, which is removed`)
  }
}

// ─── Review ─────────────────────────────────────────────────────────────────

const collapse = (lines) => lines.join(' ').replace(/\s+/g, ' ').trim()
const isProgressLine = (line) => /^- (Test|State):/.test(line)

/** The item a heading starts: a statement with its heading line, or the prose of a section, keyed by its heading. */
function headingOwner (heading, seen) {
  const statement = heading.level === 4 ? STATEMENT_HEADING.exec(heading.text) : null
  if (statement !== null) return { key: `${statement[2]}-${statement[3]}`, kind: 'statement', line: heading.line }
  const count = (seen.get(heading.text) ?? 0) + 1
  seen.set(heading.text, count)
  return { key: count === 1 ? heading.text : `${heading.text} (${count})`, kind: 'section', line: heading.line }
}

/** The item each raw line of `doc` belongs to; `null` for front matter, section headings and the register. */
function lineOwners (doc, definitions) {
  const headings = new Map(doc.headings.map(h => [h.line, h]))
  const register = registerRange(doc)
  const seen = new Map()
  let section = null
  let entry = null
  return doc.raw.map((text, i) => {
    if (headings.has(i)) { section = headingOwner(headings.get(i), seen); entry = null; return section.kind === 'statement' ? section : null }
    if (definitions.has(i)) entry = { key: definitions.get(i), kind: 'entry', line: i, row: doc.lines[i].startsWith('|') }
    const owner = inRange(register, i) ? null : entry ?? section
    if (entry?.row) entry = null
    return owner
  })
}

const itemText = (item) => collapse(item.lines.filter(line => item.kind !== 'statement' || !isProgressLine(line)))
const isEmptyItem = (item) => item.text === '' || item.text === 'None.'

/**
 * The reviewable items of `doc` by key, in document order: each statement without its `Test:` and `State:`
 * lines, each Design entry, and the prose of each section outside them (WORKFLOW §5.6).
 */
function documentItems (doc, prefix) {
  const items = new Map()
  lineOwners(doc, definitionLines(doc, prefix)).forEach((owner, i) => {
    if (owner === null) return
    if (!items.has(owner.key)) items.set(owner.key, { key: owner.key, kind: owner.kind, line: owner.line, lines: [] })
    items.get(owner.key).lines.push(doc.raw[i])
  })
  return new Map([...items].map(([key, item]) => [key, { ...item, text: itemText(item) }]).filter(([, item]) => !isEmptyItem(item)))
}

/** The ID defined on each line of `doc` that defines one. */
const definitionLines = (doc, prefix) => new Map(definitionsIn(doc, new Set(prefix === undefined ? [] : [prefix])).map(d => [d.line, d.id]))

/** The key of the item each raw line of `doc` belongs to, or `null`. */
const lineItems = (doc) => lineOwners(doc, definitionLines(doc, prefixOf(doc))).map(owner => owner?.key ?? null)

/** The items added, changed or removed from `before` to `after`, as `{ key, kind, change, before, after }`. */
function itemChanges (before, after) {
  const kept = [...after.values()].flatMap(item => {
    const old = before.get(item.key)
    if (old === undefined) return [{ key: item.key, kind: item.kind, change: 'added', before: null, after: item }]
    return old.text === item.text ? [] : [{ key: item.key, kind: item.kind, change: 'changed', before: old, after: item }]
  })
  const removed = [...before.values()].filter(item => !after.has(item.key)).map(item => ({ key: item.key, kind: item.kind, change: 'removed', before: item, after: null }))
  return [...kept, ...removed]
}

/** `doc` as it was at `commit`; `null` when it did not exist there. */
function documentAt (doc, commit) {
  try {
    const text = execFileSync('git', ['show', `${commit}:./${basename(doc.path)}`], { cwd: dirname(doc.path), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 })
    return readDocument(doc.path, text)
  } catch { return null }
}

/** What changed in `doc` since `commit`, item by item. */
function changesSince (doc, commit) {
  const before = commit === null ? null : documentAt(doc, commit)
  return itemChanges(before === null ? new Map() : documentItems(before, prefixOf(doc)), documentItems(doc, prefixOf(doc)))
}

/** The document's review as `{ path, reviewed, changed }`: `changed` are the items changed since `reviewed` (WORKFLOW §5.6). */
function checkReviewed (doc, report) {
  const reviewed = doc.front.reviewed === undefined ? null : String(doc.front.reviewed)
  if (reviewed === null) return { path: doc.path, reviewed, changed: [] }
  const place = commitPlace(reviewed, dirname(doc.path))
  if (place !== 'ancestor') {
    report.error(doc.path, 1, 'front-matter', `reviewed ${reviewed} ${place === 'unknown' ? 'is not known to git' : 'is not in the history of HEAD'}`)
    return { path: doc.path, reviewed, changed: [] }
  }
  const changed = changesSince(doc, reviewed).map(c => c.key)
  if (changed.length > 0) report.warning(doc.path, 1, 'reviewed', `${changed.length} item(s) changed since the review at ${reviewed}: ${changed.join(', ')}`)
  return { path: doc.path, reviewed, changed }
}

// ─── References from code ───────────────────────────────────────────────────

const isDirectory = (path) => existsSync(path) && statSync(path).isDirectory()

/** The `sources` of docs/README.md (WORKFLOW §6.4) that exist; reports the rest. */
function sourcesOf (docs, root, report) {
  const index = docs.find(d => d.front?.type === 'docs-index')
  const sources = index?.front?.sources
  if (sources === undefined) return []
  if (!Array.isArray(sources) || sources.some(s => typeof s !== 'string')) {
    report.error(index.path, 1, 'front-matter', 'sources must be a list of directories')
    return []
  }
  for (const source of sources.filter(s => !isDirectory(join(root, s)))) report.error(index.path, 1, 'front-matter', `source directory ${source} does not exist`)
  return sources.filter(s => isDirectory(join(root, s)))
}

/** Files git tracks under `sources`, outside `docs/`; `null` outside a git repository. */
function trackedFiles (root, sources, docsDir) {
  try {
    const listed = execFileSync('git', ['ls-files', '-z', '--', ...sources], { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 })
    const docs = `${relative(root, docsDir)}/`
    return listed.split('\0').filter(file => file !== '' && !file.startsWith(docs))
  } catch { return null }
}

/** The text of a file, or `null` for a binary one. */
function readText (path) {
  const content = readFileSync(path)
  return content.includes(0) ? null : content.toString('utf-8')
}

function statementProblem (statements, id) {
  if (!statements.has(id)) return 'is not defined'
  return statements.get(id).state === 'removed' ? 'is removed' : null
}

/** Every ID and statement a tracked source file refers to resolves, and no statement is removed. */
function checkSourceReferences (root, docsDir, sources, ids, report) {
  if (sources.length === 0) return
  const files = trackedFiles(root, sources, docsDir)
  if (files === null) return report.error(docsDir, 1, 'reference', `sources are read with git, and ${root} is not a git repository`)
  const patterns = [
    ids.prefixes.size > 0 && [idPattern(ids.prefixes), id => (isDefined(ids.definitions, id) ? null : 'is not defined')],
    ids.codes.size > 0 && [`(?:${[...ids.codes].join('|')})-\\d+`, id => statementProblem(ids.statements, id)]
  ].filter(Boolean)
  for (const file of files) {
    const path = join(root, file)
    const text = isFile(path) ? readText(path) : null
    if (text !== null) for (const [pattern, problemOf] of patterns) scanReferences(path, text.split('\n'), pattern, problemOf, 'reference', report)
  }
}

/** Each item of `changes` is `<statement> <kind>`, naming a defined statement (WORKFLOW §11.3). */
function checkChanges (doc, statements, report) {
  if (doc.front.changes === undefined) return
  if (!Array.isArray(doc.front.changes)) return report.error(doc.path, 1, 'rfc', 'changes must be a list')
  for (const item of doc.front.changes) {
    const match = CHANGE.exec(String(item))
    if (match === null || !CHANGE_KINDS.includes(match[2])) report.error(doc.path, 1, 'rfc', `change '${item}' is not '<statement> <${CHANGE_KINDS.join('|')}>'`)
    else if (!statements.has(match[1])) report.error(doc.path, 1, 'rfc', `change ${match[1]} names no defined statement`)
  }
}

const isVerification = (id) => /S\d+[a-z]?$/.test(id)

/** Each item of `audit` is a defined Verification entry; an implemented RFC from `audit-from` on has one (WORKFLOW §8.2). */
function checkAudit (doc, definitions, from, report) {
  const audit = doc.front.audit
  if (audit !== undefined && !Array.isArray(audit)) return report.error(doc.path, 1, 'rfc', 'audit must be a list')
  for (const id of (audit ?? []).map(String)) {
    if (!isDefined(definitions, id)) report.error(doc.path, 1, 'rfc', `audit ${id} is not defined`)
    else if (!isVerification(id)) report.error(doc.path, 1, 'rfc', `audit ${id} is not a Verification entry`)
  }
  const required = from !== null && doc.front.status === 'implemented' && doc.front.number >= from
  if (required && (audit ?? []).length === 0) report.error(doc.path, 1, 'rfc', 'an implemented RFC names its falsification audit in audit (WORKFLOW §8.2)')
}

function checkRfc (doc, context, report) {
  if (doc.front.sections !== 'legacy') { checkRfcSections(doc, report); checkRfcCritique(doc, report) }
  checkChanges(doc, context.statements, report)
  checkAudit(doc, context.definitions, context.auditFrom, report)
  checkCommits(doc, report)
}

/** Statement codes declared by conforming documents, and by those not restructured yet. */
function declaredCodes (docs) {
  const codesOf = (list) => new Set(list.flatMap(d => Array.isArray(d.front.codes) ? d.front.codes : []))
  return { conforming: codesOf(docs.filter(conforms)), other: codesOf(docs.filter(d => isArchitecture(d) && !conforms(d))) }
}

/** Checks `docsDir`, whose parent is the repository root; returns the report, statements and codes. */
function analyze (docsDirArg) {
  const docsDir = resolve(docsDirArg)
  const report = createReport()
  const docs = listMarkdown(docsDir).map(path => readDocument(path))
  linkIndexes(docs)
  for (const doc of docs) checkFrontMatter(doc, report)
  checkUniqueDeclarations(docs, report)
  checkWorkflowVersion(docs, report)
  const root = dirname(docsDir)
  const levels = declaredLevels(docs, report)
  const statements = checkArchitecture(docs, { root, levels }, report)
  const { prefixes, definitions, useCases } = checkIds(docs, statements, report)
  const declaredScenarioLevels = scenarioLevels(docs, levels, report)
  const withoutScenario = checkScenarioCoverage(statements, useCases, declaredScenarioLevels, report)
  for (const index of docs.filter(d => d.front?.type === 'docs-index')) { checkSystemDiagram(index, report); checkViews(index, report); checkGlossary(index, report) }
  const codes = declaredCodes(docs)
  checkSourceReferences(root, docsDir, sourcesOf(docs, root, report), { prefixes, definitions, statements, codes: codes.conforming }, report)
  const rfcContext = { statements, definitions, auditFrom: auditFrom(docs, report) }
  for (const doc of docs.filter(d => d.front?.type === 'rfc')) checkRfc(doc, rfcContext, report)
  checkRfcIndex(docs, report)
  checkRfcNumbers(docs, report)
  for (const doc of docs.filter(hasCheckedDiagrams)) for (const diagram of doc.diagrams) checkDiagram(doc, diagram, report)
  const cache = new Map()
  for (const doc of docs.filter(d => d.front?.type !== 'workflow')) checkLinks(doc, cache, report)
  checkMaps(docs, useCases, statements, report)
  checkMapFile(docs, docsDir, { statements, useCases, levels: levels ?? [] }, report)
  const reviews = docs.filter(conforms).map(doc => checkReviewed(doc, report))
  return { report, docs, statements, codes, useCases, withoutScenario, reviews, levels: levels ?? [], scenarioLevels: declaredScenarioLevels ?? [] }
}

const check = (docsDir) => analyze(docsDir).report

function main () {
  const docsDir = resolve(process.argv[2] ?? 'docs')
  if (!existsSync(docsDir)) { console.error(`${docsDir} does not exist`); process.exit(2) }
  const errors = printReport(check(docsDir), process.cwd())
  process.exit(errors > 0 ? 1 : 0)
}

export {
  analyze, check, createReport, printReport, renderMap, sectionLines, slug, parseFrontMatter, CHANGE, MAP_FILE, VIEWS,
  clicksOf, diagramsIn, documentAt, idToken, reachedFrom, documentItems, fencedBlocks, isScenario, itemChanges, lineItems, prefixOf, sectionOf
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
