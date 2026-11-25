#!/usr/bin/env node
/**
 * Spec Workflow test results checker (WORKFLOW.md §6.2, §9). No dependencies: Node ≥ 20.
 *
 *   node docs/tools/check-results.mjs <docsDir> <level>=<report.xml> … [--defer <level>] …
 *
 * Reads the JUnit XML reports of a test run, each labeled with its test level. Prints `path:line: level: rule: message` for every error
 * and warning, and exits 1 when there is an error.
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { analyze, createReport, idToken, printReport, sectionLines, sectionOf } from './check-docs.mjs'

// ─── Reading JUnit XML ──────────────────────────────────────────────────────

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const TESTCASE = /<testcase\b((?:[^>"']|"[^"]*"|'[^']*')*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g

function decodeXml (text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name.startsWith('#x') || name.startsWith('#X')) return String.fromCodePoint(parseInt(name.slice(2), 16))
    if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)))
    return ENTITIES[name] ?? whole
  })
}

function attributes (text) {
  return Object.fromEntries([...text.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(([, key, double, single]) => [key, decodeXml(double ?? single)]))
}

const CDATA = /<!\[CDATA\[[\s\S]*?\]\]>/g
const CAPTURED_OUTPUT = /<system-(out|err)\b(?:[^>]*[^/>])?>[\s\S]*?<\/system-\1>/g
const keepNewlines = (text) => text.replace(/[^\n]/g, '')

/** A report without what the tests printed, which may look like report elements; each line stays on its number. */
const withoutCapturedOutput = (xml) => xml.replace(CDATA, keepNewlines).replace(CAPTURED_OUTPUT, keepNewlines)

function outcome (body, status) {
  if (/<(failure|error)\b/.test(body)) return 'failed'
  if (/<skipped\b/.test(body) || status === 'notrun') return 'skipped'
  return 'passed'
}

const lineAt = (text, index) => text.slice(0, index).split('\n').length

/** Every `<testcase>` of a report as `{ name, outcome, level, file, line }`. */
function readTestCases (path, level) {
  const xml = withoutCapturedOutput(readFileSync(path, 'utf-8'))
  return [...xml.matchAll(TESTCASE)].map(match => {
    const { name = '', status } = attributes(match[1])
    return { name, outcome: outcome(match[2] ?? '', status), level, file: path, line: lineAt(xml, match.index) }
  })
}

// ─── Matching tests to statements ───────────────────────────────────────────

/** The statement IDs a test title carries, for any declared code. */
function carriedIds (name, codes) {
  if (codes.length === 0) return []
  const separator = /\s/.test(name) ? '-' : '[-_]'
  const pattern = new RegExp(`(?<![A-Za-z0-9-])(${codes.join('|')})${separator}(\\d+)(?![0-9])`, 'g')
  return [...new Set([...name.matchAll(pattern)].map(m => `${m[1]}-${m[2]}`))]
}

/** Test cases by the IDs of conforming statements they carry; reports IDs that resolve to nothing current. */
function indexTestCases (cases, statements, codes, report) {
  const byId = new Map()
  const allCodes = [...codes.conforming, ...codes.other]
  for (const testCase of cases) {
    for (const id of carriedIds(testCase.name, allCodes)) {
      if (!codes.conforming.has(id.split('-')[0])) continue
      checkCarriedId(testCase, id, statements.get(id), report)
      byId.set(id, [...(byId.get(id) ?? []), testCase])
    }
  }
  return byId
}

function checkCarriedId (testCase, id, statement, report) {
  if (statement === undefined) report.error(testCase.file, testCase.line, 'result', `test '${testCase.name}' carries ${id}, which is not defined`)
  else if (statement.state === 'removed') report.error(testCase.file, testCase.line, 'result', `test '${testCase.name}' carries ${id}, which is removed`)
  else if (statement.test?.kind === 'unverified') report.warning(statement.doc.path, statement.line + 1, 'result', `${id} says unverified, but test '${testCase.name}' carries its ID`)
}

/** The use case and scenario IDs a test title carries, for any declared prefix. */
function carriedJourneys (name, prefixes) {
  if (prefixes.length === 0) return []
  const pattern = new RegExp(`(?<![A-Za-z0-9-])((?:${prefixes.join('|')})J\\d+[a-z]?)(?![A-Za-z0-9])`, 'g')
  return [...new Set([...name.matchAll(pattern)].map(m => m[1]))]
}

