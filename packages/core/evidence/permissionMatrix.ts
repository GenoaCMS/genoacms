import { WILDCARD, type Grant } from '$lib/script/authorization/grants'
import type { Permission } from '$lib/script/authorization/permissions'

/**
 * The E6 permission matrix: the roles under test and what each is expected to be allowed.
 *
 * **Data only, and deliberately separate from the test that runs it.** The expectations are written
 * by hand from the permission taxonomy — never derived from the `requirePermission` calls they check —
 * so the matrix is able to disagree with the implementation. A table generated from the code could
 * only ever confirm the code.
 *
 * It lives outside the test file so the same declaration produces both the assertions and the
 * published table, and the thesis cannot quote a matrix that differs from the one that was run.
 *
 * **The roles below are invented for this matrix.** GenoaCMS ships exactly one role, `SuperAdmin`
 * (`roles.ts`); everything else is defined by an operator at runtime. These stand in for the kinds of
 * role the taxonomy describes — a copywriter, a designer, a storage manager — so the matrix exercises
 * realistic combinations. Nothing here is loaded by the CMS, which is why it sits in `evidence/`
 * rather than beside the authorization modules.
 */

/** The resources the resource-scoped grants name. Operations are exercised against these. */
const BUCKET = 'media'
const COLLECTION = 'articles'

/**
 * Every gated service function, by name.
 *
 * The test asserts this list against the services' actual exports, so a function added without being
 * placed here fails rather than quietly escaping the matrix.
 */
const matrixOperations = [
  // storage
  'getUserBucketReferences',
  'listUserDirectory',
  'processUserDirectoryContents',
  'uploadUserObject',
  'createUserDirectory',
  'moveUserObject',
  'moveUserDirectory',
  'deleteUserObject',
  'deleteUserDirectory',
  // database
  'getUserCollectionReferences',
  'getUserCollectionReference',
  'getUserCollection',
  'getUserDocument',
  'createUserDocument',
  'updateUserDocument',
  'deleteUserDocument',
  // dynamic components
  'listUserComponents',
  'getUserComponent',
  'getUserComponentDefinition',
  'createUserComponent',
  'updateUserComponentDefinition',
  'commitUserComponentDefinition',
  'deleteUserComponent',
  // prebuilt components
  'registerUserComponentHeader',
  'listUserComponentEntries',
  'getUserComponentHeader',
  'updateUserComponentHeader',
  'getUserComponentHeaderDepth',
  'undoUserComponentHeader',
  'redoUserComponentHeader',
  'deleteUserComponentHeader',
  // pages
  'listUserPages',
  'getUserPageEntry',
  'saveUserPageContent',
  'saveUserPageStructure',
  'revertUserPageEntry',
  'generateUserReadablePageTree',
  'deleteUserPage',
  // configuration
  'listUserRolesAndAccounts',
  'listGrantableResources',
  'createUserRole',
  'updateUserRole',
  'deleteUserRole',
  'upsertUserAccount',
  'assignUserAccountRoles',
  'removeUserAccount',
  // signing keys
  'listUserSigningKeys',
  'rotateUserSubordinateKey',
  'revokeUserSubordinateKey'
] as const

const bucketGrant = (permission: Permission): Grant =>
  ({ permission, resource: { scope: 'bucket', id: BUCKET } } as Grant)
const collectionGrant = (permission: Permission): Grant =>
  ({ permission, resource: { scope: 'collection', id: COLLECTION } } as Grant)
const instanceGrant = (permission: Permission): Grant =>
  ({ permission, resource: WILDCARD } as Grant)

interface RoleUnderTest {
  grants: Grant[]
  allowed: string[]
}

