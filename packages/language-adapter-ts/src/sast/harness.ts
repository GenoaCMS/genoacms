import { describe, it, expect } from 'vitest'
import { sastRule, type SastRuleId } from '@genoacms/internal/sast'
import type {
  AnalysisRequest,
  AnalysisResult,
  ComponentShape,
  Diagnostic,
  SecurityRuleDiagnostic
} from '@genoacms/internal/languageAdapter'
import type { Attribute, ComponentHeaderAttributes } from '@genoacms/internal/attributes'
import adapter from '../index.js'

/**
 * How a security rule is tested.
 *
 * Every rule in the ruleset is checked through `describeRule` below, and the shape of that function
 * is the point of this file rather than an incidental convenience.
 *
 * ## Both halves, or the suite proves nothing
 *
 * A rule test that only asserts rejection **passes against an analyzer that rejects everything**.
 * That is not a hypothetical: this project has twice shipped a check that could not fail — a
 * conformance vector set that passed a deliberately wrong implementation, and a secret scanner with
 * a needle that could not match — and both were found only by deliberately trying to break them.
 *
 * So `describeRule` takes `rejects` **and** `accepts`, and **throws if either is empty**. Not a
 * failing assertion inside a test, which a `.skip` would silence: a throw while the suite is being
 * collected, so a rule contributed with one half missing cannot be run at all.
 *
 * ## The analyzer is injectable, so the harness itself can be tested
 *
 * `harnessFor` takes the analyze function. The suites use the real adapter; `harness.test.ts` passes
 * stubs, which is the only way to demonstrate that these assertions **fail when they should** — the
 * property the whole file exists to provide and the one that cannot be shown using an analyzer whose
 * answers are already correct.
 */

/** A fragment to analyze: the author's body, and the shape it is wrapped in. */
interface Fragment {
  body: string
  /** Defaults to a single string attribute, which is enough for most rules. */
  shape?: ComponentShape
}

/** Cases for one rule. Both directions are required — see the note above. */
interface RuleCases {
  /** Fragments the rule must reject. */
  rejects: Array<string | Fragment>
  /**
   * Fragments the rule must stay silent on.
   *
   * These are the half that makes a passing suite mean something, and they are worth choosing
   * adversarially: something that *resembles* a violation and is legitimate is a far better case
   * than an empty body.
   */
  accepts: Array<string | Fragment>
}

type Analyze = (request: AnalysisRequest) => Promise<AnalysisResult> | AnalysisResult

const asFragment = (fragment: string | Fragment): Fragment =>
  typeof fragment === 'string' ? { body: fragment } : fragment

const attribute = (uid: string, name: string, type: Attribute['type']): Attribute =>
  ({ uid, name, type, schema: { title: name, description: '', required: false } } as Attribute)

/**
 * What a fragment is wrapped in when a case does not say.
 *
 * One string attribute rather than none, so a body can refer to a parameter without every case
 * having to declare one. Rules about parameters — declared bounds above all — supply their own.
 */
const defaultShape = (): ComponentShape => {
  const attributes: ComponentHeaderAttributes = {}
  const only = attribute('attribute-1', 'heading', 'string')
  attributes[only.uid] = only
  return { attributes, attributeOrder: [only.uid] }
}

/** A short, stable label for a fragment, so a failing test names the code that failed. */
const label = (body: string): string => {
  const oneLine = body.replace(/\s+/g, ' ').trim()
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}...` : oneLine
}

const isSecurityDiagnostic = (diagnostic: Diagnostic): diagnostic is SecurityRuleDiagnostic =>
  diagnostic.type === 'security-rule'

const harnessFor = (analyze: Analyze) => {
  /** Every diagnostic a fragment produces, of both kinds. */
  const diagnosticsIn = async (fragment: string | Fragment): Promise<Diagnostic[]> => {
    const { body, shape } = asFragment(fragment)
    const result = await analyze({ body, shape: shape ?? defaultShape() })
    return result.diagnostics
  }

  /**
   * The security rules a fragment violates.
   *
   * Language-rule diagnostics are filtered out deliberately. A fragment that fails to compile has
   * not thereby violated a security rule, and counting it as one is exactly the miscount the
   * diagnostic type exists to prevent.
   */
  const violationsIn = async (fragment: string | Fragment): Promise<SastRuleId[]> =>
    (await diagnosticsIn(fragment)).filter(isSecurityDiagnostic).map(one => one.rule)

  /**
   * Asserts a rule on cases in both directions.
   *
   * The severity assertion is not decoration: a rule the table calls a warning must not block a
   * commit, and one it calls fatal must. Reading that from the ruleset rather than restating it per
   * test keeps the two from drifting.
   */
  const describeRule = (id: SastRuleId, cases: RuleCases): void => {
    const rule = sastRule(id)

    // Thrown while the suite is being collected, not asserted inside a test: a failing assertion can
    // be skipped, and a rule with one half missing would then look green.
    if (cases.rejects.length === 0) throw new Error(`${id} has no rejecting cases`)
    if (cases.accepts.length === 0) {
      throw new Error(
        `${id} has no accepting cases. A rule tested only on what it rejects passes against an ` +
        'analyzer that rejects everything.'
      )
    }

    describe(`${id} ${rule.name}`, () => {
      it.each(cases.rejects.map(one => [label(asFragment(one).body), one] as const))(
        'rejects %s', async (_name, fragment) => {
          const diagnostics = (await diagnosticsIn(fragment)).filter(isSecurityDiagnostic)
          const fired = diagnostics.filter(one => one.rule === id)

          expect(fired.length).toBeGreaterThan(0)
          expect(fired[0].severity).toBe(rule.enforcement)
          // A refusal an author cannot locate is a refusal without a reason.
          expect(fired[0].message.length).toBeGreaterThan(0)
        }
      )

      it.each(cases.accepts.map(one => [label(asFragment(one).body), one] as const))(
        'accepts %s', async (_name, fragment) => {
          expect(await violationsIn(fragment)).not.toContain(id)
        }
      )
    })
  }

  return { diagnosticsIn, violationsIn, describeRule }
}

const { diagnosticsIn, violationsIn, describeRule } = harnessFor(adapter.analyze)

export { harnessFor, diagnosticsIn, violationsIn, describeRule, defaultShape, attribute }
export type { Fragment, RuleCases, Analyze }
