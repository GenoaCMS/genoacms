---
'@genoacms/core': minor
'@genoacms/cli': minor
'@genoacms/config': patch
---

Dynamic collections are defined per database and signed: a definition lives at `.genoacms/databases/<database>/collections/<name>` in the default bucket, is served by that database, and must be a `genoacms.collectionDefinition.v1` envelope signed by the instance's subordinate key and bound to its database and name. One that does not verify is still listed, and opening it fails with `collection/unverifiable`. `.genoacms/collections/` is no longer read, and the collections directories are no longer created. A dynamic definition can no longer replace a collection the configuration declares. `genoa database` lists and deletes in the new directories. The host gains `databaseNamed`. The markdown preview in the editors shows its content as soon as the page is interactive.
