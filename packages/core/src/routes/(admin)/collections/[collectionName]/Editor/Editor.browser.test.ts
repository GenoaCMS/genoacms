import { describe, it, expect, afterEach } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import type { CollectionReference } from '@genoacms/contracts/database'
import { page, userEvent } from 'vitest/browser'
import Editor from './Editor.svelte'

type Data = Record<string, unknown>

const snapshot = (value: Data): Data => JSON.parse(JSON.stringify(value))

let mounted: ReturnType<typeof mount> | undefined

afterEach(() => {
  if (mounted !== undefined) unmount(mounted)
  mounted = undefined
  document.body.innerHTML = ''
})

const collectionOf = (properties: Record<string, unknown>): CollectionReference =>
  ({ name: 'articles', primaryKey: { key: 'id', schema: { type: 'string' } }, schema: { type: 'object', properties } })

function openEditor (properties: Record<string, unknown>, value: Data = {}): { latest: () => Data } {
  let latest: Data = snapshot(value)
  mounted = mount(Editor, {
    target: document.body,
    props: {
      collectionReference: collectionOf(properties),
      value,
      onvalue: (next: Data) => {
        latest = snapshot(next)
        return next
      }
    }
  })
  flushSync()
  return { latest: () => latest }
}

describe('defaults on mount', () => {
  it('EDT-5: fields without a value get their default, and other kinds get nothing', () => {
    const editor = openEditor({
      string: { type: 'string' },
      text: { type: 'string', format: 'text' },
      number: { type: 'number' },
      boolean: { type: 'boolean' },
      choiceWithDefault: { type: 'string', enum: ['a', 'b'], default: 'b' },
      choice: { type: 'string', enum: ['a', 'b'] },
      constant: { const: 'fixed' },
      uuid: { type: 'string', format: 'uuid' },
      list: { type: 'array', items: { type: 'string' } },
      markdown: { type: 'string', format: 'markdown' },
      integer: { type: 'integer' }
    })

    expect(editor.latest()).toStrictEqual({
      string: '',
      text: '',
      number: 0,
      boolean: false,
      choiceWithDefault: 'b',
      constant: 'fixed',
      markdown: ''
    })
  })

  it('EDT-5: an object, and an object item of a list, holds the defaults of its own fields', () => {
    const editor = openEditor({
      object: { type: 'object', properties: { title: { type: 'string' }, count: { type: 'number' } } },
      onlyLists: { type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } } } },
      items: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' } } } }
    }, { items: [{}] })

    expect(editor.latest()).toStrictEqual({
      object: { title: '', count: 0 },
      items: [{ label: '' }]
    })
  })

  it('EDT-5: a field that has a value keeps it', () => {
    const stored = { string: 'kept', number: 7, boolean: true }
    const editor = openEditor({ string: { type: 'string' }, number: { type: 'number' }, boolean: { type: 'boolean' } }, { ...stored })

    expect(editor.latest()).toStrictEqual(stored)
  })
})

describe('numbers', () => {
  it('EDT-7: a number field stores the number typed, decimals included', async () => {
    const editor = openEditor({ price: { type: 'number' } })
    await userEvent.fill(page.getByLabelText('price', { exact: true }), '13.9')
    expect(editor.latest()).toStrictEqual({ price: 13.9 })
  })

  it('EDT-7: an emptied number field stores 0', async () => {
    const editor = openEditor({ price: { type: 'number' } }, { price: 5 })
    await userEvent.clear(page.getByLabelText('price', { exact: true }))
    expect(editor.latest()).toStrictEqual({ price: 0 })
  })
})

describe('choices', () => {
  async function choose (field: string, option: string): Promise<void> {
    await userEvent.click(page.getByRole('group', { name: new RegExp(`^${field}\\b`) }).getByPlaceholder('Select an option...'))
    await userEvent.click(page.getByRole('option', { name: option, exact: true }))
  }

  it('EDT-8: a choice offers each option as text', async () => {
    openEditor({ size: { type: 'number', enum: [1, 2, 3] } })
    await userEvent.click(page.getByPlaceholder('Select an option...'))
    const options = page.getByRole('option').elements().map(option => option.textContent?.trim())
    expect(options).toEqual(['1', '2', '3'])
  })

  it('EDT-8: a choice stores the option of its original type', async () => {
    const editor = openEditor({ size: { type: 'number', enum: [1, 2, 3] }, flag: { type: 'boolean', enum: [true, false] } })
    await choose('size', '2')
    await choose('flag', 'false')
    expect(editor.latest()).toStrictEqual({ size: 2, flag: false })
  })
})

