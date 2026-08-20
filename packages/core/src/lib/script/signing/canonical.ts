import canonicalize from 'canonicalize'
import { sha256 } from '@noble/hashes/sha2.js'

/**
 * Deterministic serialization of a payload, and the digest signed over it.
 *
 * A signature is over bytes, but what GenoaCMS wants to attest to is a *value*. JSON does not fix
 * key order, whitespace or number formatting, so two conforming serializers can render one value as
 * two different byte strings — and a consumer that reassembles the JSON differently from the signer
 * would reject a perfectly good signature. RFC 8785 removes that freedom, which is what lets a
 * verifier in another language reach the same digest.
 *
 * Canonicalization itself is delegated to `canonicalize`, written by a co-author of RFC 8785. The
 * required property here is byte-exact agreement with implementations in other languages, and a
 * reference implementation serves that better than a careful local one: a subtle divergence would
 * surface only as a cross-language mismatch, where it is unclear whether the specification or the
 * implementation is at fault.
 */

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

/**
 * Rejects anything RFC 8785 cannot represent, before it reaches the canonicalizer.
 *
 * This exists because the failure it prevents is silent. `canonicalize` drops an `undefined`
 * object member, so `{ a: undefined, b: 1 }` becomes `{"b":1}` — the caller believes it signed a
 * payload with an `a` field and actually signed one without. A signature that attests to something
 * other than what was handed over is worse than no signature, so an unrepresentable value is an
 * error rather than something to normalise away.
 *
 * It is also what the schema requires in practice: a constraint that is unset must be **omitted**, and
 * omitting it has to be a deliberate act rather than an accidental `undefined`.
 */
function assertSignable (value: unknown, path = '$', seen = new Set<object>()): void {
  if (value === null) return

  const type = typeof value
  if (type === 'string' || type === 'boolean') return

  if (type === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`unsignable-payload: ${path} is ${String(value)}, which JSON cannot represent`)
    }
    return
  }

  if (type === 'undefined') {
    throw new Error(
      `unsignable-payload: ${path} is undefined. Omit the key instead — an undefined member is ` +
      'dropped during canonicalization, which would sign a different payload than the one supplied.'
    )
  }

  if (type !== 'object') {
    // Functions, symbols and bigints. `JSON.stringify` treats the first two as absent and throws on
    // the third; neither outcome should be reached by way of a signing call.
    throw new Error(`unsignable-payload: ${path} is a ${type}, which has no JSON representation`)
  }

  const object = value as object
  if (seen.has(object)) throw new Error(`unsignable-payload: ${path} is a circular reference`)
  seen.add(object)

  if (Array.isArray(object)) {
    object.forEach((item, index) => assertSignable(item, `${path}[${index}]`, seen))
  } else if (Object.getPrototypeOf(object) === Object.prototype || Object.getPrototypeOf(object) === null) {
    for (const [key, item] of Object.entries(object)) assertSignable(item, `${path}.${key}`, seen)
  } else {
    // A Date would serialise through `toJSON` to an ISO string, and a Map to `{}`. Both are
    // conversions the caller did not ask for, inside something about to be signed.
    const name = object.constructor?.name ?? 'object'
    throw new Error(`unsignable-payload: ${path} is a ${name}; use a plain object, array or primitive`)
  }

  seen.delete(object)
}

/** The RFC 8785 canonical form. */
function canonicalString (payload: JsonValue): string {
  assertSignable(payload)
  const canonical = canonicalize(payload)
  if (canonical === undefined) {
    // Unreachable via assertSignable, but the canonicalizer's own contract allows it and an
    // undefined slipping into a digest would be far worse than an error here.
    throw new Error('unsignable-payload: canonicalization produced no output')
  }
  return canonical
}

/** The canonical form as UTF-8 bytes — the exact bytes a verifier in any language must reproduce. */
function canonicalBytes (payload: JsonValue): Uint8Array {
  return new TextEncoder().encode(canonicalString(payload))
}

/**
 * The 32-byte SHA-256 digest that is signed.
 *
 * Signing covers the digest rather than the canonical bytes. The lattice and hash-based schemes hash
 * internally too, so this is one more hash than strictly needed — but it is what the specification
 * states, it is unambiguous to reimplement, and its security rests only on SHA-256 collision
 * resistance.
 */
function digest (payload: JsonValue): Uint8Array {
  return sha256(canonicalBytes(payload))
}

export {
  assertSignable,
  canonicalString,
  canonicalBytes,
  digest
}

export type {
  JsonValue,
  JsonPrimitive
}
