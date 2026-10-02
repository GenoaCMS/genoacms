---
type: architecture
title: GCP authentication: Firestore identity store
codes: [FAUTH]
verified: 7174f7f
---

# GCP authentication: Firestore identity store

Part of the [GCP adapter architecture](README.md). Markers, IDs and test references as defined there.

**Everything in this document is New.** No Firestore identity store exists. No RFC yet: its RFC
depends on the RFC that limits failed sign-ins in core (`identities.md` IU5), and on the
management capability that creates its users (`identities.md` IU6, CQ2).

## Design

### Role

`@genoacms/adapter-gcp/authentication/firestore` is a self-owned identity store
([`identities.md`](../identities.md)) on Firestore. It authenticates CMS users. It is the operator's alternative to Identity Platform
([`authentication-identity-platform.md`](authentication-identity-platform.md)) (GU9). Hashing,
records and sign-in behave as `identities.md` specifies; this document adds only the
Firestore layout, the options and the mapping of Firestore's failures.

### Decisions

**GD9. Firestore holds a self-owned identity store (GU9, `identities.md` IU1).** FAUTH-1 to FAUTH-4.
*Why:* no further GCP service to enable, and the password hashes move to any other store that follows
`identities.md` (IU2).
*Cost:* GenoaCMS holds password hashes on GCP. Whoever reads the identity database, or an export of
it, can guess passwords offline at 32 MiB per guess (`identities.md` ID2). There is no second factor
and no password reset by email, because GenoaCMS sends no email. A user disabled or
deleted here is signed out at the next refresh of their session (`contracts/authentication.md` CD2);
the immediate revocation is removing the user's role assignments.

**GD10. Identities live in their own Firestore database.** FAUTH-1.
*Why:* a GenoaCMS collection is the Firestore collection of the same name (DB-3), so an operator who
defined a collection named after the identities collection would expose it through the CMS. A
database that no `databases` entry names cannot be reached that way. Its IAM can also be granted on
its own.
*Cost:* the adapter cannot check that no `databases` entry names the same database, because adapters
never see the config (`host.md` D3). Firestore's free quota applies only to a project's
`(default)` database, so a second database is billed from its first read, at the same rates. The
operator creates the database once, by hand.

**GD11. A second collection keyed by the email's hash keeps emails unique.** FAUTH-2.
*Why:* Firestore has no unique index, but a document ID is unique and `create` fails when the
document exists. The SHA-256 of the normalized email makes a key of fixed length that is a valid
document ID for any email, including one containing `/`.
*Cost:* every change of email writes three documents, which must be one transaction, and every
sign-in reads two. A write that breaks the pairing makes the identity unable to sign in; FAUTH-2
defines what sign-in then does.

### Findings

None.

### History

None: nothing is implemented yet.

### Verification

**Established from Google's reference documentation, not by experiment:**
- a document ID is at most 1500 bytes, contains no `/`, is not `.` or `..`, and does not match `__.*__`;
- Firestore's free quota applies to the `(default)` database only.

**GS10, for GD9 and `identities.md` ID2: not run yet.** On a deployed function with the platform's
default memory (256 MiB) and core loaded, sign in 20 times in a row at PWH-3's parameters. Expected:
no out-of-memory restart, and the latency of a sign-in. It settles whether 32 MiB per hash fits beside
core on the default memory.

## Specification

**New**, all of it: no RFC yet.

### Descriptor

#### FAUTH-1 · Descriptor

Specifier `@genoacms/adapter-gcp/authentication/firestore`, kind `authentication`. Runtime specifier
`@genoacms/adapter-gcp/authentication/firestore/runtime`. Options: `projectId: string` (required,
COM-3); `databaseId: string` (required, COM-3), the Firestore database that holds the identities and
**SHOULD** be named by no `databases` entry (GD10); `credentials?: Secret<ServiceAccount>` (COM-4).
Other keys are refused (COM-2).

- Test: none yet
- Level: unit
- State: new (no RFC yet)

### Runtime

#### FAUTH-2 · Layout

The identity record (IDS-2) is stored in two collections of the database `databaseId`:

| Collection | Document ID | Fields |
| :-- | :-- | :-- |
| `identities` | the subject | `email` (string, normalized), `passwordHash` (string or null), `disabled` (boolean), `createdAt` and `updatedAt` (timestamps, millisecond precision) |
| `identityEmails` | the lowercase hexadecimal SHA-256 of the normalized email's UTF-8 bytes | `subject` (string) |

Every identity has exactly one `identityEmails` document whose `subject` names it, and every
`identityEmails` document names an identity whose `email` hashes to its ID. An `identityEmails`
document that names no identity, or an identity with another email, is **stale**: sign-in treats the
email as unknown.

- Test: none yet
- Level: unit, contract
- State: new (no RFC yet)

#### FAUTH-3 · Sign-in and lookup

`authenticate` follows IDS-4: it reads the `identityEmails` document of the normalized email, then the
`identities` document it names. `getIdentity` follows IDS-6, reading the `identities` document whose
ID is the subject. The rehash (PWH-5) is a write of `passwordHash` and `updatedAt`
preconditioned on the identity document's update time as read.

- Test: none yet
- Level: unit, contract
- State: new (no RFC yet)

#### FAUTH-4 · Failures

Any Firestore failure throws
`authentication/provider-failed: <code> <message>`, with the gRPC status code and message (IDS-5).

- Test: none yet
- Level: unit, contract
- State: new (no RFC yet)
