---
type: rfc
number: 27
title: Fix the open GCP findings
status: draft
commits: []
depends: [25]
architecture: [architecture/adapter-gcp/README.md, architecture/adapter-gcp/storage.md, architecture/adapter-gcp/secrets.md, architecture/adapter-gcp/deployment.md, architecture/adapter-gcp/database.md]
changes: [STO-9 compatible, STO-11 compatible, STO-12 compatible, DEP-10 compatible, ADP-5 editorial, SEC-8 editorial]
commit-subject: "fix(adapter-gcp, sveltekit-adapter-cloud-run-functions): the open GCP findings"
---

# RFC-0027: Fix the open GCP findings

## Summary

The GCP adapters carry eight open findings, decided together by the author as GU8 (2026-10-01):

1. **`startAfter` is inclusive (GF21).** A listing's next page repeats the object named `startAfter`.
   The runtime drops an object or prefix named exactly `startAfter` (STO-9).
2. **A directory move expands `$` patterns (GF22).** The new name is a replacement string. The runtime
   builds the new name by concatenation (STO-12).
3. **Directory operations are unbounded (GF10).** A delete lists page by page and deletes at most 10
   objects at a time; a move lists first, then moves one object at a time. Both stop at the first
   failure (GD7, STO-11, STO-12).
4. **The framework answers `/favicon.ico` and `/robots.txt` itself (GF20).** The deploy sets
   `IGNORED_ROUTES` to the empty string (GD8, DEP-10).
5. **A dead `static/` middleware (GF23).** The SvelteKit adapter's handler drops it, and ADP-5 drops
   the clause (editorial: it never served anything).
6. **Test gaps (GF24, GF25, GF26)** found by GS6 get the tests that catch them. SEC-8 loses the
   unobservable "sequentially" (editorial).

GF28 needed only DB-3's reason corrected, which the architecture change did. No statement of
`@genoacms/contracts` changes.

## Files

| File | Change |
| :-- | :-- |
| `packages/adapter-gcp/src/storage/runtime.ts` | modify: `listDirectory`, `deleteDirectory`, `moveDirectory` (§Storage) |
| `packages/adapter-gcp/src/deployment/settings.ts` | modify: `environmentVariables` adds `IGNORED_ROUTES: ''` (§Deployment) |
| `packages/sveltekit-adapter-cloud-run-functions/src/handler.js` | modify: drop `serve(path.join(dir, 'static'))` from the chain |
| `packages/adapter-gcp/src/**/*.test.ts` | modify: §Tests, unit and integration |
| `packages/adapter-gcp/test/contract/storage.test.ts`, `deployment.test.ts` | modify: §Tests, contract |
| `packages/sveltekit-adapter-cloud-run-functions/tests/request.test.js` | modify: §Tests, unit |
| `packages/sveltekit-adapter-cloud-run-functions/e2e/adapter.test.js` | modify: §Tests, e2e |
| `packages/sveltekit-adapter-cloud-run-functions/e2e/fixture/static/favicon.ico`, `robots.txt` | create: 4 bytes `ICO\n`, and `User-agent: *\n` |
| `/.changeset/<name>.md` | create: `@genoacms/adapter-gcp` and `@genoacms/sveltekit-adapter-cloud-run-functions` patch |

## Specification

STO-9, STO-11, STO-12, DEP-10, ADP-5 and SEC-8 change as the architecture documents now state them.
No statement is added or removed.

### Storage

```ts
// listDirectory: startAfter as startOffset; maxResults is limit, or limit + 1 when startAfter is given
const skipped = (itemName: string): boolean => itemName === name || itemName === listingParams?.startAfter
// files: drop placeholders, then skipped(file.name); directories: drop skipped(prefix);
// then, with a limit, keep the first `limit` of files and directories together, comparing names
// by their UTF-8 bytes (Buffer.compare), as GCS orders them

// deleteDirectory (GF29): one page at a time, at most DELETE_CONCURRENCY = 10 deletes in flight
let query: GetFilesOptions | undefined = { prefix: name, autoPaginate: false }
while (query !== undefined) {
  const [files, nextQuery] = await bucket.getFiles(query)
  await deleteAtMost(DELETE_CONCURRENCY, files)   // no delete starts after a failure; awaits the started ones; throws the first error
  query = nextQuery ?? undefined
}

// moveDirectory
const [files] = await bucket.getFiles({ prefix: name })   // autoPaginate (the default): every page, no delimiter
for (const file of files) await file.move(newName + file.name.slice(name.length))
```

