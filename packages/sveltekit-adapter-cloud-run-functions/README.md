# @genoacms/sveltekit-adapter-cloud-run-functions

[Adapter](https://svelte.dev/docs/kit/adapters) for SvelteKit apps that generates a Cloud Run Function definiton.

## Docs

This adapter is not intended for general use, it was made specifically for GenoaCMS.
Catch is that the generated code needs to be archived and uploaded to Cloud Run Functions, which is done by [GCP adapter for GenoaCMS](https://github.com/GenoaCMS/adapter-gcp/blob/master/src/services/deployment/deploy.ts).
No configuration reqired, generates similar code to node adapter, but with different request parsing. The function is exported as `handler`.

Requires SvelteKit 3. The adapter bundles the server in SvelteKit's own Vite build.

### Origin

The origin is fixed at build time: set `paths.origin` in the config given to `sveltekit()` (GenoaCMS sets it from the gcp target's `origin` option). Without it, the request URL is built from `X-Forwarded-Proto` and `X-Forwarded-Host`, falling back to `http` and `Host`.

### Environment

- `XFF_DEPTH` (default `1`): the `X-Forwarded-For` entry, counted from the right, taken as the client address.
- With `envPrefix`, the variable is `<envPrefix>XFF_DEPTH`, and any other variable starting with the prefix stops the function at startup.

### Migrating from 1.x

- Upgrade to SvelteKit 3, and pass the adapter to `sveltekit()` in `vite.config`.
- Replace the `ORIGIN` variable with `paths.origin`. The function refuses to start when `ORIGIN` (or `<envPrefix>ORIGIN`) is set.
- The output holds `index.js`, `handler.js`, `adapter.js`, `client/`, `prerendered/` and `server/`; `env.js`, `shims.js` and `server/manifest.js` are gone. The function still imports `handler` from `index.js`.
- No polyfills are installed: the runtime must be Node 22 or later.

## Changelog

[The Changelog for this package is available on GitHub](https://github.com/GenoaCMS/sveltekit-adapter-cloud-run-functions/blob/master/CHANGELOG.md).

## License

[MIT](LICENSE)
