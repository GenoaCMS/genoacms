---
'@genoacms/core': minor
---

Core reads the new config format: the whole config lives in `genoa.config/`, written with `@genoacms/config`'s `defineConfig`, and names its storage, database, authentication, secrets, language and deployment providers by adapter package (RFC-0003 to RFC-0005, RFC-0014, RFC-0018 to RFC-0020). `@genoacms/cloudabstraction` is gone; adapters implement `@genoacms/contracts` (RFC-0016). Sign-in tries each authentication provider in order, sessions are revalidated, and production can sign in with Identity Platform (RFC-0030, RFC-0032). Install core with the CLI, `genoa init`, and run it with `genoa dev`, `genoa build` and `genoa deploy`.
