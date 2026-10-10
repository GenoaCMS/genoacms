# @genoacms/core

## 0.1.0

### Minor Changes

- [`7a8ce2a`](https://github.com/GenoaCMS/genoacms/commit/7a8ce2a89b12bd7c99419456e27a670f555b79cb) Thanks [@Hejtmus](https://github.com/Hejtmus)! - Core reads the new config format: the whole config lives in `genoa.config/`, written with `@genoacms/config`'s `defineConfig`, and names its storage, database, authentication, secrets, language and deployment providers by adapter package (RFC-0003 to RFC-0005, RFC-0014, RFC-0018 to RFC-0020). `@genoacms/cloudabstraction` is gone; adapters implement `@genoacms/contracts` (RFC-0016). Sign-in tries each authentication provider in order, sessions are revalidated, and production can sign in with Identity Platform (RFC-0030, RFC-0032). Install core with the CLI, `genoa init`, and run it with `genoa dev`, `genoa build` and `genoa deploy`.

### Patch Changes

- Updated dependencies [[`f85e6ae`](https://github.com/GenoaCMS/genoacms/commit/f85e6ae53a0f23e2cd77291b4527cd1b753138f8)]:
  - @genoacms/contracts@0.0.2
  - @genoacms/config@0.0.2
  - @genoacms/language-adapter-ts@0.1.1
