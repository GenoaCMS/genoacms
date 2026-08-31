import { describe, it, expect, beforeAll } from 'vitest'
import { Project, ScriptTarget } from 'ts-morph'
import { transform } from 'esbuild'
import { GUARD_EXHAUSTED, GUARD_BUDGET_INVALID, isGuardExhausted } from '@genoacms/internal/guards'
import type { GuardBudgets } from '@genoacms/internal/guards'
import { GUARD_FACTORY, guardRuntime } from './runtime.js'

/**
 * The helper, exercised as the text that actually ships.
 *
 * Not as a module imported beside it — there is no such module. The constant is what gets merged
 * into an artifact, so the constant is what these tests type-strip and run.
 */

const GUARD_RUNTIME = guardRuntime(GUARD_FACTORY)

interface Guards {
  tick: () => void
  enter: () => void
  exit: () => void
  size: (amount: number) => number
  text: (value: unknown) => unknown
}

type Factory = (budgets: GuardBudgets) => Guards

let build: Factory

beforeAll(async () => {
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

const generous: GuardBudgets = { fuel: 1000, depth: 100, allocation: 1_000_000 }

const budgets = (overrides: Partial<GuardBudgets>): GuardBudgets => ({ ...generous, ...overrides })

const thrownBy = (act: () => void): unknown => {
  try {
    act()
  } catch (error) {
    return error
  }
  return undefined
}

const parsed = (compilerOptions = {}) =>
  new Project({ useInMemoryFileSystem: true, compilerOptions })
    .createSourceFile('runtime.ts', GUARD_RUNTIME)

describe('the text itself', () => {
  it('is valid TypeScript, with nothing to report about it', () => {
    // The cost of a constant: no editor checks it as it is written, so the check is a test.
    const file = parsed({ strict: true, target: ScriptTarget.ESNext })

    expect(file.getPreEmitDiagnostics().map(one => one.getMessageText())).toEqual([])
  })

  it('declares the factory the transform will call', () => {
    expect(parsed().getFunction(GUARD_FACTORY)).toBeDefined()
  })

  it.each([GUARD_EXHAUSTED, GUARD_BUDGET_INVALID])('spells %s the way the SDK reads it', (name) => {
    // The text cannot import the shared constant, so it carries a literal; this is what keeps the
    // literal and the vocabulary from drifting apart.
    expect(GUARD_RUNTIME).toContain(`'${name}'`)
  })

  it('carries no prose into the artifact', () => {
    // A comment here is bytes in every published component forever.
    expect(GUARD_RUNTIME).not.toMatch(/\/\/|\/\*/)
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
    // Different fault, different owner. Reporting it as a trip would show guards working on a render
    // where they were never armed.
    expect(isGuardExhausted(thrownBy(() => build(budgets({ fuel: 0 }))))).toBe(false)
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
    const guards = build(budgets({ fuel: 1 }))
    guards.tick()

    const error = thrownBy(() => guards.tick())

    expect(isGuardExhausted(error)).toBe(true)
    expect(error).toMatchObject({ name: GUARD_EXHAUSTED, guard: 'fuel', limit: 1 })
  })

  it('stays tripped once it has tripped', () => {
    // A loop inside a try/catch would otherwise run forever, one throw per iteration.
    const guards = build(budgets({ fuel: 1 }))
    guards.tick()
    thrownBy(() => guards.tick())

    expect(() => guards.tick()).toThrow()
  })

  it('is not spent by the other guards', () => {
    const guards = build(budgets({ fuel: 1 }))
    guards.enter()
    guards.size(10)

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
    // The only budget that is not cumulative: recursing four deep, returning, and recursing four
    // deep again is not a fault.
    const guards = build(budgets({ depth: 2 }))
    nest(guards, 2)
    guards.exit()
    guards.exit()

    expect(() => nest(guards, 2)).not.toThrow()
  })

  it('cannot be given back more than was taken', () => {
    // An exit runs in a finally, so a throw can unwind past enters already accounted for.
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

    expect(() => guards.size(100)).not.toThrow()
  })

  it('accumulates across the whole render', () => {
    // Cumulative rather than a high-water mark: nothing here observes a value being released, so
    // treating allocations independently would let a loop allocate the budget every iteration.
    const guards = build(budgets({ allocation: 100 }))
    guards.size(60)

    expect(thrownBy(() => guards.size(41))).toMatchObject({ guard: 'allocation', limit: 100 })
  })

  it.each([-100, Number.NaN, Number.NEGATIVE_INFINITY])('buys nothing back with %s', (amount) => {
    // The trailing charge is what proves it: asserting on the bad charge alone passes either way.
    const guards = build(budgets({ allocation: 100 }))
    guards.size(100)
    guards.size(amount)

    expect(thrownBy(() => guards.size(1))).toMatchObject({ guard: 'allocation' })
  })

  it('charges nothing for a size that is not a number at all', () => {
    const guards = build(budgets({ allocation: 100 }))

    expect(() => guards.size('99999' as unknown as number)).not.toThrow()
  })

  it('hands the size back, so it can wrap the argument it charges', () => {
    // Wrapping is what puts the charge before the allocation without evaluating the size twice.
    const guards = build(budgets({ allocation: 100 }))

    expect(guards.size(7)).toBe(7)
  })

  it('charges what a value costs as text, and hands the value back', () => {
    const guards = build(budgets({ allocation: 10 }))

    expect(guards.text('abcde')).toBe('abcde')
    expect(thrownBy(() => guards.text('abcdef'))).toMatchObject({ guard: 'allocation' })
  })

  it('charges a non-string by what its text form costs', () => {
    const guards = build(budgets({ allocation: 4 }))
    guards.text(123)

    expect(thrownBy(() => guards.text(45))).toMatchObject({ guard: 'allocation' })
  })

  it('trips on a single request larger than the whole budget', () => {
    const guards = build(budgets({ allocation: 100 }))

    expect(() => guards.size(1e9)).toThrow()
  })
})

describe('what a component can do to its own guards', () => {
  /*
   *     author's body ──▶ __genoa ──▶ { tick, enter, exit, charge }   ◀── frozen
   *                          │                    │
   *                          │                    └── cannot be replaced
   *                          └── can still be rebound (inject.ts answers that)
   */
  const replaceTick = (guards: Guards) => { (guards as { tick: unknown }).tick = () => undefined }

  it('cannot replace a guard method with a no-op', () => {
    expect(() => replaceTick(build(budgets({})))).toThrow(TypeError)
  })

  it('still trips after trying', () => {
    const guards = build(budgets({ fuel: 1 }))
    thrownBy(() => replaceTick(guards))
    guards.tick()

    expect(isGuardExhausted(thrownBy(() => guards.tick()))).toBe(true)
  })

  it('cannot add a method that was not there', () => {
    const guards = build(budgets({}))

    expect(() => { (guards as Record<string, unknown>).refund = () => undefined }).toThrow(TypeError)
  })

  it('hands back no way to read the counters', () => {
    expect(Object.keys(build(budgets({}))).sort()).toEqual(['enter', 'exit', 'size', 'text', 'tick'])
  })
})

describe('a component keeps its own counters', () => {
  it('counts separately from another component', () => {
    const first = build(budgets({ fuel: 1 }))
    const second = build(budgets({ fuel: 1 }))
    first.tick()
    thrownBy(() => first.tick())

    expect(() => second.tick()).not.toThrow()
  })
})
