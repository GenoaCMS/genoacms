import { describe, it, expect } from 'vitest'
import descriptor from './descriptor.js'

describe('the Node deployment descriptor', () => {
  it('is a deployment target that loads the real SvelteKit Node adapter from this package', async () => {
    expect(descriptor.kind).toBe('deployment')
    expect(typeof (await descriptor.svelteKitAdapter()).default).toBe('function')
  })

  it('points the SvelteKit adapter at the artifact directory', () => {
    expect(descriptor.svelteKitOptions({}, { outDir: '/a' })).toEqual({ out: '/a' })
  })

  it('accepts no options or a relative outDir inside the project', () => {
    expect(descriptor.validate({})).toEqual([])
    expect(descriptor.validate({ outDir: 'dist/app' })).toEqual([])
  })

  it('returns the origin option as the build\'s origin', () => {
    expect(descriptor.origin({ origin: 'http://localhost:4173' })).toBe('http://localhost:4173')
    expect(descriptor.origin({})).toBeUndefined()
  })

  it('accepts an http(s) origin', () => {
    expect(descriptor.validate({ origin: 'http://localhost:4173' })).toEqual([])
  })

  it.each([
    ['a bare host', { origin: 'localhost' }],
    ['an origin with a path', { origin: 'https://a.example/path' }]
  ])('refuses an origin that is not an absolute http(s) origin: %s', (_case, options) => {
    expect(descriptor.validate(options)).toEqual(["origin must be an absolute http(s) origin such as 'https://cms.example.com'"])
  })

  it.each([
    ['an absolute outDir', { outDir: '/abs' }],
    ['an outDir above the project', { outDir: '..' }],
    ['the project root itself', { outDir: '.' }],
    ['an unknown key', { foo: 1 }]
  ])('refuses %s', (_case, options) => {
    expect(descriptor.validate(options)).toHaveLength(1)
  })
})
