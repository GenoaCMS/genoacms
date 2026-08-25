import { describe, it, expect } from 'vitest'
import type { Attribute, ComponentHeaderAttributes } from '@genoacms/internal/attributes'
import type { ComponentShape } from '@genoacms/internal/languageAdapter'
import { assemble, identifierFor, runtimeType } from './emit.js'

/**
 * Emitting the entry function a body is wrapped in.
 *
 * The property worth protecting is that **the header is the only statement of a component's shape**.
 * Everything here follows from that: the parameter list comes from `attributeOrder` and nothing
 * else, so there is no second place for it to drift.
 */

const attribute = (uid: string, name: string, type: Attribute['type']): Attribute =>
  ({ uid, name, type, schema: { title: name, description: '', required: false } } as Attribute)

const shapeOf = (...attributes: Attribute[]): ComponentShape => {
  const byUid: ComponentHeaderAttributes = {}
  for (const each of attributes) byUid[each.uid] = each
  return { attributes: byUid, attributeOrder: attributes.map(each => each.uid) }
}

describe('the emitted signature', () => {
  it('is a fixed name and a default export, whatever the component is called', async () => {
    // A component's name is a label a person reads. It used to be the identifier its source had to
    // declare too, which is why a component named `my-hero` could be created and never published.
    const { source } = assemble('return heading', shapeOf(attribute('a', 'heading', 'string')))

    expect(source).toContain('export default function component (')
  })

  it('declares parameters in attributeOrder, not in whatever order the record iterates', async () => {
    // A consumer calls positionally, so any other order produces a component that runs and is wrong,
    // with every value in the wrong parameter and nothing failing to say so.
    const first = attribute('a', 'alpha', 'string')
    const second = attribute('b', 'beta', 'number')
    const shape = shapeOf(first, second)
    shape.attributeOrder = ['b', 'a']

    const { source } = assemble('return null', shape)

    expect(source.indexOf('beta')).toBeLessThan(source.indexOf('alpha'))
  })

  it('takes a component with no attributes', async () => {
    const { source } = assemble('return 1', shapeOf())

    expect(source).toContain('export default function component () {')
  })

  it('wraps the body verbatim', async () => {
    const { source } = assemble('  const x = 1\n  return x', shapeOf())

    expect(source).toContain('  const x = 1\n  return x')
  })
})

describe('the runtime type an author receives', () => {
  it('is the value, not the constraint encoding it used to carry', async () => {
    // A constrained string is still a string. The pattern, maximum and default live in the header
    // now, and putting the CMS's validation vocabulary in the signature helps nobody writing code.
    const { source } = assemble('return heading', shapeOf(attribute('a', 'heading', 'string')))

    expect(source).toContain('heading: string')
    expect(source).not.toContain('StringAttribute')
  })

  it('maps every attribute type', async () => {
    const types: Array<[Attribute['type'], string]> = [
      ['boolean', 'boolean'],
      ['number', 'number'],
      ['string', 'string'],
      ['text', 'string'],
      ['markdown', 'string'],
      ['richText', 'string'],
      ['link', 'readonly string[]'],
      ['storageResource', 'readonly string[]'],
      ['components', 'unknown[]']
    ]
    for (const [type, expected] of types) expect(runtimeType(type)).toBe(expected)
  })
})

describe('turning an attribute name into a parameter name', () => {
  it('accepts one that is already an identifier', async () => {
    expect(identifierFor('heading')).toBe('heading')
  })

  it('keeps the case a person typed, so two names differing only in case do not collide', async () => {
    expect(identifierFor('Heading Text')).toBe('HeadingText')
    expect(identifierFor('heading text')).toBe('headingText')
  })

  it('joins the words of a name a person would type in the registrar', async () => {
    // `Heading text` is a reasonable thing to call an attribute and an impossible parameter name.
    expect(identifierFor('Heading text')).toBe('HeadingText')
  })

  it('does not begin with a digit', async () => {
    expect(identifierFor('2nd heading')).toBe('_2ndHeading')
  })

  it('steps around a reserved word', async () => {
    expect(identifierFor('class')).toBe('class_')
  })

  it('reports a name with nothing usable in it', async () => {
    expect(identifierFor('---')).toBeUndefined()
  })
})

describe('what the emitter refuses', () => {
  it('refuses two attributes that would become the same parameter', async () => {
    // `heading text` and `heading-text` are different names in the registrar and the same
    // identifier in code. Suffixing silently would hand the author a parameter they never chose.
    const { diagnostics } = assemble('return null', shapeOf(
      attribute('a', 'heading text', 'string'),
      attribute('b', 'heading-text', 'string')
    ))

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({ severity: 'fatal', rule: 'colliding-attribute-names' })
    expect(diagnostics[0].message).toContain('heading text')
    expect(diagnostics[0].message).toContain('heading-text')
  })

  it('refuses an attribute whose name normalizes to nothing', async () => {
    const { diagnostics } = assemble('return null', shapeOf(attribute('a', '???', 'string')))

    expect(diagnostics).toMatchObject([{ severity: 'fatal', rule: 'unnameable-attribute' }])
  })

  it('says nothing about a shape it can emit', async () => {
    // Paired with the refusals: a check that refuses everything passes a deny test just as happily.
    const { diagnostics } = assemble('return null', shapeOf(
      attribute('a', 'heading', 'string'),
      attribute('b', 'visible', 'boolean')
    ))

    expect(diagnostics).toEqual([])
  })
})

describe('where the author\'s body starts', () => {
  it('counts the prologue so a diagnostic can be reported where the author sees it', async () => {
    // Without this every error in the editor points at a line the author did not write — and for a
    // short body, at one that does not exist.
    const { source, prologueLines } = assemble('return heading', shapeOf(
      attribute('a', 'heading', 'string')
    ))

    const lines = source.split('\n')
    expect(lines[prologueLines]).toBe('return heading')
  })

  it('counts it for a component with no parameters, whose signature is one line', async () => {
    const { source, prologueLines } = assemble('return 1', shapeOf())

    expect(source.split('\n')[prologueLines]).toBe('return 1')
  })
})