`deleteAtMost(limit, files)` runs `limit` workers that take the next file from a shared index and
`delete()` it; a worker stops when the files run out or any delete has failed. It awaits every
worker and then throws the first error, unchanged. The client library's `deleteFiles` is not used:
it keeps queued deletes running after a failure, and can leave the error unhandled (GF29).

### Deployment

`environmentVariables(settings)` returns `{ NODE_ENV: 'production', IGNORED_ROUTES: '', ...ORIGIN,
...XFF_DEPTH }`, in that order. The SvelteKit adapter's chain becomes `client`, prerendered, `ssr`.

## Non-goals

- Atomic directory operations, or resuming a failed one (GD7's cost).
- Declaring `@google-cloud/functions-framework` in the runtime `package.json` so the deployed version is pinned (`configuration.md` D6); GS7 checks the buildpack's version by hand.
- GF9 (`getCollection` reads a whole collection): the contract has no paging.
- GS3 and GS5, the other live checks.

## Tests

Titles carry the statement IDs. Each given / when / then names what the test asserts.

### Storage (`packages/adapter-gcp/src/storage/runtime.test.ts`, unit)

- `STO-9: does not list the object or prefix named startAfter`: given `getFiles` resolving files `p/2`, `p/3` and prefixes `p/2/`, `p/4/` with `startAfter: 'p/2'`, then `files` is `p/3` only; with `startAfter: 'p/2/'`, then `directories` is `p/4/` only and `files` holds both. `startOffset` is `startAfter`.
- `STO-9: hides only names that end in .folderPlaceholder`: given `a.folderPlaceholder.txt` and `d/.folderPlaceholder`, then only the first is listed (GF24).
- `STO-11: lists page by page and deletes at most 10 at a time`: given two pages of 15 and 3 objects with deletes that resolve only when released, then `getFiles` was called with `{ prefix: name, autoPaginate: false }` and then the page's next query, never more than 10 deletes were pending at once, the second page was listed only after the first page's deletes ended, and every object was deleted. It replaces the test of `deleteFiles` (GF29).
- `STO-11: starts no delete after the first failure, and rejects with it once the started ones end`: given one page of 30 objects whose third delete rejects, then no delete starts after the rejection, the rejection waits for the deletes already started, it is that error object, and no further page is listed.
- `STO-11: rejects with a listing error`: given `getFiles` rejects, then that error object and no delete.
- `STO-11: rejects with the first failed delete's error, not a later one`: given two deletes of one page that reject with different errors, the first rejecting first, then the first error object (GS9).
- `STO-11: rejects with a later page's listing error`: given the second `getFiles` rejects, then that error object (GS9).
- `STO-11: lists a short page's successor only after its deletes end`: given pages of 3 and 10 objects, then the second listing starts after the three deletes ended, and never more than 10 deletes are pending (GS9).
- `STO-11: goes on past an empty page that has a next page`: given pages of 0 (with a next query) and 2 objects, then both objects are deleted (GS9).
- `STO-9: keeps the first limit entries in UTF-8 byte order`: given `limit: 2`, no `startAfter`, and the entries `p/b`, `p/\u{1F600}`, `p/\u{FFFD}` returned in that order, then `p/b` and `p/\u{FFFD}` are kept (GS9).
- `STO-9: lists nothing with limit 0` (GS9).
- `STO-9: does not count startAfter toward limit`: given `limit: 2` and `startAfter: 'p/1'`, then `maxResults` is 3, and `getFiles` resolving `p/1`, `p/2`, `p/3` lists `p/2`, `p/3`; given `p/2`, `p/3`, `p/4` (the object `p/1` gone), then `p/2`, `p/3`; given the file `p/2` and the prefixes `p/1/`, `p/3/`, then `directories` `p/1/` and `files` `p/2` (files and directories count together, by name). Without `startAfter`, `maxResults` is `limit`.
- `STO-9: hides a name only when it ends in .folderPlaceholder`: also `d/.folderPlaceholder.txt` is listed (GF30).
- `STO-12: lists every page of the prefix, placeholders included, without a delimiter`: then `getFiles` was called with exactly `{ prefix: name }`, and `d/.folderPlaceholder` moved too (GF30).
- `STO-12: moves into its own subtree once`: given `d/a` moved to `d/x/`, then exactly one move, to `d/x/a` (GF30).
- `STO-12: moves one object at a time in listing order, to the literal new name`: given `d/a`, `d/b/c` and `newName` `n$&/`, then `move('n$&/a')` and then `move('n$&/b/c')`, the second starting only after the first resolved.
- `STO-12: stops at the first failed move`: given the first move rejects, then that error object and the second object was not moved.
- `STO-12: replaces only the leading name`: given `d/` moved to `x/` and an object `d/d/y`, then `x/d/y`.
- `STO-6: ifAbsent wins over ifVersion, and only 412 maps to PreconditionFailedError`: given both options, then `ifGenerationMatch: 0`; given a 500 on a conditional write, then that error object (GF24).
- `STO-7: deleteObject propagates its errors` (GF24).
- `COM-3: refuses a projectId that is not a string` in `descriptor.test.ts`: given `projectId: 5`, then `projectId is required and must be a non-empty string` (GF24).

`packages/adapter-gcp/src/storage/urls.test.ts`: `STO-8: signs for read, not write`: the URL is signed with action `read` (GF24).

### Secrets (`packages/adapter-gcp/src/secrets/runtime.test.ts`, unit; GF25)

- `SEC-3: an empty payload reads as the empty string`: given a payload of zero bytes, then `''`.
- `SEC-4: other failures propagate as the same error object`: given a failure with code 7, then `rejects.toBe(failure)`.
- `SEC-5: propagates an error of the existence check, and any createSecret error but ALREADY_EXISTS`.
- `SEC-6: propagates every createSecret error but ALREADY_EXISTS`.
- `SEC-8: keeps a version numbered 0 or not a number`: given lower numbers listed before `0` and `x`, then only the positive lower numbers are destroyed; an unnumbered name ends the cleanup as SEC-9 says.

### Deployment (`packages/adapter-gcp/src/deployment/*.test.ts`, unit; GF20, GF26)

- `DEP-10: sets IGNORED_ROUTES to the empty string`: then `environmentVariables` is exactly `{ NODE_ENV: 'production', IGNORED_ROUTES: '' }` without settings, plus `ORIGIN` and `XFF_DEPTH` when set; existing DEP-10 and DEP-14 assertions of the exact environment gain `IGNORED_ROUTES: ''`.
- `DEP-8: uploads to the location with the zip content type, and requires a storage source`: then `generateUploadUrl` with `parent: 'projects/<p>/locations/<r>'` and `PUT` with `Content-Type: application/zip`; given no `storageSource`, then `Upload URL not found`.
- `DEP-10: sends no update mask and no unset setting`.
- `DEP-10: the request carries exactly the environment of DEP-10 and DEP-14` in `procedure.test.ts`: `toEqual`, not `objectContaining` (GF30).
- `DEP-11: keeps the operation's error as cause`.
- `DEP-12: prefers url over serviceConfig.uri, falls back to it, and prints nothing without either`.

### SvelteKit adapter (`packages/sveltekit-adapter-cloud-run-functions`; GF23, GF26)

`tests/request.test.js` (unit):
- `ADP-5: joins header arrays with a comma`.
- `ADP-6: drops empty X-Forwarded-For entries`.
- `ADP-7: reads XFF_DEPTH under envPrefix`.

`e2e/adapter.test.js` (e2e):
- `DEP-10, ADP-5: with IGNORED_ROUTES empty, serves /favicon.ico and /robots.txt through the handler`: the framework started with `IGNORED_ROUTES=''`, then both answer 200 with the fixture's bytes; without the variable, both answer 404 (GF20).
- `ADP-5: keeps the query string on a 308, and marks only immutable assets immutable`.
- `ADP-5: serves the .gz variant to a client that accepts only gzip` (GF30).
- `ADP-5: does not mark a 304 of an immutable asset immutable`: a conditional request with the asset's ETag answers 304 without `cache-control: immutable` (GF30).
- `ADP-5: serves a prerendered page whose path is percent-encoded` (GF30): the fixture gains a prerendered route with a space in its name.
- `ADP-5: joins header arrays with a comma in the request the app sees`: Node joins most repeated request headers itself, with `, `, and keeps only `set-cookie` as an array; a request with two `Set-Cookie` lines reaches the app as one value joined with `,` (GF30).
- `ADP-1, ADP-2: defaults out, precompress and envPrefix, empties out, and honors base`.
- `ADP-3: keeps deep imports external, and writes sourcemaps and chunks/`.
- `ADP-4: installs the shims and initializes with process.env`.
- `ADP-5: answers 400 for a URL that cannot be parsed`.
- `ADP-6: passes the request as platform.req`.

### Contract (`packages/adapter-gcp/test/contract/`)

- `storage.test.ts` › `STO-9: pages a listing with limit and startAfter`: the existing test loses its `it.fails` marker.
- `storage.test.ts` › `STO-11, STO-12: deletes and moves a directory of 25 objects`: given 25 objects under one prefix, then the move leaves all 25 under the new prefix and none under the old, and the delete leaves none.
- `storage.test.ts` › `STO-12: moves into a name with $ patterns literally`: `d/x` moved to `n$&/` is `n$&/x`.
- `deployment.test.ts` › the existing create test also asserts `environmentVariables` holds `IGNORED_ROUTES: ''` (DEP-10: the platform keeps an empty value).

## Steps

1. The architecture change (done) and this RFC.
2. Tests, written from the Specification and this RFC by an agent session that has not seen the code, each one the code does not meet yet marked `it.fails`. One commit.
3. The code: storage, deployment, SvelteKit adapter, each removing its markers and changing no assertion. One commit each.
4. Run §Verification, including the GCP contract tests with the author's key.
5. A falsification audit of STO-9, STO-11, STO-12 and DEP-10 by an agent that wrote none of it. The first, at `63891bd`, found GF29 and GF30, which this RFC now covers.
6. The architecture documents updated to current: GF10 and GF20 to GF26 fixed, GD7 and GD8 current, `verified` updated; this RFC implemented.

## Verification

```bash
pnpm -r --no-bail --filter '!@genoacms/core' run build
node scripts/test-level.mjs unit
node scripts/test-level.mjs integration
node scripts/test-level.mjs e2e
GOOGLE_APPLICATION_CREDENTIALS=<key path> GENOACMS_TEST_GCP=1 GENOACMS_TEST_GCP_PROJECT=genoacms \
  GENOACMS_TEST_GCP_BUCKET=genoacms GENOACMS_TEST_GCP_REGION=europe-west3 node scripts/test-level.mjs contract
node docs/tools/check-results.mjs docs unit=… integration=… conformance=… contract=… e2e=…   # 0 errors
node docs/tools/check-docs.mjs docs
```

## Critique

**Pros**
- Every open GCP finding but GF9 closes, and the two adapters behave alike on directories.
- A failed directory operation stops, and its error names the failing object, instead of every other request running on.
- A GenoaCMS instance on GCP serves its own favicon and `robots.txt`.

**Cons & trade-offs**
- A directory move is now one request at a time and slow for large directories; a delete is bounded at 10 in flight.
- The runtime keeps its own small delete limiter instead of the client library's `deleteFiles` (GF29).
- Every `/favicon.ico` and `/robots.txt` request now invokes the function.
- One RFC with eight findings is a longer review than eight small ones.

**Blindspots & missed edge cases**
- A move's listing is taken before the first move; objects written under the prefix meanwhile stay behind.
- A page can still hold fewer than `limit` items: placeholders and the object named `name` use slots GCS counts. A caller that treats a short page as the last one stops early. Core passes no `startAfter`.
- The deployed framework version is the buildpack's, so GD8 rests on GS7 until it is run.
