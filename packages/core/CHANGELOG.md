# @genoacms/core

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
