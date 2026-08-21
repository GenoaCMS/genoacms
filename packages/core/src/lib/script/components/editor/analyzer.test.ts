import { describe, it, expect } from 'vitest'
import { validator } from '@exodus/schemasafe'
import { componentCodeToEntry } from './analyzer'
import { ComponentCodeError } from './errors'
import { componentEntrySchema } from '../componentEntry/component/schemas'
import { attributeTypeInits } from '../componentEntry/component/attributeInits'
import { digest } from '$lib/script/signing/canonical'
import type { JsonValue } from '$lib/script/signing/canonical'
import type { ComponentEntry } from '../componentEntry/component/types'

/**
 * The analyzer reads a parameter's *resolved* type text, so the attribute types
 * have to be declared in the component source as generic interfaces. A `type`
 * alias resolves to its right-hand side (`StringAttribute<...>` becomes
 * `string`) and the analyzer then rejects it, and an undeclared type resolves
 * to bare `StringAttribute` with no arguments at all.
 */
const PREAMBLE = `
interface BooleanAttribute<Default> { _brand: Default }
interface NumberAttribute<Min, Max, Step, DecimalPlaces, Default> { _brand: Min }
interface StringAttribute<Pattern, MaxLength, Default> { _brand: Pattern }
interface TextAttribute<MaxLength, Default> { _brand: MaxLength }
interface MarkdownAttribute<Default> { _brand: Default }
interface RichTextAttribute<Default> { _brand: Default }
interface LinkAttribute { _brand: 'link' }
interface StorageResourceAttribute { _brand: 'storageResource' }
interface ComponentsAttribute<Component, MaxComponents, Allowed> { _brand: Component }
`

function emptyEntry (name: string): ComponentEntry {
  return {
    uid: 'entry-uid',
    type: 'coded',
    name,
    attributes: {},
    attributeOrder: [],
    history: [],
    future: []
  }
}

function analyse (body: string, previous?: ComponentEntry) {
  return componentCodeToEntry('Component', PREAMBLE + body, previous ?? emptyEntry('Component'))
}

