import { describe, it, expect } from 'vitest'
import { readHeader, sharesPublication, type PublishedComponentHeader } from './header.js'
import type { JsonValue } from './canonical.js'

/**
 * Reading a header, and binding it to the code it was published with.
 *
 * Signature verification is `client.test.ts`'s. What is left here is what a valid signature does not
 * settle: whether the payload is shaped like a header at all, and whether a header and an executable
 * belong to each other.
 */

const header = (over: Record<string, unknown> = {}): JsonValue => ({
  uid: 'component-1',
  publicationId: 'publication-2',
  publisherId: 'user-1',
  publishedAt: 1_700_000_000_000,
  note: 'released',
  type: 'dynamic',
  name: 'Hero',
  attributes: {},
  attributeOrder: ['attr-1'],
  ...over
} as JsonValue)

const read = (payload: JsonValue): PublishedComponentHeader => {
  const result = readHeader(payload)
  if (!result.ok) throw Error(`expected a readable header, got ${result.reason}`)
  return result.value
}

describe('reading a header', () => {
  it('accepts one carrying everything a consumer needs to call the component', () => {
    expect(readHeader(header())).toMatchObject({ ok: true })
  })

  it.each([
    ['header-missing-uid', { uid: '' }],
    ['header-missing-publication-id', { publicationId: '' }],
    ['header-missing-publisher-id', { publisherId: '' }],
    ['header-missing-published-at', { publishedAt: 'yesterday' }],
    ['header-unknown-type', { type: 'something-else' }],
    ['header-missing-name', { name: '' }],
    ['header-missing-attributes', { attributes: [] }],
    ['header-missing-attribute-order', { attributeOrder: [1, 2] }]
  ])('refuses one that is %s', (reason, over) => {
    expect(readHeader(header(over))).toMatchObject({ ok: false, reason })
  })

  it('refuses something that is not an object at all', () => {
    expect(readHeader('a header' as JsonValue)).toMatchObject({ ok: false, reason: 'header-not-an-object' })
  })

  it('accepts a component with no attributes, which is an ordinary component', () => {
    expect(readHeader(header({ attributes: {}, attributeOrder: [] }))).toMatchObject({ ok: true })
  })
})

describe('binding a header to an executable', () => {
  /*
   * **The property R1 asks for**, tested here rather than through `Verifier.component`, because
   * there both documents are checked against the same pin and so cannot disagree — the binding is
   * implied and a test through that path would be asserting the pin checks over again.
   *
   * This is the function a consumer uses when it holds the pair without a pin: the two are fetched
   * and cached separately, so nothing else stops a correctly signed header from one publication
   * being used with a correctly signed executable from another. The shapes disagree, the bundle is
   * called with the wrong parameter list, and neither document is invalid.
   */
  const executable = { uid: 'component-1', publicationId: 'publication-2' }

  it('accepts a pair from the same publication', () => {
    expect(sharesPublication(read(header()), executable)).toMatchObject({ ok: true })
  })

  it('refuses a pair from different publications', () => {
    const result = sharesPublication(read(header()), { ...executable, publicationId: 'publication-3' })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toContain('component-mismatched-publications')
  })

  it('refuses a pair belonging to different components', () => {
    const result = sharesPublication(read(header()), { ...executable, uid: 'component-9' })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toContain('component-mismatched-documents')
  })
})
