import { describe, it, expect } from 'vitest'
import { getLanguageAdapter } from './language.server'

/**
 * Resolving a language adapter from configuration.
 *
 * Driven against the real `genoa.config` rather than a stub, because what is being checked is that
 * the instance is wired up: a component records a language, and the CMS has to find something that
 * can read it. A stub would pass with no adapter configured at all.
 */

describe('resolving an adapter', () => {
  it('finds the adapter for a configured language', async () => {
    const adapter = await getLanguageAdapter('typescript')

    expect(adapter.language).toBe('typescript')
    expect(typeof adapter.analyze).toBe('function')
    expect(typeof adapter.compileBundle).toBe('function')
  })

  it('returns the same adapter when asked twice', async () => {
    // Adapters are imported once and kept. Re-importing per component would reload the parser for
    // every commit.
    const first = await getLanguageAdapter('typescript')
    const second = await getLanguageAdapter('typescript')

    expect(second).toBe(first)
  })

  it('refuses an unknown language, and says what is configured', async () => {
    // The component says what it is written in; the instance has not been told how to read it. That
    // is a configuration problem, and the error has to be answerable without opening the config
    // file — so it names the languages that are available.
    await expect(getLanguageAdapter('kotlin')).rejects.toThrow(/kotlin/)
    await expect(getLanguageAdapter('kotlin')).rejects.toThrow(/typescript/)
  })
})
