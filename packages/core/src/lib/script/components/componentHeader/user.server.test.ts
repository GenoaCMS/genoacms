import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Grant } from '$lib/script/authorization/grants'
import type { Permission } from '$lib/script/authorization/permissions'
import type { AuthContext } from '$lib/script/authorization/context'

/**
 * Enforcement in the user-facing prebuilt component layer.
 *
 * Two things are worth pinning. Reading the catalog is its own permission, so a role can exist
 * that cannot browse components at all. And **removal is gated on `register`, not `modify`**: a
 * component is a dependency of every page using it, so a role meant to adjust attribute schemas must
 * not be able to delete one.
 */

const calls: string[] = []

/**
 * What storage holds. Prebuilt by default, because these tests are about the permission gate.
 *
 * Set to a dynamic entry by the tests that assert the other boundary this layer enforces: every
 * operation here refuses a component the component editor owns.
 */
let stored: { uid: string, type: string, name: string } | null =
  { uid: 'hero', type: 'prebuilt', name: 'Hero' }

vi.mock('./io.server', () => ({
  listOrCreateComponentHeaderList: async () => {
    calls.push('list')
    // Both kinds, because storage holds both. A mock returning nothing would let the filtering test
    // pass without any filtering happening.
    return [
      { uid: 'card', type: 'prebuilt', name: 'Card', attributes: {}, attributeOrder: [] },
      { uid: 'hero', type: 'dynamic', name: 'Hero', attributes: {}, attributeOrder: [] }
    ]
  },
  getComponentHeader: async (reference: string) => {
    calls.push(`get:${reference}`)
    return stored
  },
  uploadComponentHeader: async (entry: { uid: string }) => { calls.push(`upload:${entry.uid}`) },
  deleteComponentHeader: async (name: string) => { calls.push(`delete:${name}`) },
  getComponentHeaderHistory: async (reference: string) => {
    calls.push(`history:${reference}`)
    return { history: [], future: [] }
  },
  uploadComponentHeaderHistory: async (reference: string) => { calls.push(`uploadHistory:${reference}`) }
}))

const { createAuthContext } = await import('$lib/script/authorization/context')
const { PermissionDeniedError } = await import('$lib/script/authorization/enforce')
const components = await import('./user.server')

const grant = (permission: Permission): Grant =>
  ({ permission, resource: '*' } as Grant)

const contextWith = (permissions: Permission[]): AuthContext =>
  createAuthContext('subject-1', permissions.map(grant))

const entry = { uid: 'hero' } as never

beforeEach(() => {
  calls.length = 0
  stored = { uid: 'hero', type: 'prebuilt', name: 'Hero' }
})

const expectDenied = async (operation: () => unknown): Promise<void> => {
  await expect(Promise.resolve().then(operation)).rejects.toBeInstanceOf(PermissionDeniedError)
  expect(calls).toEqual([])
}

describe('reading the catalog', () => {
  it('is denied without components:read', async () => {
    await expectDenied(() => components.listUserComponentEntries(contextWith([])))
    await expectDenied(() => components.getUserComponentHeader(contextWith([]), 'hero'))
  })

  it('is not implied by being able to modify', async () => {
    await expectDenied(() =>
      components.listUserComponentEntries(contextWith(['components:modify'])))
  })

  it('is allowed with it', async () => {
    await components.listUserComponentEntries(contextWith(['components:read']))
    await components.getUserComponentHeader(contextWith(['components:read']), 'hero')
    expect(calls).toEqual(['list', 'get:hero'])
  })
})

describe('modifying', () => {
  it('is denied to a principal who may only read', async () => {
    await expectDenied(() =>
      components.updateUserComponentHeader(contextWith(['components:read']), entry))
  })

  it('is allowed with components:modify', async () => {
    await components.updateUserComponentHeader(contextWith(['components:modify']), entry)
    // Saving reads the stored state first, because the step it records has to be diffed against
    // what is actually stored rather than against whatever the caller believed was there.
    // The first read is the prebuilt check; the second is what the recorded step is diffed against.
    expect(calls).toEqual(['get:hero', 'get:hero', 'history:hero', 'upload:hero', 'uploadHistory:hero'])
  })
})

describe('deleting', () => {
  it('is denied to a principal holding only modify', async () => {
    // Removal is the inverse of registration. Letting modify cover it would mean a role meant to
    // edit attribute schemas could destroy a component that pages depend on.
    await expectDenied(() =>
      components.deleteUserComponentHeader(contextWith(['components:modify']), 'hero'))
  })

  it('is allowed with components:register', async () => {
    await components.deleteUserComponentHeader(contextWith(['components:register']), 'hero')
    // Read first, to refuse a reference naming a component the editor owns.
    expect(calls).toEqual(['get:hero', 'delete:hero'])
  })

  it('is not implied by being able to read', async () => {
    await expectDenied(() =>
      components.deleteUserComponentHeader(contextWith(['components:read']), 'hero'))
  })
})

describe('components the editor owns', () => {
  /**
   * A dynamic component has an entry too, and these operations must not touch it.
   *
   * Deleting one properly means removing its definition, its commits and every published executable,
   * gated on `components:register`. Removing only its entry orphans all of that in the bucket —
   * still signed, still verifying — while the component disappears from the editor that would have
   * fixed it. `components:register` could do exactly that, without holding the dynamic
   * permission at all.
   *
   * Filtering the catalog listing does not close this. A request naming the component directly never
   * goes through the listing, so the refusal has to live here.
   */
  const dynamic = () => { stored = { uid: 'hero', type: 'dynamic', name: 'Hero' } }
  const registrar = () => contextWith(['components:read', 'components:register'])

  it('refuses to delete one, even holding the permission that deletes prebuilt components', async () => {
    dynamic()

    await expect(components.deleteUserComponentHeader(registrar(), 'hero'))
      .rejects.toThrow(/not-prebuilt/)
    expect(calls).not.toContain('delete:hero')
  })

  it('refuses to modify one, whatever type the submitted entry claims', async () => {
    // The stored type decides. An update carries a whole entry, and a client is free to write
    // `prebuilt` into it.
    dynamic()

    await expect(components.updateUserComponentHeader(
      contextWith(['components:modify']),
      { uid: 'hero', type: 'prebuilt', name: 'Hero', attributes: {}, attributeOrder: [] } as never
    )).rejects.toThrow(/not-prebuilt/)
    expect(calls).not.toContain('upload:hero')
  })

  it('refuses to open one', async () => {
    dynamic()

    await expect(components.getUserComponentHeader(registrar(), 'hero')).rejects.toThrow(/not-prebuilt/)
  })

  it('refuses to step through one\'s history', async () => {
    dynamic()
    const curator = contextWith(['components:modify'])

    await expect(components.undoUserComponentHeader(curator, 'hero')).rejects.toThrow(/not-prebuilt/)
    await expect(components.redoUserComponentHeader(curator, 'hero')).rejects.toThrow(/not-prebuilt/)
  })

  it('leaves it out of the catalog listing, keeping the prebuilt ones', async () => {
    const listed = await components.listUserComponentEntries(registrar())

    expect(listed.map(entry => entry.uid)).toEqual(['card'])
  })

  it('checks the permission before the type, so neither answer leaks the other', async () => {
    // A principal with no permission must not learn whether a component exists or what kind it is.
    dynamic()

    await expectDenied(() => components.deleteUserComponentHeader(contextWith([]), 'hero'))
  })
})
