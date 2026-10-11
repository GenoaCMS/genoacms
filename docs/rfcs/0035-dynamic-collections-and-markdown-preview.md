---
type: rfc
number: 35
title: Signed dynamic collections by database, and a markdown preview that renders on load
status: draft
commits: []
depends: []
architecture: [architecture/collections.md, architecture/cli.md, architecture/host.md]
changes: [COL-1 breaking, COL-2 breaking, COL-6 added, COL-7 added, CLI-10 breaking, EDT-10 compatible]
commit-subject: "feat(core): signed dynamic collections by database, and the markdown preview on load (RFC-0035)"
---

# RFC-0035: Signed dynamic collections by database, and a markdown preview that renders on load

## Summary

Dynamic collections, defined by files in the default bucket rather than in the configuration, do not
work, are trusted on bucket access alone, and the markdown preview is empty on load:

- **OF17.** Core lists `.genoacms/collections` without the trailing `/` that names a directory to
  the storage abstraction, so Cloud Storage answers with the directory itself and no dynamic
  collection is ever listed (COL-1). `genoa database` lists the same path the same way (CLI-10).
- **OF15.** A collection is routed to a database only by the names the configuration declares, so a
  collection known only from a dynamic definition fails every document operation with
  `database/not-found`. Nothing says which database a dynamic collection is in.
- **OF9, in part.** A dynamic definition with the name of a configured collection replaces it on
  resolution, and the catalog lists the name twice.
- **OF22.** The `name` inside a dynamic definition, not its file name, is the collection that is
  read and written, so a file can point a catalog entry at any other collection, configured ones
  included.
- **OF23, in part.** A missing collections directory is created with a double slash.
- **Unsigned definitions.** Whoever may write the default bucket decides which collections the CMS
  exposes and with which schema, while the authorization manifests and the page tree, which carry
  the same kind of authority, are signed.
- **OF16.** The markdown preview is rendered on the server without DOMPurify, which needs a browser,
  so the server sends it empty, and Svelte does not repair `{@html}` content when it hydrates. The
  preview stays empty until the field is edited (EDT-10).

The author decided on 2026-10-11:

- (OU3, OD12) dynamic collections mirror the configuration's `databases.<key>.collections`. Each
  lives in a directory of the database that serves it, and they only add collections: a collection
  the configuration declares cannot be redefined.
- (OU4, OD13) a dynamic definition is a document signed by core with a subordinate key, bound to its
  database and name. One that does not verify is listed, and refused when it is opened. Core signs
  definitions through an administration screen that a later RFC adds; this one adds only the format
  and its verification.
- Core lists the collections directories and does not create them.

The change:

1. Dynamic definitions move from `.genoacms/collections/<name>` to
   `.genoacms/databases/<database>/collections/<name>`, one directory per database of the
   configuration, listed at process start, all at once, and never created (COL-1). The old
   directory is no longer read.
2. A dynamic definition is a signed envelope of the type `genoacms.collectionDefinition.v1`, whose
   payload names its database and carries the definition (COL-7).
3. A configured collection resolves from the configuration, without reading the bucket. A dynamic
   one resolves from its file when it verifies and names its own database and file name, and fails
   with `collection/unverifiable` when it does not (COL-2).
4. A dynamic collection is served by the database whose directory holds it (COL-6). The host gains
   `databaseNamed`.
