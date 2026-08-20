import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Grant } from '$lib/script/authorization/grants'
import type { Permission } from '$lib/script/authorization/permissions'
import type { AuthContext } from '$lib/script/authorization/context'

/**
 * Enforcement in the user-facing page layer.
 *
 * The property worth pinning is that **content editing and structure editing stay separate**. The
 * storage primitive underneath every one of these is the same upsert, so nothing about the data
 * distinguishes them — only the wrapper the call site chose. If the wrappers demanded the same
 * permission, or if one accepted the other's, the pair would collapse and a copywriter would be a
 * layout editor.
 *
 * The primary service is stubbed and records what reached it, so "denied" means the write never
 * happened rather than that an error surfaced somewhere.
 */

const calls: string[] = []

vi.mock('./page.server', () => ({
  listOrCreatePageList: async () => { calls.push('list'); return ['home'] },
  getPageEntry: async (name: string) => { calls.push(`get:${name}`); return { name } },
  uploadPageEntry: async (page: { name: string }) => { calls.push(`upload:${page.name}`) },
  generateReadablePageTree: async (page: { name: string }) => { calls.push(`generate:${page.name}`) }
}))

const { createAuthContext } = await import('$lib/script/authorization/context')
const { PermissionDeniedError } = await import('$lib/script/authorization/enforce')
const pages = await import('./user.server')

const grant = (permission: Permission): Grant =>
  ({ permission, resource: '*' } as Grant)

const contextWith = (permissions: Permission[]): AuthContext =>
  createAuthContext('subject-1', permissions.map(grant))

const page = { name: 'home' } as never

beforeEach(() => {
  calls.length = 0
})

const expectDenied = async (operation: () => unknown): Promise<void> => {
  await expect(Promise.resolve().then(operation)).rejects.toBeInstanceOf(PermissionDeniedError)
  expect(calls).toEqual([])
}

describe('reading', () => {
  it('is denied without pages:read', async () => {
    await expectDenied(() => pages.listUserPages(contextWith([])))
    await expectDenied(() => pages.getUserPageEntry(contextWith([]), 'home'))
  })

  it('is not implied by being able to edit', async () => {
    // Reading became a permission precisely so a role could exist that cannot open a draft.
    await expectDenied(() => pages.getUserPageEntry(contextWith(['pages:content_edit']), 'home'))
  })

  it('is allowed with it', async () => {
    await pages.listUserPages(contextWith(['pages:read']))
    await pages.getUserPageEntry(contextWith(['pages:read']), 'home')
    expect(calls).toEqual(['list', 'get:home'])
  })
})

describe('content and structure are separate capabilities', () => {
  it('lets a content editor save content', async () => {
    await pages.saveUserPageContent(contextWith(['pages:content_edit']), page)
    expect(calls).toEqual(['upload:home'])
  })

  it('does not let a content editor change the structure', async () => {
    await expectDenied(() => pages.saveUserPageStructure(contextWith(['pages:content_edit']), page))
  })

  it('does not let a structure editor change content', async () => {
    // The upsert underneath is identical, so only the check keeps these apart.
    await expectDenied(() => pages.saveUserPageContent(contextWith(['pages:structure_edit']), page))
  })

  it('lets a structure editor change the structure', async () => {
    await pages.saveUserPageStructure(contextWith(['pages:structure_edit']), page)
    expect(calls).toEqual(['upload:home'])
  })
})

describe('undo and redo', () => {
  it('need both editing permissions', async () => {
    // History holds changes of either kind and does not record which, so holding one is not enough:
    // a structure editor must not revert a content change they could not have made.
    await expectDenied(() => pages.revertUserPageEntry(contextWith(['pages:content_edit']), page))
    await expectDenied(() => pages.revertUserPageEntry(contextWith(['pages:structure_edit']), page))
  })

  it('are allowed to a principal holding both', async () => {
    await pages.revertUserPageEntry(contextWith(['pages:content_edit', 'pages:structure_edit']), page)
    expect(calls).toEqual(['upload:home'])
  })
})

describe('generating the readable tree', () => {
  it('needs publish as well as the edit that produced it', async () => {
    // Publishing someone else's saved draft is still publishing.
    await expectDenied(() => pages.generateUserReadablePageTree(contextWith(['pages:content_edit']), page))
    await expectDenied(() => pages.generateUserReadablePageTree(contextWith(['pages:publish']), page))
  })

  it('is allowed to a principal holding both', async () => {
    await pages.generateUserReadablePageTree(contextWith(['pages:content_edit', 'pages:publish']), page)
    expect(calls).toEqual(['generate:home'])
  })
})
