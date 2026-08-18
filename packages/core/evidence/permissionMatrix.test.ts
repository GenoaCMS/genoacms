import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BUCKET, COLLECTION, matrixOperations, rolesUnderTest } from './permissionMatrix'
import type { AuthContext } from '$lib/script/authorization/context'

/**
 * **E6 — the exhaustive permission matrix.**
 *
 * Every (role × service-layer function) pair is invoked against the **real** gated service and
 * checked against an independently declared expectation. Two properties make this evidence rather
 * than a restatement of the implementation:
 *
 * 1. **The expectations are hand-written**, as an allow-list per role. They are not derived from the
 *    `requirePermission` calls under test, so the matrix can disagree with the code — which is the
 *    only way a test can find a wrong mapping rather than confirm one.
 * 2. **Coverage is enforced by construction.** The operation table is checked against the modules'
 *    actual exports, so adding a service function without placing it in the matrix fails. A function
 *    that forgot its check appears as an *unexpected allow* — the fail-closed property is
 *    detectable by construction rather than by review.
 *
 * Only the primary (unprivileged) layers are stubbed. Nothing between the call and the check is
 * mocked, so a missing check has nowhere to hide.
 *
 * **Not covered here:** the field-level assertions E6 also calls for — new-field default deny and
 * write-merge integrity — because field masking is step 17 and is not built. They are absent rather
 * than approximated, and E6 must report them as such.
 */

// ---------------------------------------------------------------------------------------------
// The primary layers. Every one records nothing and simply succeeds, so any allow is a real allow.
// ---------------------------------------------------------------------------------------------

vi.mock('$lib/script/storage/storage.server', () => ({
  getBucketReferences: () => [{ name: 'media' }],
  getObject: async () => ({ data: '' }),
  getObjectString: async () => '',
  getObjectJSON: async () => ({}),
  getObjectFlatted: async () => ({}),
  uploadObject: async () => {},
  moveObject: async () => {},
  deleteObject: async () => {},
  getPublicURL: () => 'url',
  listDirectory: async () => ({ directories: [], files: [] }),
  createDirectory: async () => {},
  moveDirectory: async () => {},
  deleteDirectory: async () => {},
  processDirectoryContents: async () => ({ directories: [], files: [] }),
  isDirectoryExisting: () => true
}))

vi.mock('$lib/script/database/database.server', () => ({
  getCollectionReferences: () => ['articles'],
  getCollectionReference: async () => ({ name: 'articles', schema: {} }),
  getCollection: async () => [],
  getDocument: async () => ({}),
  createDocument: async () => ({}),
  updateDocument: async () => {},
  deleteDocument: async () => {}
}))

vi.mock('$lib/script/components/componentEntry/io.server', () => ({
  listOrCreateComponentEntryList: async () => [],
  getComponentEntry: async () => null,
  uploadComponentEntry: async () => {},
  deleteComponentEntry: async () => {}
}))

vi.mock('$lib/script/components/page/page.server', () => ({
  listOrCreatePageList: async () => [],
  getPageEntry: async () => ({ name: 'home' }),
  uploadPageEntry: async () => {},
  generateReadablePageTree: async () => {}
}))

vi.mock('$lib/script/authorization/declared.server', () => ({
  isAdministrationLocked: () => false
}))

vi.mock('$lib/script/authorization/administration.server', () => ({
  loadAdministrationState: async () => ({
    ok: true,
    value: { roles: [], users: [], declared: { roles: [], users: [] } }
  }),
  createRole: async () => ({ ok: true }),
  updateRole: async () => ({ ok: true }),
  deleteRole: async () => ({ ok: true }),
  upsertAccount: async () => ({ ok: true }),
  assignAccountRoles: async () => ({ ok: true }),
  removeAccount: async () => ({ ok: true })
}))

const { createAuthContext } = await import('$lib/script/authorization/context')
const { WILDCARD } = await import('$lib/script/authorization/grants')
const { resolveSubject } = await import('$lib/script/authorization/resolution')
const { PermissionDeniedError } = await import('$lib/script/authorization/enforce')

