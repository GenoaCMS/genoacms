/**
 * Types for the SAST ruleset.
 *
 * **The union below and the table in `sast.js` are two statements of one list**, which is the cost
 * of this package being plain JavaScript with hand-written declarations. `sast.test.js` asserts the
 * runtime table against a spelled-out list from both ends, so a rule added to one and not the other
 * fails a test rather than drifting quietly. The permission vocabulary beside this is kept honest
 * the same way, for the same reason.
 */

/**
 * Every rule in the ruleset.
 *
 * `SAST-12` is **absent deliberately**. It was specified as `StrictTypeSignature` and withdrawn on
 * 28 August 2026: the adapter emits a component's signature from its header and the author writes
 * only a body, so there is no way to declare a mismatching one and the rule could never fire. It is
 * not reused for a future rule — an identifier that meant one thing in the thesis and another in the
 * code would make every coverage report ambiguous.
 */
export type SastRuleId =
  | 'SAST-01'
  | 'SAST-02'
  | 'SAST-03'
  | 'SAST-04'
  | 'SAST-05'
  | 'SAST-06'
  | 'SAST-07'
  | 'SAST-08'
  | 'SAST-09'
  | 'SAST-10'
  | 'SAST-11'

/** The four domain groups, in the order the ruleset defines them. */
export type SastGroup =
  | 'dynamic-execution'
  | 'module-isolation'
  | 'algorithmic-complexity'
  | 'component-contract'

/**
 * How much a rule matters.
 *
 * **Not the same thing as `Diagnostic.severity`**, and the two must not be collapsed. This ranks the
 * rule; `Diagnostic['severity']` says what happens when it fires. `SAST-10` is the case that proves
 * they are different: it is `MEDIUM` here and produces a **warning**, because allocation size is a
 * runtime value and enforcement is delegated to L2 — while `SAST-03` is `HIGH` and rejects.
 */
export type SastSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM'

export interface SastRule {
  id: SastRuleId
  /** The rule's name, e.g. `NoDynamicEvaluation`. Reported and cited. */
  name: string
  group: SastGroup
  severity: SastSeverity
  /**
   * What firing does: block the commit, or report and allow it.
   *
   * Carried per rule rather than decided at the call site, so that "this rule only warns" is a fact
   * about the ruleset that the evaluation can read, rather than a behavior buried in an analyzer.
   */
  enforcement: 'fatal' | 'warning'
  /**
   * What the rule rejects, in the specification's words.
   *
   * Held here so a diagnostic can quote the rule an author violated, and so coverage can be reported
   * against a description rather than against a bare identifier.
   */
  description: string
  /**
   * Named only for the rules whose undecidable residue is carried at runtime.
   *
   * Absent means the rule decides its question completely at commit time. Present means it does not,
   * and says which runtime guard catches what it cannot — which is the honest half of what the
   * ruleset claims, and the reason `SAST-08`, `SAST-09` and `SAST-10` are not overstated as
   * complete.
   */
  residue?: 'fuel' | 'depth' | 'allocation'
}

export declare const SAST_RULES: Readonly<Record<SastRuleId, SastRule>>
export declare const SAST_RULE_IDS: readonly SastRuleId[]
export declare const isSastRuleId: (value: unknown) => value is SastRuleId
export declare const sastRule: (id: SastRuleId) => SastRule
