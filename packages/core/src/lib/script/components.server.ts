import {
  createDirectory,
  fullyQualifiedNameToFilename,
  getBucketReferences,
  getObject,
  isDirectoryExisting,
  listDirectory
} from '$lib/script/storage.server'
import { join } from 'path'
import { streamToString } from '$lib/script/utils'

const bucketId = getBucketReferences()[0] // TODO: replace with default bucket
const directoryPath = join('.genoacms', 'components', 'prebuilt/')

const listOrCreatePreBuiltComponentList = async () => {
  const componentList = await listDirectory({
    bucket: bucketId,
    name: directoryPath
  })
  console.log('componentList', componentList.files)
  const isComponentListExisting = isDirectoryExisting(componentList)
  if (!isComponentListExisting) {
    await createDirectory({
      bucket: bucketId,
      name: directoryPath
    })
  }
  return componentList.files.map(component => fullyQualifiedNameToFilename(component.name))
}

const getComponent = async (name: string) => {
  const file = await getObject({
    bucket: bucketId,
    name: join(directoryPath, name)
  })
  const isComponentExisting = !!file.data
  if (!isComponentExisting) {
    throw new Error('component-not-found')
  }
  const text = await streamToString(file.data)
  return JSON.parse(text)
}

interface Attribute {
  name: string,
  description: string,
  isRequired: boolean
}

interface BooleanAttribute extends Attribute {
  type: 'boolean',
  defaultValue: boolean
}

interface NumberAttribute extends Attribute {
  type: 'number',
  min: number,
  max: number,
  defaultValue: number,
  step: number,
  decimalPlaces: number
}

interface StringAttribute extends Attribute {
  type: 'string',
  regex: string,
  maxLength: number,
  defaultValue: string
}

interface TextAttribute extends Attribute {
  type: 'text',
  maxLength: number,
  defaultValue: string
}

interface MarkdownAttribute extends Attribute {
  type: 'markdown',
  defaultValue: string
}

interface RichTextAttribute extends Attribute {
  type: 'richText',
  defaultValue: string
}

interface LinkAttribute extends Attribute {
  type: 'link',
}

interface StorageResourceAttribute extends Attribute {
  type: 'storageResource',
}

interface ComponentsAttribute extends Attribute {
  type: 'component',
  component: string,
  maxComponents: number,
  allowedComponents: Array<string>
}

type attributeValue = BooleanAttribute | NumberAttribute | StringAttribute | TextAttribute | MarkdownAttribute
  | RichTextAttribute | LinkAttribute | StorageResourceAttribute | ComponentsAttribute

interface Component {
  version: string,
  attributes: Record<string, attributeValue>
}

export {
  listOrCreatePreBuiltComponentList,
  getComponent
}
export type {
  Component,
  attributeValue
}
