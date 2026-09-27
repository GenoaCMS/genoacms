import { describe, it, expect } from 'vitest'
import descriptor from './descriptor.js'

describe('the TypeScript language descriptor', () => {
  it('names its runtime', () => {
    expect(descriptor.kind).toBe('language')
    expect(descriptor.runtime).toBe('@genoacms/language-adapter-ts/runtime')
  })

  it('accepts no options or a target, and refuses anything else', () => {
    const validate = descriptor.validate as (options: unknown) => string[]
    expect(validate({})).toEqual([])
    expect(validate({ target: 'es2022' })).toEqual([])
    expect(validate({ target: '' })).toHaveLength(1)
    expect(validate({ lowering: 'es5' })).toEqual(["unknown option 'lowering'"])
  })
})