5. `genoa database` lists and deletes in the new directories (CLI-10).
6. The markdown preview is rendered once the component is mounted (EDT-10).

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/config/src/host/index.ts` | `Host.databaseNamed` |
| `packages/config/src/host/host.test.ts` | test `16` of §Tests |
| `packages/core/src/lib/script/signing/envelope.ts` | the document type `genoacms.collectionDefinition.v1` |
| `packages/core/src/lib/script/database/providers.server.ts` | adapters by collection and by database, in place of the five operations |
| `packages/core/src/lib/script/database/database.server.ts` | listing, resolution, verification and routing of §Core |
| `packages/core/src/lib/script/database/database.server.test.ts` | new, the COL-1, COL-2, COL-6 and COL-7 unit tests |
| `packages/core/src/lib/script/database/user.server.ts` | its module comment names the new directory |
| `packages/core/src/lib/components/MarkdownViewer.svelte` | the preview after mount |
| `packages/core/e2e/globalSetup.ts`, `packages/core/e2e/server.ts` | the build's secrets file, provided to the tests |
| `packages/core/e2e/signing.ts` | new, `signCollectionDefinition` of §Tests |
| `packages/core/e2e/bucket.ts` | `writeCollectionDefinition (database, name, content)` |
| `packages/core/e2e/collections.test.ts` | the fixtures and tests of §Tests |
| `packages/cli/src/database.js` | the directories of CLI-10 |
| `packages/cli/src/database.test.js` | the CLI-10 test of §Tests, replacing the current one |
| `docs/architecture/host.md` | `databaseNamed` in the `Host` interface |
| `docs/architecture/collections.md` | to current, step 5 |
| `docs/architecture/cli.md` | to current, step 5 |
| `docs/architecture/adapter-gcp/database.md`, `docs/architecture/adapter-aws/database.md` | the directory named in *Role*, step 5 |
| `.changeset/dynamic-collections-by-database.md` | new: `minor` for `@genoacms/core` and `@genoacms/cli`, `patch` for `@genoacms/config` |

## Specification

**COL-1 · Where collections come from** (changed, breaking):

> The catalog is the configured collections, in configuration order across every database
> (`host.collections`), followed by the dynamic collections: one per file in the directory
> `.genoacms/databases/<database>/collections/` of the default bucket, for each database of the
> configuration in key order, named by the file name, in the order the storage lists them, whether
> or not its definition verifies. A name the configuration declares, or that an earlier directory
> already gave, is left out. No other directory is listed, and none is created. The directories are
> listed once, when the server process starts, all at once. Nothing is listed while SvelteKit
> analyses the build.
>
> - Test: `packages/core/src/lib/script/database/database.server.test.ts`, `packages/core/e2e/collections.test.ts`
> - Level: unit, e2e

**COL-2 · Resolving a definition** (changed, breaking):

> A configured collection's name resolves to the first configured definition of that name, and the
> bucket is not read. A dynamic collection's name resolves to the definition in the file it was
> listed from, read and verified each time it is resolved (COL-7). When that file cannot be read or
> does not parse, or the name is neither configured nor dynamic, resolution fails with the error
> `collection/not-found`. When the file parses but is not a verified definition of that database
> and name, resolution fails with an error whose message starts with `collection/unverifiable`.
> When the key registry cannot be read, its error propagates.
>
> - Test: `packages/core/src/lib/script/database/database.server.test.ts`, `packages/core/e2e/collections.test.ts`
> - Level: unit, e2e

**COL-6 · The database of a collection** (added):

> A configured collection is read and written through the provider of the first database, in key
> order, that declares it. A dynamic collection is read and written through the provider of the
> database whose directory it was listed from. Any other name fails the operation with the host
> error `database/not-found`, and no adapter is called.
>
> - Test: `packages/core/src/lib/script/database/database.server.test.ts`, `packages/core/e2e/collections.test.ts`
> - Level: unit, e2e

**COL-7 · A signed dynamic definition** (added):

> The file of a dynamic collection is a signed envelope of the type
> `genoacms.collectionDefinition.v1`, signed by a subordinate key of the key registry, as the
> authorization manifests are:
>
> ```ts
> interface SignedCollectionDefinition {
>   alg: string                 // the subordinate key's algorithm
>   keyId: string
>   type: 'genoacms.collectionDefinition.v1'
>   payload: {
>     database: string          // the key of the database whose directory holds the file
>     definition: CollectionDefinition   // COL-4; its name is the file name
>   }
>   signature: string           // over alg, keyId, type and payload
> }
> ```
>
> A definition verifies when the envelope's signature verifies against a key that the key registry,
> as core last read it, lists and has not revoked (OF27, OF28); the payload has exactly the fields
> `database` and `definition`; `payload.database` is the database of the directory the file is in;
> and `payload.definition` is a JSON object whose `name` is the file name. Nothing else in the
> definition is checked when it is read: whoever signs it checks it against COL-4.
>
> - Test: `packages/core/src/lib/script/database/database.server.test.ts`, `packages/core/e2e/collections.test.ts`
> - Level: unit, e2e

**CLI-10 · database** (changed, breaking):

> Loads the config, opens the default bucket's storage provider through a host, and offers a menu:
> delete a collection, which lists the objects in `.genoacms/databases/<database>/collections/` of
> that bucket for each database of the configuration, in key order, offers each as
> `<database>/<file name>`, and deletes the one chosen; continue, which shows the menu again; and
> exit. The host is closed when the command ends. Adding a collection is offered but does nothing
> (LF7).
>
> - Test: `packages/cli/src/database.test.js`
> - Level: unit

**EDT-10 · Markdown** (changed, compatible):

> A markdown field edits its source in a code editor and shows it rendered beside it, or below it
> when the editor is narrower than 42rem, as soon as the page is interactive.
>
> - Test: `packages/core/e2e/collections.test.ts`
> - Level: e2e

COL-4 is unchanged: a definition stays a `CollectionReference`, and nothing in it names a database.

### The host

`packages/config/src/host/index.ts`, beside `databaseForCollection`:

```ts
interface Host {
  // …
  /** The provider of the database named `database`, a key of `database.databases`. */
  databaseNamed: (database: string) => Promise<DatabaseAdapter>
}

