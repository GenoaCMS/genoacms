import { describe, it, expect } from 'vitest'
import { attribute, header, node } from '#lib/script/testing/components.js'
import { importModule, type Parsed } from '#lib/script/testing/requests.js'

const edits = async () => await importModule('#lib/script/components/page/edits.js')
const names = async () => await importModule('#lib/script/components/page/names.js')

const card = header('card', 'Card', [attribute.string('heading', 'heading', { minLength: 2 })])
const banner = header('banner', 'Banner', [])
const section = header('section', 'Section', [
  attribute.string('title', 'title'),
  attribute.components('children', 'children', ['Card', 'Section'], { maxItems: 3 })
])
const headers = new Map([[card.uid, card], [banner.uid, banner], [section.uid, section]])

/** root (Section) ─ children: [s1 (Section) ─ children: [s2 (Section) ─ children: [c2]], c1 (Card)] */
function contents (): Parsed {
  const nodes = [
    node('root', section, { children: ['s1', 'c1'] }),
    node('s1', section, { children: ['s2'] }),
    node('s2', section, { children: ['c2'] }),
    node('c1', card, { heading: 'first' }),
    node('c2', card, { heading: 'second' })
  ]
  return { nodes: Object.fromEntries(nodes.map(item => [item.uid, item])), rootNodeUid: 'root' }
}

const slotOf = (result: Parsed, uid: string): string[] => result.contents.nodes[uid].data.children.value

function expectRefusal (result: Parsed, code: string, message: string): void {
  expect(result).toMatchObject({ ok: false, code })
  expect(result.message.startsWith(message), result.message).toBe(true)
}

describe('adding a node', () => {
  it('TOL-10: a node is added at the position, of a published component the slot accepts', async () => {
    const { addNode } = await edits()
    const before = contents()

    const first = addNode(before, 'root', 'children', card, true, headers, 0)
    expect(first.ok).toBe(true)
    expect(slotOf(first, 'root')).toEqual([first.node, 's1', 'c1'])
    expect(first.contents.nodes[first.node]).toMatchObject({
      uid: first.node,
      entryReference: 'card',
      data: { heading: { uid: 'heading', name: 'heading', type: 'string', value: '' } }
    })
    expect(before).toEqual(contents())

    const last = addNode(contents(), 's2', 'children', card, true, headers)
    expect(slotOf(last, 's2')).toEqual(['c2', last.node])

    expectRefusal(addNode(contents(), 'missing', 'children', card, true, headers), 'pages/no-such-node', 'pages/no-such-node: missing')
    expectRefusal(addNode(contents(), 'root', 'title', card, true, headers), 'pages/not-a-slot', 'pages/not-a-slot: title')
    expectRefusal(addNode(contents(), 'root', 'children', card, false, headers), 'pages/unpublished-component', 'pages/unpublished-component: card')
    expectRefusal(addNode(contents(), 'root', 'children', banner, true, headers), 'pages/not-accepted', 'pages/not-accepted: Banner')

    const full = addNode(contents(), 'root', 'children', card, true, headers)
    expectRefusal(addNode(full.contents, 'root', 'children', card, true, headers), 'pages/slot-full', 'pages/slot-full: children')
  })
})

describe('moving a node', () => {
  it('TOL-12: a node moves between slots; the root, itself or a descendant is refused', async () => {
    const { moveNode } = await edits()

    const moved = moveNode(contents(), 'c2', 'root', 'children', headers, 0)
    expect(moved.ok).toBe(true)
    expect(slotOf(moved, 'root')).toEqual(['c2', 's1', 'c1'])
    expect(slotOf(moved, 's2')).toEqual([])

    const toEnd = moveNode(contents(), 'c1', 's2', 'children', headers)
    expect(slotOf(toEnd, 's2')).toEqual(['c2', 'c1'])
    expect(slotOf(toEnd, 'root')).toEqual(['s1'])

    expectRefusal(moveNode(contents(), 'root', 's1', 'children', headers), 'pages/invalid-move', 'pages/invalid-move: root')
    expectRefusal(moveNode(contents(), 's1', 's1', 'children', headers), 'pages/invalid-move', 'pages/invalid-move: s1')
    expectRefusal(moveNode(contents(), 's1', 's2', 'children', headers), 'pages/invalid-move', 'pages/invalid-move: s1')
    expectRefusal(moveNode(contents(), 'c1', 'missing', 'children', headers), 'pages/no-such-node', 'pages/no-such-node: missing')
    expectRefusal(moveNode(contents(), 'c1', 's1', 'title', headers), 'pages/not-a-slot', 'pages/not-a-slot: title')
  })
})

