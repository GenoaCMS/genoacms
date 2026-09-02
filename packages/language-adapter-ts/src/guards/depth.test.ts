import { describe, it, expect } from 'vitest'
import type { Attribute, ComponentHeaderAttributes } from '@genoacms/internal/attributes'
import type { ComponentShape } from '@genoacms/internal/languageAdapter'
import type { GuardBudgets } from '@genoacms/internal/guards'
import { isGuardExhausted } from '@genoacms/internal/guards'
import { assemble } from '../emit.js'
import { injectGuards } from './inject.js'
import adapter from '../index.js'

/**
 * Depth: how many calls are open at once, which is not what fuel counts.
 *
 * Fuel is left generous throughout, so anything that trips here tripped on nesting rather than on
 * having been called a lot.
 */

const attribute = (uid: string, name: string, type: Attribute['type']): Attribute =>
  ({ uid, name, type, schema: { title: name, description: '', required: false } } as Attribute)

const shapeOf = (...attributes: Attribute[]): ComponentShape => {
  const byUid: ComponentHeaderAttributes = {}
  for (const each of attributes) byUid[each.uid] = each
  return { attributes: byUid, attributeOrder: attributes.map(each => each.uid) }
}

const count = shapeOf(attribute('a', 'count', 'number'))

const budgets = (depth: number): GuardBudgets =>
  ({ fuel: 10_000_000, depth, allocation: 10_000_000 })

const injected = (body: string) =>
  injectGuards(assemble(body, count).source, budgets(100), assemble(body, count).prologueLines)

const runnable = async (body: string, ceilings: GuardBudgets) => {
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

const occurrences = (text: string, needle: string): number => text.split(needle).length - 1

describe('where the accounting goes', () => {
  it.each([
    ['a declaration', 'function f () { return 1 }\nreturn String(f())'],
    ['an expression', 'const f = function () { return 1 }\nreturn String(f())'],
    ['an arrow with a block', 'const f = () => { return 1 }\nreturn String(f())'],
    ['an arrow with an expression', 'const f = () => 1\nreturn String(f())']
  ])('accounts for a function written as %s', (_, body) => {
    const { source, guards } = injected(body)

    expect(occurrences(source, `${guards}.enter()`)).toBe(1)
    expect(occurrences(source, `${guards}.exit()`)).toBe(1)
  })

  it('gives back every level it takes', () => {
    const body =
      'function a () { return 1 }\nconst b = () => 2\nfor (const x of [1]) { void x }\n' +
      'return String(a() + b())'
    const { source, guards } = injected(body)

    expect(occurrences(source, `${guards}.enter()`)).toBe(occurrences(source, `${guards}.exit()`))
  })

  it('does not account for a loop', () => {
    // A loop does not nest calls. Counting it here would spend depth on iteration, which is fuel's.
    const { source, guards } = injected('for (const x of [1]) { void x }\nreturn ""')

    expect(occurrences(source, `${guards}.enter()`)).toBe(0)
  })

  it('does not account for the component itself', () => {
    expect(occurrences(injected('return ""').source, `${injected('return ""').guards}.enter()`)).toBe(0)
  })

  it('does not account for the helper', () => {
    const { source, guards } = injected('function f () { return 1 }\nreturn String(f())')
    const helper = source.indexOf('function __genoaGuards')

    expect(source.slice(helper).includes(`${guards}.enter()`)).toBe(false)
  })

  it('puts the exit in a finally', () => {
    // Without it, a component that catches its own error leaves the counter permanently raised and
    // trips the guard for something it already handled.
    const { source, guards } = injected('function f () { return 1 }\nreturn String(f())')

    expect(source).toContain(`} finally { ${guards}.exit(); }`)
  })

  it('accounts for a function with nothing in it', () => {
    // An empty block is where a body's opening and closing offsets are the same one, so it gets a
    // single edit rather than two that would have to be ordered against each other.
    const { source, guards } = injected('function noop () {}\nnoop()\nreturn ""')

    expect(source).toContain(`{ ${guards}.enter(); try {`)
    expect(occurrences(source, `${guards}.exit()`)).toBe(1)
  })

  it('adds no lines', () => {
    const body = 'function f () {\n  return 1\n}\nreturn String(f())'
    const { source, prologueLines } = injected(body)

    const lines = source.split('\n').slice(prologueLines, prologueLines + 4)

    expect(lines.map(one => one.trim())[1]).toBe('return 1')
    expect(lines.map(one => one.trim())[3]).toBe('return String(f())')
  })
})

describe('running out of it', () => {
  const down = 'function down (n: number): number { return n <= 0 ? 0 : down(n - 1) }\nreturn String(down(count))'

  it('allows nesting up to the ceiling', async () => {
    const component = await runnable(down, budgets(20))

    expect(component(19)).toBe('0')
  })

  it('stops one level deeper', async () => {
    const component = await runnable(down, budgets(20))

    const error = await thrownBy(() => component(25))

    expect(isGuardExhausted(error)).toBe(true)
    expect(error).toMatchObject({ guard: 'depth', limit: 20 })
  })

  it('stops mutual recursion too', async () => {
    const body =
      'function a (n: number): number { return b(n) }\n' +
      'function b (n: number): number { return a(n) }\n' +
      'return String(a(0))'
    const component = await runnable(body, budgets(30))

    expect(await thrownBy(() => component(1))).toMatchObject({ guard: 'depth' })
  })

  it('does not accumulate across calls that returned', async () => {
    // The claim the `finally` exists for. A thousand sequential calls nest one deep, not a thousand.
    const body =
      'function one (n: number) { return n + 1 }\n' +
      'let total = 0\nfor (let i = 0; i < count; i++) { total = one(total) }\nreturn String(total)'
    const component = await runnable(body, budgets(3))

    expect(component(1_000)).toBe('1000')
  })

  it('gives the level back when a call throws', async () => {
    // Without a finally the caught error would leave the counter raised, and the loop would trip on
    // depth for something the component already handled.
    const body =
      'function boom (): number { throw new Error("no") }\n' +
      'let caught = 0\n' +
      'for (let i = 0; i < count; i++) { try { boom() } catch { caught++ } }\n' +
      'return String(caught)'
    const component = await runnable(body, budgets(3))

    expect(component(50)).toBe('50')
  })

  it('lets an error the component itself threw out unchanged', async () => {
    const body = 'function boom (): number { throw new Error("mine") }\nreturn String(boom())'
    const component = await runnable(body, budgets(10))

    const error = await thrownBy(() => component(1))

    expect(isGuardExhausted(error)).toBe(false)
    expect((error as Error).message).toBe('mine')
  })

  it('gives each render its own levels', async () => {
    const component = await runnable(down, budgets(20))

    expect([component(10), component(10), component(10)]).toEqual(['0', '0', '0'])
  })
})

describe('what the component still computes', () => {
  it.each([
    ['a returned value', 'function f (n: number) { return n * 2 }\nreturn String(f(count))', '10'],
    ['a value from a finally-wrapped branch',
      'function f (n: number) { if (n > 0) { return "yes" } return "no" }\nreturn f(count)', 'yes'],
    ['an expression arrow', 'const f = (n: number) => n + 1\nreturn String(f(count))', '6'],
    ['a nested call chain',
      'const a = (n: number) => b(n) + 1\nconst b = (n: number) => n * 2\nreturn String(a(count))', '11']
  ])('is unchanged by accounting for %s', async (_, body, expected) => {
    const component = await runnable(body, budgets(50))

    expect(component(5)).toBe(expected)
  })
})