async function databaseNamed (database: string): Promise<DatabaseAdapter> {
  if (!Object.hasOwn(config.database.databases, database)) throw new HostError('database/not-found', database)
  return await construct<DatabaseAdapter>('database', config.database.databases[database].provider)
}
```

It constructs exactly what `database(provider)` constructs for that provider, cached the same way.
`host.md` lists it in its `Host` block, after `databaseForCollection`.

### Core

`envelope.ts` adds `'genoacms.collectionDefinition.v1'` to `DOCUMENT_TYPES`.

`providers.server.ts` keeps `getCollections` and `getDatabaseNames`, and replaces its five
operations with two lookups:

```ts
const adapterForCollection = async (collection: string): Promise<Adapter> => await host.databaseForCollection(collection)
const adapterForDatabase = async (database: string): Promise<Adapter> => await host.databaseNamed(database)
```

`database.server.ts`:

```ts
const COLLECTION_DEFINITION_DOCUMENT: DocumentType = 'genoacms.collectionDefinition.v1'

const collectionsDirectoryOf = (database: string): string => `.genoacms/databases/${database}/collections/`
const definitionPath = (database: string, name: string): string => `${collectionsDirectoryOf(database)}${name}`

const configuredCollections = getCollections()
const isConfigured = (name: string): boolean => configuredCollections.some(collection => collection.name === name)

// COL-1, OD12
async function listDynamicCollections (): Promise<Map<string, string>> {
  const listings = await Promise.all(getDatabaseNames().map(async database => ({
    database,
    contents: await listDirectory({ name: collectionsDirectoryOf(database), bucket: defaultBucketId })
  })))
  const dynamic = new Map<string, string>()
  for (const { database, contents } of listings) {
    for (const file of contents.files) {
      const name = fullyQualifiedNameToFilename(file.name)
      if (!isConfigured(name) && !dynamic.has(name)) dynamic.set(name, database)
    }
  }
  return dynamic
}
// COL-1
const dynamicCollections = building ? new Map<string, string>() : await listDynamicCollections()

function getCollectionReferences (): string[] {
  return [...configuredCollections.map(collection => collection.name), ...dynamicCollections.keys()]
}

// COL-2
async function getCollectionReference (name: string): Promise<CollectionReference> {
  const configured = configuredCollections.find(collection => collection.name === name)
  if (configured !== undefined) return configured
  const database = dynamicCollections.get(name)
  if (database === undefined) throw new Error('collection/not-found')
  return await readDefinition(database, name)
}

async function readDefinition (database: string, name: string): Promise<CollectionReference> {
  const candidate: unknown = await getObjectJSON({ name: definitionPath(database, name), bucket: defaultBucketId })
    .catch(() => { throw new Error('collection/not-found') })
  const verified = await readSignedDocument(candidate, COLLECTION_DEFINITION_DOCUMENT)
  if (!verified.ok) throw unverifiable(name, verified.reason)
  return definitionOf(verified.payload, database, name)
}

const PAYLOAD_FIELDS = ['database', 'definition']

// COL-7, OF22
function definitionOf (payload: JsonValue, database: string, name: string): CollectionReference {
  if (!isJsonObject(payload) || !hasExactly(payload, PAYLOAD_FIELDS)) throw unverifiable(name, 'not a definition payload')
  if (payload.database !== database) throw unverifiable(name, `not signed for the database ${database}`)
  const definition = payload.definition
  if (!isJsonObject(definition) || definition.name !== name) throw unverifiable(name, `not signed for the name ${name}`)
  return definition as unknown as CollectionReference
}

const unverifiable = (name: string, reason: string): Error =>
  new Error(`collection/unverifiable: the definition of '${name}' did not verify (${reason})`)

