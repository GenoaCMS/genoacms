import { describe, it, expect } from 'vitest'
import descriptor from './descriptor.js'

describe('the array authentication descriptor', () => {
    it('names its runtime and decodes credentials as JSON', () => {
        expect(descriptor.kind).toBe('authentication')
        expect(descriptor.runtime).toBe('@genoacms/authentication-adapter-array/runtime')
        expect(descriptor.secretOptions).toEqual({ credentials: 'json' })
    })

    it('requires credentials and refuses unknown keys', () => {
        expect(descriptor.validate({ credentials: { $secret: 'ADMINS' } })).toEqual([])
        expect(descriptor.validate({})).toEqual(['credentials is required'])
        expect(descriptor.validate({ credentials: { $secret: 'ADMINS' }, users: [] })).toEqual(["unknown option 'users'"])
    })
})
