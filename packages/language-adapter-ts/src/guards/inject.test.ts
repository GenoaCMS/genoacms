import { describe, it, expect } from 'vitest'
import type { Attribute, ComponentHeaderAttributes } from '@genoacms/internal/attributes'
import type { ComponentShape } from '@genoacms/internal/languageAdapter'
import { assemble } from '../emit.js'
import { injectGuards, availableName } from './inject.js'
import { GUARD_FACTORY } from './runtime.js'
import adapter from '../index.js'

/**
 * The stage that puts the helper into a component, and takes nothing else away.
 *
 * Two claims, and the second is what the step exists for: the helper ends up in the artifact, and
 * every position in the author's body is where it was. A transform is exactly what breaks a
 * coordinate promise, so it is asserted before any guard depends on it.
 */

const attribute = (uid: string, name: string, type: Attribute['type']): Attribute =>
  ({ uid, name, type, schema: { title: name, description: '', required: false } } as Attribute)

const shapeOf = (...attributes: Attribute[]): ComponentShape => {
  const byUid: ComponentHeaderAttributes = {}
  for (const each of attributes) byUid[each.uid] = each
  return { attributes: byUid, attributeOrder: attributes.map(each => each.uid) }
}

const heading = shapeOf(attribute('a', 'heading', 'string'))

const sourceFor = (body: string): string => assemble(body, heading).source

const compile = (body: string) =>
  adapter.compileBundle({ body, shape: heading, platform: 'web-esmodule' })

describe('putting the helper in', () => {
  it('declares it', () => {
    const { source, factory } = injectGuards(sourceFor('return heading'))

    expect(source).toContain(`function ${factory} (`)
  })

  it('leaves the author with what they wrote, byte for byte', () => {
    // A prefix, not a substring: only this formulation also rules out an insertion above the body.
    const original = sourceFor('const a = 1\nconst b = 2\nreturn heading')

    expect(injectGuards(original).source.startsWith(original)).toBe(true)
  })

  it('produces the same bytes for the same source', () => {
    const original = sourceFor('return heading')

    expect(injectGuards(original).source).toBe(injectGuards(original).source)
  })
})

describe('a name the author cannot shadow', () => {
  it('uses the plain name when nothing is in the way', () => {
    expect(injectGuards(sourceFor('return heading')).factory).toBe(GUARD_FACTORY)
  })

  it('steps aside when the author declares it', () => {
    const { factory } = injectGuards(sourceFor(`const ${GUARD_FACTORY} = 1\nreturn heading`))

    expect(factory).toBe(`${GUARD_FACTORY}_1`)
  })

  it('keeps stepping aside', () => {
    const body = `const ${GUARD_FACTORY} = 1\nconst ${GUARD_FACTORY}_1 = 2\nreturn heading`

    expect(injectGuards(sourceFor(body)).factory).toBe(`${GUARD_FACTORY}_2`)
  })

  it('declares whatever name it settled on, and only that one', () => {
    const { source, factory } = injectGuards(sourceFor(`const ${GUARD_FACTORY} = 1\nreturn heading`))

    expect(source).toContain(`function ${factory} (`)
    expect(source).not.toContain(`function ${GUARD_FACTORY} (`)
  })

  it('says nothing to the author about it', async () => {
    const result = await compile(`const ${GUARD_FACTORY} = 1\nreturn heading`)

    expect(result.diagnostics).toEqual([])
  })

  it('is not fooled by a name that only appears in a string', () => {
    // Identifiers come from the AST, so a component printing the name does not push the helper to a
    // suffix nobody needed.
    const { factory } = injectGuards(sourceFor(`return "${GUARD_FACTORY}"`))

    expect(factory).toBe(GUARD_FACTORY)
  })
})

describe('choosing the name, on its own', () => {
  it('prefers the name it was given', () => {
    expect(availableName(new Set(['other']), '__g')).toBe('__g')
  })

  it('counts past every name already taken', () => {
    expect(availableName(new Set(['__g', '__g_1', '__g_2']), '__g')).toBe('__g_3')
  })

  it('skips no suffix that is free', () => {
    expect(availableName(new Set(['__g', '__g_2']), '__g')).toBe('__g_1')
  })
})

describe('what the author sees afterwards', () => {
  /*
   *     body line 3 ──▶ assembled line 3 + prologue ──▶ injected (nothing moves) ──▶ esbuild
   *                                                                                    │
   *     author reads line 3 ◀── minus prologue ◀───────────────────────────────────────┘
   */
  it('reports a fault on the line the author wrote it on', async () => {
    const result = await compile('const a = 1\nconst b = 2\nconst c = =\nreturn heading')

    expect(result.diagnostics).toMatchObject([{ severity: 'fatal', line: 3 }])
  })

  it('reports a fault on the first line as line one', async () => {
    // The line most easily lost: a prologue that grew would push it to zero, where a diagnostic is
    // dropped as belonging to emitted code and the author is told nothing.
    const result = await compile('const c = =\nreturn heading')

    expect(result.diagnostics).toMatchObject([{ severity: 'fatal', line: 1 }])
  })

  it('still compiles a component that is fine', async () => {
    const result = await compile('return heading')

    expect(result.diagnostics).toEqual([])
    expect(result.executableCode).toBeDefined()
  })
})

describe('what a consumer receives', () => {
  it('carries the helper inside the artifact', async () => {
    // Inside, and therefore inside the signature: removing the bounds changes signed bytes.
    const result = await compile('return heading')

    expect(result.executableCode).toContain(GUARD_FACTORY)
  })

  it('still exports the component as the default', async () => {
    const result = await compile('return heading')

    expect(result.executableCode).toContain('component as default')
  })

  it('carries no types into what runs', async () => {
    const result = await compile('return heading')

    expect(result.executableCode).not.toContain('interface')
    expect(result.executableCode).not.toContain('__GenoaBudgets')
  })
})
