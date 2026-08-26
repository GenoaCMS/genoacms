import { describe, it, expect } from 'vitest'
import {
  buildComponentPublication,
  describingDigest,
  PublicationPayloadError,
  type PublishedExecutable
} from './payload'
import type { ComponentHeader } from '../componentHeader/component/types'

/**
 * Assembling what a signature will cover.
 *
 * Signing is `payload.server.ts`'s and writing is `io.server.ts`'s. What is decided here is the
 * payload itself, which is worth its own file because **the envelope's digest covers it whole**: a
 * member the builder gets wrong is not a smaller document, it is a signed claim nobody made.
 *
 * ## The cases that came in with the merge
 *
 * A publication used to be two signed documents, and the two combinations below were **cross-document
 * failures** — caught by the consumer, after both halves had been fetched and both signatures
 * verified. In one document they are malformed payloads, refused before anything is signed:
 *
 * - a prebuilt component carrying a bundle, which is code nobody asked for;
 * - a dynamic component carrying none, which verifies and renders nothing.
 *
 * Testing them here rather than in the SDK is the point of the merge. The SDK still refuses both,
 * because a signing key in the wrong hands can produce either — but the CMS can no longer emit one
 * by accident, and that is a property the old shape could not have.
 */

const header = (over: Partial<ComponentHeader> = {}): ComponentHeader => ({
  uid: 'component-1',
  type: 'dynamic',
  name: 'Hero',
  attributes: { 'attr-1': { uid: 'attr-1', name: 'attr-1', type: 'string' } },
  attributeOrder: ['attr-1'],
  ...over
} as ComponentHeader)

const bundle = (over: Partial<PublishedExecutable> = {}): PublishedExecutable => ({
  platform: 'web-esmodule',
  executableCode: 'export default function component () { return 1 }',
  compiledAt: 1_700_000_001_000,
  ...over
})

const subject = {
  publicationId: 'publication-2',
  publisherId: 'user-1',
  publishedAt: 1_700_000_000_000,
  note: 'released'
}

const build = (
  headerOver: Partial<ComponentHeader> = {},
  executables?: PublishedExecutable[]
) => buildComponentPublication(subject, header(headerOver), executables)

describe('building a publication', () => {
  it('carries everything a consumer needs to call the component', () => {
    expect(build({}, [bundle()])).toMatchObject({
      uid: 'component-1',
      publicationId: 'publication-2',
      publisherId: 'user-1',
      publishedAt: 1_700_000_000_000,
      note: 'released',
      type: 'dynamic',
      name: 'Hero',
      attributeOrder: ['attr-1']
    })
  })

  it('carries the bundles as a list', () => {
    // A list rather than one bundle, so a second target is an extra element rather than a second
    // signed format — and so a page never has to pin a platform.
    const publication = build({}, [bundle()])

    expect(publication.executables).toHaveLength(1)
    expect(publication.executables?.[0]).toMatchObject({ platform: 'web-esmodule' })
  })

  it('accepts several targets in one release', () => {
    const publication = build({}, [bundle(), bundle({ platform: 'android-dex' })])

    expect(publication.executables?.map(e => e.platform)).toEqual(['web-esmodule', 'android-dex'])
  })
})

describe('a prebuilt component', () => {
  it('publishes a description and nothing else', () => {
    const publication = build({ type: 'prebuilt' })

    expect(publication.type).toBe('prebuilt')
    expect(publication.name).toBe('Hero')
  })

  it('omits the key rather than writing an empty list', () => {
    // Under RFC 8785 `{}` and `{"executables":[]}` are different documents. A producer writing one
    // where another wrote the other would sign the same release two ways, and no consumer could tell
    // which was meant.
    expect('executables' in build({ type: 'prebuilt' })).toBe(false)
  })

  it('is refused if it carries code', () => {
    // Its code lives in the consuming application. A bundle here is either a description that was
    // swapped or a bundle nobody asked for, and the CMS should not be able to emit either.
    expect(() => build({ type: 'prebuilt' }, [bundle()]))
      .toThrow(PublicationPayloadError)
  })
})

describe('a dynamic component', () => {
  it('is refused if it carries no code', () => {
    // It would verify and render nothing — kept apart from "this component was never published".
    expect(() => build({})).toThrow(PublicationPayloadError)
  })

  it('is refused if its list of bundles is empty', () => {
    expect(() => build({}, [])).toThrow(PublicationPayloadError)
  })

  it('is refused if two bundles claim the same platform', () => {
    // Not a richer publication: one that does not say which bundle to run. Whichever a consumer
    // picked would be signed, so nothing downstream could report the ambiguity.
    expect(() => build({}, [bundle(), bundle({ executableCode: 'export default () => 2' })]))
      .toThrow(/one bundle per platform/)
  })
})

describe('refusing a payload that would sign a claim nobody made', () => {
  it.each([
    ['a blank publisher', () => buildComponentPublication({ ...subject, publisherId: '  ' }, header(), [bundle()])],
    ['a blank publication id', () => buildComponentPublication({ ...subject, publicationId: '' }, header(), [bundle()])],
    ['a non-numeric timestamp', () => buildComponentPublication({ ...subject, publishedAt: NaN }, header(), [bundle()])],
    ['an empty bundle', () => build({}, [bundle({ executableCode: '   ' })])],
    ['a bundle with no platform', () => build({}, [bundle({ platform: '' })])]
  ])('refuses %s', (_why, attempt) => {
    expect(attempt).toThrow(PublicationPayloadError)
  })

  it('accepts an empty note, which is a choice rather than an omission', () => {
    // Unlike a publisher, a release genuinely may have nothing said about it.
    expect(buildComponentPublication({ ...subject, note: '' }, header(), [bundle()]).note).toBe('')
  })
})

describe('the digest that decides whether to publish again', () => {
  it('ignores which publication carried the description', () => {
    // The publication identifier is different every time by construction, so including it would make
    // every release count as changed and defeat `no change, no publication` entirely.
    expect(describingDigest(header())).toBe(describingDigest(header()))
  })

  it('moves when the attribute order moves', () => {
    // Reordering the attributes reorders the arguments, so this is a change even though every
    // attribute is the same one.
    const reordered = header({
      attributes: {
        'attr-1': { uid: 'attr-1', name: 'attr-1', type: 'string' },
        'attr-2': { uid: 'attr-2', name: 'attr-2', type: 'string' }
      } as unknown as ComponentHeader['attributes'],
      attributeOrder: ['attr-2', 'attr-1']
    })

    expect(describingDigest(reordered)).not.toBe(describingDigest(header()))
  })

  it('moves when the kind changes', () => {
    expect(describingDigest(header({ type: 'prebuilt' }))).not.toBe(describingDigest(header()))
  })
})
