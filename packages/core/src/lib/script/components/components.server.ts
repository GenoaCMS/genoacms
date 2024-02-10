import {
  createDirectory,
  fullyQualifiedNameToFilename,
  getBucketReferences,
  getObject,
  isDirectoryExisting,
  listDirectory, uploadObject
} from '$lib/script/storage.server'
import { join } from 'path'
import { streamToString } from '$lib/script/utils'

const bucketId = getBucketReferences()[0] // TODO: replace with default bucket
const componentSchemaPath = join('.genoacms', 'components/')
const prebuiltSchemaPath = join(componentSchemaPath, 'prebuilt/')

const listOrCreatePreBuiltComponentList = async () => {
  const componentList = await listDirectory({
    bucket: bucketId,
    name: prebuiltSchemaPath
  })
  console.log('componentList', componentList.files)
  const isComponentListExisting = isDirectoryExisting(componentList)
  if (!isComponentListExisting) {
    await createDirectory({
      bucket: bucketId,
      name: prebuiltSchemaPath
    })
  }
  return componentList.files.map(component => fullyQualifiedNameToFilename(component.name))
}

const getComponent = async (name: string) => {
  const file = await getObject({
    bucket: bucketId,
    name: join(prebuiltSchemaPath, name)
  })
  const isComponentExisting = !!file.data
  if (!isComponentExisting) {
    throw new Error('component-not-found')
  }
  const text = await streamToString(file.data)
  return JSON.parse(text)
}

const uploadComponentSchema = async (name: string, data: string) => {
  await uploadObject({
    bucket: bucketId,
    name: join(prebuiltSchemaPath, name)
  }, data)
}

export {
  listOrCreatePreBuiltComponentList,
  getComponent,
  uploadComponentSchema
}
