---
type: rfc
number: 40
title: Objects read as text are decoded whole, as UTF-8
status: draft
depends: [38]
architecture: [architecture/storage.md]
changes: [STS-6 added]
commit-subject: "fix(core): decode objects read as text whole, as UTF-8 (RFC-0040)"
---

# RFC-0040: Objects read as text are decoded whole, as UTF-8

## Summary

Every text read of the CMS's own state goes through one helper, `streamToString` in
`packages/core/src/lib/script/utils.server.ts`. It collects the object's stream with highland's
`toArray` and resolves `arr.join('')`, which turns each `Buffer` chunk into a string on its own. A
UTF-8 character whose bytes straddle two chunks becomes two or three U+FFFD, and a page edit writes
the damage back into the entry (`storage.md` BF12). This RFC:

1. Specifies that an object read as text is decoded whole (STS-6).
2. Collects the chunks as bytes and decodes them once: `Buffer.concat(...).toString('utf8')`.
3. Drops `highland`, whose only use this was.
4. Adds the regression tests: a split inside a character, a large Slovak document over many chunks,
   any text under any split, and the reads of the storage service, a manifest, a session family and a
   page saved by MCP edits over an adapter that splits every object into 3-byte chunks.

Released as a patch of `@genoacms/core` (0.3.0 to 0.3.1).

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/core/src/lib/script/utils.server.ts` | `streamToString` collects bytes and decodes once; no `highland` |
| `packages/core/src/lib/script/utils.server.test.ts` | new: the unit tests of `streamToString` |
| `packages/core/src/lib/script/storage/storage.server.test.ts` | new: the storage service, a manifest, a session family and MCP page edits over a chunking adapter |
| `packages/core/package.json` | remove `highland` and `@types/highland`; add `fast-check` `^4.10.2` to `devDependencies` |
| `pnpm-lock.yaml` | follows `package.json` |
| `.changeset/utf8-object-reads.md` | new: `'@genoacms/core': patch` |
| `docs/architecture/storage.md` | STS-6 current; BF12 *History.*; History; Verification |
| `docs/README.md` | the statement counts of `storage.md` |

## Specification

### Added

#### STS-6 · Objects read as text are decoded whole

When the CMS reads an object as text, it decodes the object's bytes as one UTF-8 sequence, never chunk
by chunk. This holds for every text read of the storage service (BD1), the internal documents it reads
as text, JSON or flatted, page entries among them, and for the session store and the authorization
manifests. The text is the same however the adapter splits the object's stream into chunks, a split
inside a multibyte character included; a chunk that is a string counts as its UTF-8 bytes. Bytes that
are not valid UTF-8 decode to U+FFFD, and a leading byte order mark is kept as U+FEFF. A stream that
fails fails the read with the stream's error.

- Test: `packages/core/src/lib/script/utils.server.test.ts`, `packages/core/src/lib/script/storage/storage.server.test.ts`
- Level: unit

### Core

`packages/core/src/lib/script/utils.server.ts`, with the signature unchanged:

```ts
const bytesOf = (chunk: string | Buffer): Buffer =>
  typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk

const streamToString = async (stream: NodeJS.ReadableStream): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(bytesOf(chunk))
  return Buffer.concat(chunks).toString('utf8')
}
```

`for await` rejects with the error the stream emits, which keeps the failure behavior of the
highland version for its callers: `loadFamily` treats it as an absent family, `readRawManifest` and
the storage service let it propagate. `readableStreamToReadable` is unchanged. A chunk that is a
`Uint8Array` but not a `Buffer` is accepted by `Buffer.concat` as is.

The other stream-to-text paths were checked and are not affected: the adapters hand back raw
streams; `adapter-gcp`'s secrets, `demo-support`'s bucket, the SDK's verifier client and the memory
storage of the tests decode whole buffers or whole responses (`Buffer#toString`, `Response#text`);
the MCP route reads its body with `Request#text`; the storage browser streams uploads as bytes.

## Non-goals

- Repairing entries already damaged. U+FFFD cannot be decoded back; a damaged page is rebuilt from
  its source (on the central business instance, `Guide-sk` and `Guide-en` from their drafts).
- Streaming decoding (`TextDecoder` with `stream: true`, `string_decoder`). The objects read as text
  are documents the CMS parses whole anyway.
- A size limit on objects read as text.
- Statements for the layout of the session store or the manifests.

## Tests

All at level `unit` (vitest, project `node`).

`packages/core/src/lib/script/utils.server.test.ts`, describe `streamToString`:

