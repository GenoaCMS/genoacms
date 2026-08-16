/**
 * Reading and writing the subset of `.env` syntax this emulator supports.
 *
 * Parser and serializer are a matched pair and are tested for round-trip agreement. That matters
 * more here than breadth of syntax support: a value that does not survive a write followed by a
 * read is a corrupted secret, and a corrupted signing key fails in a way that looks like tampering
 * rather than like a bug.
 *
 * **Supported:** `KEY=value`, `export KEY=value`, single and double quoted values, `#` comments and
 * blank lines (both preserved on rewrite).
 * **Not supported:** values spanning multiple lines. Nothing GenoaCMS stores needs them — keys and
 * secrets are base64 — and supporting them would make line-oriented rewriting unsound.
 */

const ENTRY_PATTERN = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/

/**
 * Keys are restricted to the portable subset every secret manager accepts. Rejecting is deliberate:
 * normalising `a-b` and `a_b` to one name would silently merge two distinct secrets.
 */
const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * @param {string} key
 */
function assertValidKey (key) {
    if (!KEY_PATTERN.test(key)) {
        throw new Error(`invalid-secret-key: '${key}' must match ${KEY_PATTERN.source}`)
    }
}

/**
 * @param {string} raw
 * @returns {string}
 */
function parseValue (raw) {
    const trimmed = raw.trim()
    if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
        // Single pass, left to right. Chained replaces would re-examine a backslash they had just
        // produced: `\\n` (an escaped backslash followed by the letter n) would unescape to a
        // backslash, which the next pass would then read as the start of `\n` and turn into a
        // newline. A corrupted secret fails looking like tampering rather than like a bug.
        return trimmed.slice(1, -1).replace(/\\(.)/g, (_, character) => character === 'n' ? '\n' : character)
    }
    if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
        return trimmed.slice(1, -1)
    }
    // An unquoted value ends at an inline comment, which must be preceded by whitespace so that a
    // '#' inside a value is not mistaken for one.
    return trimmed.replace(/\s+#.*$/, '').trim()
}

/**
 * @param {string} value
 * @returns {string}
 */
function serializeValue (value) {
    const needsQuoting = value === '' ||
        value !== value.trim() ||
        /["'#\n\\]/.test(value)
    if (!needsQuoting) return value
    const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
    return `"${escaped}"`
}

/**
 * @param {string} line
 * @returns {string | null}
 */
function readEntryKey (line) {
    const match = ENTRY_PATTERN.exec(line)
    return match ? match[1] : null
}

/**
 * @param {string} content
 * @returns {Map<string, string>}
 */
function parseEntries (content) {
    const entries = new Map()
    for (const line of splitLines(content)) {
        const match = ENTRY_PATTERN.exec(line)
        if (match) entries.set(match[1], parseValue(match[2]))
    }
    return entries
}

/**
 * Normalises line endings and strips a leading byte-order mark before splitting.
 *
 * Both matter more than they look. A CRLF file left unnormalised parses as **no entries at all**,
 * because the trailing `\r` defeats the entry pattern — and an empty parse is indistinguishable
 * from "no secret configured", which is the reading that makes a caller generate a fresh key
 * instead of failing. A file authored on Windows would silently fork the trust anchor.
 *
 * Rewriting a file normalises it to LF, which is deliberate.
 *
 * @param {string} content
 * @returns {string[]}
 */
function splitLines (content) {
    const normalized = content
        .replace(/^﻿/, '')
        .replace(/\r\n?/g, '\n')
    if (normalized === '') return []
    return normalized.replace(/\n$/, '').split('\n')
}

/**
 * @param {string[]} lines
 * @returns {string}
 */
function joinLines (lines) {
    if (lines.length === 0) return ''
    return `${lines.join('\n')}\n`
}

/**
 * Replaces the entry in place when present, so surrounding comments and ordering survive a rewrite.
 *
 * @param {string} content
 * @param {string} key
 * @param {string} value
 * @returns {string}
 */
function upsertEntry (content, key, value) {
    assertValidKey(key)
    const entry = `${key}=${serializeValue(value)}`
    const lines = splitLines(content)
    const index = lines.findIndex(line => readEntryKey(line) === key)
    if (index === -1) return joinLines([...lines, entry])
    return joinLines(lines.map((line, position) => position === index ? entry : line))
}

/**
 * @param {string} content
 * @param {string} key
 * @returns {{ content: string, existed: boolean }}
 */
function removeEntry (content, key) {
    assertValidKey(key)
    const lines = splitLines(content)
    const remaining = lines.filter(line => readEntryKey(line) !== key)
    return {
        content: joinLines(remaining),
        existed: remaining.length !== lines.length
    }
}

export {
    assertValidKey,
    parseValue,
    serializeValue,
    parseEntries,
    upsertEntry,
    removeEntry
}
