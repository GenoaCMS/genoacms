import { describe, it, expect, afterEach } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import { page } from 'vitest/browser'
import type { LinkAttributeValue } from '#lib/script/components/componentHeader/component/types.js'
import Link from './Link.svelte'

const PAGES = ['home', 'about']

let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
  if (mounted !== undefined) unmount(mounted)
  mounted = undefined
  document.body.innerHTML = ''
})

function openLink (value: LinkAttributeValue): { sent: () => LinkAttributeValue[] } {
  const sent: LinkAttributeValue[] = []
  mounted = mount(Link, {
    target: document.body,
    props: {
      value,
      pages: PAGES,
      onvalue: (next: LinkAttributeValue) => { sent.push(JSON.parse(JSON.stringify(next))) }
    }
  })
  flushSync()
  return { sent: () => sent }
}

const kindToggle = () => page.getByRole('checkbox', { name: 'External' })
const urlInput = () => page.getByPlaceholder('https://example.com')
const pageSelect = () => page.getByRole('combobox')

describe('the link editor', () => {
  it('PGE-12: switching a page link to external sends only the URL member, empty until typed', async () => {
    const { sent } = openLink({ isExternal: false, pageName: 'about' })
    await kindToggle().click()
    expect(sent().at(-1)).toStrictEqual({ isExternal: true, url: '' })

    await urlInput().fill('https://example.com/x')
    expect(sent().at(-1)).toStrictEqual({ isExternal: true, url: 'https://example.com/x' })
  })

  it('PGE-12: switching back restores the member kept while the editor is open, and sends it alone', async () => {
    const { sent } = openLink({ isExternal: false, pageName: 'about' })
    await kindToggle().click()
    await urlInput().fill('https://example.com/x')
    await kindToggle().click()
    expect(sent().at(-1)).toStrictEqual({ isExternal: false, pageName: 'about' })
    await expect.element(pageSelect()).toHaveValue('about')

    await kindToggle().click()
    expect(sent().at(-1)).toStrictEqual({ isExternal: true, url: 'https://example.com/x' })
    await expect.element(urlInput()).toHaveValue('https://example.com/x')
  })

  it('PGE-12: choosing a page sends the page link', async () => {
    const { sent } = openLink({ isExternal: false, pageName: '' })
    await pageSelect().selectOptions('home')
    expect(sent().at(-1)).toStrictEqual({ isExternal: false, pageName: 'home' })
  })

  it('PGE-12: an external link opens with its URL, and switching it to a page sends an empty page name', async () => {
    const { sent } = openLink({ isExternal: true, url: 'https://example.com' })
    await expect.element(urlInput()).toHaveValue('https://example.com')
    await kindToggle().click()
    expect(sent().at(-1)).toStrictEqual({ isExternal: false, pageName: '' })
  })
})
