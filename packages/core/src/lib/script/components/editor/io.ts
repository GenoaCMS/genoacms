import type { Component, ComponentCommit, ComponentDefinition, ComponentDefinitionReference } from './types'
import type { ComponentEntryReference } from '../componentEntry/component/types'
import type { DirectoryContents } from '@genoacms/cloudabstraction/storage'

import { join } from 'path'
import {
  defaultBucketId,
  uploadInternalObjectFlatted,
  getInternalObjectFlatted,
  deleteInternalObject,
  deleteDirectory,
  listOrCreateDirectory,
  fullyQualifiedNameToFilename
} from '$lib/script/storage/storage.server'
import { validator } from '@exodus/schemasafe'
import { componentCommitSchema, componentDefinitionSchema, componentSchema } from './schemas'

const componentDefinitionPath = join('.genoacms', 'components/', 'definitions/')
const componentPath = join('.genoacms', 'components/', 'edited/')

async function uploadComponent (component: Component) {
  await uploadInternalObjectFlatted(join(componentPath, component.uid), component)
}
async function uploadComponentDefinition (definition: ComponentDefinition) {
  await uploadInternalObjectFlatted(join(componentDefinitionPath, definition.uid, 'data.json'), definition)
}
async function uploadComponentCommit (commit: ComponentCommit) {
  await uploadInternalObjectFlatted(join(componentDefinitionPath, commit.componentId, commit.uid), commit)
}

async function getComponent (reference: ComponentEntryReference): Promise<Component> {
  const potentialComponent = await getInternalObjectFlatted(join(componentPath, reference))
  const validateComponent = validator(componentSchema)
  if (!validateComponent(potentialComponent)) throw Error(`Invalid component: ${reference}`)
  return potentialComponent
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
async function componentDirectoryToComponents (directoryContents: DirectoryContents): Promise<Array<Component>> {
  const componentIDs = directoryContents.files.map(f => fullyQualifiedNameToFilename(f.name))
  const componentPromises = componentIDs.map(id => getComponent(id))
  return await Promise.all(componentPromises)
}

async function listOrCreateComponentList (): Promise<Array<Component>> {
  const componentDirectoryList = await listOrCreateDirectory({
    bucket: defaultBucketId,
    name: componentPath
  })
  return await componentDirectoryToComponents(componentDirectoryList)
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
const deleteComponentFile = (id: string) => deleteInternalObject(join(componentPath, id))

export {
  uploadComponent,
  uploadComponentDefinition,
  uploadComponentCommit,
  getComponent,
  getComponentDefiniton,
  getComponentCommit,
  listOrCreateComponentList,
  deleteComponentDefinition,
  deleteComponentFile
}
