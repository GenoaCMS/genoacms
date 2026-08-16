import { describe, it, expect } from 'vitest'
import {
    assertValidKey,
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
    it.each(roundTrippable)('survives serialize then parse: %j', (value) => {
        expect(parseValue(serializeValue(value))).toBe(value)
    })

    it.each(roundTrippable)('survives a full file write then read: %j', (value) => {
        const content = upsertEntry('', 'SECRET', value)
        expect(parseEntries(content).get('SECRET')).toBe(value)
    })
})

describe('parseValue', () => {
    it('reads an unquoted value', () => {
        expect(parseValue('plain')).toBe('plain')
    })

    it('strips an inline comment from an unquoted value', () => {
        expect(parseValue('plain # a note')).toBe('plain')
    })

    it('keeps a hash that is not an inline comment', () => {
        expect(parseValue('pla#in')).toBe('pla#in')
    })

    it('keeps a hash inside a quoted value', () => {
        expect(parseValue('"pla # in"')).toBe('pla # in')
    })

    it('does not interpret escapes inside single quotes', () => {
        expect(parseValue("'a\\nb'")).toBe('a\\nb')
    })
})

describe('file encodings that silently break naive parsing', () => {
    // An empty parse reads as "no secret configured", which makes a caller generate a fresh key
    // rather than fail. These must never silently yield nothing.
    it('reads a CRLF file', () => {
        expect([...parseEntries('A=1\r\nB=2\r\n')]).toEqual([['A', '1'], ['B', '2']])
    })

    it('reads a CRLF file with quoted values', () => {
        expect(parseEntries('A="x y"\r\n').get('A')).toBe('x y')
    })

    it('reads a lone-CR file', () => {
        expect([...parseEntries('A=1\rB=2\r')]).toEqual([['A', '1'], ['B', '2']])
    })

    it('reads a file with a byte-order mark', () => {
        expect(parseEntries('﻿A=1\n').get('A')).toBe('1')
    })

    it('reads a file with no trailing newline', () => {
        expect(parseEntries('A=1').get('A')).toBe('1')
    })

    it('normalises a CRLF file to LF when rewriting it', () => {
        expect(upsertEntry('A=1\r\n', 'B', '2')).toBe('A=1\nB=2\n')
    })

    it('does not lose an entry when rewriting a CRLF file', () => {
        expect(parseEntries(upsertEntry('A=1\r\n', 'B', '2')).get('A')).toBe('1')
    })
})

describe('parseEntries', () => {
    it('reads several entries', () => {
        const entries = parseEntries('A=1\nB=2\n')
        expect([...entries]).toEqual([['A', '1'], ['B', '2']])
    })

    it('ignores comments and blank lines', () => {
        expect([...parseEntries('# note\n\nA=1\n')]).toEqual([['A', '1']])
    })

    it('accepts the export prefix', () => {
        expect(parseEntries('export A=1\n').get('A')).toBe('1')
    })

    it('lets a later entry win, as a shell would', () => {
        expect(parseEntries('A=1\nA=2\n').get('A')).toBe('2')
    })
})

describe('upsertEntry', () => {
    it('appends a new entry', () => {
        expect(upsertEntry('A=1\n', 'B', '2')).toBe('A=1\nB=2\n')
    })

    it('replaces an existing entry in place, keeping position', () => {
        expect(upsertEntry('A=1\nB=2\n', 'A', '9')).toBe('A=9\nB=2\n')
    })

    it('preserves comments and blank lines around it', () => {
        expect(upsertEntry('# note\n\nA=1\n', 'A', '2')).toBe('# note\n\nA=2\n')
    })

    it('does not duplicate a key written twice', () => {
        const once = upsertEntry('', 'A', '1')
        expect(parseEntries(upsertEntry(once, 'A', '2')).size).toBe(1)
    })

    it('writes into an empty file', () => {
        expect(upsertEntry('', 'A', '1')).toBe('A=1\n')
    })

    it('does not disturb an unrelated entry whose value contains the key name', () => {
        const content = 'OTHER=contains A=1 inside\n'
        expect(upsertEntry(content, 'A', '2')).toBe('OTHER=contains A=1 inside\nA=2\n')
    })
})

describe('removeEntry', () => {
    it('removes the entry and reports that it existed', () => {
        expect(removeEntry('A=1\nB=2\n', 'A')).toEqual({ content: 'B=2\n', existed: true })
    })

    it('reports absence rather than failing', () => {
        expect(removeEntry('B=2\n', 'A')).toEqual({ content: 'B=2\n', existed: false })
    })

    it('leaves comments in place', () => {
        expect(removeEntry('# note\nA=1\n', 'A')).toEqual({ content: '# note\n', existed: true })
    })
})

describe('key validation', () => {
    it.each(['A', 'a', '_a', 'GENOACMS_ROOT_KEY', 'a1'])('accepts %s', (key) => {
        expect(() => assertValidKey(key)).not.toThrow()
    })

    it.each(['', '1a', 'a-b', 'a.b', 'a b', 'a:b', 'küche', 'a/b'])('rejects %j', (key) => {
        // Rejected rather than normalised: folding 'a-b' and 'a_b' together would merge two secrets.
        expect(() => assertValidKey(key)).toThrow(/invalid-secret-key/)
    })

    it('rejects an invalid key on write rather than corrupting the file', () => {
        expect(() => upsertEntry('', 'a-b', '1')).toThrow(/invalid-secret-key/)
    })
})
