import { describe, it, expect } from 'vitest'
import descriptor from './descriptor.js'

describe('the secrets-env descriptor', () => {
    it('DST-1: is a development-only secrets adapter naming its runtime', () => {
        expect(descriptor.kind).toBe('secrets')
        expect(descriptor.developmentOnly).toBe(true)
        expect(descriptor.runtime).toBe('@genoacms/adapter-secrets-env/runtime')
    })

    it('DST-1: accepts no options or a path, and refuses anything else', () => {
        expect(descriptor.validate({})).toEqual([])
        expect(descriptor.validate({ path: 'secrets.env' })).toEqual([])
        expect(descriptor.validate({ path: '' })).toHaveLength(1)
        expect(descriptor.validate({ foo: 1 })).toHaveLength(1)
    })
})
