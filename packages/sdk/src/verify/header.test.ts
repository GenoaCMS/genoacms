import { describe, it, expect } from 'vitest'
import { readHeader, matchesPin, sharesPublication, type PublishedComponentHeader } from './header.js'
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

describe('checking a header against what the page pinned', () => {
  /*
   * The kind is the part added in step 10, and it is the one a pin check could not make before: a
   * prebuilt node used to carry no pin at all, so there was nothing to compare it with.
   *
   * The page tree and the header both state it, under separate signatures made at different times.
   * Verifying either document alone says nothing about the other, which is why the comparison is
   * here and not inside `readHeader`.
   */
  const pin = { uid: 'component-1', publicationId: 'publication-2' }

  it('accepts a header the page pinned by identity alone', () => {
    expect(matchesPin(read(header()), pin)).toMatchObject({ ok: true })
  })

  it('accepts a header whose kind is the one the page claimed', () => {
    expect(matchesPin(read(header()), { ...pin, type: 'dynamic' })).toMatchObject({ ok: true })
  })

  it('refuses a header whose kind is not the one the page claimed', () => {
    // The page would render its own local component under a name the CMS published code for.
    const result = matchesPin(read(header()), { ...pin, type: 'prebuilt' })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toContain('header-wrong-type')
  })

  it('refuses a prebuilt header where the page pinned a dynamic component', () => {
    // The reverse: a consumer goes looking for a bundle this publication never had.
    const result = matchesPin(read(header({ type: 'prebuilt' })), { ...pin, type: 'dynamic' })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toContain('header-wrong-type')
  })

  it('does not invent a kind for a caller resolving a publication without a page', () => {
    // A tool inspecting storage has no claim to compare against. Demanding one would make it supply
    // the answer it is checking, which is not a check.
    expect(matchesPin(read(header({ type: 'prebuilt' })), pin)).toMatchObject({ ok: true })
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
