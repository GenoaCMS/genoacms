import type { SastRuleId } from '@genoacms/internal/sast'
import type { CorpusEntry, EscapeKind, Origin } from './corpus.js'

/**
 * Turning corpus results into the figure `E3` reports.
 *
 * Separated from running the ruleset so the arithmetic can be checked without compiling anything,
 * and so the report and the test agree about what coverage means by sharing one definition of it.
 *
 * **Coverage is `rejected / expected-to-reject`.** An entry the corpus expects to escape is not a
 * miss and does not sit in the denominator — counting it would make the ruleset look worse the more
 * honestly the corpus documents its own boundaries, which is exactly the wrong incentive.
 */

/** What actually happened to one entry when the ruleset read it. */
interface Outcome {
  entry: CorpusEntry
  /** The rules that fired, in the order reported. */
  rules: SastRuleId[]
}

interface RuleCoverage {
  rule: SastRuleId
  expected: number
  rejected: number
}

interface OriginCoverage {
  origin: Origin
  expected: number
  rejected: number
}

/** An entry that did not do what the corpus said it would. */
interface Surprise {
  id: string
  /** What the corpus expected, in words. */
  expected: string
  /** What the ruleset actually said. */
  got: string
}

interface Report {
  /** Entries the corpus expects a rule to reject. */
  expected: number
  rejected: number
  byRule: RuleCoverage[]
  byOrigin: OriginCoverage[]
  /** Entries the corpus expects to escape, grouped by why. */
  escapes: Array<{ kind: EscapeKind, ids: string[] }>
  /** Where the corpus and the ruleset disagree. Empty is the only acceptable result. */
  surprises: Surprise[]
  /** True while no externally sourced entry exists, which the reported figure depends on. */
  extensionOnly: boolean
}

const rejectsRule = (entry: CorpusEntry): SastRuleId | undefined =>
  'rejects' in entry.verdict ? entry.verdict.rejects : undefined

const escapeKind = (entry: CorpusEntry): EscapeKind | undefined =>
  'escapes' in entry.verdict ? entry.verdict.escapes : undefined

/** Every rule the corpus claims to exercise, in the order the ruleset defines them. */
const rulesExercised = (outcomes: Outcome[]): SastRuleId[] => {
  const seen = new Set<SastRuleId>()
  for (const outcome of outcomes) {
    const rule = rejectsRule(outcome.entry)
    if (rule !== undefined) seen.add(rule)
  }
  return [...seen].sort()
}

const describe = (entry: CorpusEntry): string =>
  'rejects' in entry.verdict ? entry.verdict.rejects : `escapes (${entry.verdict.escapes})`

/**
 * Whether the ruleset did what the corpus said it would.
 *
 * An entry expected to escape must produce **no** diagnostic at all: reporting a different rule than
 * the one claimed would be coverage credited to the wrong place, and a rule firing on an entry
 * documented as escaping means the documentation is stale.
 */
const surprisedBy = (outcome: Outcome): Surprise | undefined => {
  const expected = rejectsRule(outcome.entry)
  const got = outcome.rules.length === 0 ? 'nothing' : outcome.rules.join(', ')

  if (expected === undefined) {
    return outcome.rules.length === 0
      ? undefined
      : { id: outcome.entry.id, expected: describe(outcome.entry), got }
  }
  return outcome.rules.includes(expected)
    ? undefined
    : { id: outcome.entry.id, expected, got }
}

const countBy = <T extends string>(
  outcomes: Outcome[],
  keys: T[],
  keyOf: (entry: CorpusEntry) => T | undefined
): Array<{ key: T, expected: number, rejected: number }> =>
  keys.map(key => {
    const mine = outcomes.filter(outcome => keyOf(outcome.entry) === key)
    return {
      key,
      expected: mine.length,
      rejected: mine.filter(outcome => surprisedBy(outcome) === undefined).length
    }
  })

const report = (outcomes: Outcome[]): Report => {
  const rejecting = outcomes.filter(outcome => rejectsRule(outcome.entry) !== undefined)
  const escaping = outcomes.filter(outcome => escapeKind(outcome.entry) !== undefined)

  const byRule = countBy(rejecting, rulesExercised(outcomes), rejectsRule)
  const byOrigin = countBy(rejecting, ['external', 'extension'], entry => entry.origin)

  const kinds: EscapeKind[] = ['undecidable', 'rule-gap', 'by-design']

  return {
    expected: rejecting.length,
    rejected: rejecting.filter(outcome => surprisedBy(outcome) === undefined).length,
    byRule: byRule.map(({ key, expected, rejected }) => ({ rule: key, expected, rejected })),
    byOrigin: byOrigin.map(({ key, expected, rejected }) => ({ origin: key, expected, rejected })),
    escapes: kinds.map(kind => ({
      kind,
      ids: escaping.filter(outcome => escapeKind(outcome.entry) === kind).map(one => one.entry.id)
    })),
    surprises: outcomes.map(surprisedBy).filter((one): one is Surprise => one !== undefined),
    extensionOnly: outcomes.every(outcome => outcome.entry.origin === 'extension')
  }
}

export { report, surprisedBy, describe }
export type { Outcome, Report, RuleCoverage, OriginCoverage, Surprise }
