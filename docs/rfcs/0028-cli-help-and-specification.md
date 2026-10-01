---
type: rfc
number: 28
title: CLI help, guidance and its Specification
status: draft
commits: []
depends: [15]
architecture: [architecture/cli.md, architecture/configuration.md]
changes: [CLI-1 added, CLI-11 added, CLI-13 added, CLI-14 added, CLI-15 added, CLI-16 added, CLI-17 added, CLI-18 added, CLI-19 added]
commit-subject: "feat(cli): help, version and guidance, to its Specification"
---

# RFC-0028: CLI help, guidance and its Specification

## Summary

The CLI gains a Specification (`cli.md`, LU1). This RFC brings the code to it:

1. **Short flags and mode aliases** (LU4; CLI-1): `-c` for `--config`, `-m` for `--mode`, and the
   modes `dev` and `prod`.
2. **Help and version** (LU2; CLI-14 to CLI-16, LF3): `-h`/`--help`, `<command> --help`,
   `-v`/`--version`, all without a project (LD2), all generated from one command table (LD1).
3. **No silent menu** (LU2; CLI-17, CLI-18, LF2): an unknown command is an error with the usage; no
   command opens the menu only in a terminal (LD3).
4. **Naming the production config** (LU3; CLI-19, LF4): a production `build` or `deploy` refused for a
   development-only adapter of the default-found config says which file it loaded and how to name
   the production one. The loader is unchanged (LD4).
5. **Two fixes** found by the drift audit (LS1): `init`'s AWS suite scaffolds
   `@genoacms/adapter-aws/secrets` (CLI-13, LF5), and `roles` offers the declared roles for an
   assignment (CLI-11, LF6).
6. **The CLI's tests run** (LF8): they move to Vitest under `src/`, carry statement IDs, and run at
   `unit` and `integration`. Every current statement of `cli.md` gets a test, except CLI-6.

