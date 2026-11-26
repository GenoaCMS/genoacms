---
'@genoacms/config': minor
---

`secrets.prefix` lets several instances share one secrets store. Every key an instance gives the
store, its own signing keys and the config's `secret()` keys alike, is stored as `<prefix>__<key>`;
`env()` variables are not prefixed. Without a prefix, keys are stored as written. Setting a prefix
on a running instance is not migrated: the instance starts with a new root key.
