# @genoacms/core

## 0.5.0

### Minor Changes

- [`71a947c`](https://github.com/GenoaCMS/genoacms/commit/71a947c32e019353da45514c80a1ecae813fe50a) Thanks [@Hejtmus](https://github.com/Hejtmus)! - SvelteKit 3 (RFC-0043). Core runs on SvelteKit 3.1, Vite 8 and Node 22.17 or later, and the origin is fixed at build time on every target: a deployment descriptor's `origin(options)` becomes SvelteKit's `paths.origin`, and no deploy sets an `ORIGIN` variable. `@genoacms/config/load` exports `resolveKitTarget`, which returns the adapter and the origin, in place of `resolveKitAdapter`. The Cloud Run Functions adapter 2.0.0 requires SvelteKit 3, bundles in SvelteKit's own server build, installs no polyfills, and refuses to start when `ORIGIN` is set; set `paths.origin` instead. adapter-gcp, adapter-aws and adapter-node require `@sveltejs/adapter-node` 6. Conformance accepts Vitest 4.

### Patch Changes

- Updated dependencies [[`71a947c`](https://github.com/GenoaCMS/genoacms/commit/71a947c32e019353da45514c80a1ecae813fe50a)]:
  - @genoacms/config@0.1.0
  - @genoacms/contracts@0.2.0
  - @genoacms/language-adapter-ts@0.1.4

## 0.4.0

### Minor Changes

- [#25](https://github.com/GenoaCMS/genoacms/pull/25) [`4f67bbf`](https://github.com/GenoaCMS/genoacms/commit/4f67bbf9973ec27a4e70ac13ee1542cf172b98e9) Thanks [@Hejtmus](https://github.com/Hejtmus)! - Agent tools for documents and objects (RFC-0041). MCP gains 16 tools: `list_collections`, `get_collection`, `list_documents`, `get_document`, `create_document`, `update_document`, `delete_document`, `list_buckets`, `list_directory`, `get_object`, `upload_object`, `move_object`, `delete_object`, `create_directory`, `move_directory` and `delete_directory`, all through the permission-checked document service and storage user layer. The document service now validates documents against the collection schema, an update as it will be stored, and an update of a missing document fails with `documents/not-found`. Breaking for the editor: a stored document its schema refuses can no longer be saved until it is valid.

- [#25](https://github.com/GenoaCMS/genoacms/pull/25) [`159aaff`](https://github.com/GenoaCMS/genoacms/commit/159aaffc456e5b4a5200594ca45737d3cfc16711) Thanks [@Hejtmus](https://github.com/Hejtmus)! - The agent tools' audit findings (RFC-0041). `move_object` and `move_directory` refuse an existing destination unless `overwrite` is true, a directory is never moved into itself, and `create_directory` refuses the root. The document service validates a creation and an update as stored, never validates the key field, describes no error under a field the principal may not read, passes only the writable fields of an update to the database, and answers a document gone before the write as `documents/not-found`. The bare `.genoacms` name is the CMS's state.

- [#25](https://github.com/GenoaCMS/genoacms/pull/25) [`9b97ef1`](https://github.com/GenoaCMS/genoacms/commit/9b97ef12e59d47c8a043996a4966d91e3f271b3e) Thanks [@Hejtmus](https://github.com/Hejtmus)! - The database contract (RFC-0042). `getCollection` returns a page, `{ documents, next }`, and filters with typed comparison conditions (`==`, `!=`, `<`, `<=`, `>`, `>=`) compared by JSON type, strings by their UTF-8 bytes. The store assigns every ID, the key is a read-only field of `data` equal to the ID, updating a missing document throws `DocumentNotFoundError`, and a value that is not JSON is refused before any request. `@genoacms/contracts/database` exports the errors and `isDocumentNotFound`, and `@genoacms/contracts/database/query` the helpers adapters share. Breaking for database adapters: `QueryParams` and `getCollection`'s result change, and Firestore and DynamoDB documents now carry the key field in `data`. `runDatabaseConformance` takes `{ collection, prefix }`.

### Patch Changes

- [`c23723e`](https://github.com/GenoaCMS/genoacms/commit/c23723ee3f63cc609d49dc024cb9a9a5943c6526) Thanks [@Hejtmus](https://github.com/Hejtmus)! - A published page tree that cannot be read, such as one that is not JSON, is listed as unreadable when a component is deleted, rather than treated as a page that was never published.

- [#25](https://github.com/GenoaCMS/genoacms/pull/25) [`a878a51`](https://github.com/GenoaCMS/genoacms/commit/a878a51891e0a4efa5b2d42ba47b45915469d319) Thanks [@Hejtmus](https://github.com/Hejtmus)! - Objects the CMS reads as text are decoded whole, as UTF-8 (RFC-0040). A multibyte character split across two chunks of a storage stream was read as U+FFFD, and a page edit wrote the damage back into the entry, growing with each save. Entries already damaged are not repaired; rebuild them from their source.

- Updated dependencies [[`eeabe19`](https://github.com/GenoaCMS/genoacms/commit/eeabe19499974018fc510f84da7e18a7b6b79cf1), [`9b97ef1`](https://github.com/GenoaCMS/genoacms/commit/9b97ef12e59d47c8a043996a4966d91e3f271b3e)]:
  - @genoacms/contracts@0.1.0
  - @genoacms/config@0.0.5
  - @genoacms/language-adapter-ts@0.1.3

## 0.3.0

### Minor Changes

- [`7f69446`](https://github.com/GenoaCMS/genoacms/commit/7f69446f8509938b2fa6a4e3ee43922ba8461b7e) Thanks [@Hejtmus](https://github.com/Hejtmus)! - AI agents control components and pages through an MCP endpoint, `POST /mcp`, with 18 tools. An agent is declared in `authentication.agents` or created on `/configuration/iam`, identifies itself with a bearer token alone, and never holds a configuration permission. Every save of a component header, a component body or a page carries the version it was read at, on the screens and in the tools, and a stale save is refused. The screens now refuse a header saved for an unknown component, a changed component kind, a page name of more than one level, a replaced page, a node of an unpublished component, and a node edit that rewrites a page's structure with only the content permission; a node removed from a slot leaves the page with every node below it.

- [#22](https://github.com/GenoaCMS/genoacms/pull/22) [`813d2b5`](https://github.com/GenoaCMS/genoacms/commit/813d2b5ec6841e155cd697e45dccdb42e7f9c3d0) Thanks [@Hejtmus](https://github.com/Hejtmus)! - The storage browser treats `.genoacms/` in the default bucket as read-only for users, takes typed names as one level, renames and moves only what was chosen, answers denials with 403, reports actions on several items per item, shows long directories a page at a time with `Show more`, keeps the selection across reloads, and names the picker's confirm button `Confirm selection`.

- [#22](https://github.com/GenoaCMS/genoacms/pull/22) [`813d2b5`](https://github.com/GenoaCMS/genoacms/commit/813d2b5ec6841e155cd697e45dccdb42e7f9c3d0) Thanks [@Hejtmus](https://github.com/Hejtmus)! - The storage contract gains `ObjectNotFoundError`: reading or deleting a missing object rejects with `storage/not-found` on every adapter. A directory's name is `''` or ends in `/`, and other names are refused with `storage/not-a-directory`. Listings page with an opaque `next` token, and core and `genoa database` follow every page. `gzip` is removed from `UploadOptions`. The MinIO adapter now serves any S3-compatible server that honours conditional writes (tested against RustFS), and the conformance suite checks the whole storage contract.

### Patch Changes

- Updated dependencies [[`7f69446`](https://github.com/GenoaCMS/genoacms/commit/7f69446f8509938b2fa6a4e3ee43922ba8461b7e), [`813d2b5`](https://github.com/GenoaCMS/genoacms/commit/813d2b5ec6841e155cd697e45dccdb42e7f9c3d0)]:
  - @genoacms/config@0.0.4
  - @genoacms/contracts@0.0.3
  - @genoacms/language-adapter-ts@0.1.2

## 0.2.0

### Minor Changes

- [#20](https://github.com/GenoaCMS/genoacms/pull/20) [`f52ec2c`](https://github.com/GenoaCMS/genoacms/commit/f52ec2c70591368826ab0b5edf075648b6e41684) Thanks [@Hejtmus](https://github.com/Hejtmus)! - Dynamic collections are defined per database and signed: a definition lives at `.genoacms/databases/<database>/collections/<name>` in the default bucket, is served by that database, and must be a `genoacms.collectionDefinition.v1` envelope signed by the instance's subordinate key and bound to its database and name. One that does not verify is still listed, and opening it fails with `collection/unverifiable`. `.genoacms/collections/` is no longer read, and the collections directories are no longer created. A dynamic definition can no longer replace a collection the configuration declares. `genoa database` lists and deletes in the new directories. The host gains `databaseNamed`. The markdown preview in the editors shows its content as soon as the page is interactive.

### Patch Changes

- [#20](https://github.com/GenoaCMS/genoacms/pull/20) [`482fcd4`](https://github.com/GenoaCMS/genoacms/commit/482fcd459a5d8e53c2325c938f7caf95811e707e) Thanks [@Hejtmus](https://github.com/Hejtmus)! - The collection document editor is redesigned. Fields carry a label and a type hint and short fields share a row; list items are collapsible cards with a summary, a drag handle that works over its whole area, and a visible remove button; file and document pickers are labelled and list what is picked, with a link to each referenced document. The document page names its collection and full id, shows whether there are unsaved changes, saves with Ctrl/⌘+S, and asks before leaving with unsaved changes.

- [#20](https://github.com/GenoaCMS/genoacms/pull/20) [`3d48988`](https://github.com/GenoaCMS/genoacms/commit/3d48988b0dbec2584b5a4b1cc13ae119063ae2e6) Thanks [@Hejtmus](https://github.com/Hejtmus)! - The collection listing shows one line per document: the first text field leads each row, long values are cut short with their full text on hover, and each value is shown by its kind — a count for lists, a check mark for booleans, a short summary for objects, plain text for markdown — instead of `[object Object]` or wrapped text. A filter narrows the documents shown, ignoring case and diacritics, and Select all selects the documents shown.

- Updated dependencies [[`f52ec2c`](https://github.com/GenoaCMS/genoacms/commit/f52ec2c70591368826ab0b5edf075648b6e41684)]:
  - @genoacms/config@0.0.3

## 0.1.0

### Minor Changes

- [`7a8ce2a`](https://github.com/GenoaCMS/genoacms/commit/7a8ce2a89b12bd7c99419456e27a670f555b79cb) Thanks [@Hejtmus](https://github.com/Hejtmus)! - Core reads the new config format: the whole config lives in `genoa.config/`, written with `@genoacms/config`'s `defineConfig`, and names its storage, database, authentication, secrets, language and deployment providers by adapter package (RFC-0003 to RFC-0005, RFC-0014, RFC-0018 to RFC-0020). `@genoacms/cloudabstraction` is gone; adapters implement `@genoacms/contracts` (RFC-0016). Sign-in tries each authentication provider in order, sessions are revalidated, and production can sign in with Identity Platform (RFC-0030, RFC-0032). Install core with the CLI, `genoa init`, and run it with `genoa dev`, `genoa build` and `genoa deploy`.

### Patch Changes

- Updated dependencies [[`f85e6ae`](https://github.com/GenoaCMS/genoacms/commit/f85e6ae53a0f23e2cd77291b4527cd1b753138f8)]:
  - @genoacms/contracts@0.0.2
  - @genoacms/config@0.0.2
  - @genoacms/language-adapter-ts@0.1.1
