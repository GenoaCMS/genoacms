---
type: architecture
title: Self-owned identities: stores and password hashing
prefix: I
codes: [PWH, IDS]
verified: 7174f7f
---

# Self-owned identities: stores and password hashing

**Everything in this document is New.** No self-owned identity store exists. No RFC yet.

## Design

### Role

A **self-owned identity store** is an authentication provider that keeps its users itself, instead of
asking a managed service such as Identity Platform. Firestore is the first
([`adapter-gcp/authentication-firestore.md`](adapter-gcp/authentication-firestore.md)). Postgres,
DynamoDB and stores written by third parties follow the same rules.

This document specifies what every such store shares, so that an operator can move users from one
store to another, including one written by someone else, and the users keep their passwords:

- the password hash and its encoding (PWH);
- the identity record every store holds, and sign-in (IDS).

A concrete store specifies its persisted layout, how it keeps emails unique, and its platform's
failures. That layout and this document are what a migration tool reads and writes.

**Relation to [`contracts/authentication.md`](contracts/authentication.md).** That document defines
the authentication contract (AUTHN-2 to AUTHN-4) and how core signs users in across providers. This
document does not change the contract: a self-owned store implements it as IDS-4 and IDS-6 say.
Limiting failed sign-ins is core's, before any provider is called (CF1, CQ1).
Authorization stays core's: a subject that signs in is admitted only if the authorization data knows
it.

### Decisions

| # | Decision | Where |
| :-- | :-- | :-- |
| IU1 | 2026-10-02: GenoaCMS owns identity stores, beside managed providers. Firestore is the first, as `@genoacms/adapter-gcp/authentication/firestore`. This reverses the deferral in `configuration.md` U13, whose content now lives in GU1 and here. | this document; [`adapter-gcp/authentication-firestore.md`](adapter-gcp/authentication-firestore.md) |
| IU2 | 2026-10-02: passwords are hashed with **scrypt**, in an encoding this document fixes, so users move between stores, third-party ones included, with their passwords. | PWH-1 to PWH-6 |
| IU3 | 2026-10-02: the shared specification covers the identity record, not only the hash. | IDS-2 |
| IU4 | 2026-10-02: managing users is not part of this change. The authentication contract gains no management methods until core can use them, and then only as CU1 allows. | CQ2 |
| IU5 | 2026-10-02: a self-owned store is not used in production before core limits failed sign-ins (CF1, CQ1). The RFC of every first-party self-owned store depends on the RFC that implements that limit. | ID5 |

