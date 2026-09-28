# RFC-0012: Port `@genoacms/adapter-node`

| | |
| :-- | :-- |
| Status | Implemented (`f47e6b7`) |
| Depends on | RFC-0001 |
| Architecture | §4 D6; §7.2 (Node row); F6; S-3, S-5 |
| Commit | `feat(adapter-node): add deployment descriptor and artifact copy procedure` |

## 1. Summary

Add a deployment descriptor and procedure next to the current `src/index.js` and `src/deploy.js`.
- The descriptor loads `@sveltejs/adapter-node` from this package (S-5) and points its `out` at the artifact directory.
- The procedure copies the artifact, including its generated `package.json`, to `outDir`. There is no config bundle to copy any more (F6).

## 2. Files

**Create** (under `packages/adapter-node/`):

| File | Purpose |
| :-- | :-- |
| `src/descriptor.js`, `src/descriptor.d.ts` | §4.1 |
| `src/procedure.js` | §4.2 |
| `src/descriptor.test.js`, `src/procedure.test.js` | §5 |

**Modify** `package.json`:
- add the dependency `"@genoacms/contracts": "workspace:^"`;
- add the dev dependency `"vitest": "^3.2.7"`;
- add the script `"test": "vitest run"`.

`exports`: none declared today (`main` is `src/index.js`). Unchanged until RFC-0014.

**Delete:** none.

## 3. Non-goals

- Do not run `npm install` in `outDir`. Installing runtime dependencies stays the operator's step, as with any adapter-node output. The procedure prints the command.
- Do not delete anything in `outDir` before copying. Today's `cp(…, { recursive: true, force: true })` semantics are kept. An `rm` of a misconfigured `outDir` could delete the project.

## 4. Specification

### 4.1 Descriptor

```ts
// src/descriptor.d.ts
export interface NodeDeploymentOptions {
  /** Where `genoa deploy` copies the artifact. Relative to the project root. Default 'build'. */
  outDir?: string
}
declare module '@genoacms/contracts' {
  interface DeploymentTargets { '@genoacms/adapter-node': NodeDeploymentOptions }
}
```

```js
// src/descriptor.js
export default defineDeploymentTarget({
  svelteKitAdapter: async () => await import('@sveltejs/adapter-node'),
  svelteKitOptions: (_options, { outDir }) => ({ out: outDir }),
  procedure: async () => await import('./procedure.js'),
  validate: (options) => /* unknown keys; outDir, when present: a non-empty string that is not absolute
                            and whose normalized form neither is '.' nor starts with '..' */
})
```

### 4.2 `src/procedure.js`

```js
export default defineDeployProcedure(async ({ outDir = 'build' }, ctx) => {
  const target = resolve(ctx.projectRoot, outDir)
  await cp(ctx.buildDir, target, { recursive: true, force: true })
  console.info(`GenoaCMS copied to ${target}. Install its runtime dependencies there with: npm install --omit=dev`)
})
```

The descriptor's `validate` has already refused an absolute or escaping `outDir`. The procedure
asserts it again (defense in depth): if `relative(ctx.projectRoot, target)` is `''` or starts with
`..`, it throws `Error('deploy/out-dir-outside-project')`.

## 5. Tests

- **Descriptor:**
  - `kind === 'deployment'`;
  - `svelteKitAdapter()` resolves a module whose default is a function (the real `@sveltejs/adapter-node`, a dependency of this package);
  - `svelteKitOptions({}, { outDir: '/a' })` deep-equals `{ out: '/a' }`;
  - `validate` accepts `{}` and `{ outDir: 'dist/app' }`;
  - `validate` rejects `{ outDir: '/abs' }`, `{ outDir: '..' }`, `{ outDir: '.' }` and `{ foo: 1 }`.
- **Procedure**, in temp dirs:
  - copies a fake artifact (`index.js`, `package.json`, `client/x`) to `<root>/build`;
  - leaves pre-existing unrelated files in `<root>/build` in place;
  - throws `deploy/out-dir-outside-project` for `outDir: '../x'` when called directly, bypassing `validate`.

## 6. Steps

1. Update `package.json` and run `pnpm install`.
2. Create the files.
3. Run §7.

## 7. Verification

```bash
pnpm install
pnpm --filter @genoacms/adapter-node run test
git status --short
```

**Expected:** tests pass, and `git status` lists only files under `packages/adapter-node/` and
`pnpm-lock.yaml`.

## 8. Critique

**Pros.**
- The config bundle and its `build/genoa.config` copy disappear, because the manifest is in the bundle.
- `outDir` can no longer point outside the project.

**Cons.** The operator still runs the install. That matches adapter-node's own documented workflow.

**Blindspots.** Copying over an existing `outDir` keeps stale chunk files from earlier builds. It is
harmless because nothing references them, but they accumulate. Today's behavior is identical.
