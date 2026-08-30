import { describe, it, expect } from 'vitest'
import { describeRule, diagnosticsIn, violationsIn, attribute } from '../harness.js'
import type { ComponentShape } from '@genoacms/internal/languageAdapter'

/** A shape declaring a slot, so `cards` is a parameter the component was handed. */
const withSlot = (): ComponentShape => {
  const heading = attribute('attribute-1', 'heading', 'string')
  const cards = attribute('attribute-2', 'cards', 'components')
  return {
    attributes: { [heading.uid]: heading, [cards.uid]: cards },
    attributeOrder: [heading.uid, cards.uid]
  }
}

/**
 * Group three: what a component may spend, and what it may write to.
 *
 * The accepting cases carry most of the weight here. Each of these rules decides only the part that
 * *is* decidable and hands the rest to a runtime guard, so a case that a rule must stay silent on is
 * the only thing distinguishing "left to the guard" from "not implemented".
 */

describeRule('SAST-08', {
  rejects: [
    'while (true) { void 0 }\nreturn null',
    'while (1) { void 0 }\nreturn null',
    'for (;;) { void 0 }\nreturn null',
    'do { void 0 } while (true)\nreturn null'
  ],
  accepts: [
    'return heading',
    'for (let i = 0; i < 10; i++) { void i }\nreturn null',
    // A reachable exit is how "repeat until" is written. Whether it is reached is the fuel guard's.
    'while (true) { if (heading) { break } }\nreturn null',
    'while (true) { return heading }',
    // Never terminates and is not decidable as such — the fuel guard carries it, not this rule.
    'let i = 0\nwhile (i < 10) { void i }\nreturn null'
  ]
})

describeRule('SAST-09', {
  rejects: [
    'function spin () { return spin() }\nreturn String(spin())',
    'function walk (n) { return walk(n - 1) }\nreturn String(walk(3))'
  ],
  accepts: [
    'return heading',
    // Guarded, so whether it stops is undecidable rather than decidably false: the depth guard's.
    'function walk (n) { if (n <= 0) { return 0 }\nreturn walk(n - 1) }\nreturn String(walk(3))',
    'function walk (n) { return n <= 0 ? 0 : walk(n - 1) }\nreturn String(walk(3))',
    // Calls something else, which is not recursion this rule decides.
    'function outer () { return inner() }\nfunction inner () { return 1 }\nreturn String(outer())'
  ]
})

describeRule('SAST-10', {
  rejects: [
    'const rows = new Array(heading.length)\nreturn String(rows.length)',
    'const buffer = new Uint8Array(heading.length * 2)\nreturn String(buffer.length)'
  ],
  accepts: [
    'return heading',
    // A literal size is known before anything runs, so there is nothing for a guard to watch.
    'const rows = new Array(10)\nreturn String(rows.length)',
    'const rows = [1, 2, 3]\nreturn String(rows.length)'
  ]
})

describeRule('SAST-11', {
  rejects: [
    'passthrough.cache = heading\nreturn heading',
    'passthrough.state.count = 1\nreturn heading',
    { body: 'cards.push(heading)\nreturn heading', shape: withSlot() },
    { body: 'cards.sort()\nreturn heading', shape: withSlot() },
    { body: 'cards[0] = heading\nreturn heading', shape: withSlot() }
  ],
  accepts: [
    'return heading',
    // Reading is the whole point of the capability object.
    'return String(passthrough.locale)',
    // A copy is the component's own, and sorting it changes nothing anyone else can see.
    { body: 'const ordered = [...cards]\nordered.sort()\nreturn String(ordered.length)', shape: withSlot() },
    'const own = {}\nown.count = 1\nreturn String(own.count)',
    // Rebinding the parameter changes nothing the caller holds.
    { body: 'cards = []\nreturn heading', shape: withSlot() }
  ]
})

describe('the residue each rule hands on', () => {
  it('warns for an allocation rather than refusing it', async () => {
    // The only warning in the ruleset. A size is a runtime value, so refusing here would refuse
    // correct components for something nothing can know yet.
    const found = await diagnosticsIn('const rows = new Array(heading.length)\nreturn String(rows.length)')

    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('warning')
  })

  it('names the guard that carries what an allocation rule cannot decide', async () => {
    const found = await diagnosticsIn('const rows = new Array(heading.length)\nreturn String(rows.length)')

    expect(found[0].message).toContain('allocation guard')
  })

  it('stays silent on a loop that never ends but cannot be shown not to', async () => {
    // The honest boundary: this loop does not terminate, and no rule here says so. Asserted, because
    // a reader could otherwise assume SAST-08 covers non-termination in general.
    expect(await violationsIn('let i = 0\nwhile (i < 10) { void i }\nreturn null')).toEqual([])
  })

  it('stays silent on mutual recursion, which the depth guard carries', async () => {
    expect(await violationsIn(
      'function down (n) { return up(n - 1) }\nfunction up (n) { return down(n - 1) }\nreturn String(down(3))'
    )).toEqual([])
  })
})

describe('a break belonging to a nested loop', () => {
  it('does not rescue the loop around it', async () => {
    // The obvious way to write this wrongly: any break anywhere inside counts. This one ends the
    // inner loop and leaves the outer one running forever.
    const violations = await violationsIn(
      'while (true) { for (let i = 0; i < 3; i++) { break } }\nreturn null'
    )

    expect(violations).toContain('SAST-08')
  })
})
