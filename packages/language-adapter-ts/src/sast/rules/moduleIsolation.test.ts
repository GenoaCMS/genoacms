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

describeRule('SAST-05', {
  rejects: [
    'return fetch("https://example.com")',
    'const send = fetch; return send("https://example.com")',
    'const request = new XMLHttpRequest(); return heading',
    'const socket = new WebSocket("wss://example.com"); return heading'
  ],
  accepts: [
    'return heading',
    // The sanctioned route, once the data bridge exists.
    'return passthrough.client.load("/products")',
    // A method that shares the name on an object the component was given.
    'const api = { fetch: (path) => path }; return api.fetch("/x")'
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