describe('removing a node', () => {
  it('TOL-13, PGE-4: removing a node removes every node below it, and the root cannot be removed', async () => {
    const { removeNode, applyNodeEdit } = await edits()

    const removed = removeNode(contents(), 's1')
    expect(removed.ok).toBe(true)
    expect(Object.keys(removed.contents.nodes).sort()).toEqual(['c1', 'root'])
    expect(slotOf(removed, 'root')).toEqual(['c1'])

    expectRefusal(removeNode(contents(), 'root'), 'pages/invalid-move', 'pages/invalid-move: root')

    const sent = structuredClone(contents().nodes.root)
    sent.data.children.value = ['c1']
    const edited = applyNodeEdit(contents(), sent, headers)
    expect(edited.ok).toBe(true)
    expect(Object.keys(edited.contents.nodes).sort()).toEqual(['c1', 'root'])
  })
})

describe('setting values', () => {
  const every = header('every', 'Every', [
    attribute.boolean('b', 'b'),
    attribute.number('n', 'n', { maximum: 10 }),
    attribute.string('s', 's', { minLength: 2 }),
    attribute.string('t', 't', {}, 'text'),
    attribute.string('m', 'm', {}, 'markdown'),
    attribute.string('r', 'r', {}, 'richText'),
    attribute.link('l', 'l', { maxItems: 1 }),
    attribute.storageResource('sr', 'sr'),
    attribute.components('slot', 'slot')
  ])
  const everyHeaders = new Map([[every.uid, every]])
  const page = (): Parsed => ({ nodes: { root: node('root', every) }, rootNodeUid: 'root' })

  const valid = {
    b: true,
    n: 10,
    s: 'ab',
    t: 'plain',
    m: '# heading',
    r: 'rich',
    l: [{ isExternal: true, url: 'https://example.com' }],
    sr: [{ bucket: 'genoacms', name: 'a.png' }]
  }

  const invalid: Array<[string, unknown]> = [
    ['b', 'yes'],
    ['n', 'ten'],
    ['n', 11],
    ['s', 5],
    ['s', 'a'],
    ['t', 5],
    ['m', false],
    ['r', 1],
    ['l', [{ isExternal: true, url: 'https://a.example' }, { isExternal: false, pageName: 'home' }]],
    ['l', [{ isExternal: 'no' }]],
    ['sr', [{ bucket: 'genoacms' }]],
    ['sr', 'a.png']
  ]

  it('TOL-11: each value is checked against its attribute; a slot is not a value', async () => {
    const { setValues } = await edits()

    const set = setValues(page(), 'root', valid, everyHeaders)
    expect(set.ok).toBe(true)
    for (const [key, value] of Object.entries(valid)) expect(set.contents.nodes.root.data[key].value).toEqual(value)

    for (const [key, value] of invalid) {
      const before = page()
      expectRefusal(setValues(before, 'root', { [key]: value }, everyHeaders), 'pages/invalid-value', `pages/invalid-value: ${key}: `)
      expect(before).toEqual(page())
    }

    expectRefusal(setValues(page(), 'root', { slot: [] }, everyHeaders), 'pages/slot-not-a-value', 'pages/slot-not-a-value: slot')
  })
})

describe('editing a node', () => {
  it('PGE-4: a node edit takes only values, and tells content from structure', async () => {
    const { applyNodeEdit } = await edits()

    const injected = structuredClone(contents().nodes.c1)
    injected.name = 'Injected'
    injected.entryReference = 'banner'
    injected.data.heading.schema = { type: 'string', title: 'injected', description: '', required: false }
    injected.data.heading.name = 'injected'
    injected.data.heading.value = 'changed'
    const content = applyNodeEdit(contents(), injected, headers)
    expect(content).toMatchObject({ ok: true, content: true, structure: false })
    const stored = content.contents.nodes.c1
    expect(stored.entryReference).toBe('card')
    expect(stored.name).not.toBe('Injected')
    expect(stored.data.heading.value).toBe('changed')
    expect(stored.data.heading.name).toBe('heading')
    expect(stored.data.heading.schema?.title).not.toBe('injected')

    const reordered = structuredClone(contents().nodes.root)
    reordered.data.children.value = ['c1', 's1']
    const structure = applyNodeEdit(contents(), reordered, headers)
    expect(structure).toMatchObject({ ok: true, content: false, structure: true })
    expect(slotOf(structure, 'root')).toEqual(['c1', 's1'])

    const foreign = structuredClone(contents().nodes.root)
    foreign.data.children.value = ['s1', 'c1', 'c2']
    expectRefusal(applyNodeEdit(contents(), foreign, headers), 'pages/invalid-slot', 'pages/invalid-slot: children')
  })
})

describe('page names', () => {
  it('PGE-11: names of one level are accepted, others refused', async () => {
    const { isPageName } = await names()

    for (const name of ['home', 'a b', 'ü', '..a', 'x'.repeat(200)]) expect(isPageName(name), name).toBe(true)
    for (const name of ['', '.', '..', 'a/b', 'a\\b', 'a\u0001', 'a\u007f', 'x'.repeat(201)]) expect(isPageName(name), JSON.stringify(name)).toBe(false)
  })
})
