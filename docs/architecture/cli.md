---
type: architecture
title: Command-line interface
prefix: L
codes: [CLI]
verified: 7174f7f
---

# Command-line interface

## Design

### Role

`@genoacms/cli` is the operator's tool: the `genoa` command. It scaffolds a project (`init`), runs
it locally (`dev`), builds and deploys it (`build`, `deploy`), and runs the operator tasks that must
not sit behind a CMS session (`rotate-root`, `roles`, `database`). It drives core's own Vite and
SvelteKit and passes them the facts they need through the environment (`configuration.md` D7). The
config file format, the loader's rules and the deployment targets belong to
[`configuration.md`](configuration.md); this document covers what the operator types and sees.

```
genoa <command> [target] [flags]
  args      parse argv strictly; -h, --help, -v, --version answered here
  project   root = cwd, --config against cwd, core = the project or its installed @genoacms/core
  command   dev, build, deploy: spawn core's Vite (cwd = core) with GENOA_* (D7)
            rotate-root: run core's script through Vite's server API
            database, roles: load the config themselves; init: no project at all
  failure   message to stderr, exit 1
```

### Decisions

| # | Decision | Where |
| :-- | :-- | :-- |
| LU1 | 2026-10-02: the CLI has its own Specification, this document, covering every command as it is, drift-audited against the code. `configuration.md` §9 points here for the CLI. | this document |
| LU2 | 2026-10-02: the CLI answers `-h`/`--help` with the usage of every command, `<command> --help` with that command's, and `-v`/`--version` with its version; an unknown command is an error with the usage, not the menu. A terminal without a command still opens the menu. | LD1 to LD3 |
| LU3 | 2026-10-02: when a production run refuses a development-only adapter of the config the default lookup found, the CLI names that file and says how to name the production config. The default lookup itself is unchanged (`configuration.md` U12). | LD4 |
| LU4 | 2026-10-02: `-c` is short for `--config` and `-m` for `--mode`, and `--mode` also takes `dev` for `development` and `prod` for `production`. | CLI-1 |

**LD1. One command table drives the menu, the help and the dispatch (LU2; CLI-2, CLI-14,
CLI-15).** Each command's name, summary, usage, flags, default mode and examples are declared once.
*Why:* three lists of commands, in the menu, in the help and in the dispatch, drift apart; the
help is only worth having if it says what the dispatch does.
*Cost:* help text lives in code, next to the command it describes, rather than in a README.

**LD2. Help and version need no project (LU2; CLI-14, CLI-16).** They are answered right after
parsing, before the project is resolved and before any command module or the config loader is
imported (LF13).
*Why:* `genoa --help` is what someone types before a project exists, and in a directory where
`@genoacms/core` is not installed every other path fails with `cli/core-not-installed`. The config
loader brings Vite and esbuild, and help must work while either is broken.
*Cost:* none beyond a branch in the entry point.

**LD3. Without a terminal, no command is an error (LU2; CLI-17, CLI-18).** The interactive menu
opens only when standard input and output are terminals; otherwise the CLI prints the usage and
fails. An unknown command fails everywhere.
*Why:* a CI job or a script that calls `genoa` without a valid command must fail visibly instead of
waiting on a prompt nobody answers, and a mistyped command (`genoa deplyo`) must not open a menu that
hides the typo.
*Cost:* `genoa` piped through another program no longer prompts.

