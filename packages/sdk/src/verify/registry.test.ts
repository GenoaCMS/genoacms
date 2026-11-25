import { describe, it, expect } from 'vitest'
import { readRegistry, KEY_REGISTRY_DOCUMENT } from './registry.js'
import { Verifier } from './client.js'
import type { JsonValue } from './canonical.js'
import {
  MANIFEST_PATH, toBase64, entryOf, rootKeypair, subordinateKeypair, signedManifest, recordingSource
} from '../../test/keyManifests.js'

const root = rootKeypair(1)
const current = subordinateKeypair(2)
const older = subordinateKeypair(3)

const currentEntry = entryOf(current)
const olderEntry = entryOf(older, { supersededAt: 1_700_000_000_001 })

const manifest = (overrides: Record<string, unknown> = {}): JsonValue => ({
  sequence: 3,
  current: currentEntry.keyId,
  keys: [olderEntry, currentEntry],
  ...overrides
} as JsonValue)

const withEntry = (entry: Record<string, unknown>): JsonValue =>
  manifest({ current: entry.keyId, keys: [entry] })

describe('reading the key manifest', () => {
  it('VFY-3: accepts a manifest by every rule of REG-1, as it was given', () => {
    expect(readRegistry(manifest())).toEqual(manifest())
  })

  it('VFY-3: refuses anything but an object', () => {
    for (const payload of [null, 'manifest', 3, []] as JsonValue[]) {
      expect(readRegistry(payload)).toBe('registry-not-an-object')
    }
  })

  it('VFY-3: refuses a member the manifest does not have', () => {
    expect(readRegistry(manifest({ rootOverride: 'x' }))).toBe('registry-unexpected-member: rootOverride')
  })

  it('VFY-3: refuses a sequence that is not an integer of at least 1', () => {
    for (const sequence of [0, -1, 1.5, '3', null]) {
      expect(readRegistry(manifest({ sequence }))).toBe('registry-sequence-not-a-positive-integer')
    }
  })

  it('VFY-3: refuses a manifest without a current key', () => {
    expect(readRegistry(manifest({ current: '' }))).toBe('registry-missing-current')
  })

  it('VFY-3: refuses keys that are not a list', () => {
    expect(readRegistry(manifest({ keys: {} }))).toBe('registry-keys-not-an-array')
  })

  it('VFY-3: refuses an empty key list', () => {
    expect(readRegistry(manifest({ keys: [] }))).toBe('registry-keys-empty')
  })

  it('VFY-3: refuses an entry that is not an object', () => {
    expect(readRegistry(manifest({ keys: [currentEntry, 'entry'] }))).toBe('registry-entry-not-an-object')
  })

  it('VFY-3: refuses an entry without a key id', () => {
    expect(readRegistry(manifest({ keys: [{ ...olderEntry, keyId: '' }, currentEntry] }))).toBe('registry-entry-missing-key-id')
  })

  it('VFY-3: refuses a v1 entry that still carries its public key', () => {
    expect(readRegistry(withEntry({ ...currentEntry, publicKey: toBase64(current.publicKey) })))
      .toBe(`registry-entry-unexpected-member: ${currentEntry.keyId} publicKey`)
  })

  it('VFY-3: refuses any algorithm but ML-DSA-65', () => {
    expect(readRegistry(withEntry({ ...currentEntry, alg: 'SLH-DSA-SHA2-128s' })))
      .toBe(`registry-entry-wrong-algorithm: ${currentEntry.keyId} SLH-DSA-SHA2-128s`)
  })

  it('VFY-3: refuses a digest that is not 64 lowercase hexadecimal characters', () => {
    const { digest } = currentEntry
    for (const malformed of [digest.slice(0, 63), `${digest}0`, digest.toUpperCase()]) {
      expect(readRegistry(withEntry({ ...currentEntry, digest: malformed })))
        .toBe(`registry-entry-digest-malformed: ${currentEntry.keyId}`)
    }
  })

  it('VFY-3: refuses a digest that does not begin with its key id', () => {
    expect(readRegistry(withEntry({ ...currentEntry, digest: olderEntry.digest })))
      .toBe(`registry-entry-digest-mismatch: ${currentEntry.keyId}`)
  })

  it('VFY-3: refuses an entry without its creation moment', () => {
    const { createdAt: _dropped, ...withoutCreation } = currentEntry
    expect(readRegistry(withEntry(withoutCreation))).toBe(`registry-entry-missing-created-at: ${currentEntry.keyId}`)
  })

  it('VFY-3: refuses a moment that is not an integer of at least 0, and null for an unset one', () => {
    expect(readRegistry(manifest())).toEqual(manifest())
    for (const moments of [{ createdAt: -1 }, { createdAt: 1.5 }, { supersededAt: null }, { revokedAt: null }, { supersededAt: -1 }]) {
      const refusal = readRegistry(manifest({ keys: [{ ...olderEntry, ...moments }, currentEntry] }))
      expect(typeof refusal === 'string' && refusal.startsWith('registry-entry-')).toBe(true)
    }
  })

  it('VFY-3: refuses a key listed twice', () => {
    expect(readRegistry(manifest({ keys: [currentEntry, currentEntry] })))
      .toBe(`registry-duplicate-key-id: ${currentEntry.keyId}`)
  })

  it('VFY-3: refuses a current key it does not list', () => {
    expect(readRegistry(manifest({ current: '0123456789abcdef' }))).toBe('registry-current-not-listed: 0123456789abcdef')
  })

  it('VFY-3: refuses a current key that is superseded or revoked', () => {
    expect(readRegistry(withEntry({ ...currentEntry, supersededAt: 1 }))).toBe(`registry-current-superseded: ${currentEntry.keyId}`)
    expect(readRegistry(withEntry({ ...currentEntry, revokedAt: 1 }))).toBe(`registry-current-revoked: ${currentEntry.keyId}`)
  })

  it('VFY-3: refuses a manifest of the type genoacms.keyRegistry.v1', async () => {
    const { source } = recordingSource({ [MANIFEST_PATH]: signedManifest(root, manifest(), 'genoacms.keyRegistry.v1') })
    const verifier = new Verifier({ rootPublicKey: root.publicKey, source })

    expect(KEY_REGISTRY_DOCUMENT).toBe('genoacms.keyRegistry.v2')
    expect(await verifier.loadRegistry()).toEqual({
      valid: false,
      reason: 'envelope-wrong-type: expected genoacms.keyRegistry.v2, found genoacms.keyRegistry.v1'
    })
  }, 60_000)
})
