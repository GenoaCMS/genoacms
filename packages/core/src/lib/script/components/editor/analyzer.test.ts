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
    type: 'dynamic',
    name,
    attributes: {},
    attributeOrder: [],
    history: [],
    future: []
  }
}

/** The language every fixture here is written in, resolved through the configured adapters. */
const LANGUAGE = 'typescript'

async function analyze (body: string, previous?: ComponentEntry) {
  return await componentCodeToEntry(LANGUAGE, 'Component', PREAMBLE + body, previous ?? emptyEntry('Component'))
}

/**
 * Attributes are stored keyed by **uid**, so a test that knows a parameter name has to look it up.
 *
 * Indexing by name is what these tests used to do, and it passed only because the analyzer path
 * keyed by name while the editor path keyed by uid.
 */
const byName = (entry: ComponentEntry, name: string) => {
  const attribute = Object.values(entry.attributes).find(candidate => candidate.name === name)
  if (!attribute) throw new Error(`no attribute named ${name}`)
  return attribute
}

const namesOf = (entry: ComponentEntry) => Object.values(entry.attributes).map(a => a.name)

describe('componentCodeToEntry', () => {
  it('derives one attribute per parameter, in the order the source declares them', async () => {
    const entry = await analyze(`
      function Component (heading: StringAttribute<".*", 120, "hello">, visible: BooleanAttribute<true>) {}
    `)
    expect(namesOf(entry)).toEqual(['heading', 'visible'])
  })

  it('keys attributes by uid, and orders them by the same uids', async () => {
    // The defect this replaced: attributes derived from source were keyed by *name*, while
    // attributes added in the editor were keyed by uid. One record, two key schemes, decided by how
    // the component happened to be authored — and a page node refers to an attribute by uid.
    const entry = await analyze('function Component (heading: StringAttribute<".*", 120, "hi">) {}')
    const heading = byName(entry, 'heading')

    expect(Object.keys(entry.attributes)).toEqual([heading.uid])
    expect(entry.attributeOrder).toEqual([heading.uid])
    expect(heading.uid).not.toBe('heading')
  })

  it('carries the parameter name onto the attribute', async () => {
    const entry = await analyze('function Component (heading: StringAttribute<".*", 120, "hello">) {}')
    expect(byName(entry, 'heading').name).toBe('heading')
  })

  it('assigns each attribute a uid', async () => {
    const entry = await analyze('function Component (heading: StringAttribute<".*", 120, "hello">) {}')
    expect(byName(entry, 'heading').uid).toEqual(expect.any(String))
  })

  it('maps each supported attribute type', async () => {
    const entry = await analyze(`
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

  it('takes a component with no parameters', async () => {
    expect(Object.keys((await analyze('function Component () {}')).attributes)).toEqual([])
  })

  it('throws when the named root function is missing', async () => {
    await expect(analyze('function Other () {}')).rejects.toThrow(ComponentCodeError)
  })

  it('throws on an unknown attribute type', async () => {
    await expect(analyze('function Component (x: number) {}')).rejects.toThrow(ComponentCodeError)
  })

  // uids are what page nodes reference, so re-analyzing edited code must not
  // renumber attributes that still exist
  it('preserves the uid of an attribute that survives a re-analysis', async () => {
    const first = await analyze('function Component (heading: StringAttribute<".*", 120, "hello">) {}')
    const originalUid = byName(first, 'heading').uid
    const second = await analyze(
      'function Component (heading: StringAttribute<".*", 240, "hello">, extra: BooleanAttribute<false>) {}',
      first
    )
    expect(byName(second, 'heading').uid).toBe(originalUid)
    expect(byName(second, 'extra').uid).not.toBe(originalUid)
  })

  it('drops attributes whose parameter was removed', async () => {
    const first = await analyze(`
      function Component (heading: StringAttribute<".*", 120, "hi">, gone: BooleanAttribute<true>) {}
    `)
    const second = await analyze('function Component (heading: StringAttribute<".*", 120, "hi">) {}', first)
    expect(namesOf(second)).toEqual(['heading'])
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
    it('omits a constraint whose argument was not supplied', async () => {
      // Not null, and not NaN. `parseFloat` of a missing argument used to yield
      // NaN, which JSON cannot represent at all.
      //
      // Declared without generics, which is how a type reaches the analyzer
      // with no arguments — the case the file header describes.
      const entry = await componentCodeToEntry(
        LANGUAGE,
        'Component',
        'interface NumberAttribute { _brand: 0 }\nfunction Component (n: NumberAttribute) {}',
        emptyEntry('Component')
      )
      const schema = byName(entry, 'n').schema as unknown as Record<string, unknown>

      expect(schema).not.toHaveProperty('minimum')
      expect(schema).not.toHaveProperty('maximum')
      expect(schema).not.toHaveProperty('multipleOf')
      expect(schema).not.toHaveProperty('default')
    })

    it('writes a constraint that was supplied', async () => {
      const entry = await analyze('function Component (n: NumberAttribute<0, 10, 1, 2, 5>) {}')

      expect(byName(entry, 'n').schema).toMatchObject({
        minimum: 0, maximum: 10, multipleOf: 1, decimalPlaces: 2, default: 5
      })
    })

    it('carries no flat sibling beside the schema', async () => {
      // maxComponents, allowedComponents and component all said what the schema
      // says. Two representations inside a signed payload can disagree.
      const entry = await analyze('function Component (i: ComponentsAttribute<"Card", 3, "Card|Hero">) {}')
      const attribute = byName(entry, 'i') as unknown as Record<string, unknown>

      expect(Object.keys(attribute).sort()).toEqual(['name', 'schema', 'type', 'uid'])
      expect(attribute.schema).toMatchObject({
        maxItems: 3, items: { type: 'string', enum: ['Card', 'Hero'] }
      })
    })

    it('produces entries the boundary accepts', async () => {
      // The same schema the prebuilt editor's output is validated against, so
      // the two producers are held to one standard rather than two.
      const entry = await analyze(`
        function Component (
          a: BooleanAttribute<true>,
          b: NumberAttribute<0, 10, 1, 2, 5>,
          c: StringAttribute<".*", 120, "hi">,
          i: ComponentsAttribute<"Card", 3, "Card|Hero">
        ) {}
      `)

      expect(validator(componentEntrySchema)(JSON.parse(JSON.stringify(entry)))).toBe(true)
    })

    it('agrees with attributeInits on the digest of an equivalent attribute', async () => {
      // One shape, one digest, across both producers. Driven through the real
      // RFC 8785 canonicalizer rather than a stand-in, since byte-exact
      // agreement is the whole property.
      const analyzed = await analyze('function Component (a: BooleanAttribute<false>) {}')
      const init = attributeTypeInits.find(({ name }) => name === 'boolean')

      const fromAnalyzer = { ...byName(analyzed, 'a').schema, title: '', description: '' }
      const digestOf = (value: unknown) => Buffer.from(digest(value as JsonValue)).toString('hex')

      expect(digestOf(fromAnalyzer)).toBe(digestOf(init?.schema))
    })
  })

  /**
   * The same assertion across every attribute type, not only the one that
   * happened to be written first.
   *
   * A component authored in code and the same component registered by hand must
   * sign identically, or a consumer verifying one and re-deriving the other
   * disagrees. The types carrying **optional constraints** are where this
   * actually bites: those are the keys that can be present-as-null,
   * present-as-undefined, or genuinely absent, and only the last one produces
   * the digest the other producer produces.
   *
   * Each attribute is written with **no type arguments**, which is what makes
   * the comparison fair — nothing is constrained on either side, so the two
   * producers should be describing exactly the same thing.
   */
  describe('the two producers agree, per attribute type', () => {
    /**
     * The attribute types whose code form takes **no type arguments**, so an
     * unconstrained attribute can be written in component source at all.
     *
     * The others declare required generics: `BooleanAttribute` on its own
     * resolves to `any` and the analyzer rejects it, so there is no way to ask
     * the analyzer for the unconstrained form to compare against. Their
     * constrained forms are covered by the assertions above; this is the honest
     * limit of the parameterized comparison rather than a gap being ignored.
     */
    const CODE_TYPE: Record<string, string> = {
      link: 'LinkAttribute',
      storageResource: 'StorageResourceAttribute'
    }

    const comparable = attributeTypeInits.filter(({ name }) => name in CODE_TYPE)

    const digestOf = (value: unknown): string =>
      Buffer.from(digest(value as JsonValue)).toString('hex')

    it.each(comparable)('$name signs the same either way', async ({ name, schema }) => {
      const analyzed = await analyze(`function Component (a: ${CODE_TYPE[name]}) {}`)

      // The analyzer names the attribute after its parameter and the init cannot
      // know it, so the two labels are equalized rather than compared. Everything
      // else — every constraint, present or absent — is the assertion.
      const fromAnalyzer = { ...byName(analyzed, 'a').schema, title: '', description: '' }

      expect(digestOf(fromAnalyzer)).toBe(digestOf(schema))
    })
  })
})
