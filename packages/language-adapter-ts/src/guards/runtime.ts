/**
 * The counters a compiled component runs against.
 *
 * ## Why this is a string
 *
 * The text below is **bundled into every artifact**, which is what puts it inside the signature: a
 * component's bounds cannot be stripped by whoever stores the file or serves it, because removing
 * them changes bytes the signature covers. An artifact resolves no imports, so there is nothing to
 * import a helper *from* — the helper has to be in the file.
 *
 * It is a constant in this package's source rather than a module compiled and read back, so its
 * bytes are a function of the **adapter's source**. Derived from a build instead, they would be a
 * function of how the adapter was *packaged*, and the same adapter version bundled two ways would
 * sign one component two different ways. The cost is that an editor does not type-check this while
 * it is being written, which is why `runtime.test.ts` parses it and asserts it is clean.
 *
 * ## What it is not
 *
 * It knows nothing about components, attributes or ASTs. Budgets in, a throw when one runs out.
 * Inserting the calls that spend them is the transform's work, and this is tested without compiling
 * anything.
 *
 *     budgets ──▶ __genoaGuards(budgets) ──▶ { tick, enter, exit, charge }
 *                                                │      │      │      │
 *                        loop headers ───────────┘      │      │      │
 *                        recursive call sites ──────────┴──────┘      │
 *                        allocation expressions ───────────────────────┘
 */

/** The factory's name in the emitted module. Underscored to stay clear of an author's identifiers. */
const GUARD_FACTORY = '__genoaGuards'

/**
 * The helper, as TypeScript.
 *
 * TypeScript rather than JavaScript because it is merged into a source file that is compiled as
 * TypeScript, and because the annotations are what let the test type-check it. Every one of them is
 * erased before anything ships.
 *
 * ### Two failures, named apart
 *
 * A **trip** is a component reaching a bound that was set for it, which is the mechanism working. An
 * **invalid budget** is nobody having set one, which is a defect in whatever resolved the budgets.
 * Refusing at construction rather than treating an absent budget as unlimited: a component running
 * with no bound is the one outcome the guards exist to prevent, so the failure is loud.
 *
 * ### Counting up, not down
 *
 * Each counter rises toward its limit, so the limit is still around to report when one is reached.
 * A counter decremented to zero has forgotten the number an operator would want to change.
 *
 * ### A closure rather than a class
 *
 * The emitted target is configurable per instance and defaults to `es2020`, where private class
 * fields do not exist — a class holding its counters in `#fuel` is lowered to `WeakMap` scaffolding,
 * so the guard inside every signed artifact would have a different shape and size depending on a
 * setting. Public fields avoid that and are worse: `__genoa.fuel = 0` from an author's body would
 * reset the counter mid-render. A closure has neither problem at any target, and its methods carry
 * no receiver for an injected call site to lose.
 */
const GUARD_RUNTIME = `type __GenoaGuardFamily = 'fuel' | 'depth' | 'allocation'

interface __GenoaBudgets {
  fuel: number
  depth: number
  allocation: number
}

interface __GenoaGuards {
  tick: () => void
  enter: () => void
  exit: () => void
  charge: (amount: number) => void
}

function ${GUARD_FACTORY} (budgets: __GenoaBudgets): __GenoaGuards {
  const invalid = (family: __GenoaGuardFamily): never => {
    const error = new Error('This component was given no usable ' + family + ' budget, so it cannot run.')
    error.name = 'GuardBudgetInvalid'
    throw error
  }

  // Read as an unknown rather than through the annotation: budgets arrive from a signed document and
  // a consumer's options, so what the type says and what is actually there can differ.
  const required = (family: __GenoaGuardFamily): number => {
    const limit = (budgets as unknown as Record<string, unknown>)[family]
    if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return invalid(family)
    return limit
  }

  const maxFuel = required('fuel')
  const maxDepth = required('depth')
  const maxAllocation = required('allocation')

  let fuel = 0
  let depth = 0
  let allocated = 0

  const exhausted = (guard: __GenoaGuardFamily, limit: number): never => {
    const error = new Error(
      'This component stopped because it used more than its ' + guard + ' budget of ' + limit + '.'
    ) as Error & { guard: __GenoaGuardFamily, limit: number }
    error.name = 'GuardExhausted'
    error.guard = guard
    error.limit = limit
    throw error
  }

  // Frozen, because the counters being unreachable is worth nothing if the methods reading them can
  // be replaced. An artifact is a module and therefore strict, so an author's \`tick = () => {}\`
  // throws rather than quietly succeeding. It does not stop the identifier itself being rebound.
  return Object.freeze({
    tick: (): void => {
      fuel += 1
      if (fuel > maxFuel) exhausted('fuel', maxFuel)
    },
    enter: (): void => {
      depth += 1
      if (depth > maxDepth) exhausted('depth', maxDepth)
    },
    // Never below zero. An exit is emitted in a finally, so an inner throw can unwind past enters
    // that a matching exit already accounted for, and a negative depth would hand back budget the
    // component never returned.
    exit: (): void => {
      if (depth > 0) depth -= 1
    },
    // Anything that is not a positive number costs nothing. A size is an arbitrary expression in the
    // author's code, so it can be a NaN, a negative or a string — and none of those may buy budget
    // back by being subtracted from the total.
    charge: (amount: number): void => {
      const size = typeof amount === 'number' && Number.isFinite(amount) && amount > 0 ? amount : 0
      allocated += size
      if (allocated > maxAllocation) exhausted('allocation', maxAllocation)
    }
  })
}
`

export { GUARD_FACTORY, GUARD_RUNTIME }
