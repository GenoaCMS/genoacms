/**
 * The runtime guard vocabulary: what a component can run out of, and how anyone finding out says so.
 *
 * The counters themselves are not here. They are compiled into each artifact by a language adapter,
 * because the code that spends a budget is the component's and there is nothing to count until one
 * runs. What *is* here is the part three packages have to agree on: an adapter emits a trip, the SDK
 * recognizes one, and the evaluation counts them per family. One definition, as with the SAST
 * ruleset and the permission vocabulary beside it.
 *
 * @typedef {import('./guards.d.ts').GuardFamily} GuardFamily
 * @typedef {import('./guards.d.ts').GuardExhausted} GuardExhausted
 * @typedef {import('./guards.d.ts').GuardBudgets} GuardBudgets
 */

/**
 * The name a trip carries.
 *
 * A string rather than an exported error class, and that is the whole point. A consumer may execute
 * components in a worker or a sandboxed iframe, where `Error` is a different constructor and
 * `instanceof` answers `false` for a perfectly genuine trip — silently reclassifying a guard doing
 * its job as an ordinary crash.
 */
const GUARD_EXHAUSTED = 'GuardExhausted'

/**
 * A budget that was never usable: absent, negative, or not a number.
 *
 * Separate from a trip because it is a different fault with a different owner. A trip is a component
 * reaching a bound that was set for it; this is nobody having set one, which is a defect in whatever
 * resolved the budgets. Sharing one name would let a misconfigured instance report guards working.
 */
const GUARD_BUDGET_INVALID = 'GuardBudgetInvalid'

/** @type {readonly GuardFamily[]} */
const GUARD_FAMILIES = ['fuel', 'depth', 'allocation']

/**
 * Whether a caught value is a guard trip rather than an ordinary fault.
 *
 * By shape, for the realm reason above, and **the family is checked too**: `name` alone would accept
 * anything an author chose to throw with that name, and a component authored in the CMS is exactly
 * the code this cannot take at its word.
 *
 * @param {unknown} value
 * @returns {value is GuardExhausted}
 */
const isGuardExhausted = (value) => {
  if (typeof value !== 'object' || value === null) return false
  const candidate = /** @type {{ name?: unknown, guard?: unknown }} */ (value)
  return candidate.name === GUARD_EXHAUSTED &&
    GUARD_FAMILIES.includes(/** @type {GuardFamily} */ (candidate.guard))
}

/** The three ceilings, in the order they are documented, paired with the budget each one bounds. */
const CEILING_OF = /** @type {const} */ ({ fuel: 'maxFuel', depth: 'maxDepth', allocation: 'maxAllocation' })

/**
 * The budgets a component runs against when nothing lowers its ceilings.
 *
 * @param {import('./guards.d.ts').GuardCeilings} ceilings
 * @returns {GuardBudgets}
 */
const budgetsFrom = (ceilings) => ({
  fuel: ceilings.maxFuel,
  depth: ceilings.maxDepth,
  allocation: ceilings.maxAllocation
})

/**
 * Whether a value carries all three ceilings, each a positive whole number.
 *
 * Whole because a signed document is canonicalized, and a fraction is a number two implementations
 * can disagree about the spelling of. Positive because a ceiling of zero is a component that cannot
 * run, which is not a bound anyone meant to set.
 *
 * @param {unknown} value
 * @returns {value is import('./guards.d.ts').GuardCeilings}
 */
const isGuardCeilings = (value) => {
  if (typeof value !== 'object' || value === null) return false
  const candidate = /** @type {Record<string, unknown>} */ (value)
  return GUARD_FAMILIES.every((family) => {
    const limit = candidate[CEILING_OF[family]]
    return typeof limit === 'number' && Number.isInteger(limit) && limit > 0
  })
}

export {
  GUARD_EXHAUSTED,
  GUARD_BUDGET_INVALID,
  GUARD_FAMILIES,
  CEILING_OF,
  isGuardExhausted,
  budgetsFrom,
  isGuardCeilings
}
