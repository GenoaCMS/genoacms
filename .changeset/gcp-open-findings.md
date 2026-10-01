---
'@genoacms/adapter-gcp': patch
'@genoacms/sveltekit-adapter-cloud-run-functions': patch
---

Fix the open GCP findings (RFC-0027): directory deletes and moves are bounded and stop at the first failure, `startAfter` is exclusive, a directory move takes its new name literally, the deploy sets `IGNORED_ROUTES` so `/favicon.ico` and `/robots.txt` reach the app, and the dead `static/` middleware is gone.
