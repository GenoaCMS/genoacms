import { describe, it, expect } from 'vitest'
import { describeRule, violationsIn } from '../harness.js'

/**
 * Group two: what a component may reach outside itself.
 *
 * `SAST-04` and `SAST-06` overlap on every dynamic form, deliberately — the first says a component
 * may not import, the second says resolving one while the component runs decides what executes after
 * the artifact was signed. Both are true of `import('fs')`, so both are reported, and the tables
 * below list the same fragment under each rather than picking a winner.
 */

describeRule('SAST-04', {
  rejects: [
    'import fs from "fs"\nreturn heading',
    'import lodash from "lodash"\nreturn heading',
    'export { thing } from "./other"\nreturn heading',
    'return import("fs")',
    'const os = require("os"); return heading',
    'const name = "fs"; return import(name)'
  ],
  accepts: [
    'return heading',
    // Erased before anything is emitted, so it puts nothing in the artifact.
    'import type { Thing } from "./types"\nreturn heading',
    // A local named `require` is the component's own, not a module loader.
    'const require = (key) => key.toUpperCase(); return require(heading)'
  ]
})

describeRule('SAST-06', {
  rejects: [
    'return import("fs")',
    'const os = require("os"); return heading',
    'const name = "lodash"; return import(name)'
  ],
  accepts: [
    'return heading',
    // Static, so nothing is resolved at run time. SAST-04 refuses it; this rule has nothing to say.
    'import fs from "fs"\nreturn heading',
    'import type { Thing } from "./types"\nreturn heading'
  ]
})

const ALLOWED = ['https://api.example.com'] as const

describeRule('SAST-05', {
  rejects: [
    'return fetch("https://example.com")',
    'const send = fetch; return send("https://example.com")',
    'const request = new XMLHttpRequest(); return heading',
    'const socket = new WebSocket("wss://example.com"); return heading',
    /*
     * The half of the allowlist that is decidable where the author is standing. A URL written down
     * is one the ruleset can compare now; refusing it at commit is worth more than the same refusal
     * arriving when somebody loads the page.
     */
    { body: 'return bridge.fetch("https://elsewhere.test/x")', fetchOrigins: ALLOWED },
    { body: 'return bridge.fetch(`https://elsewhere.test/x`)', fetchOrigins: ALLOWED },
    // A prefix of an allowed origin is a different origin.
    { body: 'return bridge.fetch("https://api.example.com.evil.test/x")', fetchOrigins: ALLOWED },
    /*
     * Aliased first, in each of the ways a name can be passed along. Refused at commit rather than
     * left to the runtime check, because the point of deciding it here is that the author finds out
     * where they wrote it instead of when a page fails in production.
     */
    { body: 'const b = bridge; return b.fetch("https://elsewhere.test/x")', fetchOrigins: ALLOWED },
    { body: 'const b = bridge; const c = b; return c.fetch("https://elsewhere.test/x")', fetchOrigins: ALLOWED },
    { body: 'const f = bridge.fetch; return f("https://elsewhere.test/x")', fetchOrigins: ALLOWED },
    { body: 'const { fetch } = bridge; return fetch("https://elsewhere.test/x")', fetchOrigins: ALLOWED },
    { body: 'const { fetch: go } = bridge; return go("https://elsewhere.test/x")', fetchOrigins: ALLOWED },
    { body: 'return bridge["fetch"]("https://elsewhere.test/x")', fetchOrigins: ALLOWED },
    // Relative: it would resolve against whatever page the component is rendered on.
    { body: 'return bridge.fetch("/orders")', fetchOrigins: ALLOWED },
    // An instance that has allowed nothing allows nothing, which is the shipped default.
    { body: 'return bridge.fetch("https://api.example.com/x")', fetchOrigins: [] }
  ],
  accepts: [
    'return heading',
    // What the consuming application chose to grant, which this rule says nothing about.
    'return passthrough.client.load("/products")',
    // A method that shares the name on an object the component was given.
    'const api = { fetch: (path) => path }; return api.fetch("/x")',
    // The sanctioned route, pointed where the instance allows.
    { body: 'return bridge.fetch("https://api.example.com/orders")', fetchOrigins: ALLOWED },
    { body: 'return bridge.fetch("https://api.example.com/a?b=1#c")', fetchOrigins: ALLOWED },
    /*
     * Assembled at run time, so nothing here can decide it. Silent on purpose: the bridge refuses it
     * when the call is made, and a rule that guessed would refuse correct components for a value
     * nobody can know yet.
     */
    { body: 'return bridge.fetch("https://" + heading + "/x")', fetchOrigins: ALLOWED },
    /*
     * An author's own object of that name, in a scope where it can exist — `const bridge` beside the
     * parameter is a syntax error, so shadowing means a nested function. It is theirs, it reaches
     * nothing, and the rule resolves the name rather than matching it.
     */
    {
      body: 'function own () { const bridge = { fetch: (u: string) => u }; return bridge.fetch("https://elsewhere.test/x") }\nreturn own()',
      fetchOrigins: ALLOWED
    },
    // Aliased, and allowed: following the alias has to reach the accepting answer too, or the rule
    // would be refusing every aliased call rather than checking the origin behind it.
    { body: 'const b = bridge; return b.fetch("https://api.example.com/x")', fetchOrigins: ALLOWED },
    /*
     * Some other object's `fetch`, on a name nothing declares. It is not the bridge, so the origin
     * rule has nothing to say about it — and the name resolves to nothing at run time either, so the
     * component fails on its own. Treating every undeclared name as the bridge would refuse this.
     */
    { body: 'return whatever.fetch("https://elsewhere.test/x")', fetchOrigins: ALLOWED }
  ]
})

describe('where the two import rules meet', () => {
  it('reports both for a dynamic import, because both are true of it', async () => {
    const violations = await violationsIn('return import("fs")')

    expect(violations).toContain('SAST-04')
    expect(violations).toContain('SAST-06')
  })

  it('reports only the import ban for a static one', async () => {
    // The line nothing resolves at run time. Splitting the rules by form would have made this the
    // case with no rule at all, which is why SAST-04 bans importing rather than importing *that way*.
    const violations = await violationsIn('import lodash from "lodash"\nreturn heading')

    expect(violations).toEqual(['SAST-04'])
  })

  it('locates a static import in the author\'s body without shifting it', async () => {
    // A body diagnostic is already in the author's coordinates. Subtracting the prologue, as the
    // assembled rules require, would move this one off the line it belongs to.
    const { diagnosticsIn } = await import('../harness.js')
    const found = await diagnosticsIn('const safe = 1\nimport fs from "fs"\nreturn heading')

    expect(found.some(one => one.line === 2)).toBe(true)
  })
})
