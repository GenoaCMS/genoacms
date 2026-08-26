import type { Component, ComponentDefinition, ComponentReference } from './types'
import type { ComponentHeader, ComponentHeaderReference } from '../componentHeader/component/types'
import type { UndoRedoAdjunct } from '$lib/script/undoRedo/types'
import { noHistory } from '$lib/script/undoRedo'

import { join } from 'path'
import {
  defaultBucketId,
  uploadInternalObjectFlatted,
  getInternalObjectFlatted,
  deleteDirectory
} from '$lib/script/storage/storage.server'
import { getComponentHeader, listOrCreateComponentHeaderList } from '../componentHeader/io.server'
import { NoSuchComponentError } from './errors'
import { validator } from '@exodus/schemasafe'
import { componentDefinitionSchema } from './schemas'

/**
 * Where a dynamic component's source lives.
 *
 * `dynamic/{uid}/data.json`, with its editing history beside it at `history.json`. What a component
 * *publishes* lives in
 * `components/public/`, which `publication/io.server.ts` owns — a publication is a fact about a
 * component rather than about its code, and a prebuilt component makes one without ever having a
 * directory here.
 *
 * ## There is no separate component file
 *
 * A dynamic component used to be written twice: once as a `Component` of `{ uid, name }` under
 * `edited/`, and once as a `ComponentHeader` carrying the same uid and the same name. The first
 * carried nothing the second did not, so it is gone and the list is derived from the headers. That
 * removes a second thing to keep in step — a rename reaching one and not the other left the editor
 * and the catalog disagreeing about what a component is called.
 */
const componentDefinitionPath = join('.genoacms', 'components/', 'dynamic/')

const definitionPath = (reference: ComponentReference): string =>
  join(componentDefinitionPath, reference, 'data.json')

/**
 * The editing history, stored **beside** the definition rather than inside it.
 *
 * An adjunct, exactly as a component header's history is. Keeping it out of the definition is what
 * lets the definition stay a single stored fact: the body a publication compiles must not carry
 * every intermediate state of an author's afternoon, and reading the source should not mean reading
 * a history that can be far larger than it.
 */
const historyPath = (reference: ComponentReference): string =>
  join(componentDefinitionPath, reference, 'history.json')

async function uploadComponentDefinition (definition: ComponentDefinition) {
  await uploadInternalObjectFlatted(definitionPath(definition.uid), definition)
}

const uploadComponentDefinitionHistory = async (
  reference: ComponentReference,
  adjunct: UndoRedoAdjunct<ComponentDefinition>
): Promise<void> => await uploadInternalObjectFlatted(historyPath(reference), adjunct)

/**
 * A component's editing history. Absent is empty, not an error: nothing has been edited yet.
 *
 * An unreadable history is also empty, with a warning rather than a failure. The source is intact
 * either way, and the worst outcome is that the author cannot undo past this point — which is not
 * worth refusing an edit over.
 */
const getComponentDefinitionHistory = async (
  reference: ComponentReference
): Promise<UndoRedoAdjunct<ComponentDefinition>> => {
  let stored
  try {
    stored = await getInternalObjectFlatted(historyPath(reference)) as
      Partial<UndoRedoAdjunct<ComponentDefinition>> | undefined | null
  } catch {
    return noHistory<ComponentDefinition>()
  }
  if (stored === undefined || stored === null) return noHistory<ComponentDefinition>()
  if (!Array.isArray(stored.history) || !Array.isArray(stored.future)) {
    console.warn(`[genoacms:components] ${reference} has an unreadable editing history; starting a new one`)
    return noHistory<ComponentDefinition>()
  }
  return { history: stored.history, future: stored.future }
}

/** A dynamic component, as the editor lists it. Derived from its header, which is where it lives. */
const asComponent = (entry: ComponentHeader): Component => ({ uid: entry.uid, name: entry.name })

async function getComponent (reference: ComponentHeaderReference): Promise<Component> {
  const entry = await getComponentHeader(reference)
  if (entry === null) {
    throw new NoSuchComponentError(reference, `components/no-such-component: ${reference} does not exist.`)
  }
  // A prebuilt component has no source, so the editor cannot open one. Refused by
  // name rather than by a missing definition, which would surface as a confusing storage error.
  if (entry.type !== 'dynamic') {
    throw new NoSuchComponentError(
      reference,
      `components/no-such-component: ${reference} is a prebuilt component. Its code lives in the ` +
      'consuming application, so there is nothing for the editor to open.'
    )
  }
  return asComponent(entry)
}

async function getComponentDefiniton (reference: ComponentReference) {
  const potentialComponentDefinition = await getInternalObjectFlatted(definitionPath(reference))
  const validateComponentDefinition = validator(componentDefinitionSchema)
  if (!validateComponentDefinition(potentialComponentDefinition)) throw Error(`Invalid component definition: ${reference}`)
  return potentialComponentDefinition
}

/**
 * Every dynamic component.
 *
 * Filtered out of the header catalog rather than read from a directory of its own. The catalog is
 * where a component's identity already lives, and the type is what distinguishes one the editor can
 * open from one whose code is in the consuming application.
 */
async function listOrCreateComponentList (): Promise<Array<Component>> {
  const entries = await listOrCreateComponentHeaderList()
  return entries.filter(entry => entry.type === 'dynamic').map(asComponent)
}

/**
 * Removes a definition.
 *
 * A **directory**, not an object. The source lives at `{uid}/data.json`, so `{uid}` is a prefix and
 * deleting it as though it were a single object fails with a 404 for a component that exists. That
 * went unnoticed because the deletion never reached here: the server refused on the confirmation
 * name first, every time.
 */
const deleteComponentDefinition = (reference: ComponentReference) =>
  deleteDirectory({ bucket: defaultBucketId, name: join(componentDefinitionPath, reference) })

export {
  uploadComponentDefinition,
  uploadComponentDefinitionHistory,
  getComponent,
  getComponentDefiniton,
  getComponentDefinitionHistory,
  listOrCreateComponentList,
  deleteComponentDefinition
}
