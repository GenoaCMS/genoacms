---
type: rfc
number: 35
title: Dynamic collections by database, and a markdown preview that renders on load
status: draft
commits: []
depends: []
architecture: [architecture/collections.md, architecture/cli.md, architecture/host.md]
changes: [COL-1 breaking, COL-2 breaking, COL-6 added, CLI-10 breaking, EDT-10 compatible]
commit-subject: "feat(core): dynamic collections by database, and the markdown preview on load (RFC-0035)"
---

# RFC-0035: Dynamic collections by database, and a markdown preview that renders on load

## Summary

Dynamic collections, defined by files in the default bucket rather than in the configuration, do not
work, and the markdown preview is empty on load:

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
- **OF16.** The markdown preview is rendered on the server without DOMPurify, which needs a browser,
  so the server sends it empty, and Svelte does not repair `{@html}` content when it hydrates. The
  preview stays empty until the field is edited (EDT-10).

The author decided on 2026-10-11 (OU3, OD12): dynamic collections mirror the configuration's
`databases.<key>.collections`. Each lives in a directory of the database that serves it, and they
only add collections: a collection the configuration declares cannot be redefined.

The change:

1. Dynamic definitions move from `.genoacms/collections/<name>` to
   `.genoacms/databases/<database>/collections/<name>`, one directory per database of the
   configuration, listed at process start, all at once (COL-1). The old directory is no longer read.
2. A configured collection resolves from the configuration, without reading the bucket. A dynamic
   one resolves from its file, under the file's name (COL-2).
3. A dynamic collection is served by the database whose directory holds it (COL-6). The host gains
   `databaseNamed`.
4. `genoa database` lists and deletes in the new directories (CLI-10).
5. The markdown preview is rendered once the component is mounted (EDT-10).

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/config/src/host/index.ts` | `Host.databaseNamed` |
| `packages/config/src/host/host.test.ts` | test `16` of §Tests |
| `packages/core/src/lib/script/database/providers.server.ts` | adapters by collection and by database, in place of the five operations |
| `packages/core/src/lib/script/database/database.server.ts` | listing, resolution and routing of §Core |
| `packages/core/src/lib/script/database/database.server.test.ts` | new, the COL-1, COL-2 and COL-6 unit tests |
| `packages/core/src/lib/script/database/user.server.ts` | its module comment names the new directory |
| `packages/core/src/lib/components/MarkdownViewer.svelte` | the preview after mount |
| `packages/core/e2e/bucket.ts` | `writeCollectionDefinition (database, definition)` |
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
> configuration in key order, named by the file name, in the order the storage lists them. A name
> the configuration declares, or that an earlier directory already gave, is left out. No other
> directory is listed. The directories are listed once, when the server process starts, all at
> once, and each is created when missing. Nothing is listed or created while SvelteKit analyses the
> build.
>
> - Test: `packages/core/src/lib/script/database/database.server.test.ts`, `packages/core/e2e/collections.test.ts`
> - Level: unit, e2e

**COL-2 · Resolving a definition** (changed, breaking):

> A configured collection's name resolves to the first configured definition of that name, and the
> bucket is not read. A dynamic collection's name resolves to the JSON object stored in the file it
> was listed from, read each time it is resolved, with `name` set to the file name. When that object
> cannot be read or parsed, or the name is neither configured nor dynamic, resolution fails with the
> error `collection/not-found`.
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
> when the editor is narrower than 42rem, from the moment the page is shown.
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

`providers.server.ts` keeps `getCollections` and `getDatabaseNames`, and replaces its five
operations with two lookups:

```ts
const adapterForCollection = async (collection: string): Promise<Adapter> => await host.databaseForCollection(collection)
const adapterForDatabase = async (database: string): Promise<Adapter> => await host.databaseNamed(database)
```

`database.server.ts`:

```ts
const collectionsDirectoryOf = (database: string): string => `.genoacms/databases/${database}/collections/`
const definitionPath = (database: string, name: string): string => `${collectionsDirectoryOf(database)}${name}`

const configuredCollections = getCollections()
const isConfigured = (name: string): boolean => configuredCollections.some(collection => collection.name === name)

