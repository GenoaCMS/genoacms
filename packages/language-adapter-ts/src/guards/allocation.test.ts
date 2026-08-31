import { describe, it, expect } from 'vitest'
import type { Attribute, ComponentHeaderAttributes } from '@genoacms/internal/attributes'
import type { ComponentShape } from '@genoacms/internal/languageAdapter'
import type { GuardBudgets } from '@genoacms/internal/guards'
import { isGuardExhausted } from '@genoacms/internal/guards'
import { assemble } from '../emit.js'
import { injectGuards } from './inject.js'
import adapter from '../index.js'

/**
 * Allocation: what a component asks for, charged before it gets it.
 *
 * Fuel and depth are left wide open throughout, so anything that trips here tripped on memory.
 */

const attribute = (uid: string, name: string, type: Attribute['type']): Attribute =>
  ({ uid, name, type, schema: { title: name, description: '', required: false } } as Attribute)

const shapeOf = (...attributes: Attribute[]): ComponentShape => {
  const byUid: ComponentHeaderAttributes = {}
  for (const each of attributes) byUid[each.uid] = each
  return { attributes: byUid, attributeOrder: attributes.map(each => each.uid) }
}

const count = shapeOf(attribute('a', 'count', 'number'))

const budgets = (allocation: number): GuardBudgets =>
  ({ fuel: 10_000_000, depth: 10_000, allocation })

const injected = (body: string) =>
  injectGuards(assemble(body, count).source, budgets(10_000_000), assemble(body, count).prologueLines)

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

describe('what gets charged', () => {
  const sizes = (body: string): number =>
    occurrences(injected(body).source, `${injected(body).guards}.size(`)

  it.each([
    'Array', 'Uint8Array', 'Uint32Array', 'Float64Array', 'BigInt64Array', 'ArrayBuffer'
  ])('charges new %s(n)', (constructor) => {
    expect(sizes(`const a = new ${constructor}(count)\nreturn String(a.length)`)).toBe(1)
  })

  it('charges the call form as well as the new form', () => {
    // `Array(n)` allocates exactly as `new Array(n)` does.
    expect(sizes('const a = Array(count)\nreturn String(a.length)')).toBe(1)
  })

  it('wraps the size rather than preceding the call', () => {
    // Preceding it would evaluate the size twice, and an author's size can have side effects.
    const { source, guards } = injected('const a = new Array(count)\nreturn String(a.length)')

    expect(source).toContain(`new Array(${guards}.size(count))`)
  })

  it('leaves a construction with no size alone', () => {
    expect(sizes('const a = new Array()\nreturn String(a.length)')).toBe(0)
  })

  it('leaves an array literal alone', () => {
    // Its size is written down, so nothing about it is decided while the component runs.
    expect(sizes('const a = [1, 2, 3]\nreturn String(a.length)')).toBe(0)
  })

  it('leaves a constructor that takes a value rather than a length alone', () => {
    expect(sizes('const a = new Set([1, 2])\nreturn String(a.size)')).toBe(0)
  })

  it('charges the helper for nothing', () => {
    const { source, guards } = injected('const a = new Array(count)\nreturn String(a.length)')
    const helper = source.indexOf('function __genoaGuards')

    expect(source.slice(helper).includes(`${guards}.size(`)).toBe(false)
  })
})

describe('concatenation', () => {
  const texts = (body: string): number =>
    occurrences(injected(body).source, `${injected(body).guards}.text(`)

  it('charges what a concatenation inside a loop adds', () => {
    const body = 'let out = ""\nfor (let i = 0; i < count; i++) { out += "row" }\nreturn out'

    expect(texts(body)).toBe(1)
  })

  it('leaves a concatenation outside a loop alone', () => {
    // It happens a fixed number of times and cannot grow without bound. Charging it would spend
    // allocation on ordinary string building that no ceiling needs to bound.
    expect(texts('let out = ""\nout += "row"\nreturn out')).toBe(0)
  })

  it('charges one nested in a loop inside a loop once, not once per loop', () => {
    const body =
      'let out = ""\nfor (const a of [1]) { for (const b of [2]) { out += String(a + b) } }\nreturn out'

    expect(texts(body)).toBe(1)
  })

  it('charges a nested concatenation the same as an unnested one', async () => {
    // Charging per enclosing loop would make the same string cost twice as much two loops deep.
    const nested = 'let out = ""\nfor (const a of [1]) { for (const b of [2]) { out += "abcde" } }\nreturn out'
    const component = await runnable(nested, budgets(5))

    expect(component(1)).toBe('abcde')
  })
})

describe('running out of it', () => {
  it('allows an allocation inside the ceiling', async () => {
    const component = await runnable('const a = new Array(count)\nreturn String(a.length)', budgets(100))

    expect(component(100)).toBe('100')
  })

  it('stops one past it', async () => {
    const component = await runnable('const a = new Array(count)\nreturn String(a.length)', budgets(100))

    const error = await thrownBy(() => component(101))

    expect(isGuardExhausted(error)).toBe(true)
    expect(error).toMatchObject({ guard: 'allocation', limit: 100 })
  })

  it('charges before the memory is taken', async () => {
    // A component asking for a billion elements must be stopped rather than reported on afterwards.
    const component = await runnable('const a = new Array(count)\nreturn String(a.length)', budgets(1_000))

    expect(await thrownBy(() => component(1e9))).toMatchObject({ guard: 'allocation' })
  })

  it('accumulates across separate allocations', async () => {
    const body = 'const a = new Array(count)\nconst b = new Array(count)\nreturn String(a.length + b.length)'
    const component = await runnable(body, budgets(150))

    expect(await thrownBy(() => component(100))).toMatchObject({ guard: 'allocation' })
  })

  it('stops a string built until memory runs out', async () => {
    const body = 'let out = ""\nfor (let i = 0; i < count; i++) { out += "12345" }\nreturn out'
    const component = await runnable(body, budgets(50))

    expect(await thrownBy(() => component(1_000))).toMatchObject({ guard: 'allocation' })
  })

  it('gives each render its own budget', async () => {
    const component = await runnable('const a = new Array(count)\nreturn String(a.length)', budgets(100))

    expect([component(90), component(90)]).toEqual(['90', '90'])
  })
})

describe('what the component still computes', () => {
  it.each([
    ['a sized array', 'const a = new Array(count)\nreturn String(a.length)', '5'],
    ['a typed array', 'const a = new Uint8Array(count)\nreturn String(a.length)', '5'],
    ['a built string', 'let out = ""\nfor (let i = 0; i < count; i++) { out += "x" }\nreturn out', 'xxxxx'],
    ['a size with a side effect',
      'let calls = 0\nconst grow = () => { calls++; return count }\nconst a = new Array(grow())\nreturn String(a.length) + calls',
      '51']
  ])('is unchanged by charging %s', async (_, body, expected) => {
    const component = await runnable(body, budgets(10_000))

    expect(component(5)).toBe(expected)
  })

  it('adds no lines', () => {
    const body = 'const a = new Array(count)\nlet out = ""\nreturn String(a.length) + out'
    const { source, prologueLines } = injected(body)

    const lines = source.split('\n').slice(prologueLines, prologueLines + 3).map(one => one.trim())

    expect(lines[1]).toBe('let out = ""')
    expect(lines[2]).toBe('return String(a.length) + out')
  })
})
