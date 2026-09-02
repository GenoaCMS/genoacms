/**
 * The counters a compiled component runs against.
 *
 *     budgets ──▶ __genoaGuards(budgets) ──▶ { tick, enter, exit, size, text }
 *                                                │      │      │     │     │
 *                        loop headers ───────────┘      │      │     │     │
 *                        function entries ──────────────┴──────┘     │     │
 *                        array and buffer sizes ──────────────────────┘     │
 *                        concatenation in a loop ──────────────────────────┘
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
 * **The allocation guard hands its argument back.** `size` charges a length and returns it, so it
 * wraps the size a constructor is given rather than being called beside it — one evaluation, and the
 * charge lands before the memory is taken rather than reporting it afterwards. `text` does the same
 * for a value being concatenated, charging what its string form costs.
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
  size: (amount: number) => number
  text: (value: unknown) => unknown
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

  const spend = (amount: number): void => {
    allocated += spendable(amount)
    if (allocated > maxAllocation) exhausted('allocation', maxAllocation)
  }

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
    size: (amount: number): number => {
      spend(amount)
      return amount
    },
    text: (value: unknown): unknown => {
      spend(String(value).length)
      return value
    }
  })
}
`

/** The name the bridge factory is given, and the binding holding the allowlist. */
const BRIDGE_FACTORY = '__genoaBridge'
const BRIDGE_ORIGINS = '__genoaOrigins'

/**
 * The data bridge, as TypeScript.
 *
 * **The check lives here, inside the artifact, because the artifact is what the CMS signed.** The
 * consumer supplies the raw network call; what it may be pointed at is decided by a list compiled in
 * and covered by the signature, so no SDK can widen it and nothing in transit can either.
 *
 * An origin is compared after the platform's own parser has read the URL, so `https://api.example.com`
 * matches `https://api.example.com/orders?page=2` and does not match `https://api.example.com.evil.test`.
 * Comparing strings by prefix is the mistake that makes an allowlist look like one without being one.
 *
 * A relative URL has no origin of its own and is refused: it would resolve against whatever page the
 * component happens to be rendered on, which is not a decision the allowlist ever made.
 */
const bridgeRuntime = (factory: string, origins: string, allowed: readonly string[]): string =>
  `const ${origins}: readonly string[] = ${JSON.stringify([...allowed])}

interface __GenoaBridge {
  fetch: (url: string, init?: unknown) => Promise<unknown>
}

function ${factory} (net: (url: string, init?: unknown) => Promise<unknown>): __GenoaBridge {
  const refused = (url: string): never => {
    const error = new Error(
      'This component may not reach ' + String(url) + '. The origins it may reach are set by the ' +
      'instance that published it.'
    )
    error.name = 'BridgeOriginRefused'
    throw error
  }

  const permitted = (url: string): boolean => {
    try {
      return ${origins}.indexOf(new URL(String(url)).origin) !== -1
    } catch {
      return false
    }
  }

  return Object.freeze({
    fetch: (url: string, init?: unknown): Promise<unknown> => {
      if (!permitted(url)) return refused(url)
      if (typeof net !== 'function') {
        const error = new Error('This component asked for the network and none was supplied.')
        error.name = 'NoNetwork'
        throw error
      }
      return net(url, init)
    }
  })
}
`

export { GUARD_FACTORY, GUARD_INSTANCE, BRIDGE_FACTORY, BRIDGE_ORIGINS, guardRuntime, bridgeRuntime }
