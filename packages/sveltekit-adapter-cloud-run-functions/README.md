# @genoacms/sveltekit-adapter-cloud-run-functions

[Adapter](https://svelte.dev/docs/kit/adapters) for SvelteKit apps that generates a Cloud Run Function definiton.

## Docs

This adapter is not intended for general use, it was made specifically for GenoaCMS.
Catch is that the generated code needs to be archived and uploaded to Cloud Run Functions, which is done by [GCP adapter for GenoaCMS](https://github.com/GenoaCMS/adapter-gcp/blob/master/src/services/deployment/deploy.ts).
No configuration reqired, generates similar code to node adapter, but with different request parsing. The function is exported as `handler`.

## Changelog

[The Changelog for this package is available on GitHub](https://github.com/GenoaCMS/sveltekit-adapter-cloud-run-functions/blob/master/CHANGELOG.md).

## License

[MIT](LICENSE)
