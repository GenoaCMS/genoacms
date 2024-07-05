import { select } from '@clack/prompts'
import { config } from '@genoacms/cloudabstraction'

const {
  createDirectory,
  deleteObject,
  getObject,
  getPublicURL,
  getSignedURL,
  listDirectory,
  uploadObject
} = await import(config.storage.adapterPath)

const collectionsDirectory = '.genoacms/collections'

async function listCollections() {
    return await listDirectory({ name: collectionsDirectory, bucket: config.storage.defaultBucket })
}

let collectionsDirectoryContents = await listCollections()

function fullyQualifiedNameToFilename (name) {
  if (name[name.length - 1] === '/') name = name.slice(0, -1)

  const lastIndexOfSlash = name.lastIndexOf('/')
  return lastIndexOfSlash === -1 ? name : name.slice(lastIndexOfSlash + 1)
}

async function selectMode() {
  return await select({
    message: 'Select a mode',
    options: [
      {
        value: 'add',
        label: 'Add a collection'
      },
      {
        value: 'delete',
        label: 'Delete a collection'
      },
      {
        value: 'continue',
        label: 'Continue'
      },
      {
        value: 'exit',
        label: 'Exit'
      }
    ]
  })
}

async function selectCollection () {
  const options = collectionsDirectoryContents.files.map(({ name }) => ({ value: name, label: fullyQualifiedNameToFilename(name) }))
  options.push({ value: '', label: 'Exit' })
  return await select({ message: 'Select a collection', options })
}

function addCollection() {
  console.clear()
  // TODO: CRUD attribute
}

async function deleteCollection() {
  const collection = await selectCollection()
  if (!collection) return
  await deleteObject({ name: collection, bucket: config.storage.defaultBucket })
  collectionsDirectoryContents = await listCollections()
}

export default async function database() {
  const mode = await selectMode()
  switch (mode) { case 'add':
      addCollection()
      break
    case 'delete':
      await deleteCollection()
      break
    case 'exit':
      return
    default:
      await database()
  }
}
