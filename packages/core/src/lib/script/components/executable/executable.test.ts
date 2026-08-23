import { describe, it, expect } from 'vitest'
import { canonicalString } from '$lib/script/signing/canonical'
import { DOCUMENT_TYPES, isDocumentType } from '$lib/script/signing/envelope'
import {
  EXECUTABLE_DOCUMENT,
  ExecutableError,
  buildComponentExecutable,
  executablePayload
} from './executable'

/**
 * Assembling the payload a signature will cover.
 *
 * Everything here is pure. Whether the envelope verifies is `executable.server.test.ts`; what is
 * asserted here is that nothing reaches the signer half-built, because a payload with a member
 * missing signs perfectly well and attests to a document nobody supplied.
 */

const SUBJECT = {
  uid: 'component-1',
  commitId: 'commit-1',
  authorId: 'user-1',
  committedAt: 1_700_000_000_000
}

const build = (overrides: Partial<typeof SUBJECT> = {}, code = 'export const a = 1') =>
  buildComponentExecutable({ ...SUBJECT, ...overrides }, 'web-esmodule', code, 1_700_000_001_000)

describe('the document type', () => {
  it('is registered, so an envelope can carry it', () => {
    // An unregistered type is refused by `readEnvelope`, which would make every executable
    // unverifiable rather than merely unrecognized.
    expect(isDocumentType(EXECUTABLE_DOCUMENT)).toBe(true)
    expect(DOCUMENT_TYPES).toContain(EXECUTABLE_DOCUMENT)
  })

  it('is versioned', () => {
    // The payload shape will change. A version in the identifier is what keeps an old signature
    // unambiguous about which shape it attested to.
    expect(EXECUTABLE_DOCUMENT).toMatch(/\.v\d+$/)
  })
})

describe('building a payload', () => {
  it('carries every fact the artifact is supposed to attest to', () => {
    const executable = build()

    expect(executable).toEqual({
      uid: 'component-1',
      commitId: 'commit-1',
      authorId: 'user-1',
      committedAt: 1_700_000_000_000,
      platform: 'web-esmodule',
      executableCode: 'export const a = 1',
      compiledAt: 1_700_000_001_000
    })
  })

  it('keeps the commit time and the compile time apart', () => {
    const executable = build()

    expect(executable.compiledAt).not.toBe(executable.committedAt)
  })

  it('canonicalizes, which is what the signature is taken over', () => {
    // A payload the canonicalizer refuses would fail at signing time instead of here.
    expect(() => canonicalString(executablePayload(build()))).not.toThrow()
  })
})

describe('refusing a half-built payload', () => {
  it.each([
    ['uid', { uid: '' }],
    ['commitId', { commitId: '' }],
    ['authorId', { authorId: '' }]
  ])('refuses a missing %s', (field, override) => {
    expect(() => build(override)).toThrow(ExecutableError)
    expect(() => build(override)).toThrow(new RegExp(field))
  })

  it('refuses a blank identifier, not just an absent one', () => {
    // Whitespace signs as cleanly as a name and attributes the artifact to nobody.
    expect(() => build({ authorId: '   ' })).toThrow(ExecutableError)
  })

  it('refuses a timestamp that is not a number', () => {
    expect(() => build({ committedAt: Number.NaN })).toThrow(ExecutableError)
  })

  it('refuses an empty bundle', () => {
    // The compiler already refuses a source that compiles to nothing, so an empty bundle here means
    // the pipeline lost the output between the two.
    expect(() => build({}, '   ')).toThrow(ExecutableError)
  })

  it('names the field it refused, so the pipeline says what was missing', () => {
    expect(() => build({ authorId: '' })).toThrow(
      expect.objectContaining({ field: 'authorId' })
    )
  })
})
