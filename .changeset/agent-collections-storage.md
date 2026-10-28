---
'@genoacms/core': minor
---

Agent tools for documents and objects (RFC-0041). MCP gains 16 tools: `list_collections`, `get_collection`, `list_documents`, `get_document`, `create_document`, `update_document`, `delete_document`, `list_buckets`, `list_directory`, `get_object`, `upload_object`, `move_object`, `delete_object`, `create_directory`, `move_directory` and `delete_directory`, all through the permission-checked document service and storage user layer. The document service now validates documents against the collection schema, an update as it will be stored, and an update of a missing document fails with `documents/not-found`. Breaking for the editor: a stored document its schema refuses can no longer be saved until it is valid.
