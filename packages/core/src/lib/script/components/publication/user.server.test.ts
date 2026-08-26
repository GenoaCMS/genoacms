import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Grant } from '$lib/script/authorization/grants'
import type { Permission } from '$lib/script/authorization/permissions'
import type { AuthContext } from '$lib/script/authorization/context'

/**
 * Enforcement on publishing.
 *
 * Publishing is the highest-value act in the system: it signs with the key hierarchy and produces
 * documents consumers fetch and execute. It is also the one act whose permissions **depend on what
 * is being published** — a component with executable code demands the permission that reaches
 * executable code, and one without it does not.
 *
 * The case worth the most here is the negative one: a principal holding `components:modify` alone —
 * the curator who edits descriptions and may not read a line of source — must be able to publish a
 * prebuilt component and must **not** be able to release a dynamic one. Every positive assertion in
 * this file would pass if that check were deleted.
 *
 * The primary layer is stubbed and records what reached it, so "denied" means the operation never
 * ran rather than that an error surfaced somewhere.
 */

const calls: string[] = []
let storedType = 'prebuilt'

vi.mock('./index', () => ({
  publishComponent: async (order: { componentId: string }, publisherId: string) => {
    calls.push(`publish:${order.componentId}:${publisherId}`)
    return { uid: order.componentId, publicationId: 'pub-1', publisherId }
  },
  getPublishedComponent: async (uid: string) => {
    calls.push(`published:${uid}`)
    return null
  },
  listComposableComponentHeaders: async () => {
    calls.push('composable')
    return []
  }
}))

vi.mock('../componentHeader/io.server', () => ({
  getComponentHeader: async (uid: string) => ({ uid, type: storedType, name: 'hero' })
}))

const { createAuthContext } = await import('$lib/script/authorization/context')
const { PermissionDeniedError } = await import('$lib/script/authorization/enforce')
const publication = await import('./user.server')

const grant = (permission: Permission): Grant => ({ permission, resource: '*' } as Grant)
const contextWith = (permissions: Permission[]): AuthContext =>
  createAuthContext('subject-1', permissions.map(grant))

const nobody = () => contextWith([])
const reader = () => contextWith(['components:read'])
/** Edits descriptions, and cannot read source. The principal the dynamic check exists for. */
const curator = () => contextWith(['components:read', 'components:modify'])
/** Reaches source, and may change descriptions. What publishing a dynamic component takes. */
const developer = () => contextWith(['components:modify', 'components:code'])
/** Reaches source and nothing else. */
const coder = () => contextWith(['components:code'])

const order = { componentId: 'uid-1', note: 'a note' }

beforeEach(() => {
  calls.length = 0
  storedType = 'prebuilt'
})

const expectDenied = async (operation: () => unknown): Promise<void> => {
  await expect(Promise.resolve().then(operation)).rejects.toBeInstanceOf(PermissionDeniedError)
  expect(calls.filter(call => call.startsWith('publish:'))).toEqual([])
}

describe('publishing a prebuilt component', () => {
  it('needs components:modify', async () => {
    await publication.publishUserComponent(curator(), order)
    expect(calls).toContain('publish:uid-1:subject-1')
  })

  it('is denied to a principal with no grants', async () => {
    await expectDenied(() => publication.publishUserComponent(nobody(), order))
  })

  it('is denied to a principal who may only read the catalog', async () => {
    await expectDenied(() => publication.publishUserComponent(reader(), order))
  })

  it('is denied to a principal who reaches source but may not change descriptions', async () => {
    // `components:code` is not a superset of `components:modify`. A prebuilt component has no code,
    // so the permission that reaches code says nothing about whether this may be released.
    await expectDenied(() => publication.publishUserComponent(coder(), order))
  })
})

describe('publishing a dynamic component', () => {
  beforeEach(() => {
    storedType = 'dynamic'
  })

  it('needs components:code as well as components:modify', async () => {
    await publication.publishUserComponent(developer(), order)
    expect(calls).toContain('publish:uid-1:subject-1')
  })

  it('is denied to a curator who may not read the source', async () => {
    // The guard this module exists for. Publishing a dynamic component compiles its source and signs
    // an executable consumers will run; releasing code one is not permitted to read is the
    // "publisher who releases what others wrote" arrangement the permission collapse gave up.
    await expectDenied(() => publication.publishUserComponent(curator(), order))
  })

  it('is denied to a principal who reaches source but may not change descriptions', async () => {
    // Publishing signs the header too, whatever kind the component is, so `modify` is demanded of
    // every publication and holding the code permission alone is not enough.
    await expectDenied(() => publication.publishUserComponent(coder(), order))
  })

  it('dispatches on the stored type, not on anything the caller sends', async () => {
    // A client that could declare its own component prebuilt would publish an executable with
    // `components:modify` alone. The type is read from storage, and the order has no place for one.
    await expectDenied(() =>
      publication.publishUserComponent(curator(), { ...order, type: 'prebuilt' } as never)
    )
  })
})

describe('attribution', () => {
  it('names the authenticated principal, not the order', async () => {
    // The order is what the browser sent. If it could name the publisher, a principal could
    // attribute its own release to somebody else, and both signed documents would carry that claim.
    const forged = { ...order, publisherId: 'someone-else' } as never

    await publication.publishUserComponent(curator(), forged)

    expect(calls).toContain('publish:uid-1:subject-1')
  })
})

describe('reading publication status', () => {
  it('rides on the catalog permission, not on modify', async () => {
    // Which components are actually usable on a page is catalog-order information. A principal who
    // may see that a component exists needs to know whether anything has been released of it.
    await publication.getUserPublishedComponent(reader(), 'uid-1')
    expect(calls).toEqual(['published:uid-1'])
  })

  it('is denied to a principal with no grants', async () => {
    await expect(Promise.resolve().then(() => publication.getUserPublishedComponent(nobody(), 'uid-1')))
      .rejects.toBeInstanceOf(PermissionDeniedError)
    expect(calls).toEqual([])
  })
})

describe('listing what a page may be composed from', () => {
  it('rides on the catalog permission', async () => {
    // Which components can be put on a page is the same order of fact as which components exist, and
    // a principal composing a page is not thereby permitted to change anything.
    await publication.listUserComposableComponents(reader())
    expect(calls).toEqual(['composable'])
  })

  it('is denied to a principal with no grants', async () => {
    await expect(Promise.resolve().then(() => publication.listUserComposableComponents(nobody())))
      .rejects.toBeInstanceOf(PermissionDeniedError)
    expect(calls).toEqual([])
  })
})
