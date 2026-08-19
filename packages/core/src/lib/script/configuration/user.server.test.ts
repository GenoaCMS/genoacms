import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Grant } from '$lib/script/authorization/grants'
import type { Permission } from '$lib/script/authorization/permissions'
import type { AuthContext } from '$lib/script/authorization/context'

/**
 * Enforcement in the configuration service.
 *
 * These permissions govern the authorization data itself, so the case that matters most is
 * `assignUserAccountRoles`: it is an account operation whose effect is to decide what someone may
 * do. Gating it on account management alone would let a principal who cannot touch roles hand out
 * any role that exists — `config:roles:manage` by another name.
 *
 * The primary layer is stubbed and records what reached it, so "denied" means the manifest was never
 * written rather than that an error surfaced.
 */

const calls: string[] = []

const locked = { value: false }

const storedRole = { name: 'RuntimeRole', grants: [] }
const declaredRole = { name: 'DeclaredRole', grants: [] }
const storedAccount = { subject: 'stored-1', email: 'stored-1@example.com', roles: [] }
const declaredAccount = { subject: 'declared-1', email: '', roles: ['DeclaredRole'] }

const stored = {
  roles: [storedRole],
  users: [storedAccount],
  declared: { roles: [declaredRole], users: [declaredAccount] }
}

vi.mock('$lib/script/authorization/declared.server', () => ({
  isAdministrationLocked: () => locked.value
}))

vi.mock('$lib/script/authorization/administration.server', () => ({
  loadAdministrationState: async () => {
    calls.push('load')
    return { ok: true, value: { roles: stored.roles, users: stored.users, declared: stored.declared } }
  },
  createRole: async (role: { name: string }) => { calls.push(`createRole:${role.name}`); return { ok: true } },
  updateRole: async (role: { name: string }) => { calls.push(`updateRole:${role.name}`); return { ok: true } },
  deleteRole: async (name: string) => { calls.push(`deleteRole:${name}`); return { ok: true } },
  upsertAccount: async (record: { subject: string }) => { calls.push(`upsert:${record.subject}`); return { ok: true } },
  assignAccountRoles: async (subject: string) => { calls.push(`assign:${subject}`); return { ok: true } },
  removeAccount: async (subject: string) => { calls.push(`remove:${subject}`); return { ok: true } }
}))

vi.mock('$lib/script/storage/storage.server', () => ({
  getBucketReferences: () => [{ name: 'media' }, { name: 'invoices' }]
}))

vi.mock('$lib/script/database/database.server', () => ({
  getCollectionReferences: () => ['articles', 'products', 'unreadable'],
  getCollectionReference: async (name: string) => {
    if (name === 'unreadable') throw new Error('collection/not-found')
    return { name, schema: { properties: { title: {}, body: {} } } }
  }
}))

const { createAuthContext } = await import('$lib/script/authorization/context')
const { PermissionDeniedError } = await import('$lib/script/authorization/enforce')
const configuration = await import('./user.server')

const grant = (permission: Permission): Grant => ({ permission, resource: '*' } as Grant)

const contextWith = (permissions: Permission[]): AuthContext =>
  createAuthContext('subject-1', permissions.map(grant))

const roleAdmin = () => contextWith(['config:roles:manage'])
const accountAdmin = () => contextWith(['config:users:manage'])
const bothAdmin = () => contextWith(['config:roles:manage', 'config:users:manage'])
const nobody = () => contextWith([])

const role = { name: 'Editor', grants: [] }
const account = { subject: 's-1', email: 's-1@example.com', roles: [] }

beforeEach(() => {
  calls.length = 0
  locked.value = false
})

const expectDenied = async (operation: () => unknown): Promise<void> => {
  await expect(Promise.resolve().then(operation)).rejects.toBeInstanceOf(PermissionDeniedError)
  expect(calls).toEqual([])
}

describe('administering roles', () => {
  it('is denied without config:roles:manage', async () => {
    await expectDenied(() => configuration.createUserRole(nobody(), role))
    await expectDenied(() => configuration.updateUserRole(nobody(), role))
    await expectDenied(() => configuration.deleteUserRole(nobody(), 'Editor'))
  })

  it('is not granted by being able to manage accounts', async () => {
    await expectDenied(() => configuration.createUserRole(accountAdmin(), role))
    await expectDenied(() => configuration.deleteUserRole(accountAdmin(), 'Editor'))
  })

  it('is allowed with it', async () => {
    await configuration.createUserRole(roleAdmin(), role)
    await configuration.updateUserRole(roleAdmin(), role)
    await configuration.deleteUserRole(roleAdmin(), 'Editor')
    expect(calls).toEqual(['createRole:Editor', 'updateRole:Editor', 'deleteRole:Editor'])
  })
})