| Title | Given / when / then |
| :-- | :-- |
| `STS-6: a character split between two chunks is read whole` | Given the UTF-8 bytes of `používanie` cut between the two bytes of `ž`, as two `Buffer` chunks; when read; then the text is exactly `používanie`. |
| `STS-6: a large Slovak document over many chunks reads back exactly` | Given a JSON document of at least 1 MiB of Slovak text, with `€` (3 bytes) and `😀` (4 bytes), split once into 64 KiB chunks and once into 7-byte chunks; when each is read; then the text equals the serialized document and parses to it, with no U+FFFD. |
| `STS-6: any text split anywhere reads back the same` | Property (fast-check): given any string of Unicode code points and any set of byte offsets into its UTF-8 bytes, split there; when read; then the text equals the string. |
| `STS-6: string chunks count as their UTF-8 bytes` | Given the chunks `'Návod na pou'` (a string), then the bytes of `žívanie` cut inside `ž`, as two `Buffer` chunks; when read; then the text is `Návod na používanie`. |
| `STS-6: invalid bytes decode to U+FFFD and a byte order mark is kept` | Given `EF BB` / `BF 61 FF` as two chunks; when read; then the text is `﻿a�`. |
| `STS-6: a stream that fails fails the read with its error` | Given a stream that yields one chunk and then fails with `Error('boom')`; when read; then the read rejects with that error. |

`packages/core/src/lib/script/storage/storage.server.test.ts`. The storage providers are the memory
providers of `testing/memoryStorage.ts`, except `getObject`, which yields the stored object's UTF-8
bytes in 3-byte `Buffer` chunks; keys and the security policy are the test ones, as in
`mcp/tools/pages.test.ts`. The text used is `Návod na používanie aplikácie — ľščťžýáíéúäôň €😀`.

| Title | Given / when / then |
| :-- | :-- |
| `STS-6: the storage service reads text, JSON and flatted objects whole` | Given the text stored as a plain object, inside a JSON object and inside a flatted object; when read with `getObjectString`, `getObjectJSON`, `getObjectFlatted`, `getInternalObjectStringVersioned`, `getInternalObjectJSONVersioned` and `getInternalObjectFlattedVersioned`; then each returns the text exactly. |
| `STS-6: a manifest is read whole` | Given the text stored at `usersManifestPath`; when read with `readRawManifest`; then its `text` is the text exactly. |
| `STS-6: a session family is read whole` | Given a session started for the identity `{ subject: <the text>, email: 'ľubomír.šťastný@príklad.sk' }`; when its family is loaded with `loadFamily`; then the family carries that subject and email. (`session.server.test.ts` stubs `streamToString`, so this is the session store's only STS-6 test.) |
| `STS-6: a page edited twenty times by MCP keeps its text` | Given a page whose node has the text as its heading; when `set_values` sets the heading to the text followed by ` 1`, ` 2`, … ` 20`, each at the version `get_page` returned; then after each save the stored entry's heading is the text followed by that number, and no stored object contains U+FFFD. |

Every test fails against the code at `a2bd99c` except the failing-stream test, which passes before
and after.

## Steps

1. Commit the architecture change (`storage.md` BF12, STS-6 **New**) and this RFC, separately.
2. Add `fast-check` and write the tests of §Tests, those failing today marked `it.fails`;
   `pnpm --filter @genoacms/core exec vitest run --project node` passes. Commit: `test(core): STS-6 regression tests for objects read as text (RFC-0040)`.
3. Implement §Core and remove `highland` and `@types/highland`; remove the
   `it.fails` markers without changing an assertion; add the changeset. Commit with the
   `commit-subject`.
4. Update `storage.md`: STS-6 current with its tests, BF12 *History.* and fixed, the History, a
   falsification audit as a Verification entry, `verified`; `docs/README.md` counts; this RFC
   `implemented` with its commit. Commit: `docs: STS-6 current (RFC-0040)`.

## Verification

```bash
pnpm --filter @genoacms/core exec vitest run --project node
# all pass
pnpm --filter @genoacms/core run check
# 0 errors
pnpm --filter @genoacms/core run lint
# no errors
node docs/tools/check-docs.mjs docs
# 0 error(s)
```

A falsification audit of STS-6 (WORKFLOW §6.3), by an agent that did not write the code, recorded as
a Verification entry in `storage.md`.

## Critique

**Pros**
- One helper is fixed, and every text read of the CMS's state goes through it: page entries,
  component headers and definitions, publications, manifests, sessions, agents.
- The tests split where real providers do and where memory storage never does, so the class of bug,
  not only the reported case, is covered.
- No new runtime dependency; one is removed.

**Cons & trade-offs**
- The whole object is held twice in memory while it is decoded, as bytes and as text; the old code
  held the chunks and the strings. Objects read as text are documents of at most a few MiB.
- Damaged entries stay damaged. An instance that ran 0.3.0 or earlier may carry U+FFFD in any
  document large enough to span chunks, and nothing finds or reports them.

**Blindspots & missed edge cases**
- The tests simulate chunking in the memory adapter; no test reads a large non-ASCII object through
  a real Cloud Storage or S3 stream. Adding one to `e2e/storage.test.ts` would need credentials (level
  `e2e`, deferred on pull requests).
- A signed document damaged on read fails its verification rather than being saved back damaged:
  under 0.3.0 a large signed manifest with non-ASCII names would have been rejected as tampered. Which
  documents were large enough to be hit, and whether any instance rejected a manifest for this, is
  not known.
- The helper has joined decoded chunks since 2024-02 (`651d5f9`), so every release since then carries
  the bug; only 0.3.0 is known to have damaged a document.
- `streamToString` accepts an object of any size; a huge object read as text exhausts memory, as
  before.
