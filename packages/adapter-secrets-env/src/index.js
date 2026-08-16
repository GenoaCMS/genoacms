import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { getProvider } from '@genoacms/cloudabstraction'
import { assertValidSecretKey } from '@genoacms/cloudabstraction/secrets'
import { parseEntries, removeEntry, upsertEntry } from './envFile.js'

/**
 * Secrets emulator backed by a `.env` file.
 *
 * **Development only.** Secrets sit in plaintext in the project directory, protected by nothing but
 * file permissions, and every process running as the same user can read them. A deployment uses a
 * real secret manager; this exists so that running GenoaCMS locally does not require one.
 */

const ADAPTER_PATH = '@genoacms/adapter-secrets-env'
const DEFAULT_ENV_PATH = '.env'
/** Owner read/write only. The file holds private keys. */
const FILE_MODE = 0o600

const providerConfig = getProvider('secrets', ADAPTER_PATH)
const envPath = resolve(providerConfig.path ?? DEFAULT_ENV_PATH)

/**
 * Serialises writes. Each one is a read-modify-write of the whole file, so two concurrent writes
 * would otherwise race and silently drop one of the secrets.
 */
let writeQueue = Promise.resolve()

/**
 * @returns {Promise<string>}
 */
async function readEnvFile () {
    try {
        return await readFile(envPath, 'utf-8')
    } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return ''
        throw error
    }
}

/**
 * @param {string} content
 */
async function writeEnvFile (content) {
    await writeFile(envPath, content, { encoding: 'utf-8', mode: FILE_MODE })
}

/**
 * @template T
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 */
async function enqueueWrite (operation) {
    const result = writeQueue.then(operation, operation)
    // Keep the chain alive even when an operation rejects, so one failure does not wedge the queue.
    writeQueue = result.then(() => undefined, () => undefined)
    return await result
}

/**
 * Loads the file into `process.env` without overriding what is already there, so a real environment
 * variable always beats the file — the same precedence dotenv uses, and the one that lets a
 * deployment override a checked-out `.env`.
 */
async function loadIntoEnvironment () {
    const entries = parseEntries(await readEnvFile())
    for (const [key, value] of entries) {
        if (process.env[key] === undefined) process.env[key] = value
    }
}

await loadIntoEnvironment()

/**
 * @type {import('@genoacms/cloudabstraction').secrets.Adapter.getSecret}
 */
async function getSecret (key) {
    assertValidSecretKey(key)
    return process.env[key]
}

/**
 * @type {import('@genoacms/cloudabstraction').secrets.Adapter.setSecret}
 */
async function setSecret (key, value) {
    assertValidSecretKey(key)
    return await enqueueWrite(async () => {
        await writeEnvFile(upsertEntry(await readEnvFile(), key, value))
        process.env[key] = value
        return true
    })
}

/**
 * @type {import('@genoacms/cloudabstraction').secrets.Adapter.deleteSecret}
 */
async function deleteSecret (key) {
    assertValidSecretKey(key)
    return await enqueueWrite(async () => {
        const { content, existed } = removeEntry(await readEnvFile(), key)
        await writeEnvFile(content)
        const wasSet = process.env[key] !== undefined
        delete process.env[key]
        return existed || wasSet
    })
}

export {
    getSecret,
    setSecret,
    deleteSecret
}
