import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ComponentDefinition } from './types'
import type { UndoRedoAdjunct } from '$lib/script/undoRedo/types'

/**
 * Saving a body, and stepping back through the saves.
 *
 * **This is what replaced commits**, so the properties worth asserting are the ones an author would
 * previously have got from one: a save marks a point, and undo returns to the point before it.
 *
 * The `UndoRedoAdjunct` itself is real — only storage is stood in for. The adjunct applies and
 * reverts diffs *in place*, which is a sharp edge worth exercising rather than mocking: a stored
 * definition handed to `recordChange` as both the before and the after would diff against itself and
 * record nothing, and every undo would silently do nothing.
 */

const stored = new Map<string, unknown>()

vi.mock('./io', () => ({
  getComponentDefiniton: async (uid: string) => {
    const definition = stored.get(`definition:${uid}`)
    if (definition === undefined) throw Error(`no definition ${uid}`)
    // A copy, as a real read would be. Returning the same object twice would let the two reads in
    // `saveComponentBody` alias, which is exactly the defect this file exists to catch.
    return structuredClone(definition)
  },
  uploadComponentDefinition: async (definition: ComponentDefinition) => {
    stored.set(`definition:${definition.uid}`, structuredClone(definition))
  },
  getComponentDefinitionHistory: async (uid: string) =>
    structuredClone(stored.get(`history:${uid}`) ?? { history: [], future: [] }),
  uploadComponentDefinitionHistory: async (uid: string, adjunct: UndoRedoAdjunct<ComponentDefinition>) => {
    stored.set(`history:${uid}`, structuredClone(adjunct))
  }
}))

const {
  saveComponentBody,
  undoComponentBody,
  redoComponentBody,
  getComponentDefinitionDepth
} = await import('./editing.server')

const UID = 'component-1'

const definitionOf = (): ComponentDefinition => stored.get(`definition:${UID}`) as ComponentDefinition
const bodyOf = (): string => definitionOf().body

beforeEach(() => {
  stored.clear()
  stored.set(`definition:${UID}`, {
    uid: UID,
    language: 'typescript',
    body: 'first',
    publishedBody: '',
    publishedSignature: ''
  })
})

describe('saving', () => {
  it('writes the body', async () => {
    await saveComponentBody(UID, 'second')

    expect(bodyOf()).toBe('second')
  })

  it('records a step that can be undone', async () => {
    const depth = await saveComponentBody(UID, 'second')

    expect(depth).toEqual({ historyLength: 1, futureLength: 0 })
  })

  it('records nothing when the body has not changed', async () => {
    // Pressing save twice is harmless, and undoing once afterwards has to actually undo something.
    // An empty step would occupy a place in the history and appear to do nothing when replayed.
    await saveComponentBody(UID, 'second')
    const depth = await saveComponentBody(UID, 'second')

    expect(depth).toEqual({ historyLength: 1, futureLength: 0 })
  })

  it('reports the depth without a reload being needed', async () => {
    await saveComponentBody(UID, 'second')
    await saveComponentBody(UID, 'third')

    expect(await getComponentDefinitionDepth(UID)).toEqual({ historyLength: 2, futureLength: 0 })
  })
})

describe('undoing', () => {
  it('returns the body to the state before the last save', async () => {
    await saveComponentBody(UID, 'second')

    await undoComponentBody(UID)

    expect(bodyOf()).toBe('first')
  })

  it('walks back through several saves in order', async () => {
    await saveComponentBody(UID, 'second')
    await saveComponentBody(UID, 'third')

    await undoComponentBody(UID)
    expect(bodyOf()).toBe('second')

    await undoComponentBody(UID)
    expect(bodyOf()).toBe('first')
  })

  it('does nothing at the beginning of the history', async () => {
    await undoComponentBody(UID)

    expect(bodyOf()).toBe('first')
    expect(await getComponentDefinitionDepth(UID)).toEqual({ historyLength: 0, futureLength: 0 })
  })

  it('moves the step onto the future, so it can be redone', async () => {
    await saveComponentBody(UID, 'second')
    await undoComponentBody(UID)

    expect(await getComponentDefinitionDepth(UID)).toEqual({ historyLength: 0, futureLength: 1 })
  })
})

describe('redoing', () => {
  it('reapplies what was undone', async () => {
    await saveComponentBody(UID, 'second')
    await undoComponentBody(UID)

    await redoComponentBody(UID)

    expect(bodyOf()).toBe('second')
  })

  it('does nothing at the end of the history', async () => {
    await saveComponentBody(UID, 'second')

    await redoComponentBody(UID)

    expect(bodyOf()).toBe('second')
  })

  it('is discarded by editing from an undone state', async () => {
    // The abandoned branch is unreachable once the author writes over it, and its diffs were
    // computed against a state that no longer exists — replaying them would corrupt the body rather
    // than restore it.
    await saveComponentBody(UID, 'second')
    await undoComponentBody(UID)

    const depth = await saveComponentBody(UID, 'elsewhere')

    expect(depth.futureLength).toBe(0)
    expect(bodyOf()).toBe('elsewhere')
  })
})

describe('what the history does not touch', () => {
  it('leaves a publication where it is', async () => {
    // Publishing records no step, so undo has nothing that would revert it. Were a step ever to
    // cover these members, an author could walk a component back to claiming a publication it no
    // longer has — and a page pinning it would resolve to an artifact that was never written.
    await saveComponentBody(UID, 'second')

    stored.set(`definition:${UID}`, {
      ...definitionOf(),
      publishedBody: 'second',
      publishedSignature: 'a signature',
      lastPublicationId: 'publication-1'
    })

    await undoComponentBody(UID)

    expect(bodyOf()).toBe('first')
    expect(definitionOf().publishedBody).toBe('second')
    expect(definitionOf().lastPublicationId).toBe('publication-1')
  })
})