/** Test cases by the scenarios they carry; reports a title that names a use case or a scenario not defined (WORKFLOW §5.4). */
function indexScenarioTests (cases, useCases, prefixes, report) {
  const byScenario = new Map()
  for (const testCase of cases) {
    for (const id of carriedJourneys(testCase.name, prefixes)) {
      const at = [testCase.file, testCase.line, 'result']
      if (!/[a-z]$/.test(id) && useCases.has(id)) report.error(...at, `test '${testCase.name}' carries the use case ${id}: a test carries the ID of a scenario`)
      else if (!/[a-z]$/.test(id)) report.warning(...at, `test '${testCase.name}' carries ${id}, which looks like a use case and is not defined`)
      else if (!useCases.has(id)) report.error(...at, `test '${testCase.name}' carries ${id}, which is not defined`)
      else byScenario.set(id, [...(byScenario.get(id) ?? []), testCase])
    }
  }
  return byScenario
}

const passesAt = (cases, level) => cases.some(c => c.level === level && c.outcome === 'passed')
const failsAt = (cases, level) => cases.some(c => c.level === level && c.outcome === 'failed')

/** A current statement that names test files has, for each of its levels, a passing test carrying its ID, and no failing one. */
function checkStatement (statement, cases, deferred, report) {
  const at = [statement.doc.path, statement.line + 1, 'result']
  for (const failed of cases.filter(c => c.outcome === 'failed')) report.error(...at, `${statement.id}: ${failed.level} test '${failed.name}' failed`)
  for (const level of statement.levels.filter(l => !passesAt(cases, l))) {
    if (deferred.includes(level)) report.warning(...at, `${statement.id}: its ${level} tests are deferred`)
    else report.error(...at, `${statement.id} has no passing ${level} test carrying its ID`)
  }
}

/** Every report, and every deferred level, names a level that docs/README.md declares. */
function checkReportLevels (docsDir, reports, deferred, levels, report) {
  for (const { level, path } of reports) if (!levels.includes(level)) report.error(path, 1, 'result', `level ${level} is not declared in docs/README.md levels`)
  for (const level of deferred.filter(l => !levels.includes(l))) report.error(docsDir, 1, 'result', `deferred level ${level} is not declared in docs/README.md levels`)
}

const EXPECTED_FAILURE = /\b(?:it|test)(?:\.\w+)*\.(?:fails|failing|fail)\b|\bfails:\s*true\b|\bxfail\b|\bWILL_FAIL\b/

/** The rows of every Findings register that are not history, by ID. */
function findingsOf (docs) {
  const sections = docs.map(doc => [doc, sectionOf(doc, 3, 'Findings')]).filter(([, section]) => section !== undefined)
  const rows = sections.flatMap(([doc, section]) => sectionLines(doc, section).lines).filter(line => !line.includes('*History.*'))
  return new Map(rows.map(line => [/^\| ([A-Z]+F\d+) \|/.exec(line)?.[1], line]).filter(([id]) => id !== undefined))
}

