#!/usr/bin/env bash
#
# Builds all four consumer demos and the functions they need, ready for `firebase deploy`.
#
# Four Hosting sites, one per demo, and one functions codebase holding two functions:
#
#   genoacms-demo-svelte    static assets + `demoSvelte`, server-rendered, serving /artifacts itself
#   genoacms-demo-react     static, /artifacts/** -> `artifacts`
#   genoacms-demo-vue       static, /artifacts/** -> `artifacts`
#   genoacms-demo-vanilla   static, /artifacts/** -> `artifacts`
#
# **No deployed demo holds a credential.** The functions read the bucket with their own
# service-account identity; the browsers hold only the root public key, which is public by
# construction and is what verification is for.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
packages="$(dirname "$here")"
public="$here/public"
functions="$here/functions"

: "${VITE_GENOACMS_ROOT_PUBLIC_KEY:?set it to the instance root anchor, from Configuration -> Keys}"
: "${VITE_GENOACMS_PAGE:=demoHome}"
: "${GENOACMS_BUCKET:=genoacms}"
export VITE_GENOACMS_ROOT_PUBLIC_KEY VITE_GENOACMS_PAGE

# Each demo is its own site, so each fetches from its own origin at the root. No base path, and
# nothing cross-origin.
export VITE_GENOACMS_ORIGIN="/artifacts"

rm -rf "$public" "$functions/svelte" "$functions/artifacts.js" "$functions/bucket.js"
mkdir -p "$public"

pnpm --filter @genoacms/sdk run build
pnpm --filter @genoacms/demo-support run build

# The allowlist and the reader, as the compiled files the tests cover. Copied rather than restated:
# Firebase installs the function from its own package.json, so a workspace dependency would not
# resolve. The reader is here too because the function used to carry its own copy, and the two
# disagreed about whether a credential was required.
cp "$packages/demo-support/dist/artifacts.js" "$functions/artifacts.js"
cp "$packages/demo-support/dist/bucket.js" "$functions/bucket.js"

# Which bucket the functions read, as the runtime environment both of them expect. `firebase deploy`
# turns this into environment variables on the deployed functions.
#
# Generated rather than committed, because `.env` is gitignored repository-wide -- a checked-in one
# would be absent from a fresh clone and the deploy would come up unconfigured. It holds no secret:
# the name of a bucket, and an identity is still required to read it.
printf 'GENOACMS_BUCKET=%s\n' "$GENOACMS_BUCKET" > "$functions/.env"

for demo in react vue vanilla; do
  echo "--- building $demo"
  (cd "$packages/demo-$demo" && pnpm exec vite build --outDir "$public/$demo" --emptyOutDir)
done

echo "--- building svelte"
(cd "$packages/demo-svelte" && pnpm exec vite build)

# The adapter emits `build/client`, `build/prerendered` and the server beside them. Hosting serves
# the first two; the function runs the rest.
mkdir -p "$public/svelte"
cp -r "$packages/demo-svelte/build/client/." "$public/svelte/"
if [ -d "$packages/demo-svelte/build/prerendered" ]; then
  cp -r "$packages/demo-svelte/build/prerendered/." "$public/svelte/"
fi

# Everything the function needs to run, minus what Hosting is already serving.
mkdir -p "$functions/svelte"
cp -r "$packages/demo-svelte/build/." "$functions/svelte/"
rm -rf "$functions/svelte/client" "$functions/svelte/prerendered"

echo
echo "built."
echo "  hosting:   $public/{svelte,react,vue,vanilla}"
echo "  functions: $functions  (artifacts, demoSvelte)"
echo
echo "The four sites must exist before the first deploy:"
for site in svelte react vue vanilla; do
  echo "  firebase hosting:sites:create genoacms-demo-$site"
done