const isJsonObject = (value: unknown): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasExactly = (object: Record<string, JsonValue>, fields: string[]): boolean =>
  Object.keys(object).length === fields.length && fields.every(field => Object.hasOwn(object, field))

// COL-6
async function adapterOf (collection: string): Promise<Adapter> {
  const database = dynamicCollections.get(collection)
  return database === undefined ? await adapterForCollection(collection) : await adapterForDatabase(database)
}
```

`listDirectory`, `getObjectJSON`, `defaultBucketId` and `fullyQualifiedNameToFilename` come from
`../storage/storage.server`; `readSignedDocument` from `$lib/script/signing/signedDocument.server`,
which resolves the key through the registry and lets a registry that cannot be read throw.

The five operations it exports keep their names and the `Adapter` signatures, and each calls
`adapterOf` with the name of the collection it is given (`reference.name`, or
`reference.collection.name`) before delegating. A name that is neither configured nor dynamic
reaches `host.databaseForCollection`, which rejects with `database/not-found` before constructing
anything.

### The command

`packages/cli/src/database.js`:

```js
const collectionsDirectoryOf = database => `.genoacms/databases/${database}/collections/`

async function listCollections (session) {
  const listings = await Promise.all(session.host.databases.map(async database => ({
    database,
    contents: await session.storage.listDirectory({ name: collectionsDirectoryOf(database), bucket: session.bucket })
  })))
  return listings.flatMap(({ database, contents }) =>
    contents.files.map(({ name }) => ({ value: name, label: `${database}/${fullyQualifiedNameToFilename(name)}` })))
}
```

`selectCollection` offers these options, followed by Exit, as today.

### The preview

`MarkdownViewer.svelte` renders the sanitized HTML only once it is mounted:

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  // … imports and `html` as today
  let isMounted = $state(false)
  onMount(() => { isMounted = true })
</script>

<div class="markdown-body">
  {#if isMounted}{@html html}{/if}
</div>
```

The server sends the empty container; the browser fills it right after hydration. The pages editor,
which uses the same component, gets the same fix.

## Non-goals

- Writing a signed definition: the administration screen that lets a principal define and remove a
  dynamic collection, the permission it is guarded by, and the signing it does, come with a later
  RFC. Until then only the end-to-end harness writes signed definitions.
- Listing the directories more than once per process, or reloading them (the rest of OF9). A
  collection added while the CMS runs stays out of the catalog, and cannot be opened, until the
  process restarts.
- Moving existing files from `.genoacms/collections/`: the CMS is in alpha, and the directory is
  simply no longer read. Unsigned definitions would not verify anyway.
- Creating collections in a database: a dynamic definition reaches a collection that already
  exists, or that the adapter creates on the first write, as Firestore does.
- Validating the schema inside a verified definition.
- The double slash of `listOrCreateDirectory` for the directories that still use it (the rest of
  OF23), listing beyond the first page (OF24), the names adapters hide or invent (OF25), and the
  order of integer-like database keys (OF26).
- The key cache's view of the registry (OF27, OF28), which every signed document shares and a
  signing RFC fixes, and a storage outage read as a missing definition (OF29).
- `genoa database`'s add, cancel and host-closing behaviour (LF7, LF17, LF18).
- `uiSchema` in the `CollectionReference` type (OF6), and the other open findings.

## Tests

- `packages/config/src/host/host.test.ts` (unit) › `16: databaseNamed constructs the provider of the named database, and refuses a name the config lacks`:
  given the manifest of test `10` (`content` and `archive`, both on provider `db`), when
  `databaseNamed('archive')` is awaited, then the adapter's `ctx.name` is `db` and it is the same
  object `database('db')` returns; when `databaseNamed('nowhere')` is awaited, then it rejects with
  `code: 'database/not-found'`, and the database runtime was constructed once in all.