LF7 (`database`'s empty "Add a collection") is not addressed: what it should do is undecided. All
statements are added (the CLI had none), so the release is a minor of `@genoacms/cli`.

## Files

All paths are under `packages/cli/` unless they start with `/`.

| File | Change |
| :-- | :-- |
| `src/commands.js` | create: the command table (§The command table) |
| `src/help.js` | create: `usage()`, `commandUsage(name)`, `version()` (§Help text) |
| `src/hint.js` | create: `productionConfigHint(...)` (§The hint) |
| `src/args.js` | modify: `short: 'c'` for `config` and `short: 'm'` for `mode`; `-h`/`--help`, `-v`/`--version` booleans; `MODE_ALIASES = { dev: 'development', prod: 'production' }` applied in `checkMode`; returns `help`, `version` |
| `src/index.js` | modify: §Entry point; the menu and dispatch read `src/commands.js` |
| `src/init.js` | modify: AWS suite `secrets: '@genoacms/adapter-aws/secrets'`; drop its comment |
| `src/roles.js` | modify: `loadCatalog` adds `roles: Object.keys(manifest.config.authorization?.roles ?? {})` |
| `test/*.test.js` | move to `src/*.test.js`, `node:test` imports replaced by Vitest's (`after` → `afterAll`); `node:assert` stays |
| `src/*.test.js`, `src/main.test.js` | create or extend: §Tests |
| `package.json` | `"test": "vitest run"`; drop `test:init` and `test:unit`; devDependency `vitest` `^3.2.7` |
| `/scripts/test-level.mjs` | `INTEGRATION_TESTS` gains `'@genoacms/cli': 'src/main.test.js'`, and the `integration` level `{ dir: 'packages/cli', args: ['src/main.test.js'] }` |
| `/docs/README.md` | Test levels: the CLI's integration tests |
| `/.changeset/<name>.md` | create: `@genoacms/cli` minor |

## Specification

CLI-1, CLI-11, CLI-13 and CLI-14 to CLI-19 become current. No other statement changes.

### The command table

`src/commands.js` exports `COMMANDS`, an array in this order, each entry
`{ name, summary, usage, flags, mode, examples, load }`; `load` is the lazy import `index.js` uses
today, and `init`'s is `init` itself. `flags` names entries of `FLAGS`.

| name | summary | usage | flags | mode | examples |
| :-- | :-- | :-- | :-- | :-- | :-- |
| `init` | Scaffold a GenoaCMS project in this directory | `genoa init` | — | — | `genoa init` |
| `dev` | Run GenoaCMS locally (alias: run) | `genoa dev [--config <file>] [--mode <mode>]` | config, mode | development | `genoa dev` |
| `build` | Build GenoaCMS for a deployment target | `genoa build [target] [--config <file>] [--mode <mode>] [--no-inline]` | config, mode, no-inline | production | `genoa build gcp --config genoa.config/production.ts`; `genoa build --mode development` |
| `deploy` | Build, then deploy to a deployment target | `genoa deploy [target] [--config <file>] [--mode <mode>] [--no-inline]` | config, mode, no-inline | production | `genoa deploy gcp --config genoa.config/production.ts`; `genoa deploy gcp -c genoa.config/production.ts -m prod` |
| `database` | Delete dynamic collections | `genoa database [--config <file>] [--mode <mode>]` | config, mode | development | `genoa database` |
| `roles` | Compose a role or an assignment to paste into the config | `genoa roles [--config <file>]` | config | development | `genoa roles` |
| `rotate-root` | Rotate the root trust anchor (asks to confirm) | `genoa rotate-root [--config <file>]` | config | development | `genoa rotate-root --config genoa.config/production.ts` |

`FLAGS`:

| key | line |
| :-- | :-- |
| config | `-c, --config <file>  The config file, relative to this directory. Default: genoa.config.ts, else genoa.config/development.ts; a production config is always named.` |
| mode | `-m, --mode <mode>    development (dev) or production (prod). Default: the command's.` |
| no-inline | `    --no-inline      Refuse inline() values in the build.` |
| help | `-h, --help           Show this help.` |
| version | `-v, --version        Show the CLI's version.` |

The menu of CLI-18 offers the entries in table order, labelled with `name` and hinted with
`summary`, then `Exit`.

### Help text

`usage()` returns exactly:

```
Usage: genoa <command> [target] [flags]

Commands:
  init           Scaffold a GenoaCMS project in this directory
  dev            Run GenoaCMS locally (alias: run)
  build          Build GenoaCMS for a deployment target
  deploy         Build, then deploy to a deployment target
  database       Delete dynamic collections
  roles          Compose a role or an assignment to paste into the config
  rotate-root    Rotate the root trust anchor (asks to confirm)

Flags:
  <the five FLAGS lines, each indented by two spaces>

Run genoa <command> --help for a command's usage.
```

`commandUsage(name)` returns, for `deploy`:

```
Usage: genoa deploy [target] [--config <file>] [--mode <mode>] [--no-inline]

Build, then deploy to a deployment target.

Flags:
  <its FLAGS lines, then the help line, each indented by two spaces>

Default mode: production

Examples:
  genoa deploy gcp --config genoa.config/production.ts
  genoa deploy gcp -c genoa.config/production.ts -m prod
```

and likewise for every command; `init` has no `Default mode:` line and lists only the help flag.
`version()` reads `version` from the CLI's own `package.json`.

### The hint

`productionConfigHint({ root, command, target, error })` returns the two lines of CLI-19 when
`error` is a `ConfigError` whose `issues` include the code `config/development-only`, else
`undefined`. The loaded path is `relative(root, locateConfigFile(root))` (`@genoacms/config/load`);
the second line appears only when `genoa.config/production.ts` exists under `root`, and reads
`Run: genoa <command> <target> --config genoa.config/production.ts`, without `<target> ` when no
target was given. `index.js` calls it only for `build` and `deploy`, in `production` mode, without
`--config`, and prints its lines to standard error after the error's message.

### Entry point

```pseudo
args = parse(argv)                                  // CLI-1, errors per CLI-4
if args.help: print(command known ? commandUsage(command) : usage()); exit 0   // CLI-14, CLI-15
if args.version: print(version()); exit 0           // CLI-16
if command undefined:
  if stdin.isTTY and stdout.isTTY: command = menu() // CLI-18
  else: fail('cli/no-command\n' + usage())
if command not in COMMANDS: fail('cli/unknown-command: <command>\n' + usage())   // CLI-17
run command; on error: print message, then the hint if any; exit 1               // CLI-4, CLI-19
```

`genoa --help deploy` and `genoa deploy --help` are the same. `--help` with an unknown command
prints `usage()` and exits 0.

## Non-goals

- LF7: adding a dynamic collection from `genoa database`.
- Changing the loader's default lookup (U12) or any loader message.
- Shell completion, colours, or a pager for help.
- Per-command flag validation: a flag a command does not use stays ignored (CLI-1).
- Tests of `dev` (CLI-6), which only spawns Vite.

## Tests

Unit tests mock `@clack/prompts`, `./vite.js`, `@genoacms/config/load`, `@genoacms/config/build` and
`@genoacms/config/host` with `vi.mock`, as their statements need; `src/main.test.js` spawns
`node src/index.js` with a temporary working directory and asserts standard output, standard error
and the exit code.

`src/args.test.js` (unit; existing tests, retitled):
- `CLI-1: reads the command, the target and every flag`, also `-h`, `--help`, `-v`, `--version`.
- `CLI-1: keeps run as an alias of dev`.
- `CLI-1: reads -c and -m as --config and --mode`.
- `CLI-1: replaces dev and prod with development and production`: `-m dev` gives `mode: 'development'`, `--mode prod` gives `'production'`.
- `CLI-1: refuses a mode that is neither development nor production`: the exact message, also for `--mode Dev` (aliases are case-sensitive).
- `CLI-1: refuses an unknown flag, and --config or --mode without a value`.

`src/commands.test.js` (unit):
- `CLI-2: declares every command once, in the menu's order, with its default mode`: the names and modes of the table.
- `CLI-18: the menu offers every command, then Exit`.

`src/project.test.js` (unit; existing, retitled `CLI-3: …`).

`src/environment.test.js` (unit; existing, retitled `CLI-5: …`), plus `CLI-5: never sets an empty value`.

`src/vite.test.js` (unit): `CLI-5: runs core's Vite in core, and fails with cli/vite-failed on a non-zero exit` (spawn mocked).

`src/build.test.js` (unit):
- `CLI-7: chooses the given target, else deployment.default, else the first`.
- `CLI-7: fails with config/no-deployment-target and config/unknown-target`: the exact messages.
- `CLI-7: loads with the mode and forbids inline with --no-inline, then runs vite build and writes the runtime package`.

`src/deploy.test.js` (unit): `CLI-8: resolves the target's options through a host, runs the procedure in an emptied work directory, and closes the host even when the procedure fails`.

`src/rotateRoot.test.js` (unit): `CLI-9: changes nothing when declined or cancelled`, `CLI-9: runs core's script with the confirmation set when confirmed`.

`src/database.test.js` (unit): `CLI-10: deletes the chosen collection object from the default bucket, and closes the host`.

`src/roles.test.js` (unit): `CLI-11: offers the declared roles for an assignment` (LF6), `CLI-11: offers the declared buckets and *, or free text without a config`, and the existing `declaration` tests retitled `CLI-11: …`.

`src/init.test.js` (unit; existing, retitled), plus `CLI-13: the AWS suite scaffolds @genoacms/adapter-aws/secrets` (LF5), `CLI-12: refuses with cli/config-exists before writing anything`, `CLI-12: appends .genoacms/ to .gitignore once`.

`src/hint.test.js` (unit): `CLI-19: names the default-found file and the production command`, `CLI-19: omits the Run line without genoa.config/production.ts, and the target when none was given`, `CLI-19: gives no hint for other errors`.

`src/main.test.js` (integration):
- `CLI-14: prints the usage with -h and --help, and exits 0, outside any project`: the exact text of §Help text.
- `CLI-15: prints a command's usage, with run as dev, without running it`: `deploy --help` exactly; `run -h` equals `dev -h`; nothing is created in the directory.
- `CLI-16: prints the version alone, and help wins over it`.
- `CLI-17: fails on an unknown command with the usage on standard error`.
- `CLI-18: fails without a command when not in a terminal`: spawned with piped stdio, then `cli/no-command` and the usage, exit 1.
- `CLI-4: prints a command's error alone and exits 1`: `genoa build` in a directory without core, then exactly `cli/core-not-installed: install @genoacms/core in <dir>`.
- `CLI-19: a production build of the default development config names it and the production config`: a project whose `package.json` is named `@genoacms/core` (so no core install is needed), with `genoa.config/development.ts` using a descriptor marked `developmentOnly` (a local fixture package) and an empty `genoa.config/production.ts`; `genoa build` exits 1 with the loader's message and both hint lines.

## Steps

1. The architecture change (`cli.md`, `configuration.md`, `docs/README.md`) and this RFC.
2. The test move to Vitest and `test-level.mjs`, with the existing assertions unchanged. One commit.
3. Tests, written from `cli.md` and this RFC by an agent session that has not seen the new code, each one the code does not meet yet marked `it.fails`. One commit.
4. The code: the command table and help; the entry point; the hint; the two fixes. One commit each.
5. §Verification; a falsification audit of CLI-1 and CLI-14 to CLI-19 by an agent that wrote none of it.
6. `cli.md` updated to current: markers removed, test files named, LF2 to LF6 and LF8 fixed, `verified` updated; this RFC implemented.

## Verification

```bash
pnpm -r --no-bail --filter '!@genoacms/core' run build
node scripts/test-level.mjs unit          # packages/cli included
node scripts/test-level.mjs integration   # src/main.test.js included
node docs/tools/check-results.mjs docs unit=… integration=…   # no CLI error
node docs/tools/check-docs.mjs docs
node packages/cli/src/index.js --help
```

## Critique

**Pros**
- `genoa --help` answers what each command does and which config a production deploy needs, the question that started this RFC.
- A typo or a missing command fails visibly, which a CI job needs.
- The CLI's behavior is specified and tested for the first time, and its tests run in CI.

**Cons & trade-offs**
- The help text is fixed in the Specification, so wording changes go through an RFC.
- `genoa` without a command in a pipe no longer prompts.
- Every flag stays accepted by every command; `genoa init --no-inline` is silently fine.
- Mocking `@clack/prompts` ties the interactive tests to its API.

**Blindspots & missed edge cases**
- Aliases are case-sensitive: `-m Prod` is refused, which is stricter than some users expect.
- The hint covers only `config/development-only`. A development config with no development-only adapter but other production errors (inline values, a missing target) gets no hint.
- A project with only `genoa.config.ts` gets the first line of the hint, never the second.
- `process.stdin.isTTY` is `undefined` in some terminals on Windows under certain shells; such a user gets `cli/no-command` instead of the menu.
- LF7 stays: the menu still offers an "Add a collection" that does nothing.
