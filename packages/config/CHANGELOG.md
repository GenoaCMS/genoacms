# @genoacms/config

## 0.0.4

### Patch Changes

- [`7f69446`](https://github.com/GenoaCMS/genoacms/commit/7f69446f8509938b2fa6a4e3ee43922ba8461b7e) Thanks [@Hejtmus](https://github.com/Hejtmus)! - AI agents control components and pages through an MCP endpoint, `POST /mcp`, with 18 tools. An agent is declared in `authentication.agents` or created on `/configuration/iam`, identifies itself with a bearer token alone, and never holds a configuration permission. Every save of a component header, a component body or a page carries the version it was read at, on the screens and in the tools, and a stale save is refused. The screens now refuse a header saved for an unknown component, a changed component kind, a page name of more than one level, a replaced page, a node of an unpublished component, and a node edit that rewrites a page's structure with only the content permission; a node removed from a slot leaves the page with every node below it.

- Updated dependencies [[`813d2b5`](https://github.com/GenoaCMS/genoacms/commit/813d2b5ec6841e155cd697e45dccdb42e7f9c3d0)]:
  - @genoacms/contracts@0.0.3

## 0.0.3

### Patch Changes

- [#20](https://github.com/GenoaCMS/genoacms/pull/20) [`f52ec2c`](https://github.com/GenoaCMS/genoacms/commit/f52ec2c70591368826ab0b5edf075648b6e41684) Thanks [@Hejtmus](https://github.com/Hejtmus)! - Dynamic collections are defined per database and signed: a definition lives at `.genoacms/databases/<database>/collections/<name>` in the default bucket, is served by that database, and must be a `genoacms.collectionDefinition.v1` envelope signed by the instance's subordinate key and bound to its database and name. One that does not verify is still listed, and opening it fails with `collection/unverifiable`. `.genoacms/collections/` is no longer read, and the collections directories are no longer created. A dynamic definition can no longer replace a collection the configuration declares. `genoa database` lists and deletes in the new directories. The host gains `databaseNamed`. The markdown preview in the editors shows its content as soon as the page is interactive.

## 0.0.2

### Patch Changes

- Updated dependencies [[`f85e6ae`](https://github.com/GenoaCMS/genoacms/commit/f85e6ae53a0f23e2cd77291b4527cd1b753138f8)]:
  - @genoacms/contracts@0.0.2
