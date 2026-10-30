---
'@genoacms/sveltekit-adapter-cloud-run-functions': major
'@genoacms/core': minor
'@genoacms/config': minor
'@genoacms/adapter-gcp': minor
'@genoacms/adapter-aws': minor
'@genoacms/adapter-node': minor
'@genoacms/contracts': minor
'@genoacms/conformance': patch
---

SvelteKit 3 (RFC-0043). Core runs on SvelteKit 3.1, Vite 8 and Node 22.17 or later, and the origin is fixed at build time on every target: a deployment descriptor's `origin(options)` becomes SvelteKit's `paths.origin`, and no deploy sets an `ORIGIN` variable. `@genoacms/config/load` exports `resolveKitTarget`, which returns the adapter and the origin, in place of `resolveKitAdapter`. The Cloud Run Functions adapter 2.0.0 requires SvelteKit 3, bundles in SvelteKit's own server build, installs no polyfills, and refuses to start when `ORIGIN` is set; set `paths.origin` instead. adapter-gcp, adapter-aws and adapter-node require `@sveltejs/adapter-node` 6. Conformance accepts Vitest 4.
