import { describe, it, expect } from 'vitest'
import { readPublication, matchesPin, runnableOn, type ComponentPublication } from './publication.js'
import type { JsonValue } from './canonical.js'

/**
 * Reading a verified payload as a publication.
 *
 * Signature verification is `client.test.ts`'s. What is left here is everything a valid signature
 * does not settle: whether the payload is shaped like a publication, whether it is the one the page
 * pinned, and whether this runtime can run what it carries.
 *
 * ## What the merge changed about this file
 *
 * There used to be two readers and a third function binding their results together, because a
 * publication was a header and an executable signed separately. The binding could fail with both
 * documents genuine — a description from one release beside code from another — and it was tested on
 * its own precisely because nothing in the happy path exercised it.
 *
 * **That function is gone, and the hazard with it.** What survives is the pair of shape rules it
 * used to express across two documents: a prebuilt component carries no code, a dynamic one carries
 * some. They are asserted below against a single payload, which is the whole point — the CMS can no
 * longer emit either by accident, and a compromised signing key is now the only way to produce one.
 */

const bundle = (over: Record<string, unknown> = {}) => ({
  platform: 'web-esmodule',
  executableCode: 'export default function component () { return 1 }',
  compiledAt: 1_700_000_001_000,
  ...over
})

const publication = (over: Record<string, unknown> = {}): JsonValue => ({
  uid: 'component-1',
  publicationId: 'publication-2',
  publisherId: 'user-1',
  publishedAt: 1_700_000_000_000,
  note: 'released',
  type: 'dynamic',
  name: 'Hero',
  attributes: {},
  attributeOrder: ['attr-1'],
  executables: [bundle()],
  ...over
} as JsonValue)

/** A prebuilt payload: no code, and the key absent rather than empty. */
const prebuilt = (over: Record<string, unknown> = {}): JsonValue => {
  const { executables: _dropped, ...rest } = publication({ type: 'prebuilt', ...over }) as Record<string, unknown>
  return rest as JsonValue
}

const read = (payload: JsonValue): ComponentPublication => {
  const result = readPublication(payload)
  if (!result.ok) throw Error(`expected a readable publication, got ${result.reason}`)
  return result.value
}

describe('reading a publication', () => {
  it('reads the description a component is called by', () => {
    expect(read(publication())).toMatchObject({
      uid: 'component-1',
      publicationId: 'publication-2',
      publisherId: 'user-1',
      type: 'dynamic',
      name: 'Hero',
      attributeOrder: ['attr-1']
    })
  })

  it('reads the code in the same document', () => {
    // The merge, in one assertion: what a component accepts and what it does arrive together, under
    // one signature, with no second fetch and nothing to check them against each other.
    const value = read(publication())

    expect(value.executables).toHaveLength(1)
    expect(value.executables?.[0].executableCode).toContain('function component')
  })

  it('reads a prebuilt component, which publishes a description alone', () => {
    const value = read(prebuilt())

    expect(value.type).toBe('prebuilt')
    expect('executables' in value).toBe(false)
  })

  it('reads several targets from one release', () => {
    const value = read(publication({ executables: [bundle(), bundle({ platform: 'android-dex' })] }))

    expect(value.executables?.map(e => e.platform)).toEqual(['web-esmodule', 'android-dex'])
  })

  it('accepts a component that takes no attributes', () => {
    expect(readPublication(publication({ attributes: {}, attributeOrder: [] })))
      .toMatchObject({ ok: true })
  })
})

describe('refusing a payload a renderer would have to guess about', () => {
  it.each([
    ['a payload that is not an object', 'a string' as unknown as JsonValue, 'publication-not-an-object'],
    ['no uid', publication({ uid: '' }), 'publication-missing-uid'],
    ['no publication id', publication({ publicationId: '' }), 'publication-missing-publication-id'],
    ['no publisher', publication({ publisherId: '' }), 'publication-missing-publisher-id'],
    ['no timestamp', publication({ publishedAt: 'yesterday' }), 'publication-missing-published-at'],
    ['no note', publication({ note: 7 }), 'publication-missing-note'],
    ['an unknown kind', publication({ type: 'native' }), 'publication-unknown-type'],
    ['no name', publication({ name: '' }), 'publication-missing-name'],
    ['no attributes', publication({ attributes: 'none' }), 'publication-missing-attributes'],
    ['no attribute order', publication({ attributeOrder: 'attr-1' }), 'publication-missing-attribute-order']
  ])('refuses %s', (_why, payload, reason) => {
    expect(readPublication(payload)).toEqual({ ok: false, reason })
  })

  it('refuses a bundle with no code', () => {
    // Not a bundle with nothing in it: a component that renders nothing while carrying a signature
    // saying it was meant to.
    expect(readPublication(publication({ executables: [bundle({ executableCode: '' })] })))
      .toEqual({ ok: false, reason: 'executable-missing-code' })
  })

  it('refuses two bundles claiming the same target', () => {
    // Whichever a consumer picked would be signed, so nothing downstream could report the ambiguity.
    const result = readPublication(publication({ executables: [bundle(), bundle()] }))

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toContain('publication-duplicate-platforms')
  })
})

