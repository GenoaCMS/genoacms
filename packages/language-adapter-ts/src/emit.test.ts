import { describe, it, expect } from 'vitest'
import type { Attribute, ComponentHeaderAttributes } from '@genoacms/internal/attributes'
import type { ComponentShape } from '@genoacms/internal/languageAdapter'
import { assemble, identifierFor, runtimeType, signatureOf } from './emit.js'

/**
 * Emitting the entry function a body is wrapped in.
 *
 * The property worth protecting is that **the header is the only statement of a component's shape**.
 * Everything here follows from that: the parameter list comes from `attributeOrder` and nothing
 * else, so there is no second place for it to drift.
 */

/**
 * An attribute as the registrar stores one.
 *
 * `name` is deliberately set to the uid, which is what the registrar actually writes: the field is
 * left over from deriving shapes out of code, and the name a person types goes to `schema.title`.
 * A fixture that put the real name in both would pass whichever field the emitter read.
 */
const attribute = (uid: string, name: string, type: Attribute['type']): Attribute =>
  ({ uid, name: uid, type, schema: { title: name, description: '', required: false } } as Attribute)

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

  it('gives a component with no attributes the capability parameter alone', async () => {
    const { source } = assemble('return 1', shapeOf())

    expect(source).toContain('passthrough: Record<string, unknown> = {}')
    expect(source).toContain('export default function component (')
  })

  it('puts the capability parameter last, after every attribute', async () => {
    // The attributes ahead of it are addressed by position, so anywhere but last would shift them.
    const { source } = assemble(
      'return 1',
      shapeOf(attribute('a', 'heading', 'string'), attribute('b', 'body', 'text'))
    )
    const signature = source.slice(0, source.indexOf(') {'))

    expect(signature.indexOf('heading')).toBeLessThan(signature.indexOf('passthrough'))
    expect(signature.indexOf('body')).toBeLessThan(signature.indexOf('passthrough'))
  })

  it('defaults it, so a component is callable without one', async () => {
    // A consumer that grants nothing, or a test calling the component directly, still gets an object
    // rather than undefined — which is what saves every author from writing a presence check.
    const { source } = assemble('return 1', shapeOf(attribute('a', 'heading', 'string')))

    expect(source).toContain('= {}')
  })

  it('refuses an attribute that would take the reserved name', async () => {
    const { diagnostics } = assemble('return 1', shapeOf(attribute('a', 'passthrough', 'string')))

    expect(diagnostics).toMatchObject([{ severity: 'fatal', rule: 'reserved-parameter-name' }])
  })

  it('names the attribute in that refusal, so the author knows which to rename', async () => {
    const { diagnostics } = assemble('return 1', shapeOf(attribute('a', 'passthrough', 'string')))

    expect(diagnostics[0].message).toContain('passthrough')
  })

  it('allows a name differing only in case, which becomes a different parameter', async () => {
    // The reservation is of an identifier, not of a word. `Passthrough` compiles beside
    // `passthrough` without colliding, so refusing it would cost an author a name for no reason.
    const { source, diagnostics } = assemble('return 1', shapeOf(attribute('a', 'Passthrough', 'string')))

    expect(diagnostics).toEqual([])
    expect(source).toContain('Passthrough: string')
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
      // A rendered child is a DOM node, settled by the SDK once it could render a tree. It stood at
      // `unknown[]` until then rather than being guessed at, because a guess would have landed in
      // the signature of every component anyone writes.
      ['components', 'readonly Node[]']
    ]
    for (const [type, expected] of types) expect(runtimeType(type)).toBe(expected)
  })

  it('hands a slot to the author as an array they may read and not rearrange', async () => {
    // The array belongs to the renderer. A component that sorted or spliced it would be editing the
    // page's structure from inside one of its nodes, and the next render would not remember it.
    expect(runtimeType('components')).toBe('readonly Node[]')
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

  it('reads the name a person typed, not the uid stored beside it', async () => {
    // The registrar writes the typed name to `schema.title` and leaves `name` holding the uid, so
    // emitting from `name` produced parameters called `_3f2a1b…` — signatures nobody can write
    // against, which is how this was found.
    const { text } = signatureOf(shapeOf(attribute('3f2a1b04-0000-4000-8000-000000000000', 'heading', 'string')))

    expect(text).toContain('heading: string')
    expect(text).not.toContain('3f2a1b04')
  })

  it('says an attribute is unnamed rather than reporting an empty identifier', async () => {
    // The ordinary case: added in the registrar and not yet named.
    const unnamed = { uid: 'u', name: 'u', type: 'string', schema: { title: '', description: '', required: false } } as Attribute
    const { diagnostics } = signatureOf(shapeOf(unnamed))

    expect(diagnostics).toMatchObject([{ rule: 'unnameable-attribute' }])
    expect(diagnostics[0].message).toMatch(/no name yet/i)
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

describe('the signature shown to the author', () => {
  it('is exactly what the body is wrapped in', async () => {
    // The property the preview exists for. Composing it separately — in the CMS, or here from a
    // second template — would let the editor show an author one parameter list while their code was
    // compiled against another, which is the drift emitting the signature exists to remove.
    const shape = shapeOf(attribute('a', 'heading', 'string'), attribute('b', 'visible', 'boolean'))

    const { text } = signatureOf(shape)
    const { source } = assemble('return heading', shape)

    expect(source.startsWith(text)).toBe(true)
  })

  it('carries the same refusals, so the editor can say why there is no signature', async () => {
    const shape = shapeOf(attribute('a', 'heading text', 'string'), attribute('b', 'heading-text', 'string'))

    expect(signatureOf(shape).diagnostics).toMatchObject([{ rule: 'colliding-attribute-names' }])
  })

  it('names every parameter an author has to write against', async () => {
    const { text } = signatureOf(shapeOf(
      attribute('a', 'Heading text', 'string'),
      attribute('b', 'Show border', 'boolean')
    ))

    expect(text).toContain('HeadingText: string')
    expect(text).toContain('ShowBorder: boolean')
  })
})
