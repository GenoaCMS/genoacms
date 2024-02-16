import {
  deleteObject,
  defaultBucketId,
  getObjectJSON,
  listOrCreateDirectory,
  uploadObject,
  fullyQualifiedNameToFilename
} from '$lib/script/storage.server'
import { join } from 'path'
import Ajv from 'ajv'
import { componentSchemaFileSchema } from './schemas'
import type { ComponentSchemaFile } from './types'

const prebuiltSchemaPath = join('.genoacms', 'components/', 'prebuilt/')
const ajv = new Ajv()
const validateComponentSchema = ajv.compile(componentSchemaFileSchema)

const listOrCreatePreBuiltComponentList = async (): Promise<Array<ComponentSchemaFile>> => {
  const componentList = await listOrCreateDirectory({
    bucket: defaultBucketId,
    name: prebuiltSchemaPath
  })
  const componentSchemaPromises = componentList.files
    .map(async component => getComponentSchemaFile(fullyQualifiedNameToFilename(component.name)))
  const componentSchemas = await Promise.all(componentSchemaPromises)
  return componentSchemas.filter(schema => schema !== null) as Array<ComponentSchemaFile>
}

const getComponentSchemaFile = async (name: string): Promise<ComponentSchemaFile | null> => {
  console.log('getComponentSchemaFile', name)
  const potentialComponentSchema = await getObjectJSON({
    bucket: defaultBucketId,
    name: join(prebuiltSchemaPath, name)
  })
  if (!validateComponentSchema(potentialComponentSchema)) {
    return null
  }
  return potentialComponentSchema
}

const uploadComponentSchema = async (name: string, data: string) => {
  await uploadObject({
    bucket: defaultBucketId,
    name: join(prebuiltSchemaPath, name)
  }, data)
}

const deleteComponentSchema = async (name: string) => {
  await deleteObject({
    bucket: defaultBucketId,
    name: join(prebuiltSchemaPath, name)
  })
}

export {
  listOrCreatePreBuiltComponentList,
  getComponentSchemaFile,
  uploadComponentSchema,
  deleteComponentSchema
}
