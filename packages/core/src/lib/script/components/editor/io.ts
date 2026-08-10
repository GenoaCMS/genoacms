import type { Component, ComponentCommit, ComponentDefinition, ComponentDefinitionReference } from './types'
import type { ComponentEntryReference } from '../componentEntry/component/types'
import type { DirectoryContents } from '@genoacms/cloudabstraction/storage'

import { join } from 'path'
import {
  defaultBucketId,
  uploadInternalObjectFlatted,
  getInternalObjectFlatted,
  deleteInternalObject,
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

async function getComponentCommit (componentId: string, commitId: string) {
  const potentialComponentCommit = await getInternalObjectFlatted(join(componentDefinitionPath, componentId, commitId))
  const validateComponentCommit = validator(componentCommitSchema)
  if (!validateComponentCommit(potentialComponentCommit)) throw Error(`Invalid component commit: ${commitId}`)
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

const deleteComponentDefinition = (reference: ComponentDefinitionReference) => deleteInternalObject(join(componentDefinitionPath, reference))
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
