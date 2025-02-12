import type { Component, ComponentDefinition, ComponentDefinitionReference } from './types'
import type { ComponentEntry, ComponentEntryReference } from '../componentEntry/component/types'
import type { DirectoryContents } from '@genoacms/cloudabstraction/storage'

import { join } from 'path'
import { deletePrebuiltComponentEntry, uploadPrebuiltComponentEntry } from '../componentEntry/component.server'
import {
  listOrCreateDirectory,
  defaultBucketId,
  uploadInternalObjectFlatted,
  getInternalObjectFlatted,
  fullyQualifiedNameToFilename,
  deleteInternalObject
} from '$lib/script/storage/storage.server'
import { validator } from '@exodus/schemasafe'
import { componentDefinitionSchema, componentSchema } from './schemas'

const componentDefinitionPath = join('.genoacms', 'components/', 'definitions/')
const componentPath = join('.genoacms', 'components/', 'edited/')

async function uploadComponentDefinition (definition: ComponentDefinition) {
  await uploadInternalObjectFlatted(join(componentDefinitionPath, definition.uid), definition)
}
async function uploadComponent (component: Component) {
  await uploadInternalObjectFlatted(join(componentPath, component.entryId), component)
}
async function createComponentDefinition (uid: string) {
  const emptyComponentDefinition: ComponentDefinition = {
    uid,
    language: 'javascript',
    uncommitedCode: '',
    code: '',
    history: [],
    future: []
  }
  await uploadComponentDefinition(emptyComponentDefinition)
}
async function createComponentEntry (uid: string) {
  const emptyComponentEntry: ComponentEntry = {
    uid,
    name: '',
    attributes: {},
    history: [],
    future: []
  }
  await uploadPrebuiltComponentEntry(emptyComponentEntry)
}
async function createComponent (name: string) {
  const componentEntryUid = crypto.randomUUID()
  const componentDefinitionUid = crypto.randomUUID()
  const component = {
    entryId: componentEntryUid,
    definitionId: componentDefinitionUid,
    name
  }
  await createComponentEntry(componentEntryUid)
  await createComponentDefinition(componentDefinitionUid)
  await uploadComponent(component)
}

async function getComponent (reference: ComponentEntryReference): Promise<Component> {
  const potentialComponent = await getInternalObjectFlatted(join(componentPath, reference))
  const validateComponent = validator(componentSchema)
  if (!validateComponent(potentialComponent)) throw Error(`Invalid component: ${reference}`)
  return potentialComponent
}

async function getComponentDefiniton (reference: ComponentDefinitionReference) {
  const potentialComponentDefinition = await getInternalObjectFlatted(join(componentDefinitionPath, reference))
  const validateComponentDefinition = validator(componentDefinitionSchema)
  if (!validateComponentDefinition(potentialComponentDefinition)) throw Error(`Invalid component definition: ${reference}`)
  return potentialComponentDefinition
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

async function deleteComponent (component: Component): Promise<void> {
  const deletionTasks = [
    deleteComponentDefinition(component.definitionId),
    deletePrebuiltComponentEntry(component.entryId),
    deleteInternalObject(join(componentPath, component.entryId))
  ]
  await Promise.all(deletionTasks)
}

export {
  createComponent,
  listOrCreateComponentList,
  getComponent,
  getComponentDefiniton,
  deleteComponent
}
