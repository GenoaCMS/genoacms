import { describe, it, expect } from 'vitest'
import * as database from './index.js'

const reference = { collection: { name: 'pages' }, id: 'x' }

describe('the database errors', () => {
  it.fails('DATA-12: the errors carry their names and messages, and the guard recognizes by name', () => {
    const { DocumentNotFoundError, UnsupportedQueryError, isDocumentNotFound } = database
    const notFound = new DocumentNotFoundError(reference)
    expect(notFound).toBeInstanceOf(Error)
    expect(notFound.name).toBe('DocumentNotFoundError')
    expect(notFound.message).toBe('database/not-found: pages/x')
    const unsupported = new UnsupportedQueryError('create the index https://console.example/index')
    expect(unsupported).toBeInstanceOf(Error)
    expect(unsupported.name).toBe('UnsupportedQueryError')
    expect(unsupported.message).toBe('database/unsupported-query: create the index https://console.example/index')
    expect(isDocumentNotFound(notFound)).toBe(true)
    expect(isDocumentNotFound({ name: 'DocumentNotFoundError' })).toBe(true)
    expect(isDocumentNotFound(unsupported)).toBe(false)
    expect(isDocumentNotFound(new Error('database/not-found: pages/x'))).toBe(false)
    expect(isDocumentNotFound(null)).toBe(false)
    expect(isDocumentNotFound('DocumentNotFoundError')).toBe(false)
  })
})
