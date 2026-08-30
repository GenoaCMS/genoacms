import { describe, it, expect } from 'vitest'
import type { Attribute, ComponentHeaderAttributes } from '@genoacms/internal/attributes'
import type { ComponentShape } from '@genoacms/internal/languageAdapter'
import type { GuardBudgets } from '@genoacms/internal/guards'
import { isGuardExhausted } from '@genoacms/internal/guards'
import { assemble } from '../emit.js'
import { injectGuards } from './inject.js'
import adapter from '../index.js'

/**
 * Fuel, asserted where it can actually be spent.
 *
 * Half of these read the injected source, and half **compile a component and run it** — a tick in
 * the right place that never fires would look identical to one that does, and the claim is that a
 * runaway stops.
 */

const attribute = (uid: string, name: string, type: Attribute['type']): Attribute =>
  ({ uid, name, type, schema: { title: name, description: '', required: false } } as Attribute)

const shapeOf = (...attributes: Attribute[]): ComponentShape => {
  const byUid: ComponentHeaderAttributes = {}
  for (const each of attributes) byUid[each.uid] = each
  return { attributes: byUid, attributeOrder: attributes.map(each => each.uid) }
}

const count = shapeOf(attribute('a', 'count', 'number'))

const GENEROUS: GuardBudgets = { fuel: 1_000_000, depth: 100, allocation: 10_000_000 }

const injected = (body: string, ceilings: GuardBudgets = GENEROUS) =>
  injectGuards(assemble(body, count).source, ceilings, assemble(body, count).prologueLines)

/** The compiled component, loaded and ready to call. */
const runnable = async (body: string, ceilings: GuardBudgets = GENEROUS) => {
  const result = await adapter.compileBundle({
    body, shape: count, platform: 'web-esmodule', ceilings
  })
  if (result.executableCode === undefined) {
    throw new Error(`did not compile: ${result.diagnostics.map(one => one.message).join(', ')}`)
  }
  const module = await import(
    /* @vite-ignore */
    `data:text/javascript;base64,${Buffer.from(result.executableCode).toString('base64')}`
  )
  return module.default as (count: number, passthrough?: Record<string, unknown>) => unknown
}

const thrownBy = async (act: () => unknown): Promise<unknown> => {
  try {
    await act()
  } catch (error) {
    return error
  }
  return undefined
}

describe('where the ticks go', () => {
  const ticks = (body: string): number =>
    injected(body).source.split(`${injected(body).guards}.tick()`).length - 1

  it.each([
    ['for', 'for (let i = 0; i < count; i++) { void i }\nreturn ""'],
    ['for-of', 'for (const x of [1]) { void x }\nreturn ""'],
    ['for-in', 'for (const k in {}) { void k }\nreturn ""'],
    ['while', 'let i = 0\nwhile (i < count) { i++ }\nreturn ""'],
    ['do-while', 'let i = 0\ndo { i++ } while (i < count)\nreturn ""']
  ])('ticks a %s loop', (_, body) => {
    expect(ticks(body)).toBe(1)
  })

  it('ticks a loop whose body is a single statement', () => {
    // `while (x) step()` has no block to open, so it grows one.
    expect(ticks('let i = 0\nwhile (i < count) i++\nreturn ""')).toBe(1)
  })

  it.each([
    ['a declaration', 'function f () { return 1 }\nreturn String(f())'],
    ['an expression', 'const f = function () { return 1 }\nreturn String(f())'],
    ['an arrow with a block', 'const f = () => { return 1 }\nreturn String(f())'],
    ['an arrow with an expression', 'const f = () => 1\nreturn String(f())']
  ])('ticks a function written as %s', (_, body) => {
    expect(ticks(body)).toBe(1)
  })

  it('ticks each site once, not once per site per pass', () => {
    const body = 'for (const x of [1]) { void x }\nfunction f () { return 1 }\nreturn String(f())'

    expect(ticks(body)).toBe(2)
  })

  it('does not tick the component itself', () => {
    // It runs once per render against guards built for that render, so a tick could only charge one.
    expect(ticks('return ""')).toBe(0)
  })

  it('does not tick the helper', () => {
    // The helper has loops and functions of its own. Instrumenting them would make a component pay
    // fuel for the counting.
    const { source, guards } = injected('for (const x of [1]) { void x }\nreturn ""')
    const helper = source.indexOf('function __genoaGuards')

    expect(source.slice(helper).includes(`${guards}.tick()`)).toBe(false)
  })
})

describe('sites inside other sites', () => {
  /*
   * Where an edit that replaced a span rather than inserting at a point emitted source that did not
   * parse: the inner arrow's edit landed inside the outer one's span, and the outer replacement
   * spliced over it.
   *
   *     () => xs.map(x => x * 2)
   *     └───┬───┘   └────┬────┘
   *      outer          inner
   */
  const ticks = (body: string): number =>
    injected(body).source.split(`${injected(body).guards}.tick()`).length - 1

  it('instruments an arrow nested in an arrow', () => {
    expect(ticks('const f = () => [1, 2].map(x => x * 2)\nreturn String(f().length)')).toBe(2)
  })

  it('instruments an arrow that returns an arrow, which ends where it does', () => {
    // Both bodies close at the same character, so the two edits land on one offset.
    expect(ticks('const f = () => (n: number) => n\nreturn String(f()(count))')).toBe(2)
  })

  it('instruments a loop inside a function inside a loop', () => {
    const body =
      'for (const a of [1]) {\n' +
      '  const f = () => { for (const b of [2]) { void b } }\n' +
      '  f()\n' +
      '  void a\n}\nreturn ""'

    expect(ticks(body)).toBe(3)
  })

  it.each([
    ['nested arrows', 'const f = () => [1, 2].map(x => x * 2)\nreturn String(f().join(","))', '2,4'],
    ['an arrow returning an arrow', 'const f = () => (n: number) => n * 2\nreturn String(f()(count))', '10'],
    ['a loop inside a function inside a loop',
      'let t = 0\nfor (const a of [1, 2]) { const f = () => { for (const b of [3]) { t += a * b } }\n f() }\nreturn String(t)',
      '9']
  ])('still computes the same answer for %s', async (_, body, expected) => {
    const component = await runnable(body)

    expect(component(5)).toBe(expected)
  })

  it('still runs a component with an empty function in it', async () => {
    const component = await runnable('function noop () {}\nnoop()\nreturn "ok"')

    expect(component(1)).toBe('ok')
  })

  it('charges every nested site, not only the outermost', async () => {
    // A tick that is emitted but never reached would look the same in the source as one that is.
    const body = 'const f = () => [1, 2, 3].map(x => x * 2)\nreturn String(f().length)'
    const component = await runnable(body, { ...GENEROUS, fuel: 3 })

    expect(await thrownBy(() => component(1))).toMatchObject({ guard: 'fuel' })
  })
})

