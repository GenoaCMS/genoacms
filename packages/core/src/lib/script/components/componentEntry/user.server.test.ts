import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Grant } from '$lib/script/authorization/grants'
import type { Permission } from '$lib/script/authorization/permissions'
import type { AuthContext } from '$lib/script/authorization/context'

/**
 * Enforcement in the user-facing prebuilt component layer.
 *
 * Two things are worth pinning. Reading the catalogue is its own permission, so a role can exist
 * that cannot browse components at all. And **removal is gated on `register`, not `modify`**: a
 * component is a dependency of every page using it, so a role meant to adjust attribute schemas must
 * not be able to delete one.
 */

const calls: string[] = []

vi.mock('./io.server', () => ({
  listOrCreateComponentEntryList: async () => { calls.push('list'); return [] },
  getComponentEntry: async (reference: string) => { calls.push(`get:${reference}`); return null },
  uploadComponentEntry: async (entry: { uid: string }) => { calls.push(`upload:${entry.uid}`) },
  deleteComponentEntry: async (name: string) => { calls.push(`delete:${name}`) }
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
})

const expectDenied = async (operation: () => unknown): Promise<void> => {
  await expect(Promise.resolve().then(operation)).rejects.toBeInstanceOf(PermissionDeniedError)
  expect(calls).toEqual([])
}

describe('reading the catalogue', () => {
  it('is denied without components:prebuilt:read', async () => {
    await expectDenied(() => components.listUserComponentEntries(contextWith([])))
    await expectDenied(() => components.getUserComponentEntry(contextWith([]), 'hero'))
  })

  it('is not implied by being able to modify', async () => {
    await expectDenied(() =>
      components.listUserComponentEntries(contextWith(['components:prebuilt:modify'])))
  })

  it('is allowed with it', async () => {
    await components.listUserComponentEntries(contextWith(['components:prebuilt:read']))
    await components.getUserComponentEntry(contextWith(['components:prebuilt:read']), 'hero')
    expect(calls).toEqual(['list', 'get:hero'])
  })
})

describe('modifying', () => {
  it('is denied to a principal who may only read', async () => {
    await expectDenied(() =>
      components.updateUserComponentEntry(contextWith(['components:prebuilt:read']), entry))
  })

  it('is allowed with components:prebuilt:modify', async () => {
    await components.updateUserComponentEntry(contextWith(['components:prebuilt:modify']), entry)
    expect(calls).toEqual(['upload:hero'])
  })
})

describe('deleting', () => {
  it('is denied to a principal holding only modify', async () => {
    // Removal is the inverse of registration. Letting modify cover it would mean a role meant to
    // edit attribute schemas could destroy a component that pages depend on.
    await expectDenied(() =>
      components.deleteUserComponentEntry(contextWith(['components:prebuilt:modify']), 'hero'))
  })

  it('is allowed with components:prebuilt:register', async () => {
    await components.deleteUserComponentEntry(contextWith(['components:prebuilt:register']), 'hero')
    expect(calls).toEqual(['delete:hero'])
  })

  it('is not implied by being able to read', async () => {
    await expectDenied(() =>
      components.deleteUserComponentEntry(contextWith(['components:prebuilt:read']), 'hero'))
  })
})
