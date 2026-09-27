import { describe, it, expect } from 'vitest'
import { readGenoaEnvironment } from './environment.js'

describe('readGenoaEnvironment', () => {
  it('uses GENOA_MODE when set and the fallback otherwise', () => {
    expect(readGenoaEnvironment('development', { GENOA_MODE: 'production' }).mode).toBe('production')
    expect(readGenoaEnvironment('production', {}).mode).toBe('production')
    expect(readGenoaEnvironment('development', {}).mode).toBe('development')
  })

  it('passes the absolute paths and the target through, and falls back to the working directory', () => {
    expect(readGenoaEnvironment('development', { GENOA_PROJECT: '/p', GENOA_CONFIG: '/p/genoa.config.ts', GENOA_TARGET: 'gcp' }))
      .toEqual({ root: '/p', file: '/p/genoa.config.ts', target: 'gcp', mode: 'development' })
    expect(readGenoaEnvironment('development', {})).toEqual({ root: process.cwd(), mode: 'development' })
  })

  it('refuses relative paths and unknown modes', () => {
    expect(() => readGenoaEnvironment('development', { GENOA_PROJECT: 'relative' })).toThrow(/^genoa\/relative-path: GENOA_PROJECT/)
    expect(() => readGenoaEnvironment('development', { GENOA_CONFIG: './genoa.config.ts' })).toThrow(/^genoa\/relative-path: GENOA_CONFIG/)
    expect(() => readGenoaEnvironment('development', { GENOA_MODE: 'staging' })).toThrow(/^genoa\/invalid-mode/)
  })
})
