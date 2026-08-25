import type { Component, ComponentCommit, ComponentDefinition, ComponentDefinitionReference } from './types'
import type { ComponentHeader, ComponentHeaderReference } from '../componentHeader/component/types'

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
import { componentCommitSchema, componentDefinitionSchema } from './schemas'

/**
 * Where a dynamic component lives.
 *
 * `dynamic/{uid}` holds the source and every commit under it. Published artifacts sit beside them
 * under `dynamic/executables`, which `executable/io.server.ts` owns — named here only to say that
 * the two are siblings rather than nested, and that a component identifier is a UUID so it can never
 * collide with that one reserved name.
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
async function uploadComponentDefinition (definition: ComponentDefinition) {
  await uploadInternalObjectFlatted(join(componentDefinitionPath, definition.uid, 'data.json'), definition)
}
async function uploadComponentCommit (commit: ComponentCommit) {
  await uploadInternalObjectFlatted(join(componentDefinitionPath, commit.componentId, commit.uid), commit)
}

/** A dynamic component, as the editor lists it. Derived from its header, which is where it lives. */
const asComponent = (entry: ComponentHeader): Component => ({ uid: entry.uid, name: entry.name })

async function getComponent (reference: ComponentHeaderReference): Promise<Component> {
  const entry = await getComponentHeader(reference)
  if (entry === null) {
    throw new NoSuchComponentError(reference, `components/no-such-component: ${reference} does not exist.`)
  }
  // A prebuilt component has no source and no commits, so the editor cannot open one. Refused by
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

async function getComponentDefiniton (reference: ComponentDefinitionReference) {
  const potentialComponentDefinition = await getInternalObjectFlatted(join(componentDefinitionPath, reference, 'data.json'))
  const validateComponentDefinition = validator(componentDefinitionSchema)
  if (!validateComponentDefinition(potentialComponentDefinition)) throw Error(`Invalid component definition: ${reference}`)
  return potentialComponentDefinition
}

/**
 * Reads a stored commit, refusing one that does not validate.
 *
 * A commit written before commits recorded their author fails here. That is deliberate rather than
 * an oversight: the author cannot be recovered afterwards, and an executable rebuilt from such a
 * commit would either carry a placeholder — a signed claim of attribution that is not true — or no
 * attribution at all. Recommitting the component writes a commit that does record one.
 */
async function getComponentCommit (componentId: string, commitId: string) {
  const potentialComponentCommit = await getInternalObjectFlatted(join(componentDefinitionPath, componentId, commitId))
  const validateComponentCommit = validator(componentCommitSchema)
  if (!validateComponentCommit(potentialComponentCommit)) {
    throw Error(
      `Invalid component commit: ${commitId}. A commit stored without an authorId predates commits ` +
      'recording one; recommit the component to produce a commit that does.'
    )
  }
  return potentialComponentCommit
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
 * Removes a definition and every commit under it.
 *
 * A **directory**, not an object. The source lives at `{uid}/data.json` and each commit beside it,
 * so `{uid}` is a prefix and deleting it as though it were a single object fails with a 404 for a
 * component that exists. That went unnoticed because the deletion never reached here: the server
 * refused on the confirmation name first, every time.
 */
const deleteComponentDefinition = (reference: ComponentDefinitionReference) =>
  deleteDirectory({ bucket: defaultBucketId, name: join(componentDefinitionPath, reference) })

export {
  uploadComponentDefinition,
  uploadComponentCommit,
  getComponent,
  getComponentDefiniton,
  getComponentCommit,
  listOrCreateComponentList,
  deleteComponentDefinition
}
