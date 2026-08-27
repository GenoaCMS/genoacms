import { describe, it, expect, vi } from 'vitest'
import { parse, stringify } from 'flatted'
import type { ComponentNode, PageEntry, IsSerializable } from './types'

/**
 * Stepping a page's tree backwards and forwards.
 *
 * **Written to reproduce three defects the end-to-end suite could only describe.** Undo left the tree
 * unchanged, redo restored nothing, and a drag rotated the list instead of swapping two nodes. All
 * three were masked for a long time by a stuck overlay, and all three are about the same thing: what
 * a page's history records and what replaying it does.
 *
 * The generic operations are `undoRedo`'s and are tested there against plain objects. What is tested
 * here is the **page's use of them** — which is where the difference between a recorded step and a
 * replayable one shows up.
 */

vi.mock('$lib/script/components/componentHeader/io.server', () => ({
  getComponentHeader: async () => null
}))

const {
  addChildNodeToNodeInPage,
  undoPageEntryState,
  redoPageEntryState,
  updateComponentNode
} = await import('./index')

const child = (uid: string): ComponentNode<IsSerializable> => ({
  uid,
  entryReference: 'component-child',
  name: 'Card',
  data: {}
})

/** A page whose root has one slot, holding whichever children are named. */
const pageWith = (...children: string[]): PageEntry<IsSerializable> => ({
  name: 'home',
  previewURL: '',
  contents: {
    rootNodeUid: 'root',
    nodes: {
      root: {
        uid: 'root',
        entryReference: 'component-root',
        name: 'Page',
        data: {
          slot: { uid: 'slot', name: 'body', type: 'components', value: [...children] }
        }
      },
      ...Object.fromEntries(children.map(uid => [uid, child(uid)]))
    }
  },
  history: [],
  future: [],
  lastModified: ''
} as unknown as PageEntry<IsSerializable>)

const slotOf = (page: PageEntry<IsSerializable>): string[] =>
  page.contents.nodes.root.data.slot.value as unknown as string[]

describe('undoing a change to the tree', () => {
  it('takes a nested component back out', () => {
    // The defect the end-to-end suite reported as "undo leaves the tree unchanged".
    let page = pageWith('a')
    page = addChildNodeToNodeInPage(page, page.contents.nodes.root, 'slot', child('b'))
    expect(slotOf(page)).toEqual(['a', 'b'])

    page = undoPageEntryState(page)

    expect(slotOf(page)).toEqual(['a'])
  })

  it('removes the node itself, not only its place in the slot', () => {
    // A slot holds references. Reverting the list and leaving the node behind would produce a page
    // that renders correctly and grows an orphan on every undo.
    let page = pageWith('a')
    page = addChildNodeToNodeInPage(page, page.contents.nodes.root, 'slot', child('b'))

    page = undoPageEntryState(page)

    expect('b' in page.contents.nodes).toBe(false)
  })

  it('moves the step onto the future so it can be replayed', () => {
    let page = pageWith('a')
    page = addChildNodeToNodeInPage(page, page.contents.nodes.root, 'slot', child('b'))

    page = undoPageEntryState(page)

    expect(page.history).toHaveLength(0)
    expect(page.future).toHaveLength(1)
  })

  it('does nothing to a page with no history', () => {
    const page = undoPageEntryState(pageWith('a'))

    expect(slotOf(page)).toEqual(['a'])
    expect(page.future).toHaveLength(0)
  })
})