describe('reading the assignment', () => {
  it('needs config:roles:manage, because who holds what is administrative information', async () => {
    await expectDenied(() => configuration.listUserRolesAndAccounts(nobody()))
    await expectDenied(() => configuration.listUserRolesAndAccounts(accountAdmin()))
  })

  it('is allowed to a role administrator', async () => {
    await configuration.listUserRolesAndAccounts(roleAdmin())
    expect(calls).toEqual(['load'])
  })

  it('includes declared entries as well as stored ones', async () => {
    // Listing only the stored ones would show a fresh instance as having no roles while a Tier-1
    // declaration was in fact governing it.
    const result = await configuration.listUserRolesAndAccounts(roleAdmin())
    if (!result.ok) throw new Error('unreachable')

    expect(result.value.roles.map(entry => entry.role.name)).toEqual(['DeclaredRole', 'RuntimeRole'])
    expect(result.value.accounts.map(entry => entry.account.subject)).toEqual(['declared-1', 'stored-1'])
  })

  it('marks declared entries uneditable and stored ones editable', async () => {
    // The screen must not offer a control the write path is certain to refuse.
    const result = await configuration.listUserRolesAndAccounts(roleAdmin())
    if (!result.ok) throw new Error('unreachable')

    expect(result.value.roles.find(e => e.role.name === 'DeclaredRole')?.editable).toBe(false)
    expect(result.value.roles.find(e => e.role.name === 'RuntimeRole')?.editable).toBe(true)
    expect(result.value.accounts.find(e => e.account.subject === 'declared-1')?.editable).toBe(false)
    expect(result.value.accounts.find(e => e.account.subject === 'stored-1')?.editable).toBe(true)
  })

  it('reports nothing editable, and says so, on a locked instance', async () => {
    locked.value = true
    const result = await configuration.listUserRolesAndAccounts(roleAdmin())
    if (!result.ok) throw new Error('unreachable')

    expect(result.value.locked).toBe(true)
    expect(result.value.roles.every(entry => !entry.editable)).toBe(true)
    expect(result.value.accounts.every(entry => !entry.editable)).toBe(true)
  })
})

describe('the grantable resource catalogue', () => {
  it('is refused without config:roles:manage', async () => {
    // The disclosure decision, stated as a check rather than left to the route that calls it.
    await expect(configuration.listGrantableResources(nobody()))
      .rejects.toBeInstanceOf(PermissionDeniedError)
    await expect(configuration.listGrantableResources(accountAdmin()))
      .rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it('is not narrowed by what the administrator may themselves access', async () => {
    // A role administrator commonly holds no storage or database grant at all. Filtering the
    // catalogue by their own access would show them an empty picker and force them back to typing a
    // name nothing checks.
    const catalogue = await configuration.listGrantableResources(roleAdmin())

    expect(catalogue.buckets).toEqual(['media', 'invoices'])
    expect(catalogue.collections.map(collection => collection.name))
      .toEqual(['articles', 'products', 'unreadable'])
  })

  it('carries the fields of each collection, for the field pickers', async () => {
    const catalogue = await configuration.listGrantableResources(roleAdmin())

    expect(catalogue.collections[0]).toEqual({ name: 'articles', fields: ['title', 'body'] })
  })

  it('still lists a collection whose definition cannot be read', async () => {
    // One unreadable definition must not take the administration screen down with it. The
    // collection is known to exist; there is simply nothing to refine the grant by.
    const catalogue = await configuration.listGrantableResources(roleAdmin())

    expect(catalogue.collections.at(-1)).toEqual({ name: 'unreadable', fields: [] })
  })
})

describe('administering accounts', () => {
  it('is denied without config:users:manage', async () => {
    await expectDenied(() => configuration.upsertUserAccount(nobody(), account))
    await expectDenied(() => configuration.removeUserAccount(nobody(), 's-1'))
  })

  it('is not granted by being able to manage roles', async () => {
    await expectDenied(() => configuration.upsertUserAccount(roleAdmin(), account))
    await expectDenied(() => configuration.removeUserAccount(roleAdmin(), 's-1'))
  })

  it('is allowed with it', async () => {
    await configuration.upsertUserAccount(accountAdmin(), account)
    await configuration.removeUserAccount(accountAdmin(), 's-1')
    expect(calls).toEqual(['upsert:s-1', 'remove:s-1'])
  })
})

describe('assigning roles to an account', () => {
  it('needs both permissions', async () => {
    // Account management alone would let a principal hand out any role that exists, which is role
    // management by another name.
    await expectDenied(() => configuration.assignUserAccountRoles(accountAdmin(), 's-1', ['Editor']))
    await expectDenied(() => configuration.assignUserAccountRoles(roleAdmin(), 's-1', ['Editor']))
  })

  it('is allowed to a principal holding both', async () => {
    await configuration.assignUserAccountRoles(bothAdmin(), 's-1', ['Editor'])
    expect(calls).toEqual(['assign:s-1'])
  })
})

describe('the Tier-1 lock', () => {
  it('refuses every mutation when set', async () => {
    locked.value = true

    for (const attempt of [
      () => configuration.createUserRole(bothAdmin(), role),
      () => configuration.updateUserRole(bothAdmin(), role),
      () => configuration.deleteUserRole(bothAdmin(), 'Editor'),
      () => configuration.upsertUserAccount(bothAdmin(), account),
      () => configuration.assignUserAccountRoles(bothAdmin(), 's-1', []),
      () => configuration.removeUserAccount(bothAdmin(), 's-1')
    ]) {
      expect(await attempt()).toMatchObject({ ok: false, reason: 'administration/locked-by-configuration' })
    }

    // Refused before anything was written, not reported after the fact.
    expect(calls).toEqual([])
  })

  it('still allows reading the assignment', async () => {
    // The lock disables administration, not visibility: an operator has to be able to see what the
    // instance is configured to do.
    locked.value = true
    expect(await configuration.listUserRolesAndAccounts(roleAdmin())).toMatchObject({ ok: true })
  })

  it('reports the missing permission ahead of the lock', async () => {
    // Otherwise an unauthorized caller would learn the instance's configuration from the refusal.
    locked.value = true
    await expectDenied(() => configuration.createUserRole(nobody(), role))
  })
})
