/**
 * The SAST ruleset of GenoaCMS, as identity rather than as logic.
 *
 * The ruleset is eleven rules across four domain groups. This is that table: what each rule is
 * called, how much it matters, whether firing blocks a commit, and — for the three that cannot decide
 * their question statically — which runtime guard carries the rest.
 *
 * **No rule logic lives here, deliberately.** Detecting a violation means walking a language's AST,
 * which is a language adapter's work and differs entirely between TypeScript and any second
 * implementation. What does not differ is the ruleset: an adapter implements *these* rules, reports
 * *these* identifiers, and is measured against them. Splitting identity from detection is what lets
 * a coverage report compare two adapters at all.
 *
 * ## Why the vocabulary lives here
 *
 * The same reason as the permission vocabulary beside it: three packages need it and none of them
 * owns it. A language adapter emits diagnostics carrying these identifiers; the CMS decides whether
 * a diagnostic blocks a commit; the evaluation reports coverage per rule. One definition, as with
 * the attribute vocabulary.
 *
 * ## Two severities, which are not the same severity
 *
 * `severity` here ranks the **rule** — CRITICAL, HIGH, MEDIUM.
 * `enforcement` says what happens when it **fires**. `SAST-10` is the case that keeps them apart:
 * MEDIUM, and a *warning*, because an allocation's size is a runtime value and enforcement is
 * delegated to the L2 allocation guard. Collapsing the two would make that rule either falsely fatal
 * or falsely unimportant.
 *
 * @typedef {import('./sast.d.ts').SastRule} SastRule
 * @typedef {import('./sast.d.ts').SastRuleId} SastRuleId
 */

/**
 * Rules that reject what is decidable at commit time: reaching outside the component at all.
 *
 * Rejection covers **direct use, aliasing, and computed-member access where statically resolvable**.
 * A rule matching only the direct spelling would report coverage it does not have, which is the
 * failure mode the evasion corpus exists to expose.
 */
const dynamicExecutionRules = {
  'SAST-01': {
    id: 'SAST-01',
    name: 'NoDynamicEvaluation',
    group: 'dynamic-execution',
    severity: 'CRITICAL',
    enforcement: 'fatal',
    description: 'Rejects calls to eval(), Function(), setTimeout(string), and setInterval(string).'
  },
  'SAST-02': {
    id: 'SAST-02',
    name: 'NoGlobalScopeAccess',
    group: 'dynamic-execution',
    severity: 'CRITICAL',
    enforcement: 'fatal',
    description:
      'Rejects direct access to global environment objects (globalThis, window, global, process, ' +
      'document.cookie, localStorage).'
  },
  'SAST-03': {
    id: 'SAST-03',
    name: 'NoPrototypeManipulation',
    group: 'dynamic-execution',
    severity: 'HIGH',
    enforcement: 'fatal',
    description:
      'Blocks prototype pollution vectors (__proto__, Object.defineProperty on prototypes, ' +
      'constructor manipulation).'
  }
}

/**
 * Rules that close the module and network surface.
 *
 * These are the bans that make a component a pure function of its declared attributes — and the
 * reason the `passthrough` parameter and the data bridge exist. Removing ambient authority
 * without a sanctioned channel would leave authors evading the ruleset rather than using it.
 */
const moduleIsolationRules = {
  'SAST-04': {
    id: 'SAST-04',
    name: 'NoModuleImport',
    group: 'module-isolation',
    severity: 'CRITICAL',
    enforcement: 'fatal',
    description:
      'A component may not import at all — every specifier, and both the static and the dynamic ' +
      'form. Native OS/system modules (fs, child_process, net, http, os, cluster) are the sharpest ' +
      'case rather than the boundary.'
  },
  'SAST-05': {
    id: 'SAST-05',
    name: 'NoUnrestrictedNetworkCalls',
    group: 'module-isolation',
    severity: 'HIGH',
    enforcement: 'fatal',
    description:
      'Blocks un-allowlisted network primitives (fetch, XMLHttpRequest, WebSocket) inside component ' +
      'render logic.'
  },
  'SAST-06': {
    id: 'SAST-06',
    name: 'NoDynamicImports',
    group: 'module-isolation',
    severity: 'HIGH',
    enforcement: 'fatal',
    description: 'Rejects non-static or runtime-evaluated imports (import(variable) and require(variable)).'
  }
}