/** Each dynamic collection's name, mapped to the database whose directory holds it. COL-1 */
async function listDynamicCollections (): Promise<Map<string, string>> {
  const listings = await Promise.all(getDatabaseNames().map(async database => ({
    database,
    contents: await listOrCreateDirectory({ name: collectionsDirectoryOf(database), bucket: defaultBucketId })
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
const dynamicCollections = building ? new Map<string, string>() : await listDynamicCollections()

function getCollectionReferences (): string[] {
  return [...configuredCollections.map(collection => collection.name), ...dynamicCollections.keys()]
}

async function getCollectionReference (name: string): Promise<CollectionReference> {
  const configured = configuredCollections.find(collection => collection.name === name)
  if (configured !== undefined) return configured
  const database = dynamicCollections.get(name)
  if (database === undefined) throw new Error('collection/not-found')
  return { ...await readDefinition(database, name), name }
}

async function readDefinition (database: string, name: string): Promise<CollectionReference> {
  try {
    return await getObjectJSON({ name: definitionPath(database, name), bucket: defaultBucketId })
  } catch {
    throw new Error('collection/not-found')
  }
}

/** COL-6 */
async function adapterOf (collection: string): Promise<Adapter> {
  const database = dynamicCollections.get(collection)
  return database === undefined ? await adapterForCollection(collection) : await adapterForDatabase(database)
}
```

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

- Listing the directories more than once per process, or reloading them (the rest of OF9). A
  collection added while the CMS runs stays out of the catalog, and cannot be opened, until the
  process restarts.
- Moving existing files from `.genoacms/collections/`: the CMS is in alpha, and the directory is
  simply no longer read.
- Creating collections: a dynamic definition reaches a collection that already exists in its
  database, or that the adapter creates on the first write, as Firestore does.
- Who may write `.genoacms/databases/`: it is part of the default bucket, governed by the storage
  permissions as today.
- Validating a definition read from the bucket.
- Adding a collection with `genoa database` (LF7).
- `uiSchema` in the `CollectionReference` type (OF6), and the other open findings.

## Tests

- `packages/config/src/host/host.test.ts` (unit) › `16: databaseNamed constructs the provider of the named database, and refuses a name the config lacks`:
  given the manifest of test `10` (`content` and `archive`, both on provider `db`), when
  `databaseNamed('archive')` is awaited, then the adapter's `ctx.name` is `db` and it is the same
  object `database('db')` returns; when `databaseNamed('nowhere')` is awaited, then it rejects with
  `code: 'database/not-found'` and the runtime's `create` was called once in all.
- `packages/core/src/lib/script/database/database.server.test.ts` (unit). Each test imports the
  module afresh (`vi.resetModules`), with `$app/environment` stubbed (`building: false` unless the
  test says otherwise), `../storage/storage.server` stubbed by `listOrCreateDirectory` answering
  from a map of directory names to file names, `getObjectJSON` answering from a map of object names
  to definitions and rejecting any other, `defaultBucketId: 'media'` and the real
  `fullyQualifiedNameToFilename`, and `$lib/script/host.server` stubbed by a host whose `databases`
  are `['main', 'archive']`, whose `collections` are `articles` (in `main`), and whose
  `databaseForCollection` and `databaseNamed` return one recording adapter per database and reject
  any other name with `code: 'database/not-found'`. The directories hold: `main`: `legacy`,
  `articles`; `archive`: `logs`, `legacy`.
  - › `COL-1: lists the directory of every database, and catalogs configured names, then each dynamic name once`:
    when the module is imported, then `listOrCreateDirectory` was called with
    `.genoacms/databases/main/collections/` and `.genoacms/databases/archive/collections/` of
    `media`, and nothing else, and `getCollectionReferences()` is
    `['articles', 'legacy', 'logs']`.
  - › `COL-1: lists nothing while SvelteKit analyses the build`: given `building: true`, when the
    module is imported, then `listOrCreateDirectory` was not called and the catalog is
    `['articles']`.
  - › `COL-2: a configured name resolves to its configuration, without reading the bucket`: when
    `getCollectionReference('articles')` is awaited, then it is the host's `articles` reference and
    `getObjectJSON` was not called, although `main` holds a file of that name.
  - › `COL-2: a dynamic name resolves to its file, under the file's name`: given the object
    `.genoacms/databases/archive/collections/logs` holding a definition named `other`, when
    `getCollectionReference('logs')` is awaited, then it equals that definition with `name: 'logs'`.
  - › `COL-2: an unreadable definition or an unknown name fails with collection/not-found`: when
    `getCollectionReference('legacy')`, whose object is absent, and `getCollectionReference('nowhere')`
    are awaited, then both reject with the message `collection/not-found`.
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
- `packages/core/e2e/collections.test.ts` (e2e). Before the server starts, the suite writes through
  `writeCollectionDefinition`, under `firestore`: `test`, the definition the suite writes today,
  now with the name of a configured collection that it can no longer replace; and `dynamic`, the
  same definition named `dynamic`. Under `nowhere`, a database the configuration lacks, it writes
  `nowhere-<run>`. The fixtures of the LST-1, EDT and PCK tests that use `shadowField`,
  `hiddenInListing`, `limited` or `gallery` are created in `dynamic` instead of `test`, with no
  assertion changed, and `created` gains `dynamic`:
  - › `COL-1: lists the configured collections, then each dynamic one, and no directory of another database`:
    when the administrator opens `/collections`, then the links are `test`, `authors`, `articles`,
    `dynamic` in that order, and none is `nowhere-<run>`.
  - › `COL-2: a dynamic definition cannot replace a configured collection`, replacing
    `COL-2: a dynamic definition replaces the configured one of its name`: when the administrator
    opens `/collections/test`, then `isA` is shown and `shadowField` is not.
  - › `COL-2: a dynamic collection resolves to its definition`: when the administrator opens
    `/collections/dynamic`, then `shadowField` is shown.
  - › `COL-6: a dynamic collection is served by the database of its directory`: given a document
    `{ name: '<run> dynamic' }` created through the GCP adapter in the Firestore collection
    `dynamic`, when the administrator opens `/collections/dynamic` and follows its row, then the
    document's page shows `<run> dynamic` in its `name` field.
  - › `EDT-10: shows the markdown rendered as soon as the page is shown`: given a fresh article whose
    second section is `richText` with the body `# Rendered heading`, when its page is opened and has
    hydrated, with nothing edited, then a heading named `Rendered heading` is visible.

## Steps

1. Baseline: `pnpm --filter @genoacms/core exec vitest run`, `pnpm --filter @genoacms/config test`
   and `pnpm --filter @genoacms/cli test` pass; the collections e2e suite passes (§Verification);
   `node docs/tools/check-docs.mjs docs` reports 0 errors.
2. Tests: write the tests of §Tests marked `it.fails`, replacing the CLI-10 unit test and the e2e
   COL-2 test they name, and change the e2e fixtures as §Tests says. Commit them.
3. Code: the host, `providers.server.ts`, `database.server.ts`, `user.server.ts`'s comment,
   `MarkdownViewer.svelte`, `bucket.ts`, `database.js`, and the changeset; remove every `it.fails`,
   change no assertion.
4. Run §Verification.
5. Documents to current:
   - `collections.md`: COL-1, COL-2 and EDT-10 take the text of §Specification; COL-6 loses its
     `State:` line; COL-1 and EDT-10 name their tests; the diagram of *Role* shows
     `.genoacms/databases/<database>/collections/<name>`, and its routing arrow `databaseNamed`
     beside `databaseForCollection`; OF15, OF16, OF17 and OF22 are `fixed, RFC-0035`; OF9 keeps only
     the listing at process start; `verified` moves to the code commit; `docs/README.md`'s rows say
     35 statements, all naming a test.
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
# all tests pass, the seven database.server tests among them
pnpm --filter @genoacms/cli test
# all tests pass, CLI-10 among them
GENOACMS_TEST_GCP=1 pnpm --filter @genoacms/core exec vitest run --mode e2e e2e
# all tests pass, with Application Default Credentials for the e2e project and bucket
node docs/tools/check-docs.mjs docs
# 0 error(s)
```

A falsification audit of COL-1, COL-2, COL-6, CLI-10 and EDT-10 (WORKFLOW §6.3), by an agent that
did not write the code, recorded as a Verification entry in `collections.md`.

## Critique

**Pros**
- Dynamic collections do what they were meant for: reaching collections that exist in a database
  but not in the configuration. Where a file lives says which database serves it, in the shape the
  configuration already uses, with no field to forget and no default to guess.
- A collection is defined in exactly one place: the configuration, or one file. The repeated
  catalog name, the replaced schema and the name inside a file pointing elsewhere (OF22) all go.
- Opening a configured collection no longer reads the bucket; today every open of one first
  fetches a file that is not there.
- Startup still waits for one round trip: the directories are listed in parallel, and there is
  usually one database.
- COL-1 and EDT-10 become verifiable.

**Cons & trade-offs**
- Breaking for every installation with files in `.genoacms/collections/`: they disappear from the
  catalog until moved by hand. `@genoacms/core` and `@genoacms/cli` need a minor release.
- A collection added while the CMS runs can no longer be opened by its URL before a restart; today
  it can, because resolution reads the bucket on demand. Both the catalog and the URL now wait for
  the process to start (OF9).
- A configured collection's schema can no longer be adjusted from the bucket without a deploy.
- Whoever may write `.genoacms/databases/` in the default bucket can make any collection name of
  any configured database editable in the CMS. Its documents are still guarded by
  `db:collection:*` grants on that name.
- The `Host` interface grows, in `@genoacms/config`, whose `host.md` does not conform to the
  workflow yet, so the new method is described there without a statement of its own.
- The preview is not in the server's HTML: it appears a moment after the page, once hydrated.

**Blindspots & missed edge cases**
- A file the listing does not reach, such as one nested deeper under `collections/`, is ignored
  without a word.
- A name listed under two databases is served by the first, silently; the second file is never
  read, and nothing tells the operator.
- A database key that is not a valid path segment in some storage is not considered.
- The trailing `/` is relied on for every storage adapter; only Cloud Storage is exercised by the
  e2e test.
- Two CI runs at once share the e2e bucket's `.genoacms/` (`docs/README.md`), and now also its
  `databases/` directory.
- The pages editor's markdown preview changes too, with no statement covering it.
