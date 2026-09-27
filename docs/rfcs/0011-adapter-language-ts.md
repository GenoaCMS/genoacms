# RFC-0011: Port `@genoacms/language-adapter-ts`

| | |
| :-- | :-- |
| Status | Draft |
| Depends on | RFC-0001 |
| Architecture | §4 D2; §5.1 (`LanguageAdapter` stays in `@genoacms/internal`); §8 (`GENOA_CONFIG_PATH` removed) |
| Commit | `feat(language-adapter-ts): take the compilation target as a constructor argument` |

## 1. Summary

The adapter currently reads its `target` by importing `./config.js`, which calls `getProvider` on the
global config. That is the reason the adapter's tests and the SDK's attack demonstration need a
`genoa.config` fixture and `GENOA_CONFIG_PATH`.

This RFC:
- adds `createLanguageAdapter(target)`, which closes over the target;
- adds a descriptor and a runtime;
- deletes `config.ts` and both test fixtures.

`exports` are unchanged here. `"."` keeps exporting the library, so core and the SDK keep working
until RFC-0014 flips `"."` to the descriptor and adds `"./runtime"`.

Behavior is identical for core today: core configures `target: 'es2020'`, which equals
`DEFAULT_TARGET`, and the default export now uses `DEFAULT_TARGET`.

## 2. Files

**Create** (under `packages/language-adapter-ts/`):

| File | Purpose |
| :-- | :-- |
| `src/descriptor.ts` | §4.2 |
| `src/runtime.ts` | §4.3 |
| `src/descriptor.test.ts`, `src/runtime.test.ts` | §5 |

**Modify:**
- `src/index.ts`: §4.1.
- `vitest.config.ts`: remove the `test.env.GENOA_CONFIG_PATH` entry and its doc comment. If nothing else remains, the file becomes `export default defineConfig({})`.
- `package.json`: add the dependency `"@genoacms/contracts": "workspace:^"`. Keep `@genoacms/cloudabstraction` until RFC-0014 (no source file imports it after this RFC). `exports` are unchanged.
- `packages/sdk/vitest.config.ts`: remove `GENOA_CONFIG_PATH` and its doc comment in the same way.

**Delete:**
- `src/config.ts`
- `src/config.test.ts`
- `test/genoa.config/index.js`
- `test/genoa.config-target/index.js`
- `packages/sdk/test/genoa.config/index.js`

## 3. Non-goals

- Do not change analysis, emission, SAST rules, guards or compilation. Only where `target` comes from changes.
- Do not change `packages/sdk/src/**`. Its import of `analyze` and `compileBundle` from `'@genoacms/language-adapter-ts'` keeps working. RFC-0014 repoints it to `/runtime`.
- Do not move `LanguageAdapter` types.

## 4. Specification

### 4.1 `src/index.ts`

- Delete the "Configuration is read only where it is used" section from the module doc comment, and replace it with:

  > The compilation target is a constructor argument: `createLanguageAdapter(target)`. The default
  > export uses `DEFAULT_TARGET`, which is what an instance gets when it configures no target.

- Replace `compileBundle` with a factory:

  ```ts
  const createCompileBundle = (target: string) => async (request: CompilationRequest): Promise<CompilationResult> => {
    // body of today's compileBundle, with `const { target } = await import('./config.js')` deleted
  }

  /** A language adapter compiling to `target`. Each call returns an independent adapter. */
  const createLanguageAdapter = (target: string = DEFAULT_TARGET): LanguageAdapter => ({
    language: 'typescript',
    platforms: ['web-esmodule'],
    analyze,
    emitSignature,
    compileBundle: createCompileBundle(target)
  })

  const adapter = createLanguageAdapter()
  const { compileBundle } = adapter
  ```

- Exports:

  ```ts
  export default adapter
  export { adapter, analyze, emitSignature, compileBundle, createLanguageAdapter }
  export { DEFAULT_TARGET } from './target.js'
  ```

  `DEFAULT_TARGET` must now also be imported at the top for use in `createLanguageAdapter`.

### 4.2 `src/descriptor.ts`

