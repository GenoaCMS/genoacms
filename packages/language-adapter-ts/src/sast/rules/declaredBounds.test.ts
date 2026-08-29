import { describe, it, expect } from 'vitest'
import { describeRule, diagnosticsIn, attribute } from '../harness.js'
import type { ComponentShape } from '@genoacms/internal/languageAdapter'
import type { Attribute } from '@genoacms/internal/attributes'

/**
 * `SAST-07`, whose answer depends on the shape as well as the body.
 *
 * Every other rule can be asked about a fragment alone. This one cannot: whether `count` may size a
 * loop is a fact about the attribute behind it, so each case declares the shape it is written
 * against.
 */

const numeric = (title: string, limits: { minimum?: number, maximum?: number } = {}): Attribute =>
  ({
    uid: title,
    name: title,
    type: 'number',
    schema: { type: 'number', title, description: '', required: false, ...limits }
  } as unknown as Attribute)

const shapeOf = (...attributes: Attribute[]): ComponentShape => ({
  attributes: Object.fromEntries(attributes.map(one => [one.uid, one])),
  attributeOrder: attributes.map(one => one.uid)
})

/** A shape whose one numeric attribute declares nothing, which is what the rule refuses. */
const unbounded = shapeOf(numeric('count'))

/** The same attribute with an upper limit, which is what satisfies it. */
const bounded = shapeOf(numeric('count', { maximum: 100 }))

/**
 * Declared, and bounding nothing.
 *
 * The case the rule exists to refuse and the reason it asks for a maximum rather than "a bound":
 * a minimum leaves the loop free to run as many times as the value says.
 */
const floorOnly = shapeOf(numeric('count', { minimum: 0 }))

describeRule('SAST-07', {
  rejects: [
    { body: 'for (let i = 0; i < count; i++) { void i }\nreturn null', shape: unbounded },
    { body: 'let i = 0\nwhile (i < count) { i++ }\nreturn null', shape: unbounded },
    { body: 'const rows = new Array(count)\nreturn String(rows.length)', shape: unbounded },
    { body: 'return "x".repeat(count)', shape: unbounded },
    { body: 'const buffer = new Uint8Array(count)\nreturn String(buffer.length)', shape: unbounded },
    // The seed a recursion starts from.
    {
      body: 'function walk (depth) { return depth <= 0 ? 0 : walk(depth - 1) }\nreturn String(walk(count))',
      shape: unbounded
    },
    // Declared, and still unbounded above.
    { body: 'for (let i = 0; i < count; i++) { void i }\nreturn null', shape: floorOnly },
    // And the guard that decides when it stops.
    {
      body: 'function walk (i) { if (i >= count) { return 0 }\nreturn walk(i + 1) }\nreturn String(walk(0))',
      shape: unbounded
    }
  ],
  accepts: [
    // The same bodies, once the author has said how large the value may be.
    { body: 'for (let i = 0; i < count; i++) { void i }\nreturn null', shape: bounded },
    { body: 'const rows = new Array(count)\nreturn String(rows.length)', shape: bounded },
    // Used, but nowhere that decides how much work happens.
    { body: 'return String(count + 1)', shape: unbounded },
    { body: 'const label = `${count} items`\nreturn label', shape: unbounded },
    // Indexing is not sizing: the array already exists.
    { body: 'const rows = [1, 2, 3]\nreturn String(rows[count])', shape: unbounded }
  ]
})

describe('what the refusal tells the author', () => {
  it('names the parameter and the position that needs the bound', async () => {
    const [found] = await diagnosticsIn({
      body: 'for (let i = 0; i < count; i++) { void i }\nreturn null',
      shape: unbounded
    })

    expect(found.message).toContain('count')
    expect(found.message).toContain('how many times a loop runs')
  })

  it('says a bound is never inferred, which is the rule\'s whole shape', async () => {
    // Inference was the earlier design and is gone: undecidable under aliasing, and it would rewrite
    // the component's public contract to a value the author never chose.
    const [found] = await diagnosticsIn({
      body: 'const rows = new Array(count)\nreturn String(rows.length)',
      shape: unbounded
    })

    expect(found.message).toContain('never inferred')
  })
})

describe('a value that arrives through the capability object', () => {
  const withCapability = { body: 'for (let i = 0; i < passthrough.limit; i++) { void i }\nreturn null', shape: unbounded }

  it('is warned about rather than refused', async () => {
    // There is no schema to declare a maximum on — the object comes from the consuming application,
    // not from the registrar. Refusing it would forbid a legitimate pattern outright.
    const found = await diagnosticsIn(withCapability)

    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ type: 'security-rule', rule: 'SAST-07', severity: 'warning' })
  })

  it('says where the bound is actually enforced', async () => {
    const found = await diagnosticsIn(withCapability)

    expect(found[0].message).toContain('while the component runs')
  })

  it('says nothing when the capability decides nothing', async () => {
    expect(await diagnosticsIn({ body: 'return String(passthrough.locale)', shape: unbounded }))
      .toEqual([])
  })
})

describe('the boundary this rule does not decide', () => {
  it('does not detect mutual recursion, which the runtime guard carries', async () => {
    // Asserted rather than left to be discovered. Two functions calling each other need a call
    // graph; claiming coverage here would overstate what the ruleset catches, which is worse than
    // covering less openly.
    const found = await diagnosticsIn({
      body:
        'function down (n) { return n <= 0 ? 0 : up(n - 1) }\n' +
        'function up (n) { return down(n - 1) }\n' +
        'return String(down(count))',
      shape: unbounded
    })

    expect(found).toEqual([])
  })

  it('leaves a non-numeric attribute alone, whatever it sizes', async () => {
    const text = { uid: 'label', name: 'label', type: 'string', schema: { type: 'string', title: 'label' } }

    expect(await diagnosticsIn({
      body: 'return "x".repeat(Number(label))',
      shape: shapeOf(text as unknown as Attribute)
    })).toEqual([])
  })
})
