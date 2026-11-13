/**
 * The SAST ruleset of GenoaCMS, as identity and intent rather than as logic.
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
 * ## Intent here, binding in the adapter
 *
 * Each rule states a property of the component (`intent`), never a construct of one language.
 * What breaks that property in a given language — `eval` in JavaScript, `system()` in C — is the
 * adapter's **binding** of the rule, and lives in the adapter. Coverage is therefore a fact about a
 * binding: an evasion corpus measures one adapter's binding of a rule, not the rule itself.
 *
 * ## Precondition: a memory-safe language
 *
 * The rules constrain what code may name and how much it may run. They say nothing about memory,
 * and assume a language in which code cannot read or write outside the values it holds. One
 * out-of-bounds write reaches the host process without naming anything a rule bans, so every intent
 * below can be defeated in a language without that guarantee. Deciding memory safety of arbitrary
 * code statically is an open problem rather than a missing rule, so the ruleset does not attempt it.
 * An adapter for C or C++ can bind every rule and still not deliver what the rules intend; whoever
 * registers one accepts that its components may not be memory safe.
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
    intent:
      'A component executes only code present in the signed artifact. No construct may turn data ' +
      'into code while the component runs.'
  },
  'SAST-02': {
    id: 'SAST-02',
    name: 'NoGlobalScopeAccess',
    group: 'dynamic-execution',
    severity: 'CRITICAL',
    enforcement: 'fatal',
    intent:
      'A component reaches the environment it runs in only through its parameters. What reaches ' +
      'the environment is rejected by name rather than by member, because a member of a runtime ' +
      'value is reachable by computed access.'
  },
  'SAST-03': {
    id: 'SAST-03',
    name: 'NoPrototypeManipulation',
    group: 'dynamic-execution',
    severity: 'HIGH',
    enforcement: 'fatal',
    intent:
      'A component may not change the behavior of values it did not create, including the shared ' +
      'definitions that every value of a type inherits, nor reach the means of building code from them.'
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
    intent:
      'The artifact is self-contained: it holds all the code it executes and depends on no module ' +
      'resolved outside it. A declaration that leaves nothing in the artifact, such as a type, is ' +
      'not a dependency.'
  },
  'SAST-05': {
    id: 'SAST-05',
    name: 'NoUnrestrictedNetworkCalls',
    group: 'module-isolation',
    severity: 'HIGH',
    enforcement: 'fatal',
    intent:
      'A component reaches the network only through the data bridge, and only to an origin the ' +
      'instance allows.'
  },
  'SAST-06': {
    id: 'SAST-06',
    name: 'NoDynamicImports',
    group: 'module-isolation',
    severity: 'HIGH',
    enforcement: 'fatal',
    intent: 'No code is located or loaded after the artifact was signed.'
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
    intent:
      'Every numeric attribute that decides how much work runs or how much memory is allocated ' +
      'declares a maximum in its schema. A minimum bounds nothing a loop ' +
      'cares about. No bound is ever inferred or injected. A value arriving through passthrough has ' +
      'no schema to declare one on, so it is permitted, statically unbounded, and warned about.'
  },
  'SAST-08': {
    id: 'SAST-08',
    name: 'NoUnboundedLoops',
    group: 'algorithmic-complexity',
    severity: 'HIGH',
    enforcement: 'fatal',
    intent:
      'Every loop can end. A loop with no way out is rejected; whether a loop with one ever takes ' +
      'it is undecidable and is carried by the fuel guard.',
    residue: 'fuel'
  },
  'SAST-09': {
    id: 'SAST-09',
    name: 'NoUnboundedRecursion',
    group: 'algorithmic-complexity',
    severity: 'HIGH',
    enforcement: 'fatal',
    intent:
      'Every recursion can end. Recursion with no condition that could stop it is rejected; ' +
      'whether the condition ever holds is undecidable and is carried by the depth guard.',
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
    intent:
      'Every allocation is bounded. A size known only at run time is reported rather than ' +
      'rejected, and the allocation guard enforces the limit.',
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
    intent:
      'A component may not write to what it was given: the capability object, a slot, or an ' +
      'attribute\'s contents. That state is shared with the host application and with sibling ' +
      'components on the same page.'
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
