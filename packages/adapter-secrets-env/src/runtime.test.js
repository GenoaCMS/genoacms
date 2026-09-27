import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, statSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import runtime from './runtime.js'

const roots = []
afterEach(() => {
    vi.unstubAllEnvs()
    while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true })
})

function projectRoot () {
    const root = mkdtempSync(join(tmpdir(), 'genoa-secrets-env-'))
    roots.push(root)
    return root
}

const store = (root, options = {}) => runtime.create(options, { name: 'local', resources: [], projectRoot: root })

/** A key no real environment defines, so tests control whether process.env has it. */
const KEY = 'GENOACMS_TEST_SECRETS_ENV_KEY'

describe('the secrets-env runtime', () => {
    it('refuses to run without a project root', () => {
        expect(() => runtime.create({}, { name: 'local', resources: [] })).toThrow(/^secrets-env\/no-project-root/)
    })

    it('creates .genoacms/secrets.env on first write, readable by its owner only', async () => {
        const root = projectRoot()
        const path = join(root, '.genoacms', 'secrets.env')
        expect(existsSync(path)).toBe(false)
        await store(root).setSecret(KEY, 'v')
        expect(statSync(path).mode & 0o777).toBe(0o600)
    })

    it('reads back its own writes without touching process.env', async () => {
        const secrets = store(projectRoot())
        await secrets.setSecret(KEY, 'written')
        expect(await secrets.getSecret(KEY)).toBe('written')
        expect(process.env[KEY]).toBeUndefined()
    })

    it("lets this instance's writes beat a variable set in the shell", async () => {
        vi.stubEnv(KEY, 'shell')
        const secrets = store(projectRoot())
        await secrets.setSecret(KEY, 'new')
        expect(await secrets.getSecret(KEY)).toBe('new')
    })

    it('lets the environment beat the file for a key this instance has not written', async () => {
        const root = projectRoot()
        await store(root).setSecret(KEY, 'from-file')
        vi.stubEnv(KEY, 'from-environment')
        expect(await store(root).getSecret(KEY)).toBe('from-environment')
    })

    it('deletes an environment-only key: reports it present, then reads it as absent', async () => {
        vi.stubEnv(KEY, 'shell')
        const secrets = store(projectRoot())
        expect(await secrets.deleteSecret(KEY)).toBe(true)
        expect(await secrets.getSecret(KEY)).toBeUndefined()
    })

    it("makes one instance's write visible to another through the file", async () => {
        const root = projectRoot()
        await store(root).setSecret(KEY, 'shared')
        expect(await store(root).getSecret(KEY)).toBe('shared')
    })

    it('lets exactly one of many racing claims across two instances win', async () => {
        const root = projectRoot()
        const [a, b] = [store(root), store(root)]
        const results = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? a : b).setSecretIfAbsent(KEY, `claim-${i}`)))
        expect(results.filter(Boolean)).toHaveLength(1)
    })

    it('refuses keys outside the portable pattern in every method', async () => {
        const secrets = store(projectRoot())
        for (const call of [() => secrets.getSecret('a-b'), () => secrets.setSecret('a-b', 'v'), () => secrets.deleteSecret('a-b'), () => secrets.setSecretIfAbsent('a-b', 'v')]) {
            await expect(call()).rejects.toThrow(/^invalid-secret-key/)
        }
    })
})