const opensAMarkedTest = (line) => EXPECTED_FAILURE.test(line) && /\(\s*$|^\s*@/.test(line)
const isCommentedOut = (line) => /^\s*(?:\/\/|#|\*)/.test(line)
const isMarked = (lines, i) => !isCommentedOut(lines[i]) && (EXPECTED_FAILURE.test(lines[i]) || opensAMarkedTest(lines[i - 1] ?? ''))

/** The finding cited beside the test on line `i`, whose row names statement `id`. */
function citedFinding (lines, i, id, findings) {
  const cited = [...lines.slice(Math.max(0, i - 2), i + 1).join('\n').matchAll(/\b[A-Z]+F\d+\b/g)].map(([found]) => found)
  return cited.find(found => findings.has(found) && idToken(id).test(findings.get(found)))
}

/** Each test carrying the statement that is marked as expected to fail: it passes by failing (WORKFLOW §8.2). `finding` is what it reproduces, if it says. */
function markersOf (statement, root, findings) {
  const files = statement.test.files.filter(file => existsSync(join(root, file)) && statSync(join(root, file)).isFile())
  return files.flatMap(file => {
    const lines = readFileSync(join(root, file), 'utf-8').split('\n')
    const marked = lines.flatMap((line, i) => (idToken(statement.id).test(line) && isMarked(lines, i) ? [i] : []))
    return marked.map(i => ({ id: statement.id, file, finding: citedFinding(lines, i, statement.id, findings) }))
  })
}

function reportUncitedMarker (statement, marker, report) {
  report.error(statement.doc.path, statement.line + 1, 'result', `${statement.id}: ${marker.file} marks a test carrying it as expected to fail, citing no finding that names it (WORKFLOW §8.2)`)
}

/** A test that passes at a wanted level means the level can move into the list (WORKFLOW §6.1). */
function checkWanted (statement, cases, report) {
  for (const level of statement.wanted.filter(l => passesAt(cases, l))) report.warning(statement.doc.path, statement.line + 1, 'result', `${statement.id}: a ${level} test passes, so ${level} can move from wanted into its levels`)
}

/** A scenario has, for each level it requires, a passing test of that level carrying its ID and a statement it names at that level, and no failing one (WORKFLOW §5.4). */
function checkScenario (scenario, cases, required, isBound, deferred, report) {
  const at = [scenario.doc.path, scenario.line + 1, 'result']
  for (const failed of cases.filter(c => c.outcome === 'failed')) report.error(...at, `${scenario.id}: ${failed.level} test '${failed.name}' failed`)
  for (const level of required.filter(l => !passesAt(cases.filter(isBound), l))) {
    if (deferred.includes(level)) report.warning(...at, `${scenario.id}: its ${level} tests are deferred`)
    else report.error(...at, `${scenario.id} has no passing ${level} test carrying its ID and a statement it names at that level`)
  }
}

const compareIds = (a, b) => a.localeCompare(b, 'en', { numeric: true })
const statementsNamedBy = (entry, statements) => entry.statements.map(id => statements.get(id)).filter(s => s !== undefined)

/** A use case or scenario's state: `new` when it names no current statement but a new one, otherwise whether every current one is verified. */
function entryState (entry, statements, verified) {
  const named = statementsNamedBy(entry, statements)
  const current = named.filter(s => s.state === 'current')
  if (current.length === 0) return { state: named.some(s => s.state === 'new') ? 'new' : 'none', current }
  return { state: current.every(s => verified.has(s.id)) ? 'verified' : 'unverified', current }
}

/** Use cases or scenarios by state (WORKFLOW §5.4, §11.2); with `coverage`, also the scenarios uncovered at each of its levels. */
function summarize (entries, statements, verified, coverage = null) {
  const summary = { total: 0, verified: 0, unverified: [], new: [] }
  if (coverage !== null) summary.uncovered = Object.fromEntries(coverage.levels.map(level => [level, []]))
  for (const entry of entries.sort((a, b) => compareIds(a.id, b.id))) {
    const { state } = entryState(entry, statements, verified)
    if (state === 'new') summary.new.push(entry.id)
    if (state !== 'verified' && state !== 'unverified') continue
    summary.total++
    if (state === 'verified') summary.verified++
    else summary.unverified.push(entry.id)
    if (coverage === null) continue
    const cases = coverage.byScenario.get(entry.id) ?? []
    const bound = cases.filter(c => coverage.isBound(entry, c))
    for (const level of coverage.requiredBy(entry)) if (!passesAt(bound, level) || failsAt(cases, level)) summary.uncovered[level].push(entry.id)
  }
  return summary
}

const isScenario = (entry) => /[a-z]$/.test(entry.id)

const isChecked = (statement) => statement.state === 'current' && statement.test?.kind === 'files'
/** The levels of `scenario-levels` at which a scenario names a current statement that names test files. */
const levelsRequired = (scenario, statements, scenarioLevels) => {
  const checked = statementsNamedBy(scenario, statements).filter(isChecked)
  return scenarioLevels.filter(level => checked.some(s => s.levels.includes(level)))
}
const isVerified = (statement, cases) => statement.levels.every(level => passesAt(cases, level)) && !cases.some(c => c.outcome === 'failed')

/** A current statement against the levels that apply to it, required or wanted, when a test passes at fewer of them (WORKFLOW §11.2). */
function levelGap (statement, cases) {
  const applicable = [...statement.levels, ...statement.wanted]
  return { id: statement.id, applied: applicable.filter(level => passesAt(cases, level)), missing: applicable.filter(level => !passesAt(cases, level)) }
}

/** Checks the `{ level, path }` reports of a run against the statements; `deferred` lists the levels the run did not run. */
function checkResults (docsDir, reports, deferred = []) {
  const { docs, statements, codes, levels, useCases, scenarioLevels } = analyze(docsDir)
  const report = createReport()
  checkReportLevels(docsDir, reports, deferred, levels, report)
  const cases = reports.flatMap(({ level, path }) => readTestCases(path, level))
  const byId = indexTestCases(cases, statements, codes, report)
  const checked = [...statements.values()].filter(isChecked)
  for (const statement of checked) checkStatement(statement, byId.get(statement.id) ?? [], deferred, report)
  const findings = findingsOf(docs)
  const markers = new Map(checked.map(s => [s.id, markersOf(s, dirname(resolve(docsDir)), findings)]))
  for (const statement of checked) for (const marker of markers.get(statement.id).filter(m => m.finding === undefined)) reportUncitedMarker(statement, marker, report)
  for (const statement of checked) checkWanted(statement, byId.get(statement.id) ?? [], report)
  const knownFailures = [...markers.values()].flat().filter(m => m.finding !== undefined)
  const verified = new Set(checked.filter(s => isVerified(s, byId.get(s.id) ?? []) && !markers.get(s.id).length).map(s => s.id))
  const entries = [...useCases.values()]
  const prefixes = [...new Set(docs.filter(d => d.front?.conforms !== false).map(d => d.front?.prefix).filter(Boolean).map(String))]
  const byScenario = indexScenarioTests(cases, useCases, prefixes, report)
  const requiredBy = (scenario) => levelsRequired(scenario, statements, scenarioLevels)
  const isBound = (scenario, testCase) => {
    const carried = carriedIds(testCase.name, [...codes.conforming])
    return statementsNamedBy(scenario, statements).filter(isChecked).some(s => carried.includes(s.id) && s.levels.includes(testCase.level))
  }
  for (const scenario of entries.filter(isScenario)) checkScenario(scenario, byScenario.get(scenario.id) ?? [], requiredBy(scenario), c => isBound(scenario, c), deferred, report)
  const coverage = {
    useCases: summarize(entries.filter(e => !isScenario(e)), statements, verified),
    scenarios: summarize(entries.filter(isScenario), statements, verified, { levels: scenarioLevels, byScenario, requiredBy, isBound })
  }
  const levelGaps = [...statements.values()].filter(s => s.state === 'current').map(s => levelGap(s, byId.get(s.id) ?? [])).filter(gap => gap.missing.length > 0)
  return { report, checked: checked.length, cases, verified, levelGaps, knownFailures: [...new Map(knownFailures.map(({ id, finding }) => [`${id} ${finding}`, { id, finding }])).values()], ...coverage, carrying: new Set([...byId.values()].flat()).size }
}

/** `<level>=<path>` as `{ level, path }`; `null` without a level. */
function parseReport (arg) {
  const match = /^([a-z][a-z0-9-]*)=(.+)$/.exec(arg ?? '')
  return match === null ? null : { level: match[1], path: match[2] }
}

function main () {
  const usage = 'usage: check-results.mjs <docsDir> <level>=<report.xml> … [--defer <level>] …'
  const [docsArg, ...args] = process.argv.slice(2)
  const deferred = args.flatMap((arg, i) => (args[i - 1] === '--defer' ? [arg] : []))
  const reports = args.filter((arg, i) => arg !== '--defer' && args[i - 1] !== '--defer').map(parseReport)
  if (docsArg === undefined || reports.length === 0 || reports.includes(null)) { console.error(usage); process.exit(2) }
  const missing = [docsArg, ...reports.map(r => r.path)].filter(path => !existsSync(path))
  if (missing.length > 0) { console.error(`${missing.join(', ')} does not exist`); process.exit(2) }
  const { report, checked, cases, useCases, scenarios } = checkResults(resolve(docsArg), reports.map(r => ({ ...r, path: resolve(r.path) })), deferred)
  console.log(`${checked} statement(s) checked against ${cases.length} test case(s)`)
  if (useCases.total + scenarios.total > 0) console.log(`${useCases.verified} of ${useCases.total} use case(s) and ${scenarios.verified} of ${scenarios.total} scenario(s) verified`)
  const errors = printReport(report, process.cwd())
  process.exit(errors > 0 ? 1 : 0)
}

export { checkResults, readTestCases, parseReport }

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
