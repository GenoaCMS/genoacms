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

  it.each([
    ['an absolute outDir', { outDir: '/abs' }],
    ['an outDir above the project', { outDir: '..' }],
    ['the project root itself', { outDir: '.' }],
    ['an unknown key', { foo: 1 }]
  ])('refuses %s', (_case, options) => {
    expect(descriptor.validate(options)).toHaveLength(1)
  })
})