**LD4. The production-config hint is the CLI's, not the loader's (LU3; CLI-19).** The loader keeps
U12 and its messages; the CLI adds the hint, because only the CLI knows that `--config` was not
given.
*Why:* the loader also runs inside Vite, where `--config` means nothing, and U12's guard is what
stops a development config from reaching production.
*Cost:* the hint covers the refusal of a development-only adapter (`config/development-only`), the
first error a default-found development config meets in production; other errors of that config
carry no hint.

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| LF1 | *History.* **`configuration.md` documented a flag the CLI does not have.** Its §9 lifecycle and P3 gave `genoa build --development`; RFC-0015 replaced it with `--mode development`, and `--development` is refused as an unknown option. | fixed: `configuration.md` corrected with this document |
| LF2 | **An unknown command opens the menu** (CLI-17). `genoa deplyo` opens the interactive menu without saying the command is unknown, and without a terminal the menu cannot be answered. | open, RFC-0028 |
| LF3 | **No help and no version** (CLI-14 to CLI-16). `-h`, `--help`, `-v` and `--version` are refused as unknown options; the commands and their flags are documented only in RFCs. | open, RFC-0028 |
| LF4 | **A refused production run does not say which config it loaded** (CLI-19). `genoa deploy --mode production` without `--config` loads `genoa.config/development.ts` (U12) and fails with `@genoacms/adapter-secrets-env is for development only`, which reads as if the production config were wrong (author, 2026-10-02). | open, RFC-0028 |
| LF5 | **`init`'s AWS suite has no secrets adapter** (CLI-13). It scaffolds `TODO: secrets adapter`, although `@genoacms/adapter-aws/secrets` exists since RFC-0026. | open, RFC-0028 |
| LF6 | **`roles` never offers the declared roles for an assignment** (CLI-11). It reads the roles from the catalog, which never contains them, so the prompt never lists any. | open, RFC-0028 |
| LF7 | **`database`'s "Add a collection" does nothing** (CLI-10). It clears the console and returns to nothing; adding a dynamic collection was never implemented. | open: what it should do is undecided |
| LF9 | **`roles` and `rotate-root` hide `--mode` from their help** (CLI-15). RFC-0028's command table gave them only `--config`, while both use the mode: `roles` loads the config in it and `rotate-root` hands it to Vite. Found by LS2. | open, RFC-0028 |
| LF10 | **An empty `--config` is accepted** (CLI-1). `genoa build -c ''` resolves to the project directory itself and fails in the loader with `config/evaluation-failed`. Found by LS2. | open, RFC-0028 |
| LF11 | **A failed deploy step prints `Canceled`** (CLI-8). The step's progress line is still running when the CLI exits, and its library ends it as cancelled, which reads as if the operator had cancelled. Found by LS2. | open, RFC-0028 |
| LF12 | **The shell's `GENOA_*` variables reach Vite** (CLI-5). Vite inherits the CLI's environment, so an exported `GENOA_CONFIG` or `GENOA_TARGET` makes Vite build another config or target than the one the CLI loaded and checked. Found by LS2. | open, RFC-0028 |
| LF13 | **Help imports the config loader** (CLI-14, CLI-16). `index.js` imports the project resolution and the hint statically, and with them `@genoacms/config/load`, Vite and esbuild, so a broken install of either breaks `--help`. Found by LS2. | open, RFC-0028 |
| LF8 | **No test level runs the CLI's tests.** They use `node --test` under a `test:unit` script, and the package's `test` script runs the CLI itself, so `scripts/test-level.mjs`, which runs packages whose `test` script is Vitest, skips the package. | open, RFC-0028 |

### History

*History.* The CLI started as an interactive menu over `npm explore` of core's scripts (2023). RFC-0015
(2026-09-27) rewrote it over `@genoacms/config`: it spawns core's Vite directly, passes the D7
environment, and gained `--config`, `--mode` and `--no-inline`. This document was written from the
code at `7174f7f`.

### Verification

- **LS1, drift audit of the CLI against RFC-0015 and `configuration.md`, at `7174f7f`, 2026-10-02.** Every module of `packages/cli/src` was read against both. The mismatches are LF1, LF2 and LF5 to LF8; the rest of the behavior below is the code's, stated as found.
- **LS2, falsification audit of CLI-1, CLI-11, CLI-13 and CLI-14 to CLI-19, at `69f955d`, 2026-10-02.** An agent that wrote none of RFC-0028's code ran the CLI against each statement and mutated a copy of the code under its tests. It found LF9 to LF13, and fourteen mutations that broke a statement while every test passed, in CLI-1, CLI-11, CLI-13 to CLI-15, CLI-17 to CLI-19; RFC-0028 adds the tests that catch them.

## Specification

### Invocation

#### CLI-1 · Arguments

`genoa [command] [target] [flags]`. The first positional is the command, the second the target; further positionals are ignored. Flags: `-c`/`--config <file>`, `-m`/`--mode <mode>`, `--no-inline`, `-h`/`--help`, `-v`/`--version`. Parsing is strict: an unknown flag, or `--config` or `--mode` without a value, fails with the parser's message, and an empty `--config` fails with `cli/invalid-config: --config must name a file` (LF10). A mode is `development` or `production`, or their aliases `dev` and `prod`, which are replaced by the full name before anything else reads the mode, so `GENOA_MODE` and every message carry the full name (LU4). Any other mode fails with `cli/invalid-mode: --mode must be development (dev) or production (prod), not <mode>`. `run` is an alias of `dev`. Every command accepts every flag; a flag a command does not use is ignored.

