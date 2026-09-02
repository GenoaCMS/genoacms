import { describe, it, expect, vi, afterEach } from 'vitest'
import { target, DEFAULT_TARGET, ADAPTER_PATH } from './config.js'

/**
 * Reading this adapter's own settings out of `genoa.config`.
 *
 * Driven against the fixtures in `test/`, not a stub, because what is being checked is that the
 * adapter is registered and resolvable the way every other adapter is. A stub would pass with no
 * configuration at all.
 *
 * Settings are read once when the adapter loads, as they are for every other adapter, so exercising
 * a different instance means loading the module again against a different configuration.
 */

/** Loads `config.ts` fresh against the configuration at `configPath`. */
const settingsFor = async (configPath: string) => {
  vi.resetModules()
  vi.stubEnv('GENOA_CONFIG_PATH', configPath)
  return await import('./config.js')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('adapter settings', () => {
  it('falls back to the default target when the instance does not choose one', () => {
    // `test/genoa.config` registers the adapter and sets nothing, which is the ordinary case.
    expect(target).toBe(DEFAULT_TARGET)
  })

  it('uses the target the instance configured', async () => {
    const configured = await settingsFor('test/genoa.config-target')

    expect(configured.target).toBe('es2022')
    expect(configured.target).not.toBe(configured.DEFAULT_TARGET)
  })

  it('defaults to a level every browser with ES module support understands', () => {
    expect(DEFAULT_TARGET).toBe('es2020')
  })

  it('resolves itself by the path a configuration registers it under', () => {
    expect(ADAPTER_PATH).toBe('@genoacms/language-adapter-ts')
  })
})