describe('what the ticks cost in lines', () => {
  it('adds none', () => {
    // Everything goes on the line that already opens the block. The alternative is a line map
    // carried through the pipeline, which every guard family after this would have to maintain.
    const body = 'for (const x of [1]) {\n  void x\n}\nreturn ""'
    const plain = assemble(body, count).source.split('\n').length

    expect(injected(body).source.split('\n').length).toBe(plain + guardLines())
  })

  it('leaves the author\'s body where the reported prologue says it is', () => {
    const body = 'let i = 0\nwhile (i < count) { i++ }\nreturn String(i)'
    const { source, prologueLines } = injected(body)

    const lines = source.split('\n').slice(prologueLines, prologueLines + 3)

    expect(lines[0].trim()).toBe('let i = 0')
    expect(lines[2].trim()).toBe('return String(i)')
  })

  it('reports a fault after a loop on the line the author wrote it on', async () => {
    const result = await adapter.compileBundle({
      body: 'for (const x of [1]) { void x }\nconst c = =\nreturn ""',
      shape: count,
      platform: 'web-esmodule',
      ceilings: GENEROUS
    })

    expect(result.diagnostics).toMatchObject([{ severity: 'fatal', line: 2 }])
  })
})

/** How many lines the appended helper and the instantiation occupy. */
const guardLines = (): number => {
  const bare = assemble('return ""', count)
  return injectGuards(bare.source, GENEROUS, bare.prologueLines).source.split('\n').length -
    bare.source.split('\n').length
}

describe('spending it', () => {
  it('runs a component that stays inside its budget', async () => {
    const component = await runnable('let i = 0\nwhile (i < count) { i++ }\nreturn String(i)', {
      ...GENEROUS, fuel: 1_000
    })

    expect(component(100)).toBe('100')
  })

  it('stops one that does not', async () => {
    const component = await runnable('let i = 0\nwhile (i < count) { i++ }\nreturn String(i)', {
      ...GENEROUS, fuel: 1_000
    })

    const error = await thrownBy(() => component(5_000))

    expect(isGuardExhausted(error)).toBe(true)
    expect(error).toMatchObject({ guard: 'fuel', limit: 1_000 })
  })

  it('stops a loop that states no way out', async () => {
    // What SAST-08 leaves behind: a loop with a `break` it can never reach is accepted at commit,
    // and this is what carries it.
    const component = await runnable('while (true) { if (count < 0) break }\nreturn ""', {
      ...GENEROUS, fuel: 5_000
    })

    expect(isGuardExhausted(await thrownBy(() => component(1)))).toBe(true)
  })

  it('stops runaway recursion with no loop in sight', async () => {
    // Depth is left wide open, so this is fuel doing it and not the depth guard getting there first.
    const body = 'function down (n: number): number { return down(n + 1) }\nreturn String(down(0))'
    const component = await runnable(body, { fuel: 500, depth: 100_000, allocation: 10_000_000 })

    expect(await thrownBy(() => component(1))).toMatchObject({ guard: 'fuel' })
  })

  it('stops mutual recursion, which no call graph here recognized', async () => {
    // The reason every function is ticked rather than the ones something proved recursive.
    const body =
      'function a (n: number): number { return b(n) }\n' +
      'function b (n: number): number { return a(n) }\n' +
      'return String(a(0))'
    const component = await runnable(body, { fuel: 500, depth: 100_000, allocation: 10_000_000 })

    expect(await thrownBy(() => component(1))).toMatchObject({ guard: 'fuel' })
  })

  it('gives each render its own budget', async () => {
    // Twenty placements of one component are twenty renders, not one that runs out.
    const component = await runnable('let i = 0\nwhile (i < count) { i++ }\nreturn String(i)', {
      ...GENEROUS, fuel: 1_000
    })

    expect([component(900), component(900), component(900)]).toEqual(['900', '900', '900'])
  })
})

describe('what the component still computes', () => {
  it.each([
    ['a loop', 'let total = 0\nfor (let i = 0; i < count; i++) { total += i }\nreturn String(total)', '10'],
    ['a bodyless loop', 'let i = 0\nwhile (i < count) i++\nreturn String(i)', '5'],
    ['an expression arrow', 'const double = (n: number) => n * 2\nreturn String(double(count))', '10'],
    ['a nested return', 'function f (n: number) { if (n > 0) { return n } return 0 }\nreturn String(f(count))', '5']
  ])('is unchanged by instrumenting %s', async (_, body, expected) => {
    const component = await runnable(body)

    expect(component(5)).toBe(expected)
  })
})
