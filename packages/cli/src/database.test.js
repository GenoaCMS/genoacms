import { test, describe, vi } from 'vitest'
import assert from 'node:assert/strict'
import { select } from '@clack/prompts'
import { loadConfig } from '@genoacms/config/load'
import { createHost } from '@genoacms/config/host'
import database from './database.js'

vi.mock('@clack/prompts', async (importOriginal) => ({ ...await importOriginal(), select: vi.fn() }))
vi.mock('@genoacms/config/load', async (importOriginal) => ({ ...await importOriginal(), loadConfig: vi.fn(), importFromProject: vi.fn() }))
vi.mock('@genoacms/config/host', () => ({ createHost: vi.fn() }))

describe('database', () => {
  test('CLI-10: deletes the chosen collection object of any database from the default bucket, and closes the host', async () => {
    const manifest = { config: {} }
    const listings = {
      '.genoacms/databases/main/collections/': ['.genoacms/databases/main/collections/articles.json'],
      '.genoacms/databases/archive/collections/': ['.genoacms/databases/archive/collections/logs.json']
    }
    const storage = {
      listDirectory: vi.fn(async ({ name }) => ({ files: (listings[name] ?? []).map(file => ({ name: file })), directories: [] })),
      deleteObject: vi.fn(async () => {})
    }
    const host = { defaultBucket: 'media', databases: ['main', 'archive'], storageForBucket: vi.fn(async () => storage), close: vi.fn(async () => {}) }
    loadConfig.mockResolvedValue(manifest)
    createHost.mockReturnValue(host)
    const answers = ['continue', 'delete', '.genoacms/databases/archive/collections/logs.json']
    select.mockImplementation(async () => answers.shift())

    await database({ root: '/project', file: undefined, coreDir: '/core', mode: 'development' })

    assert.deepEqual(loadConfig.mock.calls[0][0], { root: '/project', file: undefined, mode: 'development' })
    assert.equal(createHost.mock.calls[0][0].manifest, manifest)
    assert.deepEqual(host.storageForBucket.mock.calls, [['media']])
    assert.deepEqual(storage.listDirectory.mock.calls, [
      [{ name: '.genoacms/databases/main/collections/', bucket: 'media' }],
      [{ name: '.genoacms/databases/archive/collections/', bucket: 'media' }]
    ])
    const offered = select.mock.calls[2][0].options.map(option => option.label)
    assert.deepEqual(offered, ['main/articles.json', 'archive/logs.json', 'Exit'])
    assert.deepEqual(storage.deleteObject.mock.calls, [[{ name: '.genoacms/databases/archive/collections/logs.json', bucket: 'media' }]])
    assert.equal(host.close.mock.calls.length, 1)
  })
})