- Test: none yet
- Level: unit
- State: new (RFC-0028)

#### CLI-2 · Commands and default modes

The commands, with the mode used when `--mode` is absent: `init` (none), `dev` (`development`), `build` (`production`), `deploy` (`production`), `database` (`development`), `roles` (`development`), `rotate-root` (`development`).

- Test: unverified (no test yet; RFC-0028 adds one)
- Level: unit

#### CLI-3 · Project

Every command but `init` runs in a project: its root is the working directory, `--config` is resolved against it, and core is the root itself when the root's `package.json` is named `@genoacms/core`, else the `@genoacms/core` the root resolves. When neither holds, the command fails with `cli/core-not-installed: install @genoacms/core in <root>`.

- Test: unverified (no test yet; RFC-0028 adds one)
- Level: unit

#### CLI-4 · Failure

Any error of a command is printed to standard error as its message alone, and the process exits with 1.

- Test: unverified (no test yet; RFC-0028 adds one)
- Level: integration

#### CLI-5 · Environment for Vite

`dev`, `build` and `rotate-root` hand Vite `GENOA_PROJECT` (the root) and `GENOA_MODE`, plus `GENOA_CONFIG` (the resolved `--config`) only when `--config` is given and `GENOA_TARGET` only for `build`; an unset value is never an empty string (`configuration.md` D7). No `GENOA_*` variable of the CLI's own environment reaches Vite: those it does not set are removed (LF12). Vite runs from core's own installation, with core as its working directory; a non-zero exit fails with `cli/vite-failed: vite <arguments> exited with <code>`.

- Test: unverified (no test yet; RFC-0028 adds one)
- Level: unit

### Commands

#### CLI-6 · dev

Runs `vite dev --host` in core.

- Test: unverified (spawns Vite only)
- Level: unit

#### CLI-7 · build

Loads the config with the mode, refusing inline values with `--no-inline` (`configuration.md` §5.5). The target is the positional target, else `deployment.default`, else the first declared target. A config without targets fails with the `ConfigError` `config/no-deployment-target`, and an undeclared target with `config/unknown-target`, whose issue at `deployment.targets` reads `<target> is not a deployment target; known: <names>`. It runs `vite build` in core, then writes the artifact's `package.json` into `<root>/.genoacms/build` (`configuration.md` D9), warning about every import the dependency scan cannot see and listing the packages packed into the artifact.

- Test: unverified (no test yet; RFC-0028 adds one)
- Level: unit

#### CLI-8 · deploy

Runs `build`, then resolves the target's options on the operator's machine through a host over the built manifest, at the path `deployment.targets.<target>.options` and with the descriptor's `secretOptions`, and runs the target's procedure with `{ projectRoot, buildDir, workDir, target }`. `workDir` is `<root>/.genoacms/deploy/<target>`, emptied first. The host is closed whether the procedure succeeds or fails. Each phase (building, resolving, deploying) shows a progress line; a phase that fails ends it as `<phase> failed` (`Building CMS code failed`, `Resolving deployment options failed`, `Deploying code failed`), never as cancelled (LF11).

- Test: unverified (no test yet; RFC-0028 adds one)
- Level: unit

#### CLI-9 · rotate-root

Warns what rotating the root trust anchor does and asks for confirmation, `No` by default. Declined or cancelled, it prints `Cancelled. Nothing was changed.` and changes nothing. Confirmed, it runs core's `scripts/rotate-root.ts` through Vite's server API with the environment of CLI-5 and `GENOACMS_CONFIRM_ROOT_ROTATION=1`.

- Test: unverified (no test yet; RFC-0028 adds one)
- Level: unit

#### CLI-10 · database

Loads the config, opens the default bucket's storage provider through a host, and offers a menu: delete a collection, which lists the objects under `.genoacms/collections` in that bucket and deletes the one chosen; continue, which shows the menu again; and exit. The host is closed when the command ends. Adding a collection is offered but does nothing (LF7).

- Test: unverified (no test yet; RFC-0028 adds one)
- Level: unit

#### CLI-11 · roles

