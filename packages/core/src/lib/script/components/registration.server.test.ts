import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Grant } from '$lib/script/authorization/grants'
import type { Permission } from '$lib/script/authorization/permissions'
import type { AuthContext } from '$lib/script/authorization/context'

/**
 * Registering a component of either kind.
 *
 * One form in the registrar creates both, and **the type does not change what is demanded**:
 * registering is `components:register` either way, because both produce a component the CMS
 * describes identically and lists in the same catalog. The permissions draw their line between
 * describing a component and reaching its code, not between the kinds.
 *
 * What the type *does* change is what gets stored, and that is the defect worth a test: a dynamic
 * component routed to the header service would pass the same permission check and write a
 * description with no source behind it — a component the editor cannot open while the catalog goes
 * on listing it.
 *
 * Storage is stood in for at the lowest level each branch reaches, so the real permission checks in
 * both services run. Mocking the services themselves would leave this testing the mock's idea of
 * where the gate is. Refusals are paired with the allowed case throughout, because a deny test
 * passes just as happily against a router that refuses everything.
 */

const created: string[] = []

/** What storage holds. Absent by default; set by the deletion tests to the kind under test. */
let stored: { uid: string, type: string, name: string } | null = null

vi.mock('./componentHeader/io.server', () => ({
  uploadComponentHeader: async (header: { uid: string, type: string, name: string }) => {
    created.push(`header:${header.type}:${header.name}`)
  },
  getComponentHeader: async () => stored,
  listOrCreateComponentHeaderList: async () => [],
  deleteComponentHeader: async (reference: string) => { created.push(`removed-header:${reference}`) },
  getComponentHeaderHistory: async () => ({ history: [], future: [] }),
  uploadComponentHeaderHistory: async () => {}
}))

vi.mock('./editor/index', () => ({
  createComponent: async (name: string) => {
    created.push(`definition:${name}`)
    return 'dynamic-uid'
  },
  listOrCreateComponentList: async () => [],
  getComponent: async () => ({ uid: 'x', name: 'x' }),
  getComponentDefiniton: async () => ({}),
  updateComponentDefinition: async () => {},
  commitComponentDefinition: async () => {},
  deleteComponent: async (component: { uid: string }) => { created.push(`removed-everything:${component.uid}`) }
}))

const { createAuthContext } = await import('$lib/script/authorization/context')
const { PermissionDeniedError } = await import('$lib/script/authorization/enforce')
const { registerUserComponent, deleteUserComponentByReference } = await import('./registration.server')

const grant = (permission: Permission): Grant => ({ permission, resource: '*' } as Grant)
const contextWith = (permissions: Permission[]): AuthContext =>
  createAuthContext('subject-1', permissions.map(grant))

const REGISTER: Permission = 'components:register'

beforeEach(() => {
  created.length = 0
  stored = null
})

describe('what registering demands', () => {
  it('is allowed for either kind with components:register', async () => {
    await registerUserComponent(contextWith([REGISTER]), { name: 'Card', type: 'prebuilt' })
    await registerUserComponent(contextWith([REGISTER]), { name: 'Hero', type: 'dynamic' })

    expect(created).toEqual(['header:prebuilt:Card', 'definition:Hero'])
  })

  it('is denied for either kind without it', async () => {
    for (const type of ['prebuilt', 'dynamic'] as const) {
      await expect(
        registerUserComponent(contextWith([]), { name: 'Nothing', type })
      ).rejects.toBeInstanceOf(PermissionDeniedError)
    }
    expect(created).toEqual([])
  })

  it('is not implied by being able to describe a component, or to write code', async () => {
    // Registering is a component's existence. Neither adjusting an existing component's shape nor
    // holding the key to its source is a licence to add components pages can then be built on.
    for (const permission of ['components:modify', 'components:code', 'components:read'] as const) {
      await expect(
        registerUserComponent(contextWith([permission]), { name: 'Nothing', type: 'prebuilt' })
      ).rejects.toBeInstanceOf(PermissionDeniedError)
    }
    expect(created).toEqual([])
  })
})

describe('what a component may be called', () => {
  it('accepts a name no source file could declare, for either kind', async () => {
    // This was refused while a component's name was the entry function its source had to declare.
    // The CMS emits that function under a fixed name now, so the name is a label and nothing else —
    // and `my-hero`, which could once be created and never published, is ordinary.
    await registerUserComponent(contextWith([REGISTER]), { name: 'my-hero', type: 'dynamic' })
    await registerUserComponent(contextWith([REGISTER]), { name: 'my-hero', type: 'prebuilt' })

    expect(created).toEqual(['definition:my-hero', 'header:prebuilt:my-hero'])
  })
})

describe('what registering stores', () => {
  it('gives a dynamic component a source definition, not merely a header', async () => {
    await registerUserComponent(contextWith([REGISTER]), { name: 'Hero', type: 'dynamic' })

    expect(created).toEqual(['definition:Hero'])
    expect(created).not.toContain('header:dynamic:Hero')
  })

  it('gives a prebuilt component a header and no definition', async () => {
    // The other direction: a prebuilt component has no source, so creating one through the editor's
    // service would leave an empty definition nothing will ever compile.
    await registerUserComponent(contextWith([REGISTER]), { name: 'Card', type: 'prebuilt' })

    expect(created).toEqual(['header:prebuilt:Card'])
  })
})

describe('deleting a component', () => {
  it('removes a prebuilt one through the header service', async () => {
    stored = { uid: 'card', type: 'prebuilt', name: 'Card' }

    await deleteUserComponentByReference(contextWith([REGISTER]), 'card')

    expect(created).toEqual(['removed-header:card'])
  })

  it('removes a dynamic one through the service that owns its source', async () => {
    // The defect that made the catalog hide dynamic components: removing one through the header
    // service deletes the description and strands the definition, every commit under it, and every
    // executable it published — each still signed and still verifying, for a component that is gone.
    stored = { uid: 'hero', type: 'dynamic', name: 'Hero' }

    await deleteUserComponentByReference(contextWith([REGISTER]), 'hero')

    expect(created).toEqual(['removed-everything:hero'])
    expect(created).not.toContain('removed-header:hero')
  })

  it('reads the stored kind rather than believing the request', async () => {
    // The reference is all the request carries, so there is nothing to forge — asserting it here is
    // what stops a later signature growing a caller-supplied type as a convenience.
    stored = { uid: 'hero', type: 'dynamic', name: 'Hero' }

    await deleteUserComponentByReference(contextWith([REGISTER]), 'hero')

    expect(created).toEqual(['removed-everything:hero'])
  })

  it('is denied without components:register, for either kind', async () => {
    for (const type of ['prebuilt', 'dynamic']) {
      stored = { uid: 'x', type, name: 'X' }
      await expect(
        deleteUserComponentByReference(contextWith(['components:modify']), 'x')
      ).rejects.toBeInstanceOf(PermissionDeniedError)
    }
    expect(created).toEqual([])
  })
})
