import { describe, it, expect, vi } from 'vitest'

/**
 * What the editor answers for a reference it cannot open.
 *
 * Both cases are a **404 to the route above**, and that is the whole point of the error being named:
 * a bare `Error` reaching a `load` is a 500, which is the CMS reporting its own fault for something
 * the caller got wrong. A `[500] GET /components/editor/{uid}` sat in the log of an entirely green
 * suite until it was read by hand, because no test asserts a status code for a page that renders
 * nothing of its own.
 *
 * Deleting a dynamic component from the registrar is what made it ordinary rather than exotic: the
 * editor URL outlives the component.
 */

let stored: { uid: string, type: string, name: string } | null = null

vi.mock('$lib/script/storage/storage.server', () => ({
  defaultBucketId: 'default',
  uploadInternalObjectFlatted: async () => {},
  getInternalObjectFlatted: async () => ({}),
  deleteDirectory: async () => {}
}))

vi.mock('../componentHeader/io.server', () => ({
  getComponentHeader: async () => stored,
  listOrCreateComponentHeaderList: async () => []
}))

const { getComponent } = await import('./io')
const { NoSuchComponentError } = await import('./errors')

describe('opening a component the editor cannot show', () => {
  it('refuses a reference that names nothing', async () => {
    stored = null

    await expect(getComponent('gone')).rejects.toBeInstanceOf(NoSuchComponentError)
  })

  it('refuses a prebuilt component, which exists but not to the editor', async () => {
    // It has no source and no definition. Refused by name rather than by a missing definition,
    // which would surface as a confusing storage error.
    stored = { uid: 'card', type: 'prebuilt', name: 'Card' }

    await expect(getComponent('card')).rejects.toBeInstanceOf(NoSuchComponentError)
  })

  it('opens a dynamic one', async () => {
    // The allow case, paired with both refusals: a guard that refuses everything passes a deny test
    // just as happily.
    stored = { uid: 'hero', type: 'dynamic', name: 'Hero' }

    expect(await getComponent('hero')).toEqual({ uid: 'hero', name: 'Hero' })
  })
})