- `packages/core/src/lib/script/database/database.server.test.ts` (unit). Each test imports the
  module afresh (`vi.resetModules`), with:
  - `$app/environment` stubbed (`building: false` unless the test says otherwise);
  - `../storage/storage.server` stubbed by `listDirectory` answering from a map of directory names
    to file names, `getObjectJSON` answering from a map of object names to contents and rejecting
    any other, `defaultBucketId: 'media'`, and the real `fullyQualifiedNameToFilename`;
  - `$lib/script/signing/keyResolution.server` stubbed by `resolveVerificationKey` answering the
    public key of one ML-DSA-65 key generated for the file (the trusted key), `undefined` for any
    other key id, and throwing `registry/unreachable` while a flag is set; and
    `$lib/script/signing/rootKey.server` stubbed, unused;
  - `$lib/script/host.server` stubbed by a host whose `databases` are `['main', 'archive']`, whose
    `collections` are `articles` (in `main`), and whose `databaseForCollection` and
    `databaseNamed` return one recording adapter per database and reject any other name with
    `code: 'database/not-found'`.

  The directories hold: `main`: `legacy`, `articles`; `archive`: `logs`, `legacy`. `signed(database,
  definition, key)` is the real `sign` of `envelope.ts` over `{ database, definition }`.
  - › `COL-1: lists the directory of every database, and catalogs configured names, then each dynamic name once`:
    when the module is imported, then `listDirectory` was called with
    `.genoacms/databases/main/collections/` and `.genoacms/databases/archive/collections/` of
    `media`, and nothing else, and `getCollectionReferences()` is `['articles', 'legacy', 'logs']`,
    although no file was readable.
  - › `COL-1: lists nothing while SvelteKit analyses the build`: given `building: true`, when the
    module is imported, then `listDirectory` was not called and the catalog is `['articles']`.
  - › `COL-2: a configured name resolves to its configuration, without reading the bucket`: when
    `getCollectionReference('articles')` is awaited, then it is the host's `articles` reference and
    `getObjectJSON` was not called, although `main` holds a file of that name.
  - › `COL-2, COL-7: a dynamic name resolves to the definition its file carries, signed for its database and name`:
    given `archive/collections/logs` holding `signed('archive', logs, trusted)`, when
    `getCollectionReference('logs')` is awaited, then it equals `logs`.
  - › `COL-2: an unreadable definition or an unknown name fails with collection/not-found`: when
    `getCollectionReference('legacy')`, whose object is absent, and `getCollectionReference('nowhere')`
    are awaited, then both reject with the message `collection/not-found`.
  - › `COL-2, COL-7: a definition that does not verify fails with collection/unverifiable`: given
    `archive/collections/logs` holding, in turn, the definition `logs` unsigned; `null`; `[1, 2]`;
    `signed('archive', logs, untrusted)` by a second generated key; `signed('archive', logs,
    trusted)` with its payload's `definition.schema` changed after signing; `signed('main', logs,
    trusted)`; `signed('archive', { ...logs, name: 'other' }, trusted)`; `signed('archive', 7,
    trusted)`; the payload `{ database: 'archive', definition: logs, extra: true }` signed by
    `trusted`; and the payload `{ database: 'archive' }` signed by `trusted`, when `getCollectionReference('logs')` is awaited, then it rejects with a message
    starting `collection/unverifiable` each time.
  - › `COL-2: a registry that cannot be read is not a verdict`: given the signed `logs` and the
    registry flag set, when `getCollectionReference('logs')` is awaited, then it rejects with
    `registry/unreachable`.
  - › `COL-6: a configured collection is served by the database that declares it, a dynamic one by the database of its directory`:
    when each of the five operations runs on `articles`, then on `legacy`, then on `logs`, then each
    reaches `main`'s adapter, `main`'s, and `archive`'s in turn, with the reference it was given.
  - › `COL-6: any other name fails with database/not-found, and no adapter is called`: when
    `getCollection` runs on `{ name: 'nowhere' }`, then it rejects with `code: 'database/not-found'`
    and neither adapter recorded a call.
- `packages/cli/src/database.test.js` (unit) › `CLI-10: deletes the chosen collection object of any database from the default bucket, and closes the host`,
  replacing the current CLI-10 test: given the current test's stubs with `host.databases`
  `['main', 'archive']`, and `listDirectory` answering `articles.json` for `main` and
  `logs.json` for `archive`, when `delete` and then `.genoacms/databases/archive/collections/logs.json`
  are chosen, then `listDirectory` was called with each directory of CLI-10 on `media`, the options
  offered are `main/articles.json`, `archive/logs.json`, `Exit`, that object was deleted from
  `media`, and the host was closed once.
- `packages/core/e2e/collections.test.ts` (e2e). `globalSetup` provides the path of the build's
  secrets file (`provide('secretsFile', …)`). `e2e/signing.ts` exports
  `signCollectionDefinition (database, definition)`: it reads the key registry
  `.genoacms/keys/public.json` from the test bucket, takes its current key (`parseKeyRegistry`,
  `currentKey` of `registry.ts`), reads that key's seed `GENOACMS_SUBORDINATE_KEY_SEED_<keyId>`
  through `@genoacms/adapter-secrets-env` from the provided file, derives the key pair with
  `algorithms.ts`, and returns the envelope `sign` of `envelope.ts` makes over
  `{ database, definition }`. Before the tests, the suite:
  1. removes the instance and writes, unsigned, `firestore/test` (a configured name) and
     `nowhere/nowhere-<run>` (a database the configuration lacks);
  2. starts the server, which creates the instance's keys, and stops it;
  3. writes `firestore/dynamic`, signed by `signCollectionDefinition('firestore', …)`, and
     `firestore/unsigned`, the same definition named `unsigned` and not signed;
  4. starts the server again.

  The definition is the one the suite writes today as `test`. The fixtures of the LST-1, EDT and PCK
  tests that use `shadowField`, `hiddenInListing`, `limited` or `gallery` are created in `dynamic`
  instead of `test`, with no assertion changed, and `created` gains `dynamic`. EDT-1's test finds the
  page's heading as the level-1 heading holding the document's id, because the rendered preview
  adds a level-1 heading of its own (`# Rendered heading`), with no assertion changed.
  - › `COL-1: lists the configured collections, then each dynamic one, and no directory of another database`:
    when the administrator opens `/collections`, then the links are `test`, `authors`, `articles`,
    `dynamic`, `unsigned` in that order, and none is `nowhere-<run>`.
  - › `COL-2: a dynamic definition cannot replace a configured collection`, replacing
    `COL-2: a dynamic definition replaces the configured one of its name`: when the administrator
    opens `/collections/test`, then `isA` is shown and `shadowField` is not.
  - › `COL-2, COL-7: a signed dynamic collection resolves to its definition`: when the
    administrator opens `/collections/dynamic`, then `shadowField` is shown.
  - › `COL-2, COL-7: an unsigned dynamic definition is refused with collection/unverifiable`: when
    the administrator opens `/collections/unsigned`, then the response is 500 and the server's
    output contains `collection/unverifiable`.
  - › `COL-6: a dynamic collection is served by the database of its directory`: given a document
    `{ name: '<run> dynamic' }` created through the GCP adapter in the Firestore collection
    `dynamic`, when the administrator opens `/collections/dynamic` and follows its row, then the
    document's page shows `<run> dynamic` in its `name` field.
  - › `EDT-10: shows the markdown rendered as soon as the page is interactive`: given a fresh article
    whose second section is `richText` with the body `# Rendered heading`, when its page is opened
    and has hydrated, with nothing edited, then a heading named `Rendered heading` is visible.

