import { isNotFound, isPreconditionFailed } from '@genoacms/contracts/storage'
import {
  deleteInternalObject,
  getInternalObjectStringVersioned,
  uploadInternalObjectJSON
} from '#lib/script/storage/storage.server.js'
import { keyFilePath, type KeyFile } from './keyFile'

async function readStoredText (keyId: string): Promise<string | undefined> {
  try {
    return (await getInternalObjectStringVersioned(keyFilePath(keyId))).text
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
}

function parsedOrText (text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** REG-3: written only where no file is; a file of the same bytes counts as written. */
async function writeKeyFile (file: KeyFile): Promise<void> {
  try {
    await uploadInternalObjectJSON(keyFilePath(file.keyId), file, { ifAbsent: true })
  } catch (error) {
    if (!isPreconditionFailed(error)) throw error
    if (await readStoredText(file.keyId) !== JSON.stringify(file)) {
      throw new Error(`registry/key-file-conflict: ${file.keyId}`)
    }
  }
}

/** REG-2, VFY-1: `undefined` only when no file is stored. */
async function readKeyFile (keyId: string): Promise<unknown | undefined> {
  const text = await readStoredText(keyId)
  return text === undefined ? undefined : parsedOrText(text)
}

/** REG-3: a file already gone is not an error. */
async function deleteKeyFile (keyId: string): Promise<void> {
  try {
    await deleteInternalObject(keyFilePath(keyId))
  } catch (error) {
    if (!isNotFound(error)) throw error
  }
}

export {
  writeKeyFile,
  readKeyFile,
  deleteKeyFile
}
