import { describe, it, expect } from 'vitest'
import {
  readPublication, matchesPin, runnableOn, attributeNames, type ComponentPublication
} from './publication.js'
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

describe('the names a page stores its values under', () => {
  /*
   * **What joins a publication to a page.** A publication states its parameter order as attribute
   * *references* — uids, which exist so renaming an attribute in the CMS does not lose the value
   * bound to it. A published page keys each node's `data` by the attribute's **name**. So a renderer
   * walks the order, turns each reference into a name here, and looks the value up under it.
   *
   * Getting this wrong is not visible from either document on its own: every signature stays valid
   * while a component is called with the right values in the wrong parameters.
   */

  const described = (attributes: Array<[string, unknown]>): JsonValue => publication({
    attributes: Object.fromEntries(
      attributes.map(([reference, title]) => [reference, { uid: reference, schema: { title } }])
    ),
    attributeOrder: attributes.map(([reference]) => reference)
  }) as JsonValue

  it('answers in the order the parameters take them, not the order the attributes are written in', () => {
    const payload = described([['a2', 'Body'], ['a1', 'Heading']])

    expect(attributeNames(read(payload))).toEqual({ ok: true, value: ['Body', 'Heading'] })
  })

  it('answers with the name exactly as it was signed', () => {
    // It is a storage key, not a label. Tidying it here would look for a value under something the
    // page never wrote.
    const payload = described([['a1', ' Heading ']])

    expect(attributeNames(read(payload))).toEqual({ ok: true, value: [' Heading '] })
  })

  it('answers nothing for a component that takes no parameters', () => {
    expect(attributeNames(read(described([])))).toEqual({ ok: true, value: [] })
  })

  it('refuses two attributes named the same thing', () => {
    // The CMS refuses to save such a component, but publications are immutable and a page pins one:
    // a release made before that rule existed still verifies and is still reachable. The page would
    // hold one value where two belong, and one parameter would silently receive the other's.
    const refused = attributeNames(read(described([['a1', 'Heading'], ['a2', 'Heading']])))

    expect(refused.ok).toBe(false)
    expect(!refused.ok && refused.reason).toContain('publication-duplicate-attribute-name')
  })

  it('refuses two names that differ only at their ends', () => {
    // Different keys, and the same name to anyone reading them. A wider net than equality, on
    // purpose: nobody should have to tell "Body" from "Body " by eye to know which value is lost.
    const refused = attributeNames(read(described([['a1', 'Body'], ['a2', 'Body ']])))

    expect(refused.ok).toBe(false)
  })

  it('keeps two names apart when they differ in case', () => {
    // Two names a person chose to write differently, which survive into two distinct parameters.
    expect(attributeNames(read(described([['a1', 'Body'], ['a2', 'body']]))).ok).toBe(true)
  })

  it('refuses an order naming an attribute the publication does not describe', () => {
    // One parameter would have no name and therefore no value, while every later argument stayed in
    // place — a call that looks ordinary and is wrong from that position on.
    const payload = publication({
      attributes: { a1: { uid: 'a1', schema: { title: 'Heading' } } },
      attributeOrder: ['a1', 'a2']
    })

    expect(attributeNames(read(payload)).ok).toBe(false)
  })

  it('refuses an attribute with no name to look a value up by', () => {
    const refused = attributeNames(read(described([['a1', undefined]])))

    expect(refused.ok).toBe(false)
    expect(!refused.ok && refused.reason).toContain('publication-attribute-unnamed')
  })

  it('refuses an attribute whose schema is not an object', () => {
    const payload = publication({
      attributes: { a1: { uid: 'a1', schema: 'Heading' } },
      attributeOrder: ['a1']
    })

    expect(attributeNames(read(payload)).ok).toBe(false)
  })
})
