---
type: rfc
number: 34
title: The installed command is `genoa`
status: draft
commits: []
depends: [28]
architecture: [architecture/cli.md]
changes: [CLI-20 added]
commit-subject: "fix(cli): install the command as genoa (RFC-0034)"
---

# RFC-0034: The installed command is `genoa`

## Summary

`@genoacms/cli` declares `"bin": "src/index.js"`. npm and pnpm link a bare-path `bin` under the
unscoped package name, so an installed project gets `node_modules/.bin/cli`, and `npx genoa`, which
the getting-started guide and `cli.md` tell the operator to type, fails (LF16). Found by installing
packed tarballs of the current packages into an empty project, before releasing core for the new
config format.

1. `bin` names the command: `{ "genoa": "src/index.js" }`.
2. CLI-20 states it, and an integration test installs the packed package with npm and runs the
   linked command.

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/cli/package.json` | `"bin": { "genoa": "src/index.js" }` |
| `packages/cli/src/main.test.js` | the test of §Tests, in the file `scripts/test-level.mjs` runs as the CLI's integration level |
| `.changeset/cli-genoa-command.md` | new, a `patch` changeset for `@genoacms/cli` |

## Specification

**CLI-20 · The `genoa` command** (added):

> Installing `@genoacms/cli` puts one command of its own on the project's path, named `genoa`,
> which runs the CLI.
>
> - Test: `packages/cli/src/main.test.js`
> - Level: integration

`packages/cli/package.json`:

```json
"bin": { "genoa": "src/index.js" }
```

`src/index.js` keeps its `#!/usr/bin/env node` line. No other command is linked: `cli` is gone, and no
alias keeps it.

*Amended after the falsification audit (LS5).* "One command of its own": the commands of the
packages it depends on, such as Vite's, are not the CLI's, and a real install links them too.

## Non-goals

- Keeping `cli` as an alias. 0.0.19, the only version that links it, was published before the
  current CLI and its config format; nothing documents it.
- `npx @genoacms/cli …`, which runs the package's only `bin` whatever its name, and is unchanged.
- The open findings LF7 and the LS3 report.

## Tests

- `packages/cli/src/main.test.js` (integration) › `CLI-20: an npm install of the packed package links genoa alone, and genoa runs the CLI with its declared dependencies`:
  given the tarball `pnpm pack` makes of `packages/cli`, and an empty project whose `package.json`
  overrides each dependency the packed manifest declares with `file:` the workspace's installed copy
  of it, when `npm install --offline --no-save --no-audit --no-fund --ignore-scripts <tarball>` runs
  in it, then `node_modules/.bin` holds exactly one entry, `genoa`; `genoa --version` exits 0 and
  prints the version of `packages/cli/package.json`; and `genoa build` exits 1 with
  `cli/core-not-installed: install @genoacms/core in <project>` (CLI-3), which loads
  `@genoacms/config`.

  *Amended after the falsification audit (LS5).* The test as first written installed the package
  folder, which npm links without packing it or installing its dependencies, and ran only
  `--version`. A dependency moved to `devDependencies`, or a `publishConfig.bin` that renames the
  command, passed it; both fail this one. The `file:` overrides keep the install offline, and a
  dependency the manifest does not declare is not installed at all.

## Steps

1. Baseline: `pnpm --filter @genoacms/cli test` passes; `node docs/tools/check-docs.mjs docs` reports 0 errors.
2. Tests: add the test to `main.test.js` as above, marked `test.fails`, and commit it.
3. Code: change `bin`, remove the `test.fails` marker, change no assertion; add the changeset.
4. Run §Verification.

## Verification

```bash
pnpm --filter @genoacms/cli test
# all tests pass, CLI-20 among them
node docs/tools/check-docs.mjs docs
# 0 error(s)
```

A falsification audit of CLI-20 (WORKFLOW §6.3), by an agent that did not write the code, recorded as
a Verification entry in `cli.md`.

## Critique

**Pros**
- The command the documents name is the one installed; the fix is one manifest field.
- The test goes through `pnpm pack` and npm's own linking, the boundary the statement is about,
  rather than reading `package.json`.

**Cons & trade-offs**
- The test needs `pnpm`, `npm` and `tar` on the path; it takes a few seconds and works offline.
  It installs with npm, not pnpm; both read `bin` the same way.
- Its dependencies are the workspace's copies, not the published ones: a dependency whose published
  version lacks what the CLI imports passes it.
- Anyone who scripted `npx cli` against 0.0.19 breaks. Nothing documented it.

**Blindspots & missed edge cases**
- The packed package ships its `*.test.js` files, since `files` is unset (LS5).
- Windows shims (`genoa.cmd`) are not exercised; CI runs on Linux.
