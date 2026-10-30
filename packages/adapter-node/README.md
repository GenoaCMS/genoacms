# `@genoacms/adapter-node`

A GenoaCMS deployment target that builds the CMS as a plain Node server, with
[`@sveltejs/adapter-node`](https://svelte.dev/docs/kit/adapter-node), and deploys it by copying the
build into your project.

## Configuration

```ts
import { defineConfig, deploymentTarget } from '@genoacms/config'
import type {} from '@genoacms/adapter-node'   // registers the target's option types; erased at runtime

export default defineConfig({
  // … the services …
  deployment: {
    targets: {
      server: deploymentTarget('@genoacms/adapter-node', { origin: 'https://cms.example.com' })
    }
  }
})
```

| Option | Type | Default | Meaning |
| :-- | :-- | :-- | :-- |
| `outDir` | `string` | `'build'` | Where `genoa deploy` copies the server, relative to the project root. It must be a directory inside the project. |
| `origin` | `string` | none | The origin browsers reach the CMS at, such as `https://cms.example.com`. It is fixed into the build as SvelteKit's `paths.origin`. |

Any other option is refused when the config loads (`unknown option '<name>'`), and so is an `origin`
that is not an absolute `http://` or `https://` origin without a path.

### When to set `origin`

Without `origin`, the server works out its origin from each request: `https://` plus the `Host`
header, or the headers named by adapter-node's `PROTOCOL_HEADER` and `HOST_HEADER` variables. A
server reached over **plain HTTP**, such as one on `http://localhost`, therefore fails SvelteKit's
CSRF check on every form post, sign-in included, unless `origin` says `http://…`.

The origin is part of the build. Moving the CMS to another domain needs a new `genoa deploy`.
adapter-node 6 ignores an `ORIGIN` environment variable.

## Deploying

```bash
npx genoa deploy server --config genoa.config/production.ts
```

`genoa deploy` builds the CMS and copies the build, with its generated `package.json`, into
`outDir`. It deletes nothing there first: files a previous build left behind stay until you remove
them. Then, in `outDir`:

```bash
npm install --omit=dev
node index.js
```

The artifact installs with npm 9 or later. It contains no project source and no config file; the
runtime reads its secrets through the secrets adapter the config names, so give the server what that
adapter needs (credentials, environment variables). adapter-node's own environment variables, such
as `PORT` and `HOST`, work as documented by SvelteKit.

`npx genoa build server` builds without copying; the build is in `.genoacms/build/`.

See [adapters](https://genoacms.js.org/guide/adapters/) for the other targets, and the
[CLI](https://genoacms.js.org/guide/cli/) for its flags.
