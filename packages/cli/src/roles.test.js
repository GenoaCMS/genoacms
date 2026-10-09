import { test, describe, vi, beforeEach } from 'vitest'
import assert from 'node:assert/strict'
import { select, text, confirm, log, note } from '@clack/prompts'
import { loadConfig } from '@genoacms/config/load'
import roles from './roles.js'

vi.mock('@clack/prompts', async (importOriginal) => ({
  ...await importOriginal(),
  select: vi.fn(),
  text: vi.fn(),
  confirm: vi.fn(),
  isCancel: () => false,
  note: vi.fn(),
  intro: vi.fn(),
  outro: vi.fn(),
  log: { warn: vi.fn(), info: vi.fn(), message: vi.fn() }
}))
vi.mock('@genoacms/config/load', async (importOriginal) => ({ ...await importOriginal(), loadConfig: vi.fn() }))

const ctx = { root: '/project', file: undefined, coreDir: '/core', mode: 'development' }

const manifest = {
  config: {
    storage: { buckets: { media: { provider: 'gcs' }, assets: { provider: 'gcs' } } },
    database: { databases: { main: { provider: 'db', collections: [{ name: 'articles' }] } } },
    authorization: { roles: { Editor: [], Administrator: [] } }
  }
}

function answering (answers) {
  const reply = async ({ message }) => {
    assert.ok(Object.hasOwn(answers, message), `unexpected prompt: ${message}`)
    return answers[message]
  }
  select.mockImplementation(reply)
  text.mockImplementation(reply)
  confirm.mockImplementation(reply)
}

const promptCall = (prompt, message) => prompt.mock.calls.find(([options]) => options.message === message)?.[0]

beforeEach(() => { vi.clearAllMocks() })

describe('roles', () => {
  test('CLI-11: offers the declared roles for an assignment', async () => {
    loadConfig.mockResolvedValue(manifest)
    const rolesPrompt = 'Which roles? (comma separated; declared today: Editor, Administrator)'
    answering({
      'What would you like to compose?': 'assignment',
      'Subject (as issued by your authentication provider, never an email address)': 'e0d5a1c4',
      [rolesPrompt]: 'Editor'
    })

    await roles(ctx)

    assert.ok(promptCall(text, rolesPrompt))
    assert.match(note.mock.calls[0][0], /"e0d5a1c4"/)
  })

  test('CLI-11: offers the declared buckets and *, or free text without a config', async () => {
    loadConfig.mockResolvedValue(manifest)
    answering({
      'What would you like to compose?': 'role',
      'Role name': 'Reader',
      'Which permission?': 'storage:bucket:read',
      'Which bucket?': 'media',
      'Add another grant?': false
    })

    await roles(ctx)

    assert.deepEqual(promptCall(select, 'Which bucket?').options.map(option => option.value), ['media', 'assets', '*'])
    assert.match(note.mock.calls[0][0], /id: "media"/)
    assert.equal(log.warn.mock.calls.length, 0)

    vi.clearAllMocks()
    loadConfig.mockRejectedValue(new Error('config/not-found: no config file'))
    answering({
      'What would you like to compose?': 'role',
      'Role name': 'Reader',
      'Which permission?': 'storage:bucket:read',
      'Which bucket? (its name, or * for every bucket)': 'uploads',
      'Add another grant?': false
    })

    await roles(ctx)

    assert.ok(log.warn.mock.calls.some(([message]) => message.includes('config/not-found: no config file')))
    assert.equal(promptCall(text, 'Which bucket? (its name, or * for every bucket)').initialValue, '*')
    assert.equal(promptCall(select, 'Which bucket?'), undefined)
    assert.match(note.mock.calls[0][0], /id: "uploads"/)
  })

  test('CLI-11: a config without roles still offers its buckets', async () => {
    const withoutRoles = { ...manifest.config }
    delete withoutRoles.authorization
    loadConfig.mockResolvedValue({ config: withoutRoles })
    answering({
      'What would you like to compose?': 'role',
      'Role name': 'Reader',
      'Which permission?': 'storage:bucket:read',
      'Which bucket?': 'assets',
      'Add another grant?': false
    })

    await roles(ctx)

    assert.equal(log.warn.mock.calls.length, 0)
    assert.deepEqual(promptCall(select, 'Which bucket?').options.map(option => option.value), ['media', 'assets', '*'])
    assert.equal(promptCall(text, 'Which bucket? (its name, or * for every bucket)'), undefined)
    assert.match(note.mock.calls[0][0], /id: "assets"/)
  })

  test('CLI-11: a role name that is not an identifier is printed quoted', async () => {
    const compose = async (name) => {
      vi.clearAllMocks()
      loadConfig.mockResolvedValue(manifest)
      answering({
        'What would you like to compose?': 'role',
        'Role name': name,
        'Which permission?': 'storage:bucket:read',
        'Which bucket?': 'media',
        'Add another grant?': false
      })
      await roles(ctx)
      return note.mock.calls[0][0]
    }

    const quoted = await compose('Content editor')
    assert.ok(quoted.includes('"Content editor": ['), quoted)
    assert.doesNotThrow(() => new Function(`return ({ ${quoted} })`))

    const plain = await compose('Copywriter')
    assert.ok(plain.includes('Copywriter: ['), plain)

    const padded = await compose('  Copywriter  ')
    assert.ok(padded.includes('\n  Copywriter: ['), padded)
  })
})