Composes a role or an assignment and prints it as JavaScript to paste into `authorization`; it writes no file. Permissions are offered grouped by domain. A resource-scoped permission offers the buckets or collections the config declares and `*`, or free text when the config cannot be loaded or declares none; a database read or write grant may be narrowed to fields. An assignment's prompt lists the roles the config declares (LF6). A config that cannot be loaded is reported as a warning, and composing goes on.

- Test: none yet
- Level: unit
- State: new (RFC-0028)

#### CLI-12 · init

Scaffolds a project in the working directory and needs none: runs `<package manager> init -y` when there is no `package.json`; takes the package manager from the lock file, or asks; asks for an adapter suite (GCP, AWS or none) and an authentication adapter (array or none); installs `@genoacms/core`, `config`, `contracts`, `adapter-secrets-env`, `adapter-node`, `language-adapter-ts` and the chosen suite and authentication packages; writes `genoa.config/` (CLI-13); appends `.genoacms/` to `.gitignore` unless a line already holds it; and prints the next steps, which name `genoa deploy --config genoa.config/production.ts`. It refuses with `cli/config-exists: <path>` before writing anything when `genoa.config.ts` or any file it would write exists.

- Test: unverified (no test yet; RFC-0028 adds one)
- Level: unit

#### CLI-13 · init's templates

`genoa.config/` receives `development.ts`, `production.ts`, `collections.ts`, `authorization.ts`, `security.ts` and `languages.ts`, rendered from the CLI's templates by replacing each `%name%` token the chosen values define. The values per suite (`storage`, `database`, `secrets`, `deployment`, `target`):

| Suite | Values |
| :-- | :-- |
| GCP | `@genoacms/adapter-gcp/storage`, `/database`, `/secrets`, `/deployment`, target `gcp` |
| AWS | `@genoacms/adapter-aws/storage`, `/database`, `/secrets`, `/deployment`, target `aws` (LF5) |
| none | `TODO: storage adapter`, `TODO: database adapter`, `TODO: secrets adapter`, `TODO: deployment adapter`, target `cloud` |

`authentication` is `@genoacms/authentication-adapter-array` for the array adapter, else `TODO: authentication adapter`. A `TODO` specifier is refused by the loader until it is replaced.

- Test: none yet
- Level: unit
- State: new (RFC-0028)

### Help and guidance

#### CLI-14 · Usage

`genoa -h` or `genoa --help`, with no command, prints to standard output the usage line, every command with its summary, the flags with their meaning and defaults, and the line `Run genoa <command> --help for a command's usage.`, and exits 0, once the arguments parse (CLI-1). It needs no project and imports neither a command nor the config loader (LD2).

- Test: none yet
- Level: integration
- State: new (RFC-0028)

#### CLI-15 · A command's usage

`genoa <command> -h` or `--help` prints to standard output that command's usage line, its summary, the flags it uses with their defaults, its default mode, and at least one example, and exits 0, without running the command or resolving a project. `deploy`'s and `build`'s examples include `--config genoa.config/production.ts`. `run --help` prints `dev`'s usage.

- Test: none yet
- Level: integration
- State: new (RFC-0028)

#### CLI-16 · Version

`genoa -v` or `genoa --version` prints the CLI's version from its `package.json`, alone on one line, and exits 0, once the arguments parse (CLI-1). It needs no project and imports neither a command nor the config loader (LD2). With both, help wins.

- Test: none yet
- Level: integration
- State: new (RFC-0028)

#### CLI-17 · Unknown command

A command that is not one of CLI-2's, nor `run`, the empty string included, fails with `cli/unknown-command: <command>` followed by the usage of CLI-14 on standard error, and exits 1, in a terminal or not.

- Test: none yet
- Level: integration
- State: new (RFC-0028)

#### CLI-18 · No command

Without a command, when standard input and standard output are both terminals, the CLI opens the interactive menu of every command. Otherwise it prints `cli/no-command` followed by the usage on standard error and exits 1 (LD3).

- Test: none yet
- Level: integration
- State: new (RFC-0028)

#### CLI-19 · Naming the production config

When `build` or `deploy` runs in `production` mode without `--config`, and loading the config fails with an issue `config/development-only`, the CLI prints after the error: `The config loaded was <path>, found by default; a production config is named explicitly.` with `<path>` relative to the root, and, when `genoa.config/production.ts` is a file under the root, `Run: genoa <command> [target] --config genoa.config/production.ts` with the command and target as given. It exits 1 as CLI-4.

- Test: none yet
- Level: integration
- State: new (RFC-0028)
