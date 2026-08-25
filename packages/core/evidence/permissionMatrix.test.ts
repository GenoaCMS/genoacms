import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BUCKET, COLLECTION, matrixOperations, rolesUnderTest } from './permissionMatrix'
import type { AuthContext } from '$lib/script/authorization/context'
import type { Grant } from '$lib/script/authorization/grants'

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

/**
 * The stored document the field-level assertions read and write.
 *
 * Shared with the mock below so a write can be observed: the masking evidence is about what reaches
 * the database, which a mock returning `{}` could not show.
 */
const storedDocument = { title: 'Ships', body: 'text', internal_cost: 12 }
const written: Array<Record<string, unknown>> = []

vi.mock('$lib/script/database/database.server', () => ({
  getCollectionReferences: () => ['articles'],
  getCollectionReference: async () => ({ name: 'articles', schema: {} }),
  getCollection: async () => [{ reference: {}, data: { ...storedDocument } }],
  getDocument: async () => ({ reference: {}, data: { ...storedDocument } }),
  createDocument: async (_ref: unknown, document: Record<string, unknown>) => {
    written.push(document)
    return { data: document }
  },
  updateDocument: async (_ref: unknown, document: Record<string, unknown>) => {
    written.push(document)
  },
  deleteDocument: async () => {}
}))

vi.mock('$lib/script/components/editor', () => ({
  createComponent: async () => 'uid-1',
  listOrCreateComponentList: async () => [],
  getComponent: async () => ({ uid: 'uid-1', name: 'hero' }),
  getComponentDefiniton: async () => ({ uid: 'uid-1', code: '', uncommitedCode: '' }),
  updateComponentDefinition: async () => {},
  commitComponentDefinition: async () => {},
  deleteComponent: async () => {}
}))

vi.mock('$lib/script/components/componentHeader/io.server', () => ({
  listOrCreateComponentHeaderList: async () => [],
  // A prebuilt entry, because the prebuilt service refuses a reference that names anything else —
  // and this file is testing the permission gate, not that refusal.
  getComponentHeader: async () => ({
    uid: 'hero', type: 'prebuilt', name: 'Hero', attributes: {}, attributeOrder: []
  }),
  uploadComponentHeader: async () => {},
  deleteComponentHeader: async () => {},
  getComponentHeaderHistory: async () => ({ history: [], future: [] }),
  uploadComponentHeaderHistory: async () => {}
}))

vi.mock('$lib/script/components/page/page.server', () => ({
  listOrCreatePageList: async () => [],
  getPageEntry: async () => ({ name: 'home' }),
  uploadPageEntry: async () => {},
  generateReadablePageTree: async () => {},
  deletePageEntry: async () => {}
}))

vi.mock('$lib/script/authorization/declared.server', () => ({
  isAdministrationLocked: () => false
}))

/**
 * A registry with one superseded key beside the current one, so revocation has something legitimate
 * to name. Revoking the *current* key would take the rotate-first path, which is the primary
 * layer's behavior rather than an authorization question.
 */
const registryFixture = {
  sequence: 3,
  current: 'key-current',
  keys: [
    { keyId: 'key-old', alg: 'ML-DSA-65', publicKey: 'AA==', createdAt: 1, supersededAt: 2 },
    { keyId: 'key-current', alg: 'ML-DSA-65', publicKey: 'BB==', createdAt: 2 }
  ]
}

vi.mock('$lib/script/signing/keyResolution.server', () => ({
  getRegistry: async () => registryFixture,
  rotateSubordinateKey: async () => registryFixture,
  revokeSubordinateKey: async () => registryFixture
}))

vi.mock('$lib/script/signing/rootKey.server', () => ({
  getRootPublicKey: async () => ({ keyId: 'root-1', alg: 'SLH-DSA-SHA2-128s', publicKey: 'AA==' })
}))