```ts
import { defineLanguageAdapter } from '@genoacms/contracts'

export interface TypeScriptLanguageOptions {
  /**
   * What the emitted module is lowered to: es2020, es2022, chrome109, and so on. Default es2020.
   * Changing it changes the bytes of anything compiled afterwards, and therefore its signature;
   * published executables are never rebuilt.
   */
  target?: string
}
declare module '@genoacms/contracts' {
  interface LanguageAdapters { '@genoacms/language-adapter-ts': TypeScriptLanguageOptions }
}
export default defineLanguageAdapter<TypeScriptLanguageOptions>({
  runtime: '@genoacms/language-adapter-ts/runtime',
  validate: options => /* unknown keys; target, when present, a non-empty string */
})
```

The `target` doc comment is carried from `TypeScriptLanguageSettings` in the deleted `config.ts`.
The descriptor must not import `ts-morph`, `esbuild` or `./index.js`.

### 4.3 `src/runtime.ts`

```ts
import { defineRuntime } from '@genoacms/contracts'
import type { LanguageAdapter } from '@genoacms/internal/languageAdapter'
import { createLanguageAdapter } from './index.js'
import { DEFAULT_TARGET } from './target.js'
import type { TypeScriptLanguageOptions } from './descriptor.js'

export default defineRuntime<TypeScriptLanguageOptions, LanguageAdapter>({
  create: ({ target }) => createLanguageAdapter(target ?? DEFAULT_TARGET)
})
export { analyze, emitSignature, compileBundle, createLanguageAdapter } from './index.js'
export { DEFAULT_TARGET } from './target.js'
```

After RFC-0014, `@genoacms/language-adapter-ts/runtime` serves both the host (default export) and
tooling (named exports).

## 5. Tests

- **`src/descriptor.test.ts`:** `kind === 'language'`, the `runtime` specifier, and validation (unknown key; `target: ''`).
- **`src/runtime.test.ts`**, with `vi.mock('./compile.js')` capturing `compileToWebEsModule`'s third argument:
  - `create({}, ctx).compileBundle(validRequest)` compiles with `'es2020'`;
  - `create({ target: 'es2022' }, ctx)` compiles with `'es2022'`;
  - two instances with different targets do not affect each other;
  - `create({}, ctx).language === 'typescript'`.
  
  `validRequest`: reuse the smallest valid request from `src/compile.test.ts` or `src/index.test.ts`, and state which in a comment.
- **Existing tests** (`index.test.ts`, the guards, SAST, evidence) pass unchanged.
- In `packages/sdk`, `attacks.test.ts` passes without `GENOA_CONFIG_PATH`.

## 6. Steps

1. Edit `src/index.ts`, then create the descriptor, runtime and tests.
2. Delete `config.ts`, `config.test.ts` and the fixtures, and clean both `vitest.config.ts` files.
3. Update `package.json` and run `pnpm install`.
4. Run §7.

## 7. Verification

```bash
pnpm install
pnpm --filter @genoacms/language-adapter-ts run build
pnpm --filter @genoacms/language-adapter-ts run test
pnpm --filter @genoacms/sdk run test
grep -rn "getProvider\|GENOA_CONFIG_PATH\|cloudabstraction" packages/language-adapter-ts/src packages/language-adapter-ts/vitest.config.ts packages/sdk/vitest.config.ts || echo "no config coupling: ok"
git status --short
```

**Expected:**
- Build and both test suites pass.
- The grep prints `no config coupling: ok`.
- `git status` lists only files under `packages/language-adapter-ts/`, `packages/sdk/vitest.config.ts`, `packages/sdk/test/` and `pnpm-lock.yaml`.

## 8. Critique

**Pros.**
- The adapter and the SDK tests no longer need a fake instance configuration to compile a component.
- Two targets in one process are possible, for example in tests.

**Cons & trade-offs.** `"."` exports the library until RFC-0014 and the descriptor afterwards, so any
external importer of `"."` would break at the flip. The only known importer is the SDK's test,
handled in RFC-0014.

**Blindspots.** The evidence harness imports `DEFAULT_TARGET` directly and compiles with it. If an
instance's configured target ever diverges from the default, the harness measures a different
compilation than production. That is true today as well.
