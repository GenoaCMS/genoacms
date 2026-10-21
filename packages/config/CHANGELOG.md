# @genoacms/config

## 0.0.4

### Patch Changes

- Updated dependencies [[`813d2b5`](https://github.com/GenoaCMS/genoacms/commit/813d2b5ec6841e155cd697e45dccdb42e7f9c3d0)]:
  - @genoacms/contracts@0.0.3

## 0.0.3

### Patch Changes

- [#20](https://github.com/GenoaCMS/genoacms/pull/20) [`f52ec2c`](https://github.com/GenoaCMS/genoacms/commit/f52ec2c70591368826ab0b5edf075648b6e41684) Thanks [@Hejtmus](https://github.com/Hejtmus)! - Dynamic collections are defined per database and signed: a definition lives at `.genoacms/databases/<database>/collections/<name>` in the default bucket, is served by that database, and must be a `genoacms.collectionDefinition.v1` envelope signed by the instance's subordinate key and bound to its database and name. One that does not verify is still listed, and opening it fails with `collection/unverifiable`. `.genoacms/collections/` is no longer read, and the collections directories are no longer created. A dynamic definition can no longer replace a collection the configuration declares. `genoa database` lists and deletes in the new directories. The host gains `databaseNamed`. The markdown preview in the editors shows its content as soon as the page is interactive.

## 0.0.2

### Patch Changes

- Updated dependencies [[`f85e6ae`](https://github.com/GenoaCMS/genoacms/commit/f85e6ae53a0f23e2cd77291b4527cd1b753138f8)]:
  - @genoacms/contracts@0.0.2
