---
'@genoacms/core': patch
---

Objects the CMS reads as text are decoded whole, as UTF-8 (RFC-0040). A multibyte character split across two chunks of a storage stream was read as U+FFFD, and a page edit wrote the damage back into the entry, growing with each save. Entries already damaged are not repaired; rebuild them from their source.
