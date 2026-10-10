---
'@genoacms/cli': patch
---

The installed command is `genoa`, as the documentation says (RFC-0034). `bin` was a bare path, which npm and pnpm link as `cli`, so `npx genoa` failed after `npm install -D @genoacms/cli`.
