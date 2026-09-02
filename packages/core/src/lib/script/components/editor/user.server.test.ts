import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Grant } from '$lib/script/authorization/grants'
import type { Permission } from '$lib/script/authorization/permissions'
import type { AuthContext } from '$lib/script/authorization/context'

/**
 * Enforcement on the dynamic component surface.
 *
 * This layer did not exist until the interface was being gated: the editor's routes called the
 * primary module directly, so creating, reading, editing and deleting a coded component were all
 * unenforced while the component permissions sat in the taxonomy consumed by nothing.
 *
 * The cases that matter most are the separations the taxonomy claims to express — reading the
 * catalog without reading source, and creating or destroying a component without authoring it. A
 * permission that cannot be held alone is not really a permission.
 *
 * **Publishing is not tested here**, because it is not this module's. It is an act on the whole
 * component and lives in `publication/user.server.ts`, which has its own enforcement tests.
 *
 * The primary layer is stubbed and records what reached it, so "denied" means the operation never
 * ran rather than that an error surfaced somewhere.
 */

const calls: string[] = []

vi.mock('./index', () => ({
  createComponent: async (name: string) => { calls.push(`create:${name}`); return 'uid-1' },
  listOrCreateComponentList: async () => { calls.push('list'); return [] },
  getComponent: async (uid: string) => { calls.push(`get:${uid}`); return { uid, name: 'hero' } },
  getComponentDefiniton: async (uid: string) => { calls.push(`definition:${uid}`); return { uid } },
  deleteComponent: async (component: { uid: string }) => { calls.push(`delete:${component.uid}`) }
}))

vi.mock('./editing.server', () => ({
  saveComponentBody: async (uid: string, body: string) => {
    calls.push(`save:${uid}:${body}`)
    return { historyLength: 1, futureLength: 0 }
  },
  undoComponentBody: async (uid: string) => { calls.push(`undo:${uid}`); return { uid } },
  redoComponentBody: async (uid: string) => { calls.push(`redo:${uid}`); return { uid } },
  getComponentDefinitionDepth: async (uid: string) => {
    calls.push(`depth:${uid}`)
    return { historyLength: 0, futureLength: 0 }
  }
}))

const { createAuthContext } = await import('$lib/script/authorization/context')
const { PermissionDeniedError } = await import('$lib/script/authorization/enforce')
const editor = await import('./user.server')

const grant = (permission: Permission): Grant => ({ permission, resource: '*' } as Grant)
const contextWith = (permissions: Permission[]): AuthContext =>
  createAuthContext('subject-1', permissions.map(grant))

const nobody = () => contextWith([])
const reader = () => contextWith(['components:read'])
/** Reading and writing source are one permission: `components:code`. */
const developer = () => contextWith(['components:code'])
const manager = () => contextWith(['components:register'])

const component = { uid: 'uid-1', name: 'hero' } as never

beforeEach(() => {
  calls.length = 0
})

const expectDenied = async (operation: () => unknown): Promise<void> => {
  await expect(Promise.resolve().then(operation)).rejects.toBeInstanceOf(PermissionDeniedError)
  expect(calls).toEqual([])
}

describe('every operation', () => {
  it('is denied to a principal with no grants', async () => {
    // What this whole module exists to establish: none of these were checked at all before.
    await expectDenied(() => editor.listUserComponents(nobody()))
    await expectDenied(() => editor.getUserComponent(nobody(), 'uid-1'))
    await expectDenied(() => editor.getUserComponentDefinition(nobody(), 'uid-1'))
    await expectDenied(() => editor.createUserComponent(nobody(), 'hero'))
    await expectDenied(() => editor.saveUserComponentBody(nobody(), 'uid-1', 'return 1'))
    await expectDenied(() => editor.undoUserComponentBody(nobody(), 'uid-1'))
    await expectDenied(() => editor.redoUserComponentBody(nobody(), 'uid-1'))
    await expectDenied(() => editor.getUserComponentDefinitionDepth(nobody(), 'uid-1'))
    await expectDenied(() => editor.deleteUserComponent(nobody(), component))
  })
})

describe('reading', () => {
  it('separates the catalog from the source', async () => {
    // Seeing that a component exists is catalog information; seeing what it does is not.
    await editor.listUserComponents(reader())
    await editor.getUserComponent(reader(), 'uid-1')
    expect(calls).toEqual(['list', 'get:uid-1'])

    calls.length = 0
    await expectDenied(() => editor.getUserComponentDefinition(reader(), 'uid-1'))
  })

  it('needs components:code, which reading the catalog does not imply', async () => {
    await editor.getUserComponentDefinition(developer(), 'uid-1')
    expect(calls).toEqual(['definition:uid-1'])
  })
})

describe('authoring', () => {
  it('writes the draft with components:code', async () => {
    await editor.saveUserComponentBody(developer(), 'uid-1', 'return 1')
    expect(calls).toEqual(['save:uid-1:return 1'])
  })

  it('steps the history with the same permission that writes it', async () => {
    // Undo and redo rewrite the stored body, so they are gated with writing rather than with
    // reading. A principal permitted only to read source must not be able to move it.
    await editor.undoUserComponentBody(developer(), 'uid-1')
    await editor.redoUserComponentBody(developer(), 'uid-1')
    expect(calls).toEqual(['undo:uid-1', 'redo:uid-1'])
  })

  it('does not let a reader step the history', async () => {
    await expectDenied(() => editor.undoUserComponentBody(reader(), 'uid-1'))
    await expectDenied(() => editor.redoUserComponentBody(reader(), 'uid-1'))
  })

  it('does not permit creating or destroying a component', async () => {
    // Existence is `components:register`. Holding the key to a component's source is not a licence
    // to add components pages can be built on, or to destroy one every page depends on.
    await expectDenied(() => editor.createUserComponent(developer(), 'hero'))
    await expectDenied(() => editor.deleteUserComponent(developer(), component))
  })
})

describe('managing a component', () => {
  it('creates and deletes with manage alone', async () => {
    await editor.createUserComponent(manager(), 'hero')
    await editor.deleteUserComponent(manager(), component)
    expect(calls).toEqual(['create:hero', 'delete:uid-1'])
  })

  it('does not thereby permit reading or writing the source', async () => {
    // Deleting destroys source, which is why it is not implied by `edit` — and managing existence
    // is not a way to read what a component does either.
    await expectDenied(() => editor.getUserComponentDefinition(manager(), 'uid-1'))
    await expectDenied(() => editor.saveUserComponentBody(manager(), 'uid-1', 'return 1'))
  })
})