**ID1. The hash is scrypt in a PHC string, its parameters inside it.** PWH-1 to PWH-4, PWH-6.
*Why:* scrypt is in Node's `node:crypto` and in OpenSSL, Go's `x/crypto`, Rust, Java's Bouncy Castle
and .NET libraries, so a store on any stack implements it without a native dependency. GenoaCMS
itself runs the same code on Cloud Run, Lambda and Node. The PHC string format
([P-H-C/phc-string-format](https://github.com/P-H-C/phc-string-format)) is a published encoding, and
carrying the parameters in each string lets the defaults rise later while old hashes still verify.
Fixed test vectors (PWH-6) let an implementer in another language check their output byte for byte.
*Cost:* OWASP's first choice is Argon2id; scrypt is its second. Libraries that print scrypt PHC strings
differ in their base64 alphabet (passlib uses `.` instead of `+`), so a tool's output is not
necessarily accepted as is: PWH-2 is exact. Identity Platform's "modified scrypt" is a different
function, so users moved from Identity Platform into a self-owned store cannot keep their passwords.

**ID2. New hashes use `ln=15, r=8, p=3`: 32 MiB of memory per hash.** PWH-3.
*Why:* OWASP lists it as equivalent to `ln=17, r=8, p=1` (128 MiB) for scrypt. A Cloud Run function
serves one request at a time with 256 MiB by default (`adapter-gcp/deployment.md` GD3), and a Lambda
function may have 128 MiB; 32 MiB leaves the rest to the application. It took 173 ms on the author's
development machine (Node 24, x86-64, measured 2026-10-02).
*Cost:* the parameters protect a stolen hash less than the 128 MiB set does. A raised default reaches
each user only at that user's next sign-in (PWH-5); an identity that never signs in again keeps its
old parameters. A function with less than 32 MiB to spare fails sign-ins with an out-of-memory crash,
not a clean error.

**ID3. Passwords are normalized to NFC only; emails are trimmed, NFC and lowercased.** PWH-1, IDS-1.
*Why:* the same password typed on systems that compose characters differently (macOS input yields
decomposed forms) must produce the same bytes, which is what RFC 8265's OpaqueString profile
prescribes. Emails are a lookup key, and users type them in any case.
*Cost:* lowercasing the whole address merges addresses that differ only in the case of the local
part, which RFC 5321 allows to be different mailboxes. No common mail provider distinguishes them.
Lowercasing is Unicode's default, locale-independent mapping; a store that uses a locale's mapping
(Turkish `I`) finds no user.

**ID4. A new identity's subject is a random UUID; a moved identity keeps its subject.** IDS-2, IDS-3.
*Why:* the subject is the only value authorization binds to (`Identity`). It must survive a change of
email, and it must survive a move between stores, or every role assignment is lost in a migration.
The subject's characters are limited so every store can use it as a key, a Firestore document ID
included.
*Cost:* subjects are unique within a store, not across providers. Two providers of one instance that
receive copies of the same identities hold the same subjects, and authorization cannot tell their
users apart. Subjects
from a source that uses other characters (an array adapter entry with `/`) must be renamed, and their
role assignments with them.

**ID5. Every rejected sign-in costs one hash.** IDS-4.
*Why:* a store that answered an unknown email faster than a wrong password would tell an attacker
which emails exist. It hashes against a fixed dummy hash instead.
*Cost:* anyone can make the function compute a 32 MiB hash per request, with any email. Until core
limits failed sign-ins, nothing bounds that, which is one reason for IU5.

### Findings

None.

### History

None: nothing is implemented yet.

### Verification

**Test vectors (PWH-6), computed 2026-10-02** with Node 24.21 `crypto.scryptSync` and cross-checked
with `openssl kdf … SCRYPT` (OpenSSL 3) for vector A.

**Testing every store with one suite.** `@genoacms/conformance` gains an identity-store suite
([`contracts/conformance.md`](contracts/conformance.md) CONF-5) that checks PWH-1 to PWH-6 and IDS-1 to IDS-6 against any store, given a function that writes identity
records into it through the store's own layout. Each first-party store runs it at `conformance` against a local instance, or at `contract`
against the real service; a third-party store runs the same suite. The parser of PWH-4 and the
normalizations of IDS-1 are tested with property-based tests and fuzzing (`WORKFLOW.md` §6.5).

## Specification

**New**, all of it: no RFC yet.

### Password hashing

#### PWH-1 · Password bytes

The bytes hashed are the password converted to Unicode Normalization Form C, encoded as UTF-8. Nothing else changes: no trimming, no case change. A password whose bytes exceed 1024 is never hashed: sign-in rejects it (IDS-4).

- Test: none yet
- Level: unit, conformance
- State: new (no RFC yet)

#### PWH-2 · Hash string

A password hash is the string

```
$scrypt$ln=<ln>,r=<r>,p=<p>$<salt>$<hash>
```

where `ln`, `r` and `p` are decimal integers without leading zeros, `N = 2^ln`, `salt` and `hash` are
base64 in the standard alphabet of RFC 4648 §4 without `=` padding, and `hash` is
`scrypt(password bytes (PWH-1), salt, N, r, p, dkLen)` as defined by RFC 7914, with `dkLen` the decoded
length of `hash`. The parameters appear in this order, and no other field or parameter is present.

- Test: none yet
- Level: unit, conformance
- State: new (no RFC yet)

#### PWH-3 · New hashes

Every password hash a store writes uses `ln=15`, `r=8`, `p=3`, a salt of 16 bytes from a
cryptographically secure random generator, and a hash of 32 bytes.

- Test: none yet
- Level: unit, conformance
- State: new (no RFC yet)

#### PWH-4 · Verification

A hash string is **valid** when it matches PWH-2 and `10 ≤ ln ≤ 20`, `1 ≤ r ≤ 32`, `1 ≤ p ≤ 16`,
`128 · 2^ln · r ≤ 268435456` (256 MiB), its salt decodes to 8 to 64 bytes and its hash to 16 to 64
bytes. Verifying a password against a valid string computes the hash with the string's own
parameters and compares it with the stored hash in time that does not depend on where they differ.
Verifying against an invalid string throws `identity/invalid-password-hash` and never reports a
match.

- Test: none yet
- Level: unit, conformance
- State: new (no RFC yet)

#### PWH-5 · Rehash on sign-in

After a successful sign-in whose stored hash has parameters, salt length or hash length other than
PWH-3's, the store replaces it with a new hash of the same password (PWH-3), only if the identity has
not changed since it was read. A replacement that fails or is skipped does not change the outcome of
the sign-in.

- Test: none yet
- Level: unit, conformance
- State: new (no RFC yet)

#### PWH-6 · Test vectors

Every implementation reproduces these strings exactly. The salt of each is the 16 bytes `00 01 02 …
0f`.

| # | Password | Hash string |
| :-- | :-- | :-- |
| A | `correct horse battery staple` | `$scrypt$ln=10,r=8,p=1$AAECAwQFBgcICQoLDA0ODw$mp90zEQd5XGhjEv4WArVH4Z0XRSzkGWtJK2S/AXJlRU` |
| B | `pässwörd`, precomposed (`U+00E4`, `U+00F6`) or decomposed (`a U+0308`, `o U+0308`) | `$scrypt$ln=10,r=8,p=1$AAECAwQFBgcICQoLDA0ODw$+klCkubs0ckYiTbZO4MWS3k2LxOt6MCvuou+ZUKyyp4` |
| C | `correct horse battery staple`, at PWH-3's parameters | `$scrypt$ln=15,r=8,p=3$AAECAwQFBgcICQoLDA0ODw$ZwXboEbK+6uo3pibyojgA4zgNULQwM2WqPlWpy+G7mc` |
| D | the empty password | `$scrypt$ln=10,r=8,p=1$AAECAwQFBgcICQoLDA0ODw$aXxV+SdCr+1ofX/yO9ssZIXk0slZ7Pwg0vrrut6MuZw` |

- Test: none yet
- Level: unit, conformance
- State: new (no RFC yet)

### Identities and sign-in

#### IDS-1 · Email normalization

An email is normalized by removing leading and trailing characters with the Unicode `White_Space`
property, converting to Normalization Form C, and applying Unicode's default, locale-independent
lowercase mapping. A store looks emails up, and keeps them unique, only in normalized form.

- Test: none yet
- Level: unit, conformance
- State: new (no RFC yet)

#### IDS-2 · The identity record

```ts
interface IdentityRecord {
  subject: string             // unique in the store; see below
  email: string               // normalized (IDS-1); unique in the store
  passwordHash: string | null // valid (PWH-4); null: the identity cannot sign in
  disabled: boolean           // true: the identity cannot sign in
  createdAt: string           // RFC 3339, UTC, milliseconds: 2026-10-02T09:30:00.000Z
  updatedAt: string           // same format
}
```

A subject is 1 to 128 characters from `A–Z`, `a–z`, `0–9`, `.`, `_`, `:`, `@`, `+` and `-`. It is
not `.` or `..`, and does not both start and end with `__`. A valid email, after normalization, has 3
to 254 characters, exactly one `@` that is neither first nor last, and no whitespace or control
character.

- Test: none yet
- Level: unit, conformance
- State: new (no RFC yet)

#### IDS-3 · New subjects

An identity created in a store gets a random UUID version 4 (RFC 9562) as its subject, in lowercase
hexadecimal with hyphens.

- Test: none yet
- Level: unit, conformance
- State: new (no RFC yet)

#### IDS-4 · Sign-in

```pseudo
authenticate(email, password):
  if bytes(password) > 1024: return { rejected: 'credentials' }    // PWH-1
  record = the identity whose email is normalize(email)            // IDS-1
  if record is absent, or has no passwordHash:
    verify(password, DUMMY)                     // a valid hash at PWH-3's parameters
    return { rejected: 'credentials' }
  if not verify(password, record.passwordHash):                    // PWH-4
    return { rejected: 'credentials' }
  if record.disabled: return { rejected: 'disabled' }              // only after a correct password
  rehash if needed                                                 // PWH-5
  return { subject: record.subject, email: record.email }
```

The returned email is the normalized one. A disabled identity costs one hash like any other, and is
reported as `disabled` only to the holder of its password (AUTHN-2).

- Test: none yet
- Level: unit, conformance
- State: new (no RFC yet)

#### IDS-5 · Store failures

A failure of the underlying store during `authenticate` or `getIdentity` throws `authentication/provider-failed:
<message>`, so an outage is not reported as a rejected credential. `identity/invalid-password-hash`
(PWH-4) propagates unchanged.

- Test: none yet
- Level: unit, conformance
- State: new (no RFC yet)

#### IDS-6 · getIdentity

`getIdentity(subject)` returns `{ subject, email }` of the identity with that subject when it is not
disabled and has a `passwordHash`, and `null` otherwise (AUTHN-4).

- Test: none yet
- Level: unit, conformance
- State: new (no RFC yet)
