---
'@genoacms/core': minor
---

The agent tools' audit findings (RFC-0041). `move_object` and `move_directory` refuse an existing destination unless `overwrite` is true, a directory is never moved into itself, and `create_directory` refuses the root. The document service validates a creation and an update as stored, never validates the key field, describes no error under a field the principal may not read, passes only the writable fields of an update to the database, and answers a document gone before the write as `documents/not-found`. The bare `.genoacms` name is the CMS's state.
