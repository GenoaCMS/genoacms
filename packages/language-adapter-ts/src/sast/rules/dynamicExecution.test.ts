import { describe, it, expect } from 'vitest'
import { describeRule, violationsIn } from '../harness.js'

/**
 * Group one: reaching outside the component.
 *
 * Every case is a fragment an author could actually write. The **accepting** cases are chosen
 * adversarially rather than for coverage — each one resembles a violation and is legitimate, because
 * a rule is only worth having if it can tell those apart. An empty body would pass any rule ever
 * written and prove nothing about this one.
 */

describeRule('SAST-01', {
  rejects: [
    'return eval("1 + 1")',
    'const build = eval; return build("1")',
    'return new Function("return 1")()',
    'return Function("return 1")()',
    'setTimeout("alert(1)", 0); return null',
    'setInterval(`alert(1)`, 0); return null'
  ],
  accepts: [
    'return heading',
    // The legitimate half of the same function, which the rule must not cost the author.
    'setTimeout(() => undefined, 0); return null',
    // A property that happens to share the name. `evaluate` is not `eval`.
    'const helper = { evaluate: () => 1 }; return String(helper.evaluate())',
    'const values = { eval: 1 }; return String(values.eval)',
    // Mentioned, not called. This was reported as evaluation until the rule started requiring the
    // identifier to be the callee: the enclosing call's first argument is a string, which is what
    // the rule had been matching on.
    'const register = (label, fn) => fn; register("tick", setTimeout); return heading'
  ]
})

describeRule('SAST-02', {
  rejects: [
    'return String(globalThis)',
    'return String(window.location)',
    'return String(process.env.SECRET)',
    'return String(localStorage.getItem("token"))',
    'const escape = globalThis; return String(escape)',
    'return document.cookie',
    // The bracketed spelling of the same access, which is the first thing tried when the dotted one
    // is refused.
    'return document["cookie"]',
    /*
     * `document` was permitted until 1 September 2026, on the reasoning that a component has to build
     * the DOM it returns. From it a component reached `window`, and through that `eval`,
     * `localStorage` and the network — in one hop, through a name nothing banned. What replaces it is
     * the `dom` parameter, so building a node no longer requires reaching a global.
     */
    'const node = document.createElement("div"); node.textContent = heading; return node',
    'return String(document.defaultView)',
    'return String(document.location.href)'
  ],
  accepts: [
    'return heading',
    // What a component builds nodes with now: a parameter, not a global.
    'const node = dom.element("div"); node.textContent = heading; return node',
    // The author's own local, which is not the global however it is spelled.
    'const process = (value) => value.trim(); return process(heading)',
    // And their own `document`, which is theirs and reaches nothing.
    'const document = { title: heading }; return document.title'
  ]
})

describeRule('SAST-03', {
  rejects: [
    'const target = {}; target.__proto__.polluted = true; return null',
    'const target = {}; target["__proto__"].polluted = true; return null',
    'Object.setPrototypeOf({}, null); return null',
    'Object.defineProperty(Object.prototype, "x", { value: 1 }); return null',
    'return String(heading.constructor)',
    // Reflective reconstruction: reaches `Function` without ever naming it, so `SAST-01` cannot see
    // it and this rule is what stands between the ruleset and the obvious evasion.
    'return ({}).constructor.constructor("return 1")()'
  ],
  accepts: [
    'return heading',
    // Defining a property on the component's own object is ordinary work.
    'const own = {}; Object.defineProperty(own, "x", { value: 1 }); return String(own.x)',
    // A property named for a prototype, on an object that is not one.
    'const config = { prototype: "banner" }; return config.prototype'
  ]
})

describe('what the group reports together', () => {
  it('reports each rule once per violation rather than collapsing them', async () => {
    const violations = await violationsIn('return eval(String(globalThis))')

    expect(violations).toContain('SAST-01')
    expect(violations).toContain('SAST-02')
  })

  it('locates a violation in the author\'s body, not the emitted signature', async () => {
    // The mapping that makes a diagnostic actionable. The body below puts the fault on its second
    // line; the assembled source has a signature above it, so an unmapped line number would be
    // larger and point at code the author cannot see.
    const { diagnosticsIn } = await import('../harness.js')
    const found = await diagnosticsIn('const safe = 1\nreturn eval("2")')

    expect(found).toHaveLength(1)
    expect(found[0].line).toBe(2)
  })

  it('refuses reflective reconstruction, whichever rule owns it', async () => {
    // What the corpus actually cares about is that the fragment is refused, not which identifier
    // catches it. `SAST-01` cannot: the evaluator is never named. Asserted here rather than under a
    // rule, so that moving it between rules later cannot quietly stop refusing it.
    const violations = await violationsIn('return ({}).constructor.constructor("return 1")()')

    expect(violations.length).toBeGreaterThan(0)
  })

  it('says nothing about a body that only uses its parameters', async () => {
    // The baseline the whole group is measured against: an ordinary component stays silent.
    expect(await violationsIn('return heading.trim().toUpperCase()')).toEqual([])
  })
})
