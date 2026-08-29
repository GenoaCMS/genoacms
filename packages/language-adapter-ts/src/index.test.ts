import { describe, it, expect } from 'vitest'
import type { Attribute, ComponentHeaderAttributes } from '@genoacms/internal/attributes'
import type { ComponentShape } from '@genoacms/internal/languageAdapter'
import adapter from './index.js'

/**
 * The adapter's own behavior, asserted where it lives.
 *
 * What is checked here is the part only this package can be asked about: turning a body and a shape
 * into something that compiles, and saying what is wrong when it cannot. What the CMS does with the
 * result — refusing a publication on a fatal diagnostic — is the CMS's own test.
 *
 * **Nothing here derives attributes**, because nothing does any more. An adapter used to read a
 * hand-written signature to learn what a component accepted; a component's shape is authored in the
 * registrar now, so an adapter reporting attributes would be handing back what it was just given.
 */

const attribute = (uid: string, name: string, type: Attribute['type']): Attribute =>
  ({ uid, name, type, schema: { title: name, description: '', required: false } } as Attribute)

const shapeOf = (...attributes: Attribute[]): ComponentShape => {
  const byUid: ComponentHeaderAttributes = {}
  for (const each of attributes) byUid[each.uid] = each
  return { attributes: byUid, attributeOrder: attributes.map(each => each.uid) }
}

describe('checking what the author wrote', () => {
  it('says nothing about a body it can wrap', async () => {
    const result = await adapter.analyze({
      body: 'return heading',
      shape: shapeOf(attribute('a', 'heading', 'string'))
    })

    expect(result.diagnostics).toEqual([])
  })

  it('reports a shape whose attributes cannot become parameters', async () => {
    // Emission runs before the ruleset: a shape that cannot become a parameter list has no assembled
    // source worth scanning, and scanning it anyway reports security rules about a signature the
    // author never wrote.
    const result = await adapter.analyze({
      body: 'return null',
      shape: shapeOf(attribute('a', 'heading text', 'string'), attribute('b', 'heading-text', 'string'))
    })

    expect(result.diagnostics).toMatchObject([{ severity: 'fatal', rule: 'colliding-attribute-names' }])
  })

  it('has no attributes to report, whatever the body says', async () => {
    // The old contract returned them. A caller reading `attributes` off this result would now get
    // `undefined` and, if it were still trusted, would publish a component that accepts nothing.
    const result = await adapter.analyze({ body: 'return 1', shape: shapeOf() })

    expect(result).not.toHaveProperty('attributes')
  })
})

describe('compiling', () => {
  // What compilation emits and what it refuses is asserted in `compile.test.ts`. What matters here
  // is that the adapter assembles the body first and reaches it at all.
  it('wraps the body in the emitted entry function and compiles it', async () => {
    const result = await adapter.compileBundle({
      body: 'return heading',
      shape: shapeOf(attribute('a', 'heading', 'string')),
      platform: 'web-esmodule'
    })

    expect(result.diagnostics).toEqual([])
    expect(result.executableCode).toContain('function component')
  })

  it('refuses a shape it cannot emit rather than compiling nonsense from it', async () => {
    // Compiling anyway would report syntax errors about a signature the author never wrote.
    const result = await adapter.compileBundle({
      body: 'return null',
      shape: shapeOf(attribute('a', '???', 'string')),
      platform: 'web-esmodule'
    })

    expect(result.executableCode).toBeUndefined()
    expect(result.diagnostics).toMatchObject([{ rule: 'unnameable-attribute' }])
  })

  it('reports a fault in the body at the line the author sees it on', async () => {
    // The compiler saw a signature above the body. Reporting its line number would point at a line
    // the author never wrote — and for a short body, at one that does not exist.
    const result = await adapter.compileBundle({
      body: "import { x } from 'somewhere'\nreturn x",
      shape: shapeOf(attribute('a', 'heading', 'string')),
      platform: 'web-esmodule'
    })

    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(result.diagnostics[0].line).toBe(1)
  })

  it('refuses an import before compiling, at the line the author wrote it on', async () => {
    // The coordinate hazard this arrangement exists for: the ban reads the body, so its line is
    // already the author's. Passing it through the prologue mapping turned line 1 into line 0, which
    // is dropped as belonging to emitted code — the diagnostic disappeared entirely.
    const result = await adapter.compileBundle({
      body: 'import fs from "fs"\nreturn heading',
      shape: shapeOf(attribute('a', 'heading', 'string')),
      platform: 'web-esmodule'
    })

    expect(result.executableCode).toBeUndefined()
    expect(result.diagnostics.map(one => one.rule)).toEqual(['SAST-04'])
    expect(result.diagnostics[0].line).toBe(1)
  })

  it('compiles a body that uses the capability parameter', async () => {
    // End to end: the parameter is emitted, survives compilation, and is there for a component to
    // read. Without this the signature could be right and the artifact still not carry it.
    const result = await adapter.compileBundle({
      body: 'return String(passthrough.locale)',
      shape: shapeOf(attribute('a', 'heading', 'string')),
      platform: 'web-esmodule'
    })

    expect(result.diagnostics).toEqual([])
    expect(result.executableCode).toContain('passthrough')
  })

  it('does not read a capability as a banned global', async () => {
    // `passthrough.fetch` is the sanctioned route by construction: it is a property of an object the
    // consumer supplied, not the global primitive SAST-05 refuses.
    const result = await adapter.analyze({
      body: 'return passthrough.fetch("/products")',
      shape: shapeOf(attribute('a', 'heading', 'string'))
    })

    expect(result.diagnostics).toEqual([])
  })

  it('refuses a platform it cannot target', async () => {
    const result = await adapter.compileBundle({
      body: 'return 1',
      shape: shapeOf(),
      platform: 'jvm-class' as never
    })

    expect(result.executableCode).toBeUndefined()
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })
})

describe('the adapter itself', () => {
  it('declares the language it reads and the platforms it targets', () => {
    expect(adapter.language).toBe('typescript')
    expect(adapter.platforms).toContain('web-esmodule')
  })
})
