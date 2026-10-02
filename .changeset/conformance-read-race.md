---
'@genoacms/conformance': patch
---

The storage suite's read test awaits the object's stream and checks its content, instead of returning before the read; the read no longer races the next test's delete into an uncaught 404.