const storage = await import('$lib/script/storage/user.server')
const database = await import('$lib/script/database/user.server')
const components = await import('$lib/script/components/componentEntry/user.server')
const pagesService = await import('$lib/script/components/page/user.server')
const configuration = await import('$lib/script/configuration/user.server')

// ---------------------------------------------------------------------------------------------
// The operation table: every gated service function, invoked for real.
// ---------------------------------------------------------------------------------------------

const objectRef = { bucket: BUCKET, name: 'photo.jpg' }
const directoryRef = { bucket: BUCKET, name: 'folder/' }
const collectionRef = { name: COLLECTION, schema: {} } as never
const documentRef = { collection: { name: COLLECTION }, id: 'doc-1' } as never
const pageEntry = { name: 'home' } as never
const componentEntry = { uid: 'hero' } as never
const accountRecord = { subject: 's-1', email: 's-1@example.com', roles: [] }
const roleRecord = { name: 'Editor', grants: [] }

/**
 * Filtering operations do not throw; they return a narrowed list. "Allowed" for those means the
 * resource was visible, which is the same authorization question in a different shape.
 */
const visible = (result: unknown[]): void => {
  if (result.length === 0) throw new PermissionDeniedError('subject', 'storage:bucket:read', BUCKET)
}

const operations: Record<string, (ctx: AuthContext) => unknown> = {
  // storage
  getUserBucketReferences: ctx => visible(storage.getUserBucketReferences(ctx)),
  listUserDirectory: ctx => storage.listUserDirectory(ctx, directoryRef),
  processUserDirectoryContents: ctx =>
    storage.processUserDirectoryContents(ctx, BUCKET, { directories: [], files: [] }),
  uploadUserObject: ctx => storage.uploadUserObject(ctx, objectRef, 'data'),
  createUserDirectory: ctx => storage.createUserDirectory(ctx, directoryRef),
  moveUserObject: ctx => storage.moveUserObject(ctx, objectRef, 'moved.jpg'),
  moveUserDirectory: ctx => storage.moveUserDirectory(ctx, directoryRef, 'other/'),
  deleteUserObject: ctx => storage.deleteUserObject(ctx, objectRef),
  deleteUserDirectory: ctx => storage.deleteUserDirectory(ctx, directoryRef),

  // database
  getUserCollectionReferences: ctx => visible(database.getUserCollectionReferences(ctx)),
  getUserCollectionReference: ctx => database.getUserCollectionReference(ctx, COLLECTION),
  getUserCollection: ctx => database.getUserCollection(ctx, collectionRef),
  getUserDocument: ctx => database.getUserDocument(ctx, documentRef),
  createUserDocument: ctx => database.createUserDocument(ctx, collectionRef, {}),
  updateUserDocument: ctx => database.updateUserDocument(ctx, documentRef, {}),
  deleteUserDocument: ctx => database.deleteUserDocument(ctx, documentRef),

  // prebuilt components
  listUserComponentEntries: ctx => components.listUserComponentEntries(ctx),
  getUserComponentEntry: ctx => components.getUserComponentEntry(ctx, 'hero'),
  updateUserComponentEntry: ctx => components.updateUserComponentEntry(ctx, componentEntry),
  deleteUserComponentEntry: ctx => components.deleteUserComponentEntry(ctx, 'hero'),

  // pages
  listUserPages: ctx => pagesService.listUserPages(ctx),
  getUserPageEntry: ctx => pagesService.getUserPageEntry(ctx, 'home'),
  saveUserPageContent: ctx => pagesService.saveUserPageContent(ctx, pageEntry),
  saveUserPageStructure: ctx => pagesService.saveUserPageStructure(ctx, pageEntry),
  revertUserPageEntry: ctx => pagesService.revertUserPageEntry(ctx, pageEntry),
  generateUserReadablePageTree: ctx => pagesService.generateUserReadablePageTree(ctx, pageEntry),

  // configuration
  listUserRolesAndAccounts: ctx => configuration.listUserRolesAndAccounts(ctx),
  createUserRole: ctx => configuration.createUserRole(ctx, roleRecord),
  updateUserRole: ctx => configuration.updateUserRole(ctx, roleRecord),
  deleteUserRole: ctx => configuration.deleteUserRole(ctx, 'Editor'),
  upsertUserAccount: ctx => configuration.upsertUserAccount(ctx, accountRecord),
  assignUserAccountRoles: ctx => configuration.assignUserAccountRoles(ctx, 's-1', []),
  removeUserAccount: ctx => configuration.removeUserAccount(ctx, 's-1')
}

