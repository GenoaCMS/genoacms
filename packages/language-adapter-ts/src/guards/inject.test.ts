import { describe, it, expect } from 'vitest'
import type { Attribute, ComponentHeaderAttributes } from '@genoacms/internal/attributes'
import type { ComponentShape } from '@genoacms/internal/languageAdapter'
import { assemble } from '../emit.js'
import type { GuardBudgets } from '@genoacms/internal/guards'
import { injectGuards, availableName } from './inject.js'
import { GUARD_FACTORY, GUARD_INSTANCE } from './runtime.js'
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

const CEILINGS: GuardBudgets = { fuel: 1_000_000, depth: 100, allocation: 10_000_000 }

const sourceFor = (body: string): string => assemble(body, heading).source

/** The prologue assembly reports, so a test can compare what injection reports against it. */
const prologueFor = (body: string): number => assemble(body, heading).prologueLines

const inject = (body: string) => injectGuards(sourceFor(body), CEILINGS, prologueFor(body))

const compile = (body: string) =>
  adapter.compileBundle({ body, shape: heading, platform: 'web-esmodule', ceilings: CEILINGS })

describe('putting the helper in', () => {
  it('declares it', () => {
    const { source, factory } = inject('return heading')

    expect(source).toContain(`function ${factory} (`)
  })

  it('leaves the author\'s body exactly where the reported prologue says it is', () => {
    // The claim the coordinate mapping rests on, asserted directly: subtract the prologue and you
    // are on the author's line. Written against the reported number rather than a fixed index, so
    // it fails if the two ever disagree.
    const body = 'const a = 1\nconst b = 2\nreturn heading'
    const { source, prologueLines } = inject(body)

    const lines = source.split('\n').slice(prologueLines, prologueLines + 3)

    expect(lines.map(one => one.trim())).toEqual(body.split('\n'))
  })

  it('costs exactly one line, and says so', () => {
    // The instantiation has to be inside the function, so it cannot be free. Reporting the new
    // prologue is what keeps the mapping back to author coordinates exact.
    const body = 'return heading'

    expect(inject(body).prologueLines).toBe(prologueFor(body) + 1)
  })

  it('produces the same bytes for the same source', () => {
    expect(inject('return heading').source).toBe(inject('return heading').source)
  })

  it('builds the guards inside the entry function, not beside it', () => {
    // Module scope would build them once however many times the component is placed on a page, so
    // twenty placements would share one budget.
    const { source, guards, factory } = inject('return heading')
    const entry = source.indexOf('function component')
    const built = source.indexOf(`const ${guards} = ${factory}(`)

    expect(built).toBeGreaterThan(entry)
  })

  it('writes the ceilings in as literals', () => {
    // Inside the source, and therefore inside the signature. A budget passed as an argument would
    // put the bound where a caller could choose it.
    expect(inject('return heading').source).toContain('fuel: 1000000')
  })
})

describe('a name the author cannot shadow', () => {
  it('uses the plain name when nothing is in the way', () => {
    expect(inject('return heading').factory).toBe(GUARD_FACTORY)
  })

  it('steps aside when the author declares it', () => {
    const { factory } = inject(`const ${GUARD_FACTORY} = 1\nreturn heading`)

    expect(factory).toBe(`${GUARD_FACTORY}_1`)
  })

  it('keeps stepping aside', () => {
    const body = `const ${GUARD_FACTORY} = 1\nconst ${GUARD_FACTORY}_1 = 2\nreturn heading`

    expect(inject(body).factory).toBe(`${GUARD_FACTORY}_2`)
  })

  it('declares whatever name it settled on, and only that one', () => {
    const { source, factory } = inject(`const ${GUARD_FACTORY} = 1\nreturn heading`)

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
    const { factory } = inject(`return "${GUARD_FACTORY}"`)

    expect(factory).toBe(GUARD_FACTORY)
  })

  it('steps the guard binding aside as well', () => {
    const { guards } = inject(`const ${GUARD_INSTANCE} = 1\nreturn heading`)

    expect(guards).toBe(`${GUARD_INSTANCE}_1`)
  })

  it('declares each of its two names exactly once', () => {
    // Weaker than it looks if written as `guards !== factory`: the two preferred names cannot
    // collide, so that assertion holds however the code is written. What is worth pinning is that
    // the emitted source binds each name once, which a collision would break.
    const { source, factory, guards } = inject('return heading')
    const occurrences = (name: string) =>
      source.split(new RegExp(`\\b(?:function|const) ${name}\\b`)).length - 1

    expect([occurrences(factory), occurrences(guards)]).toEqual([1, 1])
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
