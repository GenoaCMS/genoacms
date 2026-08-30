import { describe, it, expect, beforeAll } from 'vitest'
import { Project, ScriptTarget } from 'ts-morph'
import { transform } from 'esbuild'
import { GUARD_EXHAUSTED, GUARD_BUDGET_INVALID, isGuardExhausted } from '@genoacms/internal/guards'
import type { GuardBudgets } from '@genoacms/internal/guards'
import { GUARD_FACTORY, GUARD_RUNTIME } from './runtime.js'

/**
 * The helper, exercised as the text that actually ships.
 *
 * Not as a module imported beside it — there is no such module. The constant is what gets merged
 * into an artifact, so the constant is what these tests compile and run. That is the whole reason
 * the shape is affordable: everything here is a plain function of its budgets, with no AST, no
 * component and no compile in sight.
 */

interface Guards {
  tick: () => void
  enter: () => void
  exit: () => void
  charge: (amount: number) => void
}

type Factory = (budgets: GuardBudgets) => Guards

let build: Factory

beforeAll(async () => {
  // Type-stripped the same way a real artifact is, so the tests run the emitted form rather than a
  // TypeScript-flavored approximation of it.
  const { code } = await transform(`${GUARD_RUNTIME}\nexport { ${GUARD_FACTORY} }\n`, {
    loader: 'ts',
    format: 'esm',
    target: 'esnext'
  })
  const module = await import(
    /* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  )
  build = module[GUARD_FACTORY] as Factory
})

/** Budgets large enough that nothing trips unless a test asks it to. */
const generous: GuardBudgets = { fuel: 1000, depth: 100, allocation: 1_000_000 }

const budgets = (overrides: Partial<GuardBudgets>): GuardBudgets => ({ ...generous, ...overrides })

/** What was thrown, so a test can assert on it rather than only that something failed. */
const thrownBy = (act: () => void): unknown => {
  try {
    act()
  } catch (error) {
    return error
  }
  return undefined
}

describe('the text itself', () => {
  it('is valid TypeScript, with nothing to report about it', () => {
    // This is what the constant costs: no editor checks it while it is written, so the check is a
    // test. A helper that does not compile would fail every component compiled after the transform.
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { strict: true, target: ScriptTarget.ESNext }
    })
    const file = project.createSourceFile('runtime.ts', GUARD_RUNTIME)

    expect(file.getPreEmitDiagnostics().map(one => one.getMessageText())).toEqual([])
  })

  it('declares the factory the transform will call', () => {
    const project = new Project({ useInMemoryFileSystem: true })
    const file = project.createSourceFile('runtime.ts', GUARD_RUNTIME)

    expect(file.getFunction(GUARD_FACTORY)).toBeDefined()
  })

  it.each([GUARD_EXHAUSTED, GUARD_BUDGET_INVALID])('spells %s the way the SDK reads it', (name) => {
    // The text cannot import the shared constant — an artifact resolves nothing — so it carries a
    // literal, and this is what keeps the literal and the vocabulary from drifting apart.
    expect(GUARD_RUNTIME).toContain(`'${name}'`)
  })
})

describe('a budget that was never usable', () => {
  it.each([
    ['absent', undefined],
    ['zero', 0],
    ['negative', -1],
    ['not a number', 'lots'],
    ['infinite', Number.POSITIVE_INFINITY],
    ['NaN', Number.NaN]
  ])('refuses to build guards from a %s fuel budget', (_, fuel) => {
    const error = thrownBy(() => build(budgets({ fuel: fuel as number })))

    expect((error as Error).name).toBe(GUARD_BUDGET_INVALID)
  })

  it.each(['depth', 'allocation'] as const)('refuses a missing %s budget too', (family) => {
    const error = thrownBy(() => build(budgets({ [family]: undefined } as Partial<GuardBudgets>)))

    expect((error as Error).name).toBe(GUARD_BUDGET_INVALID)
  })

  it('is not reported as a component exceeding its budget', () => {
    // Different fault, different owner: an unbounded component is a misconfigured instance, and
    // reporting it as a trip would show the guards working on a render where they were never armed.
    const error = thrownBy(() => build(budgets({ fuel: 0 })))

    expect(isGuardExhausted(error)).toBe(false)
  })

  it('refuses before returning anything to spend', () => {
    expect(() => build(budgets({ fuel: -1 }))).toThrow()
  })
})

describe('fuel', () => {
  it('allows exactly the budget', () => {
    const guards = build(budgets({ fuel: 3 }))

    expect(() => { guards.tick(); guards.tick(); guards.tick() }).not.toThrow()
  })

  it('trips on the one after', () => {
    const guards = build(budgets({ fuel: 3 }))
    guards.tick(); guards.tick(); guards.tick()

    expect(() => guards.tick()).toThrow()
  })

  it('says which guard tripped, and what the limit was', () => {
    // The limit travels because it is the number an operator would change. A message saying only
    // that a component stopped leaves nobody anything to act on.
    const guards = build(budgets({ fuel: 1 }))
    guards.tick()

    const error = thrownBy(() => guards.tick())

    expect(isGuardExhausted(error)).toBe(true)
    expect(error).toMatchObject({ name: GUARD_EXHAUSTED, guard: 'fuel', limit: 1 })
  })

  it('stays tripped once it has tripped', () => {
    // A caught trip must not leave a component with fuel to keep going on — a loop wrapped in a
    // try/catch would otherwise run forever, one throw per iteration.
    const guards = build(budgets({ fuel: 1 }))
    guards.tick()
    thrownBy(() => guards.tick())

    expect(() => guards.tick()).toThrow()
  })

  it('is not spent by the other guards', () => {
    const guards = build(budgets({ fuel: 1 }))
    guards.enter()
    guards.charge(10)

    expect(() => guards.tick()).not.toThrow()
  })
})

describe('depth', () => {
  const nest = (guards: Guards, times: number) => {
    for (let i = 0; i < times; i++) guards.enter()
  }

  it('allows nesting to exactly the budget', () => {
    const guards = build(budgets({ depth: 4 }))

    expect(() => nest(guards, 4)).not.toThrow()
  })

  it('trips one level deeper', () => {
    const guards = build(budgets({ depth: 4 }))
    nest(guards, 4)

    expect(thrownBy(() => guards.enter())).toMatchObject({ guard: 'depth', limit: 4 })
  })

  it('gives the level back on the way out', () => {
    // Depth is the only budget that is not cumulative: a component that recurses four deep, returns,
    // and recurses four deep again has done nothing wrong.
    const guards = build(budgets({ depth: 2 }))
    nest(guards, 2)
    guards.exit()
    guards.exit()

    expect(() => nest(guards, 2)).not.toThrow()
  })

  it('cannot be given back more than was taken', () => {
    // An exit runs in a finally, so a throw deep in a component can unwind past enters that were
    // already accounted for. Crediting those would hand back budget nobody spent.
    const guards = build(budgets({ depth: 1 }))
    guards.exit()
    guards.exit()
    guards.enter()

    expect(() => guards.enter()).toThrow()
  })
})

describe('allocation', () => {
  it('allows exactly the budget, in one request', () => {
    const guards = build(budgets({ allocation: 100 }))

    expect(() => guards.charge(100)).not.toThrow()
  })

  it('accumulates across the whole render', () => {
    // Cumulative rather than a high-water mark: nothing here observes a value being released, and
    // treating each allocation independently would let a loop allocate the budget every iteration.
    const guards = build(budgets({ allocation: 100 }))
    guards.charge(60)

    expect(thrownBy(() => guards.charge(41))).toMatchObject({ guard: 'allocation', limit: 100 })
  })

  it.each([-100, Number.NaN, Number.NEGATIVE_INFINITY])('buys nothing back with %s', (amount) => {
    // A size is whatever expression the author wrote. None of these may buy budget back by being
    // added to the total — so the spent budget has to still be spent afterwards, which the trailing
    // charge is what actually proves. Asserting on the negative charge alone would pass either way.
    const guards = build(budgets({ allocation: 100 }))
    guards.charge(100)
    guards.charge(amount)

    expect(thrownBy(() => guards.charge(1))).toMatchObject({ guard: 'allocation' })
  })

  it('charges nothing for a size that is not a number at all', () => {
    const guards = build(budgets({ allocation: 100 }))

    expect(() => guards.charge('99999' as unknown as number)).not.toThrow()
  })

  it('trips on a single request larger than the whole budget', () => {
    // The charge happens before the allocation does, which is the only ordering that prevents the
    // memory being taken rather than reporting it afterwards.
    const guards = build(budgets({ allocation: 100 }))

    expect(() => guards.charge(1e9)).toThrow()
  })
})

describe('what a component can do to its own guards', () => {
  /*
   * The counters are unreachable — they are closure state, and nothing returns them. What is reachable
   * is the object holding the methods, and an author's body is in scope to write to it.
   *
   *     author's body ──▶ __genoa ──▶ { tick, enter, exit, charge }   ◀── frozen
   *                          │                    │
   *                          │                    └── cannot be replaced
   *                          └── can still be rebound entirely (step 12's problem, not this one)
   */
  it('cannot replace a guard method with a no-op', () => {
    const guards = build(budgets({ fuel: 1 }))

    // Strict mode, which every module is, so this throws rather than quietly succeeding.
    expect(() => { (guards as { tick: unknown }).tick = () => undefined }).toThrow(TypeError)
  })

  it('still trips after trying', () => {
    const guards = build(budgets({ fuel: 1 }))
    try { (guards as { tick: unknown }).tick = () => undefined } catch { /* expected */ }
    guards.tick()

    expect(isGuardExhausted(thrownBy(() => guards.tick()))).toBe(true)
  })

  it('cannot add a method that was not there', () => {
    const guards = build(budgets({}))

    expect(() => { (guards as Record<string, unknown>).refund = () => undefined }).toThrow(TypeError)
  })

  it('hands back no way to read the counters', () => {
    // Nothing to reset, because there is nothing to name. This is what the closure buys over a class
    // with public fields.
    const guards = build(budgets({}))

    expect(Object.keys(guards).sort()).toEqual(['charge', 'enter', 'exit', 'tick'])
  })
})

describe('a component keeps its own counters', () => {
  it('counts separately from another component', () => {
    // Every artifact builds its own, so a page of twenty components does not share one budget and a
    // component near its limit cannot stop the one rendered after it.
    const first = build(budgets({ fuel: 1 }))
    const second = build(budgets({ fuel: 1 }))
    first.tick()
    thrownBy(() => first.tick())

    expect(() => second.tick()).not.toThrow()
  })
})
