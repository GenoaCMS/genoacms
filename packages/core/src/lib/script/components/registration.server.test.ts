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

vi.mock('./componentHeader/io.server', () => ({
  uploadComponentHeader: async (header: { uid: string, type: string, name: string }) => {
    created.push(`header:${header.type}:${header.name}`)
  },
  getComponentHeader: async () => null,
  listOrCreateComponentHeaderList: async () => [],
  deleteComponentHeader: async () => {},
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
  deleteComponent: async () => {}
}))

const { createAuthContext } = await import('$lib/script/authorization/context')
const { PermissionDeniedError } = await import('$lib/script/authorization/enforce')
const { registerUserComponent } = await import('./registration.server')

const grant = (permission: Permission): Grant => ({ permission, resource: '*' } as Grant)
const contextWith = (permissions: Permission[]): AuthContext =>
  createAuthContext('subject-1', permissions.map(grant))

const REGISTER: Permission = 'components:register'

beforeEach(() => { created.length = 0 })

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
