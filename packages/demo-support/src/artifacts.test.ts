import { describe, it, expect } from 'vitest'
import { isPublishedDocument, REGISTRY } from './artifacts.js'

/**
 * What may leave a private bucket.
 *
 * **This is the only security-bearing decision in the demo.** The proxy beside it verifies nothing —
 * the browser does that, holding the root key — so nothing rests on the proxy being honest. What does
 * rest on this file is that a route reachable by anybody, with the instance's own service account
 * behind it, serves published documents and nothing else.
 *
 * The bucket holds drafts, component source, user records and the authorization manifests. A prefix
 * check would hand those over: they are under `.genoacms/` too.
 */

describe('what a consumer may read', () => {
  it('serves the key registry', () => {
    expect(isPublishedDocument(REGISTRY)).toBe(true)
  })

  it('serves a published page tree', () => {
    expect(isPublishedDocument('.genoacms/pages/readables/home')).toBe(true)
  })

  it('serves a publication', () => {
    expect(isPublishedDocument(
      '.genoacms/components/public/0198f2c1-4a3d-7000-8000-000000000001/0198f2c1-4a3d-7000-8000-0000000000a2.json'
    )).toBe(true)
  })
})

describe('what it refuses', () => {
  /*
   * Each of these is a real object in the bucket, and each one is why a prefix check is not enough:
   * every path here begins with `.genoacms/`.
   */

  it('refuses a draft page', () => {
    expect(isPublishedDocument('.genoacms/pages/entries/home')).toBe(false)
  })

  it('refuses a component header, which is a draft', () => {
    // The published description is inside the publication. This is the one being edited.
    expect(isPublishedDocument('.genoacms/components/headers/component-1.json')).toBe(false)
  })

  it('refuses a component\'s editing history', () => {
    expect(isPublishedDocument('.genoacms/components/headers/component-1.history')).toBe(false)
  })

  it('refuses the authorization manifests', () => {
    expect(isPublishedDocument('.genoacms/authorization/roles.json')).toBe(false)
    expect(isPublishedDocument('.genoacms/authorization/assignments.json')).toBe(false)
  })

  it('refuses a directory listing dressed as a path', () => {
    expect(isPublishedDocument('.genoacms/components/public/')).toBe(false)
    expect(isPublishedDocument('.genoacms/pages/readables/')).toBe(false)
  })

  it('refuses anything outside .genoacms', () => {
    expect(isPublishedDocument('uploads/invoice.pdf')).toBe(false)
    expect(isPublishedDocument('')).toBe(false)
  })
})

describe('traversal, in the forms it actually arrives in', () => {
  it('refuses a parent reference', () => {
    expect(isPublishedDocument('.genoacms/pages/readables/../entries/home')).toBe(false)
    expect(isPublishedDocument('.genoacms/pages/readables/..')).toBe(false)
  })

  it('refuses a nested path where one segment belongs', () => {
    // A page name is one segment. Accepting a slash inside it would make the pattern's shape
    // decorative, since anything under the prefix would then match.
    expect(isPublishedDocument('.genoacms/pages/readables/a/b')).toBe(false)
  })

  it('refuses an absolute path', () => {
    expect(isPublishedDocument('/.genoacms/keys/public.json')).toBe(false)
  })

  it('refuses a doubled separator', () => {
    expect(isPublishedDocument('.genoacms/pages/readables//home')).toBe(false)
  })

  it('refuses surrounding whitespace', () => {
    // A trailing newline or space would be a different object name, and accepting it here would mean
    // two spellings of one path where only one was ever considered.
    expect(isPublishedDocument(' .genoacms/keys/public.json')).toBe(false)
    expect(isPublishedDocument('.genoacms/keys/public.json\n')).toBe(false)
  })

  it('refuses a trailing newline on a pattern-matched path', () => {
    /*
     * **Pinning a language detail the patterns rest on.** The registry is compared by equality, so a
     * trailing newline there proves nothing about the patterns. These go through `$`.
     *
     * JavaScript's `$` without the `m` flag matches only at the very end of the input, and unlike
     * Perl's does *not* match before a final newline. A guard for this used to sit in the module and
     * was dead code; this is what makes its absence safe, and what would fail if the flag ever
     * changed.
     */
    expect(isPublishedDocument('.genoacms/pages/readables/home\n')).toBe(false)
    expect(isPublishedDocument('.genoacms/pages/readables/home ')).toBe(false)
    expect(isPublishedDocument(
      '.genoacms/components/public/component-1/publication-1.json\n'
    )).toBe(false)
  })

  it('refuses a hidden segment', () => {
    // A segment must begin with a letter or digit, so nothing starting with a dot gets through —
    // which is what makes `..` unmatchable rather than merely searched for.
    expect(isPublishedDocument('.genoacms/pages/readables/.secret')).toBe(false)
  })

  it('refuses a publication path that is not a publication', () => {
    expect(isPublishedDocument('.genoacms/components/public/component-1/notes.txt')).toBe(false)
    expect(isPublishedDocument('.genoacms/components/public/component-1')).toBe(false)
  })

  it('refuses a path that merely starts like the registry', () => {
    expect(isPublishedDocument('.genoacms/keys/public.json.bak')).toBe(false)
    expect(isPublishedDocument('.genoacms/keys/private.json')).toBe(false)
    expect(isPublishedDocument('.genoacms/keys/')).toBe(false)
  })
})
