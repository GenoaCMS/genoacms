import { describe, it, expect } from 'vitest'
import { assertValidSecretKey } from '@genoacms/contracts/secrets'
import {
    parseEntries,
    parseValue,
    removeEntry,
    serializeValue,
    upsertEntry
} from './envFile.js'

/** Values a signing key store must survive, plus the shapes that break naive .env handling. */
const roundTrippable = [
    'plain',
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE+/x9==',
    'with spaces',
    '',
    ' leading',
    'trailing ',
    'has#hash',
    'has"double"quotes',
    "has'single'quotes",
    'has\\backslash',
    'has=equals',
    'has\nnewline',
    'ends-with-backslash\\',
    // A literal backslash followed by 'n' — chained unescaping turns this into a real newline.
    'literal\\nescape',
    '\\n',
    'literal\\"quote',
    'double\\\\backslash',
    '"already quoted"',
    '#looks-like-a-comment'
]

describe('value round trip', () => {
    it.each(roundTrippable)('DST-7: survives serialize then parse: %j', (value) => {
        expect(parseValue(serializeValue(value))).toBe(value)
    })

    it.each(roundTrippable)('DST-7: survives a full file write then read: %j', (value) => {
        const content = upsertEntry('', 'SECRET', value)
        expect(parseEntries(content).get('SECRET')).toBe(value)
    })
})

describe('parseValue', () => {
    it('DST-7: reads an unquoted value', () => {
        expect(parseValue('plain')).toBe('plain')
    })

    it('DST-7: strips an inline comment from an unquoted value', () => {
        expect(parseValue('plain # a note')).toBe('plain')
    })

    it('DST-7: keeps a hash that is not an inline comment', () => {
        expect(parseValue('pla#in')).toBe('pla#in')
    })

    it('DST-7: keeps a hash inside a quoted value', () => {
        expect(parseValue('"pla # in"')).toBe('pla # in')
    })

    it('DST-7: does not interpret escapes inside single quotes', () => {
        expect(parseValue("'a\\nb'")).toBe('a\\nb')
    })
})

describe('file encodings that silently break naive parsing', () => {
    // An empty parse reads as "no secret configured", which makes a caller generate a fresh key
    // rather than fail. These must never silently yield nothing.
    it('DST-7: reads a CRLF file', () => {
        expect([...parseEntries('A=1\r\nB=2\r\n')]).toEqual([['A', '1'], ['B', '2']])
    })

    it('DST-7: reads a CRLF file with quoted values', () => {
        expect(parseEntries('A="x y"\r\n').get('A')).toBe('x y')
    })

    it('DST-7: reads a lone-CR file', () => {
        expect([...parseEntries('A=1\rB=2\r')]).toEqual([['A', '1'], ['B', '2']])
    })

    it('DST-7: reads a file with a byte-order mark', () => {
        expect(parseEntries('﻿A=1\n').get('A')).toBe('1')
    })

    it('DST-7: reads a file with no trailing newline', () => {
        expect(parseEntries('A=1').get('A')).toBe('1')
    })

    it('DST-7: normalizes a CRLF file to LF when rewriting it', () => {
        expect(upsertEntry('A=1\r\n', 'B', '2')).toBe('A=1\nB=2\n')
    })

    it('DST-7: does not lose an entry when rewriting a CRLF file', () => {
        expect(parseEntries(upsertEntry('A=1\r\n', 'B', '2')).get('A')).toBe('1')
    })
})

describe('parseEntries', () => {
    it('DST-7: reads several entries', () => {
        const entries = parseEntries('A=1\nB=2\n')
        expect([...entries]).toEqual([['A', '1'], ['B', '2']])
    })

    it('DST-7: ignores comments and blank lines', () => {
        expect([...parseEntries('# note\n\nA=1\n')]).toEqual([['A', '1']])
    })

    it('DST-7: accepts the export prefix', () => {
        expect(parseEntries('export A=1\n').get('A')).toBe('1')
    })

    it('DST-7: lets a later entry win, as a shell would', () => {
        expect(parseEntries('A=1\nA=2\n').get('A')).toBe('2')
    })
})

describe('upsertEntry', () => {
    it('DST-7: appends a new entry', () => {
        expect(upsertEntry('A=1\n', 'B', '2')).toBe('A=1\nB=2\n')
    })

    it('DST-7: replaces an existing entry in place, keeping position', () => {
        expect(upsertEntry('A=1\nB=2\n', 'A', '9')).toBe('A=9\nB=2\n')
    })

    it('DST-7: preserves comments and blank lines around it', () => {
        expect(upsertEntry('# note\n\nA=1\n', 'A', '2')).toBe('# note\n\nA=2\n')
    })

    it('DST-7: does not duplicate a key written twice', () => {
        const once = upsertEntry('', 'A', '1')
        expect(parseEntries(upsertEntry(once, 'A', '2')).size).toBe(1)
    })

    it('DST-7: writes into an empty file', () => {
        expect(upsertEntry('', 'A', '1')).toBe('A=1\n')
    })

    it('DST-7: does not disturb an unrelated entry whose value contains the key name', () => {
        const content = 'OTHER=contains A=1 inside\n'
        expect(upsertEntry(content, 'A', '2')).toBe('OTHER=contains A=1 inside\nA=2\n')
    })
})

describe('removeEntry', () => {
    it('DST-7: removes the entry and reports that it existed', () => {
        expect(removeEntry('A=1\nB=2\n', 'A')).toEqual({ content: 'B=2\n', existed: true })
    })

    it('DST-7: reports absence rather than failing', () => {
        expect(removeEntry('B=2\n', 'A')).toEqual({ content: 'B=2\n', existed: false })
    })

    it('DST-7: leaves comments in place', () => {
        expect(removeEntry('# note\nA=1\n', 'A')).toEqual({ content: '# note\n', existed: true })
    })
})

describe('key validation', () => {
    it.each(['A', 'a', '_a', 'GENOACMS_ROOT_KEY', 'a1'])('DST-7: accepts %s', (key) => {
        expect(() => assertValidSecretKey(key)).not.toThrow()
    })

    it.each(['', '1a', 'a-b', 'a.b', 'a b', 'a:b', 'küche', 'a/b'])('DST-7: rejects %j', (key) => {
        // Rejected rather than normalized: folding 'a-b' and 'a_b' together would merge two secrets.
        expect(() => assertValidSecretKey(key)).toThrow(/invalid-secret-key/)
    })

    it('DST-7: rejects an invalid key on write rather than corrupting the file', () => {
        expect(() => upsertEntry('', 'a-b', '1')).toThrow(/invalid-secret-key/)
    })
})