vi.mock('$lib/script/securityPolicy/policy.server', () => ({
  loadSecurityPolicy: async () => ({
    subordinateKeyRotationDays: 90,
    accessTokenMinutes: 15,
    grantCacheSeconds: 30,
    refreshTokenDays: 14
  })
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
const components = await import('$lib/script/components/componentHeader/user.server')
const editor = await import('$lib/script/components/editor/user.server')
const pagesService = await import('$lib/script/components/page/user.server')
const configuration = await import('$lib/script/configuration/user.server')
const signing = await import('$lib/script/signing/user.server')

// ---------------------------------------------------------------------------------------------
// The operation table: every gated service function, invoked for real.
// ---------------------------------------------------------------------------------------------

const objectRef = { bucket: BUCKET, name: 'photo.jpg' }
const directoryRef = { bucket: BUCKET, name: 'folder/' }
const collectionRef = { name: COLLECTION, schema: {} } as never
const documentRef = { collection: { name: COLLECTION }, id: 'doc-1' } as never
const pageEntry = { name: 'home' } as never
const componentHeader = { uid: 'hero' } as never
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

  // dynamic components
  listUserComponents: ctx => editor.listUserComponents(ctx),
  getUserComponent: ctx => editor.getUserComponent(ctx, 'uid-1'),
  getUserComponentDefinition: ctx => editor.getUserComponentDefinition(ctx, 'uid-1'),
  createUserComponent: ctx => editor.createUserComponent(ctx, 'hero'),
  updateUserComponentDefinition: ctx =>
    editor.updateUserComponentDefinition(ctx, 'uid-1', definition => definition),
  commitUserComponentDefinition: ctx =>
    editor.commitUserComponentDefinition(ctx, { componentId: 'uid-1', message: 'm' } as never),
  deleteUserComponent: ctx => editor.deleteUserComponent(ctx, { uid: 'uid-1', name: 'hero' } as never),

  // prebuilt components
  registerUserComponentHeader: ctx => components.registerUserComponentHeader(ctx, { name: 'Hero', type: 'prebuilt' }),
  listUserComponentHeaders: ctx => components.listUserComponentHeaders(ctx),
  getUserComponentHeader: ctx => components.getUserComponentHeader(ctx, 'hero'),
  updateUserComponentHeader: ctx => components.updateUserComponentHeader(ctx, componentHeader),
  getUserComponentHeaderDepth: ctx => components.getUserComponentHeaderDepth(ctx, 'hero'),
  undoUserComponentHeader: ctx => components.undoUserComponentHeader(ctx, 'hero'),
  redoUserComponentHeader: ctx => components.redoUserComponentHeader(ctx, 'hero'),
  deleteUserComponentHeader: ctx => components.deleteUserComponentHeader(ctx, 'hero'),

  // pages
  listUserPages: ctx => pagesService.listUserPages(ctx),
  getUserPageEntry: ctx => pagesService.getUserPageEntry(ctx, 'home'),
  saveUserPageContent: ctx => pagesService.saveUserPageContent(ctx, pageEntry),
  saveUserPageStructure: ctx => pagesService.saveUserPageStructure(ctx, pageEntry),
  revertUserPageEntry: ctx => pagesService.revertUserPageEntry(ctx, pageEntry),
  generateUserReadablePageTree: ctx => pagesService.generateUserReadablePageTree(ctx, pageEntry),
  deleteUserPage: ctx => pagesService.deleteUserPage(ctx, 'home'),

  // configuration
  listUserRolesAndAccounts: ctx => configuration.listUserRolesAndAccounts(ctx),
  listGrantableResources: ctx => configuration.listGrantableResources(ctx),
  createUserRole: ctx => configuration.createUserRole(ctx, roleRecord),
  updateUserRole: ctx => configuration.updateUserRole(ctx, roleRecord),
  deleteUserRole: ctx => configuration.deleteUserRole(ctx, 'Editor'),
  upsertUserAccount: ctx => configuration.upsertUserAccount(ctx, accountRecord),
  assignUserAccountRoles: ctx => configuration.assignUserAccountRoles(ctx, 's-1', []),
  removeUserAccount: ctx => configuration.removeUserAccount(ctx, 's-1'),

  // signing keys
  listUserSigningKeys: ctx => signing.listUserSigningKeys(ctx),
  rotateUserSubordinateKey: ctx => signing.rotateUserSubordinateKey(ctx),
  revokeUserSubordinateKey: ctx => signing.revokeUserSubordinateKey(ctx, 'key-old')
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
    editor,
    pages: pagesService,
    configuration,
    signing
  }

  it.each(Object.keys(services))('covers every export of the %s service', (name) => {
    // Classes are excluded: a service module may export an error type, and an error is not an
    // operation with a permission to check. Everything callable that is not a constructor is.
    const isClass = (value: unknown): boolean =>
      typeof value === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(value))

    const exported = Object.keys(services[name])
      .filter(key => typeof services[name][key] === 'function' && !isClass(services[name][key]))

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

/**
 * **Field-level masking**, the part of the E6 evidence that was reported as absent until it landed.
 *
 * Driven through the same gated service the matrix uses, so these are assertions about the product
 * rather than about the masking helpers, which are unit-tested separately.
 */
describe('field-level masking', () => {
  const fieldGrant = (permission: string, fields?: string[]): Grant => ({
    permission,
    resource: { scope: 'collection', id: COLLECTION },
    ...(fields === undefined ? {} : { fields })
  } as Grant)

  /** Reads title and body, writes only body — "may see the cost but not change it", inverted. */
  const restricted = () => createAuthContext('restricted', [
    fieldGrant('db:collection:read', ['title', 'body']),
    fieldGrant('db:collection:write', ['body'])
  ])

  beforeEach(() => {
    written.length = 0
  })

  it('strips an unreadable field from a document', async () => {
    const snapshot = await database.getUserDocument(restricted(), documentRef)

    expect(snapshot?.data).toEqual({ title: 'Ships', body: 'text' })
    expect(snapshot?.data).not.toHaveProperty('internal_cost')
  })

  it('strips it from every document in a collection', async () => {
    const snapshots = await database.getUserCollection(restricted(), collectionRef)

    expect(snapshots[0].data).not.toHaveProperty('internal_cost')
  })

  it('denies a field the grant does not name, including one added later', async () => {
    // New-field default deny: the grant names what existed when it was written.
    const snapshot = await database.getUserDocument(
      createAuthContext('reader', [fieldGrant('db:collection:read', ['title'])]),
      documentRef
    )

    expect(snapshot?.data).toEqual({ title: 'Ships' })
  })

  it('keeps an unwritable field when the submission omits it', async () => {
    // Write-merge integrity: omitting a field the principal cannot see is not an instruction to
    // clear it. A blind overwrite would erase internal_cost here.
    await database.updateUserDocument(restricted(), documentRef, { body: 'new' } as never)

    expect(written[0]).toEqual({ title: 'Ships', body: 'new', internal_cost: 12 })
  })

  it('ignores an unwritable field the submission does set', async () => {
    await database.updateUserDocument(
      restricted(),
      documentRef,
      { body: 'new', internal_cost: 0 } as never
    )

    expect(written[0].internal_cost).toBe(12)
  })

  it('takes only writable fields when creating', async () => {
    await database.createUserDocument(
      restricted(),
      collectionRef,
      { body: 'new', internal_cost: 0 } as never
    )

    expect(written[0]).toEqual({ body: 'new' })
  })

  it('leaves the writes of an unrestricted principal untouched', async () => {
    const admin = createAuthContext('admin', [{ permission: WILDCARD, resource: WILDCARD }])
    await database.updateUserDocument(admin, documentRef, { body: 'new' } as never)

    // Masking must change nothing for anyone who was not restricted.
    expect(written[0]).toEqual({ body: 'new' })
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
