import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PreconditionFailedError } from '@genoacms/cloudabstraction/storage'

/**
 * Writing a published executable.
 *
 * The property under test is that a published revision is **never rewritten**: consumers cache an
 * artifact by its path and never revalidate it, so a second write would be served as the first one
 * from every cache that already holds it — and both versions verify, because both are properly
 * signed.
 */

const uploadInternalObjectJSON = vi.fn(async (_path: string, _data: unknown, _options?: unknown) => {})

vi.mock('$lib/script/storage/storage.server', () => ({
  uploadInternalObjectJSON: async (path: string, data: unknown, options?: unknown) =>
    await uploadInternalObjectJSON(path, data, options)
}))

const { uploadComponentExecutable, componentExecutablePath, ExecutableExistsError } =
  await import('./io.server')

const envelope = {
  alg: 'ML-DSA-65',
  keyId: 'key-1',
  type: 'genoacms.componentExecutable.v1',
  signature: 'AA==',
  payload: { uid: 'component-1', commitId: 'commit-1' }
} as never

beforeEach(() => {
  uploadInternalObjectJSON.mockReset()
  uploadInternalObjectJSON.mockResolvedValue(undefined)
})

describe('where an executable is written', () => {
  it('is keyed by the component and the revision that produced it', () => {
    // A page pins a revision. The path has to keep resolving to that artifact after the component
    // has moved on, which it can only do if the revision is part of the path.
    expect(componentExecutablePath('component-1', 'commit-1'))
      .toBe('.genoacms/components/dynamic/executables/component-1/commit-1.json')
  })

  it('writes it there', async () => {
    await uploadComponentExecutable(envelope)

    expect(uploadInternalObjectJSON.mock.calls[0][0])
      .toBe('.genoacms/components/dynamic/executables/component-1/commit-1.json')
  })

  it('writes the envelope whole, so a consumer can verify the bytes', async () => {
    await uploadComponentExecutable(envelope)

    expect(uploadInternalObjectJSON.mock.calls[0][1]).toBe(envelope)
  })
})

describe('written once, never rewritten', () => {
  it('writes only if nothing is there', async () => {
    await uploadComponentExecutable(envelope)

    expect(uploadInternalObjectJSON.mock.calls[0][2]).toEqual({ ifAbsent: true })
  })

  it('refuses when the revision is already published', async () => {
    uploadInternalObjectJSON.mockRejectedValue(
      new PreconditionFailedError(
        { bucket: 'b', name: '.genoacms/components/dynamic/executables/component-1/commit-1.json' },
        'object already exists'
      )
    )

    await expect(uploadComponentExecutable(envelope)).rejects.toThrow(ExecutableExistsError)
  })

  it('names the path it refused to overwrite', async () => {
    uploadInternalObjectJSON.mockRejectedValue(
      new PreconditionFailedError({ bucket: 'b', name: 'x' }, 'object already exists')
    )

    await expect(uploadComponentExecutable(envelope))
      .rejects.toThrow(/\.genoacms\/components\/dynamic\/executables\/component-1\/commit-1\.json/)
  })

  it('lets a storage failure through as itself', async () => {
    // An unreachable bucket is not a published revision. Reporting it as one would tell an author
    // their component was already shipped when nothing had been written at all.
    uploadInternalObjectJSON.mockRejectedValue(new Error('network is unreachable'))

    await expect(uploadComponentExecutable(envelope)).rejects.toThrow('network is unreachable')
    await expect(uploadComponentExecutable(envelope)).rejects.not.toThrow(ExecutableExistsError)
  })
})