describe('componentCodeToEntry', () => {
  it('derives one attribute per parameter, keyed by parameter name', () => {
    const entry = analyse(`
      function Component (heading: StringAttribute<".*", 120, "hello">, visible: BooleanAttribute<true>) {}
    `)
    expect(Object.keys(entry.attributes)).toEqual(['heading', 'visible'])
  })

  it('carries the parameter name onto the attribute', () => {
    const entry = analyse('function Component (heading: StringAttribute<".*", 120, "hello">) {}')
    expect(entry.attributes.heading.name).toBe('heading')
  })

  it('assigns each attribute a uid', () => {
    const entry = analyse('function Component (heading: StringAttribute<".*", 120, "hello">) {}')
    expect(entry.attributes.heading.uid).toEqual(expect.any(String))
  })

  it('maps each supported attribute type', () => {
    const entry = analyse(`
      function Component (
        a: BooleanAttribute<true>,
        b: NumberAttribute<0, 10, 1, 2, 5>,
        c: StringAttribute<".*", 120, "hi">,
        d: TextAttribute<500, "body">,
        e: MarkdownAttribute<"# hi">,
        f: RichTextAttribute<"hi">,
        g: LinkAttribute,
        h: StorageResourceAttribute,
        i: ComponentsAttribute<"Card", 3, "Card|Hero">
      ) {}
    `)
    expect(Object.values(entry.attributes).map((a) => a.type)).toEqual([
      'boolean', 'number', 'string', 'text', 'markdown', 'richText',
      'link', 'storageResource', 'components'
    ])
  })

  it('takes a component with no parameters', () => {
    expect(Object.keys(analyse('function Component () {}').attributes)).toEqual([])
  })

  it('throws when the named root function is missing', () => {
    expect(() => analyse('function Other () {}')).toThrow(ComponentCodeError)
  })

  it('throws on an unknown attribute type', () => {
    expect(() => analyse('function Component (x: number) {}')).toThrow(ComponentCodeError)
  })

  // uids are what page nodes reference, so re-analysing edited code must not
  // renumber attributes that still exist
  it('preserves the uid of an attribute that survives a re-analysis', () => {
    const first = analyse('function Component (heading: StringAttribute<".*", 120, "hello">) {}')
    const originalUid = first.attributes.heading.uid
    const second = analyse(
      'function Component (heading: StringAttribute<".*", 240, "hello">, extra: BooleanAttribute<false>) {}',
      first
    )
    expect(second.attributes.heading.uid).toBe(originalUid)
    expect(second.attributes.extra.uid).not.toBe(originalUid)
  })

  it('drops attributes whose parameter was removed', () => {
    const first = analyse(`
      function Component (heading: StringAttribute<".*", 120, "hi">, gone: BooleanAttribute<true>) {}
    `)
    const second = analyse('function Component (heading: StringAttribute<".*", 120, "hi">) {}', first)
    expect(Object.keys(second.attributes)).toEqual(['heading'])
  })

  /**
   * The attribute shape, at the producer.
   *
   * The analyzer is one of two things that build an attribute; `attributeInits`
   * is the other. Both must produce the same shape, because a signature is over
   * bytes and an attribute that differs by one absent key is a different
   * document.
   */
  describe('the shape it writes', () => {
    it('omits a constraint whose argument was not supplied', () => {
      // Not null, and not NaN. `parseFloat` of a missing argument used to yield
      // NaN, which JSON cannot represent at all.
      //
      // Declared without generics, which is how a type reaches the analyzer
      // with no arguments — the case the file header describes.
      const entry = componentCodeToEntry(
        'Component',
        'interface NumberAttribute { _brand: 0 }\nfunction Component (n: NumberAttribute) {}',
        emptyEntry('Component')
      )
      const schema = entry.attributes.n.schema as unknown as Record<string, unknown>

      expect(schema).not.toHaveProperty('minimum')
      expect(schema).not.toHaveProperty('maximum')
      expect(schema).not.toHaveProperty('multipleOf')
      expect(schema).not.toHaveProperty('default')
    })

    it('writes a constraint that was supplied', () => {
      const entry = analyse('function Component (n: NumberAttribute<0, 10, 1, 2, 5>) {}')

      expect(entry.attributes.n.schema).toMatchObject({
        minimum: 0, maximum: 10, multipleOf: 1, decimalPlaces: 2, default: 5
      })
    })

    it('carries no flat sibling beside the schema', () => {
      // maxComponents, allowedComponents and component all said what the schema
      // says. Two representations inside a signed payload can disagree.
      const entry = analyse('function Component (i: ComponentsAttribute<"Card", 3, "Card|Hero">) {}')
      const attribute = entry.attributes.i as unknown as Record<string, unknown>

      expect(Object.keys(attribute).sort()).toEqual(['name', 'schema', 'type', 'uid'])
      expect(attribute.schema).toMatchObject({
        maxItems: 3, items: { type: 'string', enum: ['Card', 'Hero'] }
      })
    })

    it('produces entries the boundary accepts', () => {
      // The same schema the prebuilt editor's output is validated against, so
      // the two producers are held to one standard rather than two.
      const entry = analyse(`
        function Component (
          a: BooleanAttribute<true>,
          b: NumberAttribute<0, 10, 1, 2, 5>,
          c: StringAttribute<".*", 120, "hi">,
          i: ComponentsAttribute<"Card", 3, "Card|Hero">
        ) {}
      `)

      expect(validator(componentEntrySchema)(JSON.parse(JSON.stringify(entry)))).toBe(true)
    })

    it('agrees with attributeInits on the digest of an equivalent attribute', () => {
      // The property Block A exists for, across both producers: one shape, one
      // digest. Driven through the real RFC 8785 canonicalizer.
      const analysed = analyse('function Component (a: BooleanAttribute<false>) {}')
      const init = attributeTypeInits.find(({ name }) => name === 'boolean')

      const fromAnalyzer = { ...analysed.attributes.a.schema, title: '', description: '' }
      const digestOf = (value: unknown) => Buffer.from(digest(value as JsonValue)).toString('hex')

      expect(digestOf(fromAnalyzer)).toBe(digestOf(init?.schema))
    })
  })
})
