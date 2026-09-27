import { select } from '@clack/prompts'
import { loadConfig, importFromProject } from '@genoacms/config/load'
import { createHost } from '@genoacms/config/host'

const collectionsDirectory = '.genoacms/collections'

/**
 * The default bucket's storage provider, constructed through a host like the runtime's. Everything
 * happens inside the command, so importing this module does no I/O.
 */
async function openStorage ({ root, file, mode }) {
  const manifest = await loadConfig({ root, file, mode })
  const host = createHost({ manifest, load: s => importFromProject(s, root), projectRoot: root })
  const storage = await host.storageForBucket(host.defaultBucket)
  return { host, storage, bucket: host.defaultBucket }
}

async function listCollections (session) {
  return await session.storage.listDirectory({ name: collectionsDirectory, bucket: session.bucket })
}

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

async function selectCollection (session) {
  const contents = await listCollections(session)
  const options = contents.files.map(({ name }) => ({ value: name, label: fullyQualifiedNameToFilename(name) }))
  options.push({ value: '', label: 'Exit' })
  return await select({ message: 'Select a collection', options })
}

function addCollection() {
  console.clear()
  // TODO: CRUD attribute
}

async function deleteCollection(session) {
  const collection = await selectCollection(session)
  if (!collection) return
  await session.storage.deleteObject({ name: collection, bucket: session.bucket })
}

async function menu (session) {
  const mode = await selectMode()
  switch (mode) { case 'add':
      addCollection()
      break
    case 'delete':
      await deleteCollection(session)
      break
    case 'exit':
      return
    default:
      await menu(session)
  }
}

export default async function database(ctx) {
  const session = await openStorage(ctx)
  try {
    await menu(session)
  } finally {
    await session.host.close()
  }
}