/**
 * Rules about exhausting the host, and the only group that hands work to L2.
 *
 * Three of the four carry a `residue`, which is the group saying out loud that it does not decide its
 * question completely. That is not a weakness to be hidden: deciding whether arbitrary code
 * terminates is undecidable, so a ruleset claiming completeness here would be claiming something
 * false. The guards named are what actually carry it.
 */
const algorithmicComplexityRules = {
  'SAST-07': {
    id: 'SAST-07',
    name: 'RequireDeclaredBounds',
    group: 'algorithmic-complexity',
    severity: 'HIGH',
    enforcement: 'fatal',
    description:
      'Rejects a numeric attribute reaching a loop condition, allocation size, or recursion bound ' +
      'unless the author has declared a maximum in its schema. A minimum bounds nothing a loop ' +
      'cares about. No bound is ever inferred or injected. A value arriving through passthrough has ' +
      'no schema to declare one on, so it is permitted, statically unbounded, and warned about.'
  },
  'SAST-08': {
    id: 'SAST-08',
    name: 'NoUnboundedLoops',
    group: 'algorithmic-complexity',
    severity: 'HIGH',
    enforcement: 'fatal',
    description:
      'Rejects infinite loop constructs (while(true)) lacking statically provable termination ' +
      'conditions.',
    residue: 'fuel'
  },
  'SAST-09': {
    id: 'SAST-09',
    name: 'NoUnboundedRecursion',
    group: 'algorithmic-complexity',
    severity: 'HIGH',
    enforcement: 'fatal',
    description: 'Rejects recursive calls lacking a statically provable depth bound.',
    residue: 'depth'
  },
  'SAST-10': {
    id: 'SAST-10',
    name: 'BoundMemoryAllocation',
    group: 'algorithmic-complexity',
    severity: 'MEDIUM',
    // The one rule that reports without blocking. An allocation's size is a runtime value, so
    // rejecting here would refuse correct components for a fact nothing can know yet.
    enforcement: 'warning',
    description:
      'Flags dynamic array/buffer allocations (new Array(n)) whose size is not statically bounded. ' +
      'Warning, not rejection — enforcement is delegated to the L2 allocation guard.',
    residue: 'allocation'
  }
}

/**
 * What a component may do to state that is not its own.
 *
 * One rule, not two: `SAST-12` was withdrawn once the adapter began emitting the signature the
 * author writes against, which left it unable to fire.
 */
const componentContractRules = {
  'SAST-11': {
    id: 'SAST-11',
    name: 'NoGlobalSideEffects',
    group: 'component-contract',
    severity: 'MEDIUM',
    enforcement: 'fatal',
    description:
      'Component execution must remain pure with respect to props; mutating external module ' +
      'variables is rejected.'
  }
}

/** @type {Readonly<Record<SastRuleId, SastRule>>} */
const SAST_RULES = Object.freeze({
  ...dynamicExecutionRules,
  ...moduleIsolationRules,
  ...algorithmicComplexityRules,
  ...componentContractRules
})

/**
 * The identifiers, in specification order.
 *
 * Order matters for reporting: coverage is presented per rule, and a report whose rows moved between
 * runs would be tedious to compare against the thesis table.
 */
const SAST_RULE_IDS = Object.freeze(Object.keys(SAST_RULES))

const isSastRuleId = (value) => typeof value === 'string' && Object.hasOwn(SAST_RULES, value)

/**
 * One rule, or a throw.
 *
 * Throws rather than returning undefined: every caller has a rule identifier it believes in, and an
 * unknown one is a programming error rather than a condition to branch on. Returning undefined would
 * let a coverage report silently skip a rule it could not resolve.
 */
const sastRule = (id) => {
  const rule = SAST_RULES[id]
  if (rule === undefined) throw new Error(`unknown SAST rule: ${String(id)}`)
  return rule
}

export { SAST_RULES, SAST_RULE_IDS, isSastRuleId, sastRule }
