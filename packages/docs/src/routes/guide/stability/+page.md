---
title: Stability and versions
---

GenoaCMS is under active development, and most of its packages are published below `1.0`.

- A `0.y.z` package, such as `@genoacms/core` or the adapters, may break an interface in a minor release.
- A `0.0.z` package, such as `@genoacms/contracts`, `@genoacms/config` and `@genoacms/conformance`, may
  break in any release, including a patch.

Pin exact versions in production, and read the release notes before you update.

GenoaCMS is maintained by one person, Filip Holčík. Much of the design is written down rather than held in
one head: the architecture documents and RFCs in
[`docs/`](https://github.com/GenoaCMS/genoacms/tree/main/docs) state what a part must do, and tests name
the statement they check. The coverage table in
[`docs/README.md`](https://github.com/GenoaCMS/genoacms/blob/main/docs/README.md) shows which areas are
specified so far and which are not.

## Which versions to install

Install the latest release of each package. The packages are developed and tested together in one
repository, so the latest releases of all of them belong together. Do not mix a new `@genoacms/core` with
old adapters. The [npm organization](https://www.npmjs.com/org/genoacms) shows the newest version of each.

Besides `@genoacms/core` and `@genoacms/cli`, a project installs the adapters for its setup, plus
`@genoacms/language-adapter-ts`, which every config uses. `@genoacms/sdk` is for the applications that
read the published pages.

## Combinations of adapters

CI type-checks and loads these three configs on every change, so they are the combinations to start from.
See [example configs](/guide/config/examples).

| Setup | Storage | Database | Authentication | Secrets | Deployment |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Google Cloud | `adapter-gcp` (Cloud Storage) | `adapter-gcp` (Firestore) | `adapter-gcp` (Identity Platform) | `adapter-gcp` (Secret Manager) | `adapter-gcp` (Cloud Run functions) |
| AWS | `adapter-aws` (S3) | `adapter-aws` (DynamoDB) | `authentication-adapter-array` | `adapter-aws` (Secrets Manager) | `adapter-aws` (Lambda) |
| Self-hosted | `adapter-minio` | `adapter-postgres` | `authentication-adapter-array` | `adapter-secrets-env` (development only) | `adapter-node` |

You can mix providers across services, because a config names an adapter per service. Only the
combinations above are checked together. For example, `authentication-adapter-array` works with the
Google Cloud setup, but that has been tested by hand, not by CI.

Three limits to know about:

- **AWS** has no authentication adapter yet, so administrators sign in from a list kept in Secrets Manager.
- **Self-hosted** has no secrets store that runs in production without a cloud account.
- **Self-hosted** is not offered by `genoa init`. Start from the self-hosted example config instead.