## Steps

1. Baseline: `pnpm --filter @genoacms/core exec vitest run`, `pnpm --filter @genoacms/config test`
   and `pnpm --filter @genoacms/cli test` pass; the collections e2e suite passes (§Verification);
   `node docs/tools/check-docs.mjs docs` reports 0 errors.
2. Tests: write the tests of §Tests, replacing the CLI-10 unit test and the e2e COL-2 test they
   name, and change the e2e fixtures and harness as §Tests says. Mark `it.fails` each test that
   fails before the code, and only those; a test that passes on the current code guards it as it is.
   Commit them.
3. Code: the host, `envelope.ts`, `providers.server.ts`, `database.server.ts`, `user.server.ts`'s
   comment, `MarkdownViewer.svelte`, `database.js`, and the changeset; remove every `it.fails`,
   change no assertion.
4. Run §Verification.
5. Documents to current:
   - `collections.md`: COL-1, COL-2 and EDT-10 take the text of §Specification; COL-6 and COL-7 lose
     their `State:` lines; COL-1 and EDT-10 name their tests; the diagram of *Role* shows
     `.genoacms/databases/<database>/collections/<name>` as signed, and its routing arrow
     `databaseNamed` beside `databaseForCollection`; OF15, OF16, OF17 and OF22 are
     `fixed, RFC-0035`; OF9 keeps only the listing at process start, OF23 only the directories
     other than collections; `verified` moves to the code commit; `docs/README.md`'s rows count the
     statements.
   - `cli.md`: CLI-10 takes the text of §Specification; `verified` moves to the code commit.
   - `adapter-gcp/database.md` and `adapter-aws/database.md`: *Role* names
     `.genoacms/databases/<database>/collections/`. Their decisions and findings are history and
     keep the old path.
   - `host.md`: `databaseNamed` in the `Host` block.

