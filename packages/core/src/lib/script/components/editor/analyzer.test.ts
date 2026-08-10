import { describe, it, expect } from 'vitest'
import { componentCodeToEntry } from './analyzer'
import { ComponentCodeError } from './errors'
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
})
