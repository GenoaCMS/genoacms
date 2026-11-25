---
'@genoacms/sdk': patch
---

`resolvePage` requests every publication a page pins at once instead of one node at a time, and the
verifier loads the key registry while the first document is still downloading, sharing one load
among concurrent verifications. Results are unchanged: a page with several faults still reports the
first in depth-first page order.
