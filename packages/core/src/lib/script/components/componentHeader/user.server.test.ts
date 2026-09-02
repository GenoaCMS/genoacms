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

// `attributes` is present because saving checks that no two of them share a name before it touches
// storage. Empty rather than populated: this file is about which permission each operation demands,
// and the check itself is covered where it lives.
const entry = { uid: 'hero', attributes: {} } as never

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
    await expectDenied(() => components.listUserComponentHeaders(contextWith([])))
    await expectDenied(() => components.getUserComponentHeader(contextWith([]), 'hero'))
  })

  it('is not implied by being able to modify', async () => {
    await expectDenied(() =>
      components.listUserComponentHeaders(contextWith(['components:modify'])))
  })

  it('is allowed with it', async () => {
    await components.listUserComponentHeaders(contextWith(['components:read']))
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
    //
    // **One read, not two.** There used to be a second: a check that the component was prebuilt,
    // which retired when the registrar began describing both kinds the same way.
    expect(calls).toEqual(['get:hero', 'history:hero', 'upload:hero', 'uploadHistory:hero'])
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
   * Filtering the catalog listing never closed this — a request naming the component directly does
   * not go through the listing — which is why the refusal lives here and the listing is whole.
   *
   * **Reading is not refused.** Only the operations that would leave a dynamic component's source,
   * commits and executables stranded, or would write a description its next publication overwrites.
   */
  const dynamic = () => { stored = { uid: 'hero', type: 'dynamic', name: 'Hero' } }
  const registrar = () => contextWith(['components:read', 'components:register'])

  it('refuses to delete one, even holding the permission that deletes prebuilt components', async () => {
    dynamic()

    await expect(components.deleteUserComponentHeader(registrar(), 'hero'))
      .rejects.toThrow(/not-prebuilt/)
    expect(calls).not.toContain('delete:hero')
  })

  it('describes one exactly as it describes any other component', async () => {
    // This was refused while a publication re-derived the shape from source and would have
    // overwritten whatever was saved here. Publishing builds from this now, so describing a
    // component and coding it are two halves of one job.
    dynamic()

    await components.updateUserComponentHeader(
      contextWith(['components:modify']),
      { uid: 'hero', type: 'dynamic', name: 'Hero', attributes: {}, attributeOrder: [] } as never
    )

    expect(calls).toContain('upload:hero')
  })

  it('shows one, because the registrar describes both kinds', async () => {
    // Reading is deliberately not refused. The registrar lists every component and opens every
    // component; refusing here would leave it listing something it cannot show.
    dynamic()

    expect(await components.getUserComponentHeader(registrar(), 'hero'))
      .toMatchObject({ uid: 'hero', type: 'dynamic' })
  })

  it('steps through one\'s history like any other', async () => {
    // It has one for the same reason: its description is edited here.
    dynamic()
    const curator = contextWith(['components:modify'])

    await components.undoUserComponentHeader(curator, 'hero')
    await components.redoUserComponentHeader(curator, 'hero')

    expect(calls).not.toEqual([])
  })

  it('lists it beside the prebuilt ones', async () => {
    // The listing was narrowed to prebuilt components while deleting through this service could
    // strand a dynamic one. Routing the deletion is what closed that, so the list is whole again —
    // and it has to be: every reader of this function saw the shortened one, including the page
    // editor's component picker, where it meant no page could be rooted in a coded component.
    const listed = await components.listUserComponentHeaders(registrar())

    expect(listed.map(entry => entry.uid).sort()).toEqual(['card', 'hero'])
  })

  it('checks the permission before the type, so neither answer leaks the other', async () => {
    // A principal with no permission must not learn whether a component exists or what kind it is.
    dynamic()

    await expectDenied(() => components.deleteUserComponentHeader(contextWith([]), 'hero'))
  })
})
