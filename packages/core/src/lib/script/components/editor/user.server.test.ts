import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Grant } from '$lib/script/authorization/grants'
import type { Permission } from '$lib/script/authorization/permissions'
import type { AuthContext } from '$lib/script/authorization/context'

/**
 * Enforcement on the dynamic component surface.
 *
 * This layer did not exist until the interface was being gated: the editor's routes called the
 * primary module directly, so creating, reading, editing, committing and deleting a coded component
 * were all unenforced while `components:dynamic:*` sat in the taxonomy consumed by nothing.
 *
 * The cases that matter most are the separations the taxonomy claims to express — reading source
 * without writing it, publishing without authoring, and creating or destroying a component without
 * either. A permission that cannot be held alone is not really a permission.
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
  updateComponentDefinition: async (uid: string) => { calls.push(`update:${uid}`) },
  commitComponentDefinition: async (order: { componentId: string }) => { calls.push(`commit:${order.componentId}`) },
  deleteComponent: async (component: { uid: string }) => { calls.push(`delete:${component.uid}`) }
}))

const { createAuthContext } = await import('$lib/script/authorization/context')
const { PermissionDeniedError } = await import('$lib/script/authorization/enforce')
const editor = await import('./user.server')

const grant = (permission: Permission): Grant => ({ permission, resource: '*' } as Grant)
const contextWith = (permissions: Permission[]): AuthContext =>
  createAuthContext('subject-1', permissions.map(grant))

const nobody = () => contextWith([])
const reader = () => contextWith(['components:prebuilt:read'])
const viewer = () => contextWith(['components:dynamic:view_code'])
const author = () => contextWith(['components:dynamic:edit'])
const publisher = () => contextWith(['components:dynamic:commit'])
const manager = () => contextWith(['components:dynamic:manage'])

const component = { uid: 'uid-1', name: 'hero' } as never
const order = { componentId: 'uid-1', message: 'a message' } as never

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
    await expectDenied(() => editor.updateUserComponentDefinition(nobody(), 'uid-1', d => d))
    await expectDenied(() => editor.commitUserComponentDefinition(nobody(), order))
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

  it('lets source be read without being writable', async () => {
    await editor.getUserComponentDefinition(viewer(), 'uid-1')
    expect(calls).toEqual(['definition:uid-1'])

    calls.length = 0
    await expectDenied(() => editor.updateUserComponentDefinition(viewer(), 'uid-1', d => d))
  })
})

describe('authoring', () => {
  it('writes the draft with edit alone', async () => {
    await editor.updateUserComponentDefinition(author(), 'uid-1', d => d)
    expect(calls).toEqual(['update:uid-1'])
  })

  it('does not permit publishing', async () => {
    // Committing signs and publishes an executable. Authoring must not imply it.
    await expectDenied(() => editor.commitUserComponentDefinition(author(), order))
  })

  it('does not permit creating or destroying a component', async () => {
    await expectDenied(() => editor.createUserComponent(author(), 'hero'))
    await expectDenied(() => editor.deleteUserComponent(author(), component))
  })
})

describe('publishing', () => {
  it('needs commit alone, so a publisher need not be an author', async () => {
    // The arrangement the taxonomy exists to allow: a small trusted set publishes what others
    // wrote, without being able to alter it first.
    await editor.commitUserComponentDefinition(publisher(), order)
    expect(calls).toEqual(['commit:uid-1'])

    calls.length = 0
    await expectDenied(() => editor.updateUserComponentDefinition(publisher(), 'uid-1', d => d))
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
    await expectDenied(() => editor.updateUserComponentDefinition(manager(), 'uid-1', d => d))
  })
})