describe('redoing what was undone', () => {
  it('puts the tree back exactly as it was', () => {
    // The property `redoes it` should have asserted and did not: an undo makes the tree differ from
    // where it started, and a redo makes it match again.
    let page = pageWith('a')
    page = addChildNodeToNodeInPage(page, page.contents.nodes.root, 'slot', child('b'))
    const built = [...slotOf(page)]

    page = undoPageEntryState(page)
    page = redoPageEntryState(page)

    expect(slotOf(page)).toEqual(built)
    expect('b' in page.contents.nodes).toBe(true)
  })

  it('restores the history so the step can be undone again', () => {
    let page = pageWith('a')
    page = addChildNodeToNodeInPage(page, page.contents.nodes.root, 'slot', child('b'))

    page = redoPageEntryState(undoPageEntryState(page))

    expect(page.history).toHaveLength(1)
    expect(page.future).toHaveLength(0)
  })

  it('does nothing when nothing has been undone', () => {
    let page = pageWith('a')
    page = addChildNodeToNodeInPage(page, page.contents.nodes.root, 'slot', child('b'))
    const built = [...slotOf(page)]

    page = redoPageEntryState(page)

    expect(slotOf(page)).toEqual(built)
  })

  it('is discarded once the page is edited from the undone state', () => {
    // The abandoned branch is unreachable, and its differences were computed against a state that no
    // longer exists — replaying them would corrupt the page rather than restore it.
    let page = pageWith('a')
    page = addChildNodeToNodeInPage(page, page.contents.nodes.root, 'slot', child('b'))
    page = undoPageEntryState(page)

    page = addChildNodeToNodeInPage(page, page.contents.nodes.root, 'slot', child('c'))

    expect(page.future).toHaveLength(0)
  })
})

describe('across the two requests undo and redo actually are', () => {
  /*
   * **The step that the in-memory tests skip.** Undo and redo are separate form actions: each reads
   * the page from storage, changes it, and writes it back. So a history only works if the recorded
   * steps survive being serialized and read again — and the end-to-end suite showed redo restoring
   * nothing while every in-memory assertion passed.
   */
  const stored = (page: PageEntry<IsSerializable>): PageEntry<IsSerializable> =>
    parse(stringify(page)) as PageEntry<IsSerializable>

  it('undoes a step recorded in an earlier request', () => {
    let page = pageWith('a')
    page = addChildNodeToNodeInPage(page, page.contents.nodes.root, 'slot', child('b'))

    page = undoPageEntryState(stored(page))

    expect(slotOf(page)).toEqual(['a'])
  })

  it('redoes a step undone in an earlier request', () => {
    let page = pageWith('a')
    page = addChildNodeToNodeInPage(page, page.contents.nodes.root, 'slot', child('b'))
    page = undoPageEntryState(stored(page))

    page = redoPageEntryState(stored(page))

    expect(slotOf(page)).toEqual(['a', 'b'])
    expect('b' in page.contents.nodes).toBe(true)
  })

  it('keeps the future across a write and a read', () => {
    // If the undone step does not survive storage, redo has nothing to replay and reports success
    // for doing nothing — which is exactly what it looked like from the editor.
    let page = pageWith('a')
    page = addChildNodeToNodeInPage(page, page.contents.nodes.root, 'slot', child('b'))
    page = undoPageEntryState(page)

    expect(stored(page).future).toHaveLength(1)
  })
})

describe('reordering the nodes in a slot', () => {
  /*
   * A drag rewrites the slot's list of references and nothing else. It reaches the server as an
   * ordinary node update, which is why it is recorded and replayed like one — and why "the drag does
   * not reorder" is a question about this path rather than about the drag itself.
   */
  const reorder = (
    page: PageEntry<IsSerializable>,
    order: string[]
  ): PageEntry<IsSerializable> => {
    const root = JSON.parse(JSON.stringify(page.contents.nodes.root))
    root.data.slot.value = order
    return updateComponentNode(page, root)
  }

  it('swaps two nodes', () => {
    let page = pageWith('a', 'b', 'c')

    page = reorder(page, ['b', 'a', 'c'])

    expect(slotOf(page)).toEqual(['b', 'a', 'c'])
  })

  it('records the reorder as a step that can be undone', () => {
    let page = pageWith('a', 'b', 'c')

    page = reorder(page, ['b', 'a', 'c'])
    page = undoPageEntryState(page)

    expect(slotOf(page)).toEqual(['a', 'b', 'c'])
  })

  it('replays the reorder on redo', () => {
    let page = pageWith('a', 'b', 'c')
    page = reorder(page, ['b', 'a', 'c'])

    page = redoPageEntryState(undoPageEntryState(page))

    expect(slotOf(page)).toEqual(['b', 'a', 'c'])
  })
})
