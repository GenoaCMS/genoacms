import { describe, it, expect } from 'vitest'
import { PreconditionFailedError, isPreconditionFailed } from './storage/index.js'

describe('PreconditionFailedError', () => {
  const error = new PreconditionFailedError({ bucket: 'b', name: 'n' }, 'r')

  it('names itself and the object it refused', () => {
    expect(error.name).toBe('PreconditionFailedError')
    expect(error.message).toBe('storage/precondition-failed: b/n: r')
    expect(error.reference).toEqual({ bucket: 'b', name: 'n' })
    expect(error.reason).toBe('r')
  })
})

describe('isPreconditionFailed', () => {
  it('recognizes the error by name, including a copy from another module instance', () => {
    expect(isPreconditionFailed(new PreconditionFailedError({ bucket: 'b', name: 'n' }, 'r'))).toBe(true)
    expect(isPreconditionFailed({ name: 'PreconditionFailedError' })).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isPreconditionFailed(new Error('x'))).toBe(false)
    expect(isPreconditionFailed(null)).toBe(false)
    expect(isPreconditionFailed('x')).toBe(false)
  })
})