describe('the editor\'s document', () => {
  it('EDT-9: fields the schema does not declare keep their stored values', async () => {
    const editor = openEditor({ title: { type: 'string' } }, { title: 'Old', legacy: { kept: true } })
    await userEvent.fill(page.getByLabelText('title', { exact: true }), 'New')
    expect(editor.latest()).toStrictEqual({ title: 'New', legacy: { kept: true } })
  })

  it('EDT-9: every change is reported as the whole document', async () => {
    const reported: Data[] = []
    mounted = mount(Editor, {
      target: document.body,
      props: {
        collectionReference: collectionOf({ title: { type: 'string' }, body: { type: 'string' } }),
        value: { title: 'a', body: 'b' },
        onvalue: (next: Data) => {
          reported.push(snapshot(next))
          return next
        }
      }
    })
    flushSync()
    await userEvent.fill(page.getByLabelText('body', { exact: true }), 'c')
    expect(reported.at(-1)).toStrictEqual({ title: 'a', body: 'c' })
  })
})

describe('the control of each field', () => {
  const group = (name: string) => page.getByRole('group', { name: new RegExp(`^${name}\\b`) })

  it('EDT-4: each kind of schema gets its control, in the order of precedence', async () => {
    const editor = openEditor({
      author: { type: 'string', title: 'reference', description: 'authors' },
      id: { type: 'string', format: 'uuid' },
      summary: { type: 'string', format: 'text' },
      body: { type: 'string', format: 'markdown' },
      size: { type: 'string', enum: ['s', 'm'] },
      title: { type: 'string' },
      count: { type: 'number' },
      done: { type: 'boolean' },
      contributors: { type: 'array', items: { type: 'string', title: 'reference', description: 'authors' } },
      images: { type: 'array', items: { type: 'object', title: 'storageResource', properties: { bucket: { type: 'string' }, name: { type: 'string' } } } },
      cover: { title: 'storageResource', oneOf: [{ type: 'object' }, { type: 'null' }] },
      tags: { type: 'array', items: { type: 'string' } },
      meta: { type: 'object', properties: { inner: { type: 'string' } } },
      kind: { const: 'article' },
      age: { type: 'integer' }
    }, { age: 41 })

    await expect.element(group('author').getByRole('link', { name: 'Choose from authors' })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Generate UUID' })).toBeVisible()
    expect(page.getByLabelText('summary', { exact: true }).element().tagName).toBe('TEXTAREA')
    expect(group('body').element().querySelector('.cm-editor')).not.toBeNull()
    await expect.element(group('size').getByPlaceholder('Select an option...')).toBeVisible()
    expect(page.getByLabelText('title', { exact: true }).element().getAttribute('type')).toBe(null)
    expect(page.getByLabelText('count', { exact: true }).element().getAttribute('type')).toBe('number')
    expect(page.getByLabelText('done', { exact: true }).element().getAttribute('type')).toBe('checkbox')
    await expect.element(group('contributors').getByRole('link', { name: 'Choose from authors' })).toBeVisible()
    await expect.element(group('images').getByRole('link', { name: 'Choose files from storage' })).toBeVisible()
    await expect.element(group('cover').getByRole('link', { name: 'Choose a file from storage' })).toBeVisible()
    await expect.element(group('tags').getByRole('button', { name: 'Add item' })).toBeVisible()
    await expect.element(group('meta').getByLabelText('inner', { exact: true })).toBeVisible()
    expect(page.getByText('kind', { exact: true }).elements()).toHaveLength(0)
    expect(page.getByText('age', { exact: true }).elements()).toHaveLength(0)
    expect(editor.latest()).toMatchObject({ kind: 'article', age: 41 })
  })
})

describe('objects and variants', () => {
  const block = {
    type: 'object',
    discriminator: { propertyName: 'type' },
    oneOf: [
      { properties: { type: { const: 'hero' }, headline: { type: 'string' } } },
      { properties: { type: { const: 'rich' }, body: { type: 'string' } } },
      { properties: { caption: { type: 'string' } } }
    ]
  }

  it('EDT-12: variants are listed by the constant of their discriminator, or by their index', async () => {
    openEditor({ block })

    expect(page.getByRole('radio').elements().map(radio => radio.getAttribute('value'))).toEqual(['hero', 'rich', '2'])
  })

  it('EDT-12: the variant shown is the one whose constant equals the discriminator of the value', async () => {
    openEditor({ block }, { block: { type: 'rich', body: 'text' } })

    await expect.element(page.getByLabelText('body', { exact: true })).toHaveValue('text')
    expect(page.getByLabelText('headline', { exact: true }).elements()).toHaveLength(0)
  })

  it('EDT-12: a value whose discriminator matches no variant shows the first', async () => {
    openEditor({ block }, { block: { type: 'unknown' } })

    await expect.element(page.getByLabelText('headline', { exact: true })).toBeVisible()
  })

  it('EDT-12: choosing a variant removes the fields it does not declare and sets the discriminator', async () => {
    const editor = openEditor({ block }, { block: { type: 'rich', body: 'text', stray: true } })
    await userEvent.click(page.getByText('hero', { exact: true }))

    expect(editor.latest()).toStrictEqual({ block: { type: 'hero', headline: '' } })
  })
})
