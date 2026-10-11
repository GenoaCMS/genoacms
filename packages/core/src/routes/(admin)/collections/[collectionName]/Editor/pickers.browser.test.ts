import { describe, it, expect, afterEach } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import type { CollectionReference } from '@genoacms/contracts/database'
import { storageResource, nullableStorageResource, reference } from '@genoacms/contracts/schemas'
import { page } from '@vitest/browser/context'
import Editor from './Editor.svelte'

type Data = Record<string, unknown>
interface Message { eventName: string, data?: unknown }

const snapshot = (value: Data): Data => JSON.parse(JSON.stringify(value))

let mounted: ReturnType<typeof mount> | undefined
const channels: BroadcastChannel[] = []

afterEach(() => {
  for (const channel of channels.splice(0)) channel.close()
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

/** Plays the picker tab of PCK-2 on the channel named by the field's picker link. */
async function pick (linkName: string, chosen: unknown[]): Promise<Message[]> {
  const href = page.getByRole('link', { name: linkName }).element().getAttribute('href') ?? ''
  const selectionId = new URL(href, location.origin).searchParams.get('selectionId') ?? ''
  const picker = new BroadcastChannel(selectionId)
  channels.push(picker)
  const received: Message[] = []
  const next = (eventName: string): Promise<Message> => new Promise(resolve => {
    picker.addEventListener('message', function listen (event: MessageEvent<Message>) {
      received.push(event.data)
      if (event.data.eventName !== eventName) return
      picker.removeEventListener('message', listen)
      resolve(event.data)
    })
  })

  const initData = next('selectionInitData')
  picker.postMessage({ eventName: 'selectionInit' })
  await initData
  const kill = next('selectionKill')
  picker.postMessage({ eventName: 'selectionDone', data: chosen })
  await kill
  flushSync()
  return received
}

const file = (name: string) => ({ bucket: 'media', name })

describe('applying a selection', () => {
  it('PCK-3: a reference takes the first document picked', async () => {
    const editor = openEditor({ author: reference({ collection: 'authors' }) })
    await pick('Choose from authors', ['ada', 'bob'])
    expect(editor.latest()).toStrictEqual({ author: 'ada' })
  })

  it('PCK-3: references take every document picked', async () => {
    const editor = openEditor({ authors: { type: 'array', items: reference({ collection: 'authors' }) } }, { authors: ['old'] })
    await pick('Edit selection', ['ada', 'bob'])
    expect(editor.latest()).toStrictEqual({ authors: ['ada', 'bob'] })
  })

  it('PCK-3: a file takes the first object picked', async () => {
    const editor = openEditor({ cover: nullableStorageResource })
    await pick('Choose a file from storage', [file('a.png'), file('b.png')])
    expect(editor.latest()).toStrictEqual({ cover: file('a.png') })
  })

  it('PCK-3: files take every object picked', async () => {
    const editor = openEditor({ images: { type: 'array', items: storageResource } })
    await pick('Choose files from storage', [file('a.png'), file('b.png')])
    expect(editor.latest()).toStrictEqual({ images: [file('a.png'), file('b.png')] })
  })

  it('PCK-3: an empty selection changes nothing', async () => {
    const editor = openEditor({ authors: { type: 'array', items: reference({ collection: 'authors' }) } }, { authors: ['kept'] })
    await pick('Edit selection', [])
    expect(editor.latest()).toStrictEqual({ authors: ['kept'] })
  })
})
