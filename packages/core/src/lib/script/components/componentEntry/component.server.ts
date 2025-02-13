import type { ComponentEntry, ComponentEntryReference } from './component/types'
import {
  deleteObject,
  defaultBucketId,
  listOrCreateDirectory,
  uploadObject,
  fullyQualifiedNameToFilename,
  getObjectFlatted
} from '$lib/script/storage/storage.server'
import { join } from 'path'
import { stringify } from 'flatted'
import { validateComponentEntryAttributes } from '$lib/script/components/componentEntry/component/validators'

const prebuiltSchemaPath = join('.genoacms', 'components/', 'prebuilt/')

const listOrCreatePreBuiltComponentList = async (): Promise<Array<ComponentEntry>> => {
  const componentList = await listOrCreateDirectory({
    bucket: defaultBucketId,
    name: prebuiltSchemaPath
  })
  const componentSchemaPromises = componentList.files
    .map(async component => getPrebuiltComponentEntry(fullyQualifiedNameToFilename(component.name)))
  const componentSchemas = await Promise.all(componentSchemaPromises)
  return componentSchemas.filter(schema => schema !== null) as Array<ComponentEntry>
}

const getPrebuiltComponentEntry = async (reference: ComponentEntryReference): Promise<ComponentEntry | null> => {
  const potentialComponentEntry = await getObjectFlatted({
    bucket: defaultBucketId,
    name: join(prebuiltSchemaPath, reference)
  }) as ComponentEntry
  if (!validateComponentEntryAttributes(potentialComponentEntry.attributes)) { // TODO: figure out how to validate whole entry, but skip validation of history
    return null
  }
  return potentialComponentEntry
}

const uploadPrebuiltComponentEntry = async (entry: ComponentEntry) => {
  await uploadObject({
    bucket: defaultBucketId,
    name: join(prebuiltSchemaPath, entry.uid)
  }, stringify(entry))
}

const deletePrebuiltComponentEntry = async (name: string) => {
  await deleteObject({
    bucket: defaultBucketId,
    name: join(prebuiltSchemaPath, name)
  })
}

export {
  listOrCreatePreBuiltComponentList,
  getPrebuiltComponentEntry,
  uploadPrebuiltComponentEntry,
  deletePrebuiltComponentEntry
}
