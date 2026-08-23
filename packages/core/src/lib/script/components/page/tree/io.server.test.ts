import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAlgorithm, SUBORDINATE_ALGORITHM } from '$lib/script/signing/algorithms'
import { deriveKeyId } from '$lib/script/signing/keyId'
import { verify } from '$lib/script/signing/envelope'
import type { ReadablePageNode } from './types'

/**
 * Publishing a page tree, and reading it back.
 *
 * The tree names which component every node runs and which revision of it. Signing the executables
 * alone would secure *what a component is* while leaving *which components a page has* open to
 * anyone who can write to the bucket — every executable would still verify, they would simply be
 * the wrong ones. So the chain has to reach the page, and these assert that it does.
 *
 * Signing and verification are real. Only storage and the key store are stood in for.
 */

const algorithm = getAlgorithm(SUBORDINATE_ALGORITHM)
const keypair = algorithm.generateKeypair(new Uint8Array(algorithm.lengths.seed).fill(11))
const keyId = deriveKeyId(keypair.publicKey)

vi.mock('$lib/script/signing/keyResolution.server', () => ({
  getCurrentSigningKey: async () => ({
    alg: SUBORDINATE_ALGORITHM,
    keyId,
    secretKey: keypair.secretKey
  }),
  resolveVerificationKey: async (candidate: string) =>
    candidate === keyId ? keypair.publicKey : undefined
}))

let stored: unknown
let readFails = false

vi.mock('$lib/script/storage/storage.server', () => ({
  uploadInternalObjectJSON: async (_path: string, data: unknown) => { stored = data },
  getInternalObjectJSON: async () => {
    if (readFails) throw new Error('no such object')
    return stored
  }
}))

const { uploadReadablePageTree, getReadablePageTree, PAGE_TREE_DOCUMENT, readablePageTreePath } =
  await import('./io.server')

const tree: ReadablePageNode = {
  component: 'Hero',
  commitId: 'commit-1',
  data: {
    heading: 'hello',
    links: ['https://example.com'],
    children: [{ component: 'Card', commitId: 'commit-2', data: {} }]
  }
}

beforeEach(() => {
  stored = undefined
  readFails = false
})

describe('publishing a tree', () => {
  it('writes it where a page tree lives', () => {
    expect(readablePageTreePath('home')).toBe('.genoacms/pages/readables/home')
  })

  it('writes a signed envelope, not the bare tree', async () => {
    await uploadReadablePageTree('home', tree)

    expect(stored).toMatchObject({ type: PAGE_TREE_DOCUMENT, keyId })
    expect(verify(stored, PAGE_TREE_DOCUMENT, keypair.publicKey).valid).toBe(true)
  })

  it('signs the revision pins, not only the component names', async () => {
    // The pins are the part worth protecting: repointing a page at an older revision of the same
    // component changes what runs without changing which component it is.
    await uploadReadablePageTree('home', tree)

    const payload = (stored as { payload: ReadablePageNode }).payload
    expect(payload.commitId).toBe('commit-1')
    expect((payload.data.children as ReadablePageNode[])[0].commitId).toBe('commit-2')
  })
})

describe('reading one back', () => {
  it('returns the tree when it verifies', async () => {
    await uploadReadablePageTree('home', tree)

    expect(await getReadablePageTree('home')).toEqual(tree)
  })

  it('refuses a tree whose nodes were repointed after signing', async () => {
    await uploadReadablePageTree('home', tree)
    const envelope = stored as { payload: ReadablePageNode }
    stored = { ...envelope, payload: { ...envelope.payload, component: 'Attacker' } }

    await expect(getReadablePageTree('home')).rejects.toThrow(/did not verify/)
  })

  it('refuses a tree whose revision pin was rolled back after signing', async () => {
    await uploadReadablePageTree('home', tree)
    const envelope = stored as { payload: ReadablePageNode }
    stored = { ...envelope, payload: { ...envelope.payload, commitId: 'an-older-commit' } }

    await expect(getReadablePageTree('home')).rejects.toThrow(/did not verify/)
  })

  it('refuses one signed by a key the registry does not list', async () => {
    await uploadReadablePageTree('home', tree)
    stored = { ...(stored as object), keyId: 'not-in-the-registry' }

    await expect(getReadablePageTree('home')).rejects.toThrow(/did not verify/)
  })

  it('does not serve a tree it could not verify', async () => {
    // Fails closed. There is no degraded form to fall back to: the plausible tampering leaves a
    // document that looks entirely ordinary, so rendering it would be rendering whatever was written.
    await uploadReadablePageTree('home', tree)
    stored = { ...(stored as object), signature: 'AAAA' }

    await expect(getReadablePageTree('home')).rejects.toThrow()
  })

  it('reports a page that was never published as absent, not as tampered with', async () => {
    readFails = true

    expect(await getReadablePageTree('never-built')).toBeNull()
  })
})
