---
'@genoacms/core': patch
---

`genoa build` works again where core is installed: core's Vite config no longer needs a
devDependency, and core peers on `@sveltejs/kit` so SvelteKit finds its remote functions.
