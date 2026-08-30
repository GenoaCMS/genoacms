/**
 * The counters a compiled component runs against.
 *
 *     budgets ──▶ __genoaGuards(budgets) ──▶ { tick, enter, exit, charge }
 *                                                │      │      │      │
 *                        loop headers ───────────┘      │      │      │
 *                        recursive call sites ──────────┴──────┘      │
 *                        allocation expressions ───────────────────────┘
 *
 * ## Why this is a string
 *
 * The text is bundled into every artifact, which is what puts it inside the signature: bounds cannot
 * be stripped by whoever stores or serves the file, because removing them changes signed bytes. An
 * artifact resolves no imports, so there is nothing to import a helper *from*.
 *
 * It is a constant in this package's source rather than a module compiled and read back, so its
 * bytes follow the **adapter's source**. Derived from a build, they would follow how the adapter was
 * *packaged*, and one version bundled two ways would sign one component two ways. The cost is that
 * an editor does not type-check it; `runtime.test.ts` parses it and asserts it is clean.
 *
 * **Nothing in the text is commented**, because a comment there is bytes in every published
 * component forever. The reasoning is here instead.
 *
 * ## What the text is shaped by
 *
 * **A closure, not a class.** The emitted target is configurable per instance and defaults to
 * `es2020`, where private class fields do not exist — `#fuel` lowers to `WeakMap` scaffolding, so the
 * guard inside every artifact would vary in size with a setting. Public fields lower cleanly and are
 * worse: an author's body could reset a counter mid-render. A closure has neither problem at any
 * target, and its methods carry no receiver an injected call site can lose.
 *
 * **Frozen**, because unreachable counters are worth nothing if the methods reading them can be
 * replaced with no-ops. An artifact is a module and therefore strict, so the attempt throws. It does
 * not stop the identifier being rebound; `inject.ts` answers that by choosing a name nothing uses.
 *
 * **Budgets are read as unknowns**, not through their annotation. They arrive from a signed document
 * and from a consumer's options, so what the type promises and what is there can differ.
 *
 * **Counters rise toward their limits** rather than counting down, so the limit is still around to
 * report — the number an operator would change. `exit` floors at zero: it is emitted in a `finally`,
 * so a throw can unwind past `enter`s already accounted for, and going negative would hand back
 * budget nobody spent.
 *
 * ## Two failures, named apart
 *
 * A **trip** is a component reaching a bound set for it, which is the mechanism working. An
 * **invalid budget** is nobody having set one, which is a defect in whatever resolved them. Refusing
 * at construction rather than reading an absent budget as unlimited: a component running unbounded
 * is the outcome the guards exist to prevent.
 */

/**
 * The name the factory is given when nothing is in the way.
 *
 * Only a starting point. An author's body shares a scope with the helper, so `inject.ts` picks a name
 * the source does not already use — which is why the text below takes one rather than baking it in.
 */
const GUARD_FACTORY = '__genoaGuards'

/** What the guards for one render are bound to. Renamed the same way, and for the same reason. */
const GUARD_INSTANCE = '__genoa'

/** The helper, as TypeScript: it is merged into a file compiled as TypeScript, and every annotation is erased. */
const guardRuntime = (factory: string): string => `type __GenoaGuardFamily = 'fuel' | 'depth' | 'allocation'

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

function ${factory} (budgets: __GenoaBudgets): __GenoaGuards {
  const unusableBudget = (family: __GenoaGuardFamily): never => {
    const error = new Error('This component was given no usable ' + family + ' budget, so it cannot run.')
    error.name = 'GuardBudgetInvalid'
    throw error
  }

  const exhausted = (guard: __GenoaGuardFamily, limit: number): never => {
    const error = new Error(
      'This component stopped because it used more than its ' + guard + ' budget of ' + limit + '.'
    ) as Error & { guard: __GenoaGuardFamily, limit: number }
    error.name = 'GuardExhausted'
    error.guard = guard
    error.limit = limit
    throw error
  }

  const limitFor = (family: __GenoaGuardFamily): number => {
    const limit = (budgets as unknown as Record<string, unknown>)[family]
    if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return unusableBudget(family)
    return limit
  }

  const spendable = (amount: number): number =>
    typeof amount === 'number' && Number.isFinite(amount) && amount > 0 ? amount : 0

  const maxFuel = limitFor('fuel')
  const maxDepth = limitFor('depth')
  const maxAllocation = limitFor('allocation')

  let fuel = 0
  let depth = 0
  let allocated = 0

  return Object.freeze({
    tick: (): void => {
      fuel += 1
      if (fuel > maxFuel) exhausted('fuel', maxFuel)
    },
    enter: (): void => {
      depth += 1
      if (depth > maxDepth) exhausted('depth', maxDepth)
    },
    exit: (): void => {
      if (depth > 0) depth -= 1
    },
    charge: (amount: number): void => {
      allocated += spendable(amount)
      if (allocated > maxAllocation) exhausted('allocation', maxAllocation)
    }
  })
}
`

export { GUARD_FACTORY, GUARD_INSTANCE, guardRuntime }
