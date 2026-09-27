import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { defineRuntime } from '@genoacms/contracts'
import { assertValidSecretKey } from '@genoacms/contracts/secrets'
import { parseEntries, removeEntry, upsertEntry } from './envFile.js'

/**
 * Secrets emulator backed by a `.env`-syntax file under the project.
 *
 * **Development only.** Secrets sit in plaintext in the project directory, protected by nothing but
 * file permissions, and every process running as the same user can read them. A deployment uses a
 * real secret manager; this exists so that running GenoaCMS locally does not require one.
 */

/** Outside the files Vite watches, so a write does not restart the dev server under the request. */
const DEFAULT_PATH = '.genoacms/secrets.env'
/** Owner read/write only. The file holds private keys. */
const FILE_MODE = 0o600
const DIRECTORY_MODE = 0o700
const LOCK_TIMEOUT_MS = 5_000
const LOCK_POLL_MS = 20
const DELETED = Symbol('deleted')

/**
 * @param {import('@genoacms/contracts').AdapterContext} ctx
 * @returns {string}
 */
function requireProjectRoot (ctx) {
    if (ctx.projectRoot === undefined) {
        throw new Error('secrets-env/no-project-root: this adapter is for development only; configure a secret manager for deployment')
    }
    return ctx.projectRoot
}

/**
 * One store over one file.
 *
 * Its own writes are kept in an overlay that reads consult first. Today's adapter wrote them into
 * `process.env` instead, which is shared by every instance in the process; without some such record,
 * a variable set in the shell would hide every later write to the same key, including a rotation.
 *
 * @param {string} envPath
 * @returns {import('@genoacms/contracts/secrets').Adapter}
 */
function createStore (envPath) {
    const lockPath = `${envPath}.lock`
    /** @type {Map<string, string | typeof DELETED>} */
    const overlay = new Map()

    /**
     * Serializes writes. Each one is a read-modify-write of the whole file, so two concurrent writes
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

    /** The default path lives in a directory that may not exist yet. */
    async function ensureDirectory () {
        await mkdir(dirname(envPath), { recursive: true, mode: DIRECTORY_MODE })
    }

    /**
     * @param {string} content
     */
    async function writeEnvFile (content) {
        await ensureDirectory()
        await writeFile(envPath, content, { encoding: 'utf-8', mode: FILE_MODE })
    }

    /**
     * @template T
     * @param {() => Promise<T>} operation
     * @returns {Promise<T>}
     */
    async function enqueue (operation) {
        const result = writeQueue.then(operation, operation)
        // Keep the chain alive even when an operation rejects, so one failure does not wedge the queue.
        writeQueue = result.then(() => undefined, () => undefined)
        return await result
    }

    async function acquireLock () {
        await ensureDirectory()
        const deadline = Date.now() + LOCK_TIMEOUT_MS
        for (;;) {
            try {
                await writeFile(lockPath, String(process.pid), { flag: 'wx', mode: FILE_MODE })
                return
            } catch (error) {
                if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') throw error
                if (Date.now() > deadline) {
                    throw new Error(`secrets-env/lock-timeout: ${lockPath} is held; remove it if no process owns it`)
                }
                await new Promise(resolveDelay => setTimeout(resolveDelay, LOCK_POLL_MS))
            }
        }
    }

    async function releaseLock () {
        try {
            await unlink(lockPath)
        } catch (error) {
            if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error
        }
    }

    /** Whether this instance's own writes hold a live value for `key`. */
    const overlayHolds = (key) => overlay.has(key) && overlay.get(key) !== DELETED

    /**
     * The environment only counts when this instance has not written the key itself.
     *
     * @param {string} key
     */
    const environmentHolds = (key) => !overlay.has(key) && process.env[key] !== undefined

    return {
        async getSecret (key) {
            assertValidSecretKey(key)
            if (overlay.has(key)) {
                const value = overlay.get(key)
                return value === DELETED ? undefined : /** @type {string} */ (value)
            }
            const fromEnvironment = process.env[key]
            if (fromEnvironment !== undefined) return fromEnvironment
            // Read fresh: another process may have written the key since — which is exactly what
            // happens to whoever loses an atomic claim.
            return parseEntries(await readEnvFile()).get(key)
        },

        async setSecret (key, value) {
            assertValidSecretKey(key)
            return await enqueue(async () => {
                await writeEnvFile(upsertEntry(await readEnvFile(), key, value))
                overlay.set(key, value)
                return true
            })
        },

        async deleteSecret (key) {
            assertValidSecretKey(key)
            return await enqueue(async () => {
                const { content, existed } = removeEntry(await readEnvFile(), key)
                await writeEnvFile(content)
                const wasPresent = existed || overlayHolds(key) || environmentHolds(key)
                overlay.set(key, DELETED)
                return wasPresent
            })
        },

        /**
         * Claims a key, atomically across processes.
         *
         * The in-process write queue is not enough here: two `genoacms` processes on one machine share
         * the file but not the queue. An exclusive lock file is the cross-process primitive — `wx`
         * fails with `EEXIST` for whoever loses — and the whole read-check-write happens while holding it.
         */
        async setSecretIfAbsent (key, value) {
            assertValidSecretKey(key)
            return await enqueue(async () => {
                await acquireLock()
                try {
                    const content = await readEnvFile()
                    if (parseEntries(content).has(key) || overlayHolds(key) || environmentHolds(key)) return false
                    await writeEnvFile(upsertEntry(content, key, value))
                    overlay.set(key, value)
                    return true
                } finally {
                    await releaseLock()
                }
            })
        }
    }
}

export default defineRuntime({
    create ({ path = DEFAULT_PATH }, ctx) {
        return createStore(resolve(requireProjectRoot(ctx), path))
    }
})
