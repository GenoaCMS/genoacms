import { test, describe, vi, beforeEach } from 'vitest'
import assert from 'node:assert/strict'
import { confirm, outro } from '@clack/prompts'
import { runCoreScript } from './vite.js'
import rotateRoot from './rotateRoot.js'

const CANCEL = Symbol('clack:cancel')

vi.mock('@clack/prompts', async (importOriginal) => ({
  ...await importOriginal(),
  confirm: vi.fn(),
  isCancel: (value) => value === CANCEL,
  log: { warn: vi.fn(), info: vi.fn(), message: vi.fn() },
  outro: vi.fn()
}))
vi.mock('./vite.js', () => ({ spawnVite: vi.fn(), runCoreScript: vi.fn() }))

const ctx = { root: '/project', file: '/project/genoa.config/production.ts', coreDir: '/core', mode: 'production' }

beforeEach(() => { vi.clearAllMocks() })

describe('rotateRoot', () => {
  test('CLI-9: changes nothing when declined or cancelled', async () => {
    for (const answer of [false, CANCEL]) {
      vi.clearAllMocks()
      confirm.mockResolvedValue(answer)
      await rotateRoot(ctx)
      assert.equal(confirm.mock.calls[0][0].initialValue, false)
      assert.deepEqual(outro.mock.calls, [['Cancelled. Nothing was changed.']])
      assert.equal(runCoreScript.mock.calls.length, 0)
    }
  })

  test('CLI-9: runs core\'s script with the confirmation set when confirmed', async () => {
    confirm.mockResolvedValue(true)
    await rotateRoot(ctx)
    assert.deepEqual(runCoreScript.mock.calls, [['/core', 'scripts/rotate-root.ts', {
      GENOA_PROJECT: '/project',
      GENOA_MODE: 'production',
      GENOA_CONFIG: '/project/genoa.config/production.ts',
      GENOACMS_CONFIRM_ROOT_ROTATION: '1'
    }]])
  })
})
