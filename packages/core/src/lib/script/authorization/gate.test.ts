import { describe, it, expect, vi, afterEach } from 'vitest'
import { isPermitted } from './gate'
import { createAuthContext } from './context'
import { WILDCARD, type Grant } from './grants'
import type { Permission } from './permissions'

/**
 * What the interface offers a principal, given their grants.
 *
 * These assertions are about **presentation**, not access: everything a gate hides is refused again
 * by the service the element would reach. What matters here is that the interface does not offer a
 * control that is certain to be denied, and does not hide one that would work.
 */

const contextWith = (grants: Grant[]) => createAuthContext('subject-1', grants)
const instance = (permission: Permission): Grant => ({ permission, resource: WILDCARD } as Grant)
const onBucket = (permission: Permission, id: string): Grant =>
  ({ permission, resource: { scope: 'bucket', id } } as Grant)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a single permission', () => {
  it('permits what is held and hides what is not', () => {
    const context = contextWith([instance('pages:read')])

    expect(isPermitted(context, 'pages:read')).toBe(true)
    expect(isPermitted(context, 'pages:publish')).toBe(false)
  })

  it('hides everything from a principal with no grants', () => {
    // The same default deny the service layer applies, so an unprivileged interface is empty
    // rather than full of controls that refuse.
    expect(isPermitted(contextWith([]), 'pages:read')).toBe(false)
  })
})

describe('several permissions', () => {
  const both: Permission[] = ['pages:content_edit', 'pages:publish']

  it('demands all of them, not any of them', () => {
    // Publishing calls requirePermission twice. Offering the control on the weaker of the two
    // would show a button that is certain to be refused.
    expect(isPermitted(contextWith([instance('pages:content_edit')]), both)).toBe(false)
    expect(isPermitted(contextWith([instance('pages:publish')]), both)).toBe(false)

    expect(isPermitted(
      contextWith([instance('pages:content_edit'), instance('pages:publish')]),
      both
    )).toBe(true)
  })
})

describe('anyOf', () => {
  const configuration: Permission[] = ['config:roles:manage', 'config:keys:manage']

  it('permits a principal holding either, so a section index is not hidden from half its users', () => {
    expect(isPermitted(contextWith([instance('config:roles:manage')]), { anyOf: configuration })).toBe(true)
    expect(isPermitted(contextWith([instance('config:keys:manage')]), { anyOf: configuration })).toBe(true)
  })

  it('still hides it from a principal holding neither', () => {
    expect(isPermitted(contextWith([instance('pages:read')]), { anyOf: configuration })).toBe(false)
  })

  it('does not change what a bare list means', () => {
    // The two forms sit side by side in the same components. If a list ever started meaning `any`,
    // every existing gate would silently widen.
    expect(isPermitted(contextWith([instance('config:roles:manage')]), configuration)).toBe(false)
  })

  it('permits nothing when it names nothing', () => {
    const admin = contextWith([{ permission: WILDCARD, resource: WILDCARD }])

    expect(isPermitted(admin, { anyOf: [] })).toBe(false)
  })
})

describe('a resource-scoped permission', () => {
  it('is decided against the named resource', () => {
    const context = contextWith([onBucket('storage:bucket:write', 'media')])

    expect(isPermitted(context, 'storage:bucket:write', 'media')).toBe(true)
    expect(isPermitted(context, 'storage:bucket:write', 'invoices')).toBe(false)
  })

  it('hides rather than throwing when the resource is missing', () => {
    // Checking a bucket permission without a bucket is a programming error, and `hasPermission`
    // raises it. A gate must not take the surrounding view down over a hidden button.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const context = contextWith([onBucket('storage:bucket:write', 'media')])

    expect(isPermitted(context, 'storage:bucket:write')).toBe(false)
    expect(warn).toHaveBeenCalled()
  })
})

describe('the wildcard grant', () => {
  it('permits everything, so an administrator sees the whole interface', () => {
    const admin = contextWith([{ permission: WILDCARD, resource: WILDCARD }])

    expect(isPermitted(admin, 'config:roles:manage')).toBe(true)
    expect(isPermitted(admin, ['pages:content_edit', 'pages:publish'])).toBe(true)
    expect(isPermitted(admin, 'storage:bucket:delete', 'any-bucket')).toBe(true)
  })
})
