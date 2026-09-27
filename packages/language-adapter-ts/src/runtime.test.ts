import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Attribute, ComponentHeaderAttributes } from '@genoacms/internal/attributes'
import type { ComponentShape } from '@genoacms/internal/languageAdapter'
import runtime from './runtime.js'
import { compileToWebEsModule } from './compile.js'

vi.mock('./compile.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./compile.js')>()
  return { ...actual, compileToWebEsModule: vi.fn(actual.compileToWebEsModule) }
})

const ctx = { name: 'typescript', resources: [] }

const attribute = (uid: string, name: string, type: Attribute['type']): Attribute =>
  ({ uid, name, type, schema: { title: name, description: '', required: false } } as Attribute)

const shapeOf = (...attributes: Attribute[]): ComponentShape => {
  const byUid: ComponentHeaderAttributes = {}
  for (const each of attributes) byUid[each.uid] = each
  return { attributes: byUid, attributeOrder: attributes.map(each => each.uid) }
}

/** The smallest valid request, from the "wraps the body" case of index.test.ts. */
const request = {
  body: 'return heading',
  shape: shapeOf(attribute('a', 'heading', 'string')),
  platform: 'web-esmodule' as const,
  ceilings: { fuel: 1_000_000, depth: 100, allocation: 10_000_000 }
}

const compiledTarget = (): unknown => vi.mocked(compileToWebEsModule).mock.lastCall?.[2]

beforeEach(() => { vi.mocked(compileToWebEsModule).mockClear() })

describe('the TypeScript language runtime', () => {
  it('compiles to es2020 when no target is configured', async () => {
    await runtime.create({}, ctx).compileBundle(request)
    expect(compiledTarget()).toBe('es2020')
  })

  it('compiles to the configured target', async () => {
    await runtime.create({ target: 'es2022' }, ctx).compileBundle(request)
    expect(compiledTarget()).toBe('es2022')
  })

  it('keeps two instances with different targets apart', async () => {
    const modern = runtime.create({ target: 'es2022' }, ctx)
    const legacy = runtime.create({ target: 'es2019' }, ctx)
    await modern.compileBundle(request)
    expect(compiledTarget()).toBe('es2022')
    await legacy.compileBundle(request)
    expect(compiledTarget()).toBe('es2019')
    await modern.compileBundle(request)
    expect(compiledTarget()).toBe('es2022')
  })

  it("reports the language components record, which is the config's key", () => {
    expect(runtime.create({}, ctx).language).toBe('typescript')
  })
})
