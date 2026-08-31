/**
 * Types for the runtime guard vocabulary.
 *
 * As with the SAST ruleset beside this, the union below and the runtime list in `guards.js` are two
 * statements of one thing, and `guards.test.js` asserts them against each other from both ends.
 */

/**
 * The three things a component can run out of.
 *
 * Three rather than one because they are exhausted by different code and none of them implies the
 * others: a loop that never ends burns fuel while allocating nothing, and a single enormous array
 * exhausts memory without completing one iteration.
 */
export type GuardFamily = 'fuel' | 'depth' | 'allocation'

/**
 * What a component is allowed to spend.
 *
 * Every field is required. A budget that could be omitted would have to mean either *unlimited* or
 * *some default*, and both are a component running with a bound nobody chose.
 */
export interface GuardBudgets {
  /** Loop iterations and recursive branches, counted down. */
  fuel: number
  /** How deep recursive calls may nest. */
  depth: number
  /** Cumulative elements and bytes a component may ask for, across the whole render. */
  allocation: number
}

/**
 * What a component may **never** be allowed to spend, whatever a consumer asks for.
 *
 * The same three quantities as `GuardBudgets`, under the names the security policy gives them. Two
 * shapes because they belong to two vocabularies: a policy and a signed payload speak of `maxFuel`
 * beside a key rotation interval, and the counters inside a component have no other kind of fuel to
 * distinguish theirs from. `budgetsFrom` is the one place they meet.
 *
 * They hold the same numbers. Nothing lowers a ceiling on its way to becoming a budget — a consumer
 * supplies no budget at all, and an instance lowering a ceiling does so in the policy, before
 * anything is compiled.
 */
export interface GuardCeilings {
  maxFuel: number
  maxDepth: number
  maxAllocation: number
}

/**
 * A budget that ran out.
 *
 * Not a class. What crosses from a component into the SDK is a plain error object, possibly from a
 * different realm, and the only thing that travels reliably is its shape.
 */
export interface GuardExhausted extends Error {
  /** Which budget ran out, so a report says more than "the component stopped". */
  guard: GuardFamily
  /** What the budget was, which is the number an operator would change. */
  limit: number
}

/** The name a trip carries. Recognized instead of `instanceof`; see `isGuardExhausted`. */
export declare const GUARD_EXHAUSTED: 'GuardExhausted'

/** A budget that was never usable. See `guards.js`. */
export declare const GUARD_BUDGET_INVALID: 'GuardBudgetInvalid'

/** Every guard family, in the order they are documented. */
export declare const GUARD_FAMILIES: readonly GuardFamily[]

/** Whether a caught value is a guard trip rather than an ordinary fault. */
export declare function isGuardExhausted (value: unknown): value is GuardExhausted

/** The budgets a component runs against when nothing lowers its ceilings. */
export declare function budgetsFrom (ceilings: GuardCeilings): GuardBudgets

/** Whether a value carries all three ceilings, each a positive whole number. */
export declare function isGuardCeilings (value: unknown): value is GuardCeilings

/** Which ceiling bounds which budget. */
export declare const CEILING_OF: Readonly<Record<GuardFamily, keyof GuardCeilings>>