describe('the two rules the merge brought inside one document', () => {
  /*
   * Both used to be answers about a *pair*, reachable only after two fetches and two verifications.
   * Neither can now arise from a CMS that is working — which is what makes them worth testing here:
   * the only remaining way to produce one is a signing key in the wrong hands, and that is exactly
   * the case a consumer must not render.
   */

  it('refuses a prebuilt component that carries code', () => {
    // Either the description was swapped for a prebuilt one or the bundle is code nobody asked for.
    // Choosing which document to believe would be guessing.
    const result = readPublication(publication({ type: 'prebuilt' }))

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toContain('publication-unexpected-executables')
  })

  it('refuses a dynamic component that carries none', () => {
    expect(readPublication(prebuilt({ type: 'dynamic' })))
      .toEqual({ ok: false, reason: 'publication-missing-executables' })
  })

  it('refuses a dynamic component whose bundle list is empty', () => {
    // `[]` and an absent key are different documents once signed, and neither is a runnable release.
    expect(readPublication(publication({ executables: [] })))
      .toEqual({ ok: false, reason: 'publication-missing-executables' })
  })
})

describe('checking a publication against what the page pinned', () => {
  const pin = { uid: 'component-1', publicationId: 'publication-2' }

  it('accepts the publication the page pinned', () => {
    expect(matchesPin(read(publication()), pin)).toMatchObject({ ok: true })
  })

  it('refuses a genuine release of another publication moved onto this path', () => {
    const result = matchesPin(read(publication()), { ...pin, publicationId: 'publication-9' })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toContain('publication-wrong-publication')
  })

  it('refuses another component entirely', () => {
    const result = matchesPin(read(publication()), { ...pin, uid: 'component-9' })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toContain('publication-wrong-component')
  })

  it('refuses a kind the page did not claim', () => {
    // Two documents, two signatures, made at different times. Verifying either says nothing about
    // the other, which is why the comparison lives here and not in the reader.
    const result = matchesPin(read(publication()), { ...pin, type: 'prebuilt' })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toContain('publication-wrong-type')
  })

  it('does not invent a kind for a caller resolving without a page', () => {
    // A tool inspecting storage has no claim to compare against. Demanding one would make it supply
    // the answer it is checking, which is not a check.
    expect(matchesPin(read(prebuilt()), pin)).toMatchObject({ ok: true })
  })
})

describe('choosing the bundle this runtime will run', () => {
  it('selects the one built for a supported platform', () => {
    const value = read(publication({ executables: [bundle({ platform: 'android-dex' }), bundle()] }))
    const runnable = runnableOn(value, ['web-esmodule'])

    expect(runnable.ok && runnable.value?.platform).toBe('web-esmodule')
  })

  it('does not refuse a release merely because it also serves another runtime', () => {
    // The behavior that changed with the list. A single-artifact publication could only be accepted
    // or rejected; one carrying several targets is a release that serves this consumer *and* others,
    // and refusing it would refuse every multi-platform release ever published.
    const value = read(publication({ executables: [bundle({ platform: 'android-dex' }), bundle()] }))

    expect(runnableOn(value, ['web-esmodule'])).toMatchObject({ ok: true })
  })

  it('refuses a release with nothing this runtime can run', () => {
    const value = read(publication({ executables: [bundle({ platform: 'android-dex' })] }))
    const runnable = runnableOn(value, ['web-esmodule'])

    expect(runnable.ok).toBe(false)
    expect(!runnable.ok && runnable.reason).toContain('publication-unsupported-platform')
  })

  it('resolves a prebuilt component to no bundle, which is success', () => {
    // Its code is the consuming application's. Absent here is the answer, not a failure to find one.
    const runnable = runnableOn(read(prebuilt()), ['web-esmodule'])

    expect(runnable).toEqual({ ok: true, value: undefined })
  })
})
