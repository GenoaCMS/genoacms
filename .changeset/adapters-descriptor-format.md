---
'@genoacms/adapter-gcp': minor
'@genoacms/authentication-adapter-array': minor
'@genoacms/adapter-node': minor
'@genoacms/adapter-minio': minor
'@genoacms/adapter-postgres': minor
'@genoacms/adapter-secrets-env': minor
---

Ported to the new config format (RFC-0006 to RFC-0010, RFC-0012, RFC-0014): each adapter exports a descriptor that `@genoacms/config` loads by package name from `genoa.config/`, and implements `@genoacms/contracts`. Configs written for `@genoacms/cloudabstraction` no longer load.