const rolesUnderTest: Record<string, RoleUnderTest> = {
  Nobody: {
    grants: [],
    allowed: []
  },
  StorageReader: {
    grants: [bucketGrant('storage:bucket:read')],
    allowed: ['getUserBucketReferences', 'listUserDirectory', 'processUserDirectoryContents']
  },
  /**
   * Write without read. Present because the catalog is filtered on *any* bucket-scoped grant
   * rather than on `read`: this role must still see the bucket it may upload to, and no
   * other role in this table would catch the filter narrowing back to `read`.
   */
  StorageUploader: {
    grants: [bucketGrant('storage:bucket:write')],
    allowed: [
      'getUserBucketReferences', 'uploadUserObject', 'createUserDirectory',
      'moveUserObject', 'moveUserDirectory'
    ]
  },
  StorageContributor: {
    grants: [bucketGrant('storage:bucket:read'), bucketGrant('storage:bucket:write')],
    allowed: [
      'getUserBucketReferences', 'listUserDirectory', 'processUserDirectoryContents',
      'uploadUserObject', 'createUserDirectory', 'moveUserObject', 'moveUserDirectory'
    ]
  },
  StorageManager: {
    grants: [
      bucketGrant('storage:bucket:read'),
      bucketGrant('storage:bucket:write'),
      bucketGrant('storage:bucket:delete')
    ],
    allowed: [
      'getUserBucketReferences', 'listUserDirectory', 'processUserDirectoryContents',
      'uploadUserObject', 'createUserDirectory', 'moveUserObject', 'moveUserDirectory',
      'deleteUserObject', 'deleteUserDirectory'
    ]
  },
  DataReader: {
    grants: [collectionGrant('db:collection:read')],
    allowed: [
      'getUserCollectionReferences', 'getUserCollectionReference',
      'getUserCollection', 'getUserDocument'
    ]
  },
  /** The collection counterpart of `StorageUploader`, guarding the same catalog property. */
  DataWriter: {
    grants: [collectionGrant('db:collection:write')],
    allowed: [
      'getUserCollectionReferences', 'createUserDocument', 'updateUserDocument'
    ]
  },
  DataEditor: {
    grants: [collectionGrant('db:collection:read'), collectionGrant('db:collection:write')],
    allowed: [
      'getUserCollectionReferences', 'getUserCollectionReference',
      'getUserCollection', 'getUserDocument',
      'createUserDocument', 'updateUserDocument'
    ]
  },
  DataManager: {
    grants: [
      collectionGrant('db:collection:read'),
      collectionGrant('db:collection:write'),
      collectionGrant('db:collection:delete')
    ],
    allowed: [
      'getUserCollectionReferences', 'getUserCollectionReference',
      'getUserCollection', 'getUserDocument',
      'createUserDocument', 'updateUserDocument', 'deleteUserDocument'
    ]
  },
  Copywriter: {
    grants: [instanceGrant('pages:read'), instanceGrant('pages:content_edit')],
    allowed: ['listUserPages', 'getUserPageEntry', 'saveUserPageContent']
  },
  Designer: {
    grants: [
      instanceGrant('pages:read'),
      instanceGrant('pages:content_edit'),
      instanceGrant('pages:structure_edit')
    ],
    allowed: [
      'listUserPages', 'getUserPageEntry',
      'saveUserPageContent', 'saveUserPageStructure', 'revertUserPageEntry'
    ]
  },
  /** Removes pages without being able to write one, which is what pages:delete exists to express. */
  PageRemover: {
    grants: [instanceGrant('pages:delete')],
    allowed: ['deleteUserPage']
  },
  Publisher: {
    grants: [
      instanceGrant('pages:read'),
      instanceGrant('pages:content_edit'),
      instanceGrant('pages:publish')
    ],
    allowed: [
      'listUserPages', 'getUserPageEntry', 'saveUserPageContent', 'generateUserReadablePageTree'
    ]
  },
  /**
   * Everything a component's source can be: reading it, writing it, and publishing it.
   *
   * **One role where there were three.** `view_code`, `edit` and `commit` used to separate reading
   * source from writing it and from publishing an executable, and the matrix carried a role per
   * step — a reviewer who could read and not write, an author who could write and not publish, a
   * publisher who could publish what others wrote without altering it first. `components:code`
   * covers all three, so those arrangements are no longer expressible and the roles that
   * demonstrated them are gone rather than left asserting a separation the permissions do not make.
   *
   * This is the highest-value role in the system: publishing runs static analysis, compiles a
   * bundle, signs it with the key hierarchy, and produces an executable that consumers will run.
   */
  ComponentDeveloper: {
    grants: [instanceGrant('components:read'), instanceGrant('components:code')],
    allowed: [
      'listUserComponentEntries', 'getUserComponentHeader', 'getUserComponentHeaderDepth',
      'listUserComponents', 'getUserComponent', 'getUserComponentDefinition',
      'updateUserComponentDefinition', 'commitUserComponentDefinition'
    ]
  },
  ComponentCurator: {
    grants: [
      instanceGrant('components:read'),
      instanceGrant('components:modify')
    ],
    // The catalog permission covers coded components too: their names are catalog information,
    // and what distinguishes them — their source — is `components:code`.
    allowed: [
      'listUserComponentEntries', 'getUserComponentHeader', 'getUserComponentHeaderDepth',
      'updateUserComponentHeader', 'undoUserComponentHeader', 'redoUserComponentHeader',
      'listUserComponents', 'getUserComponent'
    ]
  },
  ComponentRegistrar: {
    grants: [
      instanceGrant('components:read'),
      instanceGrant('components:register')
    ],
    // Registering covers a component's **existence**, of either kind: the same permission creates a
    // prebuilt component's description and brings a coded component into being with its source.
    allowed: [
      'listUserComponentEntries', 'getUserComponentHeader', 'getUserComponentHeaderDepth',
      'registerUserComponentHeader', 'deleteUserComponentHeader',
      'listUserComponents', 'getUserComponent',
      'createUserComponent', 'deleteUserComponent'
    ]
  },
  RoleAdministrator: {
    grants: [instanceGrant('config:roles:manage')],
    allowed: [
      'listUserRolesAndAccounts', 'listGrantableResources',
      'createUserRole', 'updateUserRole', 'deleteUserRole'
    ]
  },
  AccountAdministrator: {
    grants: [instanceGrant('config:users:manage')],
    allowed: ['upsertUserAccount', 'removeUserAccount']
  },
  IdentityAdministrator: {
    grants: [instanceGrant('config:users:manage'), instanceGrant('config:roles:manage')],
    allowed: [
      'listUserRolesAndAccounts', 'listGrantableResources',
      'createUserRole', 'updateUserRole', 'deleteUserRole',
      'upsertUserAccount', 'removeUserAccount', 'assignUserAccountRoles'
    ]
  },
  /**
   * Administers the signing keys and nothing else.
   *
   * Present to make the absence of a `config:keys:read` visible: reading the registry sits in the
   * same allow-list as rotating it, because the registry is published for consumers to fetch and a
   * read permission would withhold nothing.
   */
  KeyAdministrator: {
    grants: [instanceGrant('config:keys:manage')],
    allowed: ['listUserSigningKeys', 'rotateUserSubordinateKey', 'revokeUserSubordinateKey']
  },
  SuperAdmin: {
    grants: [{ permission: WILDCARD, resource: WILDCARD }],
    allowed: [...matrixOperations]
  }
}

export {
  BUCKET,
  COLLECTION,
  matrixOperations,
  rolesUnderTest
}

export type {
  RoleUnderTest
}
