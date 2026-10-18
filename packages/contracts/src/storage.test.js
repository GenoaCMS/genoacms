import { describe, it, expect } from 'vitest'
import * as storage from './storage/index.js'

const { PreconditionFailedError, isPreconditionFailed } = storage

describe('PreconditionFailedError', () => {
  const error = new PreconditionFailedError({ bucket: 'b', name: 'n' }, 'r')

  it('STOR-8: names itself and the object it refused', () => {
    expect(error.name).toBe('PreconditionFailedError')
    expect(error.message).toBe('storage/precondition-failed: b/n: r')
    expect(error.reference).toEqual({ bucket: 'b', name: 'n' })
    expect(error.reason).toBe('r')
  })
})

describe('isPreconditionFailed', () => {
  it('STOR-8: isPreconditionFailed recognizes the error by name, including a copy from another module instance', () => {
    expect(isPreconditionFailed(new PreconditionFailedError({ bucket: 'b', name: 'n' }, 'r'))).toBe(true)
    expect(isPreconditionFailed({ name: 'PreconditionFailedError' })).toBe(true)
  })

  it('STOR-8: isPreconditionFailed rejects everything else', () => {
    expect(isPreconditionFailed(new Error('x'))).toBe(false)
    expect(isPreconditionFailed(null)).toBe(false)
    expect(isPreconditionFailed('x')).toBe(false)
  })
})

describe('ObjectNotFoundError', () => {
  it('STOR-16: ObjectNotFoundError names itself and the missing object', () => {
    const error = new storage.ObjectNotFoundError({ bucket: 'b', name: 'n' })
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ObjectNotFoundError')
    expect(error.message).toBe('storage/not-found: b/n')
    expect(error.reference).toEqual({ bucket: 'b', name: 'n' })
  })

  it('STOR-16: isNotFound recognizes the error by name, and nothing else', () => {
    expect(storage.isNotFound(new storage.ObjectNotFoundError({ bucket: 'b', name: 'n' }))).toBe(true)
    expect(storage.isNotFound({ name: 'ObjectNotFoundError' })).toBe(true)
    expect(storage.isNotFound(new Error('x'))).toBe(false)
    expect(storage.isNotFound(null)).toBe(false)
    expect(storage.isNotFound('x')).toBe(false)
  })
})

describe('NotADirectoryError and isDirectoryName', () => {
  it('STOR-3: NotADirectoryError and isDirectoryName', () => {
    const error = new storage.NotADirectoryError({ bucket: 'b', name: 'n' })
    expect(error.name).toBe('NotADirectoryError')
    expect(error.message).toBe('storage/not-a-directory: b/n')
    expect(error.reference).toEqual({ bucket: 'b', name: 'n' })
    for (const name of ['', 'a/', 'a//']) expect(storage.isDirectoryName(name)).toBe(true)
    for (const name of ['a', '/a', 'a/b']) expect(storage.isDirectoryName(name)).toBe(false)
  })
})