## Verification

```bash
pnpm --filter @genoacms/config test
# all tests pass, test 16 among them
pnpm --filter @genoacms/core exec vitest run
# all tests pass, the nine database.server tests among them
pnpm --filter @genoacms/cli test
# all tests pass, CLI-10 among them
GENOACMS_TEST_GCP=1 pnpm --filter @genoacms/core exec vitest run --mode e2e e2e
# all tests pass, with Application Default Credentials for the e2e project and bucket
node docs/tools/check-docs.mjs docs
# 0 error(s)
```

A falsification audit of COL-1, COL-2, COL-6, COL-7, CLI-10 and EDT-10 (WORKFLOW §6.3), by an agent
that did not write the code, recorded as a Verification entry in `collections.md`.

## Critique

**Pros**
- Dynamic collections do what they were meant for: reaching collections that exist in a database
  but not in the configuration. Where a file lives says which database serves it, in the shape the
  configuration already uses, with no field to forget and no default to guess.
- Bucket access alone no longer decides what the CMS exposes: a definition must carry a signature
  of the instance's own keys, bound to its database and name, so a file cannot be forged, edited,
  renamed or moved to another database's directory and still open.
- A collection is defined in exactly one place: the configuration, or one file. The repeated
  catalog name, the replaced schema and the name inside a file pointing elsewhere (OF22) all go.
- Opening a configured collection no longer reads the bucket, and startup writes nothing: it waits
  for one round of listings, in parallel, usually one.
- COL-1 and EDT-10 become verifiable.

**Cons & trade-offs**
- Until the administration screen arrives, nothing in the product can write a definition that
  verifies: dynamic collections work only for whoever can sign outside it, as the e2e harness does.
- Breaking for every installation with files in `.genoacms/collections/`: they disappear from the
  catalog, and moving them is not enough, because they are unsigned. `@genoacms/core` and
  `@genoacms/cli` need a minor release.
- The catalog lists a name whose definition does not verify, and opening it fails; whoever can write
  the bucket can still add names to the catalog, though not collections that open.
- Each open verifies an ML-DSA-65 signature: a few milliseconds, and a registry read when its cache
  is cold.
- A collection added while the CMS runs can no longer be opened by its URL before a restart; today
  it can. Both the catalog and the URL now wait for the process to start (OF9).
- A configured collection's schema can no longer be adjusted from the bucket without a deploy.
- Revoking a subordinate key makes every definition it signed unverifiable until re-signed; a
  routine rotation does not, because superseded keys still verify.
- The `Host` interface grows, in `@genoacms/config`, whose `host.md` does not conform to the
  workflow yet, so the new method is described there without a statement of its own.
- The preview is not in the server's HTML: it appears a moment after the page, once hydrated.

**Blindspots & missed edge cases**
- Verification trusts the key registry as this process cached it: a key revoked by another
  process keeps verifying here until a restart (OF27), and a listed key can be refused while the
  cache's refresh budget is spent (OF28). Both predate this RFC and hold for every signed document.
- A definition's schema is not checked when it is read; a signed but malformed definition resolves
  and fails later, at the adapter or the validator.
- The signature binds the database and the name, not a version: an older definition core once
  signed can be put back by whoever can write the bucket.
- A storage outage while reading a definition reads as `collection/not-found`, while a registry
  outage propagates (OF29).
- With no key registry yet, resolving a definition would bootstrap one, a write; the instance
  bootstrap at startup normally does it first.
- The document service routes a dynamic collection by its listing, not by a verified definition; it
  is reached only through routes that resolve the definition first (COL-2), which a future caller
  could skip.
- The e2e harness signs by reading the instance's key seed from its secrets file, a path no
  production signer will take; the screen of the later RFC will sign through core instead.
- A file the listing does not reach, such as one nested deeper under `collections/`, is ignored
  without a word.
- A name listed under two databases is served by the first, silently; the second file is never
  read, and nothing tells the operator.
- The trailing `/` is relied on for every storage adapter; only Cloud Storage is exercised by the
  e2e test.
- Two CI runs at once share the e2e bucket's `.genoacms/` (`docs/README.md`), and now also its
  `databases/` directory and its keys.
- The pages editor's markdown preview changes too, with no statement covering it.