// ---------------------------------------------------------------------------------------------
// The roles, and what each is expected to be allowed. Written by hand, from the taxonomy in
// the permission taxonomy — never derived from the checks under test.
// ---------------------------------------------------------------------------------------------

const operationNames = Object.keys(operations)
const roleNames = Object.keys(rolesUnderTest)

const contextFor = (roleName: string): AuthContext =>
  createAuthContext(`subject-${roleName}`, rolesUnderTest[roleName].grants)

/** Runs one cell of the matrix. Returns whether the operation was permitted. */
const isAllowed = async (roleName: string, operation: string): Promise<boolean> => {
  try {
    await operations[operation](contextFor(roleName))
    return true
  } catch (error) {
    if (error instanceof PermissionDeniedError) return false
    throw error
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the matrix is complete over the service surface', () => {
  /**
   * Guards the claim of exhaustiveness. Without this, adding a gated function would silently sit
   * outside the matrix and never be checked against any role.
   */
  const services: Record<string, Record<string, unknown>> = {
    storage,
    database,
    components,
    pages: pagesService,
    configuration
  }

  it.each(Object.keys(services))('covers every export of the %s service', (name) => {
    const exported = Object.keys(services[name])
      .filter(key => typeof services[name][key] === 'function')

    expect(operationNames).toEqual(expect.arrayContaining(exported))
  })

  it('declares exactly the operations the matrix names', () => {
    // Keeps the published table and the invoked set identical: an operation declared but never
    // invoked would appear in the thesis as evidence without having been tested.
    expect([...operationNames].sort()).toEqual([...matrixOperations].sort())
  })

  it('names only operations that exist', () => {
    for (const roleName of roleNames) {
      for (const allowed of rolesUnderTest[roleName].allowed) {
        expect(operationNames).toContain(allowed)
      }
    }
  })
})

describe('the permission matrix', () => {
  const cells = roleNames.flatMap(roleName =>
    operationNames.map(operation => ({
      roleName,
      operation,
      expected: rolesUnderTest[roleName].allowed.includes(operation)
    }))
  )

  it.each(cells)('$roleName $operation → allowed=$expected', async ({ roleName, operation, expected }) => {
    expect(await isAllowed(roleName, operation)).toBe(expected)
  })
})

describe('default deny', () => {
  it('refuses a principal with no grants at every service function', async () => {
    // E6's first additional assertion, stated directly rather than inferred from the matrix.
    for (const operation of operationNames) {
      expect(await isAllowed('Nobody', operation)).toBe(false)
    }
  })

  it('is what an unknown principal resolves to, and what an unavailable source yields', () => {
    // The bridge between resolution and this matrix. `Nobody` above is shown to be denied at every
    // function; this establishes that both fail-closed paths land there, so the
    // matrix covers them without re-running every cell.
    const unknown = resolveSubject('never-provisioned', {
      available: true, roles: [], users: []
    })
    expect(unknown.known).toBe(false)
    expect(unknown.context.grants).toEqual([])

    const unavailable = resolveSubject('any-subject', {
      available: false, reason: 'manifest-rejected'
    })
    expect(unavailable.known).toBe(false)
    expect(unavailable.context.grants).toEqual([])

    expect(rolesUnderTest.Nobody.grants).toEqual([])
  })
})

describe('a Tier-1 declared administrator', () => {
  it('is permitted everywhere, so recovery is always possible', async () => {
    // An instance whose manifests are unreadable must still have an identity that can act.
    // It is now an ordinary declared assignment carrying the wildcard grant, resolved without
    // storage, rather than a special-cased seed administrator.
    const declaredAdmin = createAuthContext('declared-admin', [{ permission: WILDCARD, resource: WILDCARD }], true)
    for (const operation of operationNames) {
      let permitted = true
      try {
        await operations[operation](declaredAdmin)
      } catch (error) {
        if (!(error instanceof PermissionDeniedError)) throw error
        permitted = false
      }
      expect(permitted).toBe(true)
    }
  })
})
