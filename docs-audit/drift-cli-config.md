# Drift audit: CLI, configuration, build, host, secrets, identities

- Date: 2026-10-08
- Commit audited: `9f43931` (worktree `adoring-swanson-8f5fbd`, clean)
- Documents: `docs/architecture/cli.md`, `configuration.md`, `build.md`, `host.md`, `secrets.md`, `identities.md`
- Code: `packages/cli`, `packages/config` (`load/`, `host/`, `artifact/`, `vite/`, `environment.ts`, `manifest.ts`, `references.ts`), `packages/adapter-secrets-env`, `packages/adapter-node`, `packages/internal/src/authorization`, `packages/language-adapter-ts` (descriptor only), `packages/core` (`svelte.config.js`, `vite.config.ts`, `src/lib/script/host.server.ts`, `src/hooks.server.ts`, `scripts/rotate-root.ts`)
- Read-only: no code, test or document was changed. Nothing is committed.

## Method and scope notes

- Only `cli.md` and `identities.md` conform to the workflow and have ID-headed statements. `configuration.md`, `build.md`, `host.md` and `secrets.md` are `conforms: false` and hold no `#### CODE-n` statements. For them, the normative content (types, loader rules, lifecycle, D-decisions) was compared with the code, and their findings are labelled by section instead of by statement ID.
- Every `identities.md` statement is **New** (no RFC yet). No code implements PWH or IDS (`grep` for `scrypt`, `PWH-`, `IDS-` in `packages/` finds nothing), so there is nothing to drift. The four PWH-6 test vectors were recomputed with Node `crypto.scryptSync` (NFC, 16-byte salt `00…0f`, 32-byte output): all four reproduce exactly, and B's decomposed form gives the same string as the precomposed one.
- Commands run:
  - `pnpm install --frozen-lockfile` (the worktree had no package-level `node_modules`; the first `pnpm --filter @genoacms/cli test` failed with `vitest: not found`)
  - unit tests: cli 66/66, config 84/84, adapter-secrets-env 88/88, adapter-node 9/9, internal 44/44, all passing. The CLI run includes `main.test.js`, the integration file, and its `script`-based terminal tests ran (none skipped).
  - `node docs/tools/check-docs.mjs docs`: 0 errors, 5 warnings (the `conforms: false` documents)
  - Probes, run locally, no cloud service: the CLI against an empty directory (`deplyo --help`, `''`, `--help --nope`); `loadConfig` over a fixture project with `secrets: {}`; `createHost` with a fake secrets store that reports one key missing. The scripts are in the session scratchpad, not in the repository.

Severity:
- **behavior**: the code does something observable that the document contradicts, or that no statement covers and that a user meets.
- **test gap**: code and statement agree, but the named tests would still pass if the code broke the statement.
- **editorial**: the document misdescribes the code in a way a user cannot observe, or describes a mechanism rather than behavior.

---

## Findings: `cli.md`

### D1 · CLI-14, CLI-15, CLI-17 · `genoa <unknown command> --help` exits 0 with the usage

- Doc: `docs/architecture/cli.md:212` (CLI-14: usage "with no command"), `:219` (CLI-15: a known command's usage), `:233` (CLI-17: an unknown command "fails … in a terminal or not")
- Code: `packages/cli/src/index.js:68-70` (`helpText` falls back to `usage()` for any name not in the table), `:81` (help is answered before the command is checked)
- Test: `packages/cli/src/main.test.js:211` asserts this behavior inside a test titled `CLI-15`
- Observable: `genoa deplyo --help` prints the full usage to stdout and exits 0 (probe confirmed). So does `genoa '' --help`. No statement says this. CLI-17, read literally, requires exit 1 with `cli/unknown-command: deplyo`, and CLI-14 covers only the case with no command. The CLI-15 test asserts a behavior CLI-15 does not state.
- Severity: behavior
- Options: (a) state in CLI-14 or CLI-15 that help with an unknown command prints the general usage and exits 0, and say in CLI-17 that `--help` takes precedence; (b) change the code so `--help` with an unknown command fails as CLI-17, and change the test's assertion through an RFC; (c) print the usage, but exit 1 with `cli/unknown-command` on stderr (a third behavior, needs a statement).

### D2 · CLI-12 · `init` refuses an existing config only after it has run `<pm> init -y` and installed every package

- Doc: `docs/architecture/cli.md:188` ("It refuses with `cli/config-exists: <path>` **before writing anything** when `genoa.config.ts` or any file it would write exists")
- Code: `packages/cli/src/init.js:204-214`: `initNpmProject()` (line 207, writes `package.json`), `installPackages()` (line 210, writes `node_modules`, a lock file and the `package.json` dependencies) run before `scaffold()` → `prepareConfig()` → `existingConfigFile()` (lines 168-170)
- Observable: in a directory with no `package.json` and an existing `genoa.config/security.ts`, `genoa init` creates `package.json`, asks for a package manager, suite and authentication adapter, installs six to eight packages, and then fails with `cli/config-exists: …/genoa.config/security.ts`. "Before writing anything" holds only for the files under `genoa.config/` and `.gitignore`.
- Test: `packages/cli/src/init.test.js:87` (`CLI-12: refuses with cli/config-exists before writing anything`) calls `prepareConfig` directly, so it cannot see the ordering. See T4.
- Severity: behavior
- Options: (a) move the existence check to the start of `init`, before any prompt or write, and add a test through `init()`; (b) narrow CLI-12's wording to "before writing any file under `genoa.config/` or `.gitignore`", accepting the install.

### D3 · CLI-12 (LF11's defect class) · a failing step of `init` prints `Canceled`

- Doc: `docs/architecture/cli.md:86` (LF11, fixed for `deploy` only), `:160` (CLI-8's "never as cancelled"); CLI-12 (`:188`) says nothing about progress lines
- Code: `packages/cli/src/init.js:79-82`, `:87-90`, `:188-191`: each spinner is started, and on a rejection it is never stopped. `fail()` (`packages/cli/src/index.js:73-77`) calls `process.exit(1)`. `@clack/prompts` 0.7.0's spinner listens on `process.on('exit', …)` and, for code 1, ends a running spinner with `Canceled`.
- Observable: when `npm install @genoacms/core` fails, or when `cli/config-exists` is thrown inside the `Creating genoa.config/` spinner (which is exactly D2's case), stdout shows `Canceled` beside the progress line, and stderr shows the real error. This is the reading LF11 called misleading for `deploy`.
- Severity: behavior (not covered by any statement)
- Options: (a) give `init` the same failed-phase handling as `deploy` (`packages/cli/src/deploy.js:18-29`) and extend CLI-12 with the wording of CLI-8; (b) record it as a known limitation of `init` in `cli.md`; (c) a shared statement in *Invocation* that no command ends a progress line as cancelled unless the operator cancelled.

### D4 · CLI-12 · cancelling a prompt of `init`

- Doc: `docs/architecture/cli.md:188` (silent on cancellation)
- Code: `packages/cli/src/init.js:73` (the package-manager answer is used unchecked), `:81`, `:89` (interpolated into a shell command), `:208-209` and `:128`, `:135` (a cancelled suite or authentication answer is a `Symbol`, which `SUITES[…]` and `AUTHENTICATION_ADAPTERS[…]` read as "none")
- Observable: Ctrl-C at "Select a package manager" makes `` `${packageManager} init -y` `` throw `TypeError: Cannot convert a Symbol value to a string`, printed as the error, exit 1. Ctrl-C at "Select an adapter suite" or "Select an authentication adapter" does not stop `init`: it goes on as if "None of the above" had been chosen, installs packages and writes `TODO` templates.
- Severity: behavior (not covered)
- Options: (a) state that cancelling any prompt of `init` ends it without writing anything, with a message and an exit code, and implement it; (b) state the current behavior (not recommended by this audit, but a valid choice of the author).

### D5 · CLI-10 · `database` on cancel, and after a deletion

- Doc: `docs/architecture/cli.md:174`
- Code: `packages/cli/src/database.js:71-84` (`menu`: any answer other than `add`, `delete` and `exit`, the clack cancel symbol included, reaches `default` and shows the menu again); `:53-58`, `:65-69` (`deleteCollection`: `if (!collection) return` lets the cancel symbol, which is truthy, through to `deleteObject({ name: <Symbol>, bucket })`); `:73-78` (after `add` or `delete`, `menu` returns and the command ends)
- Observable:
  1. Ctrl-C at "Select a mode" does not exit: the menu reappears, forever. Only "Exit", or killing the process, ends it.
  2. Ctrl-C at "Select a collection" calls the storage provider's `deleteObject` with a `Symbol` as the object name. What happens next is the adapter's behavior (a thrown error, or a request with name `Symbol(clack:cancel)`).
  3. After one deletion the command ends. CLI-10 says "continue, which shows the menu again", but says nothing about the menu after a delete, so a reader may expect it to return.
- Severity: behavior (1 and 2), editorial (3)
- Options: (a) state in CLI-10 that cancelling any prompt ends the command and changes nothing, and fix both paths through an RFC with a regression test; (b) state that the command ends after one action; or (c) loop back to the menu after each action and state that.

### D6 · CLI-11 · a role name that is not a JavaScript identifier prints invalid JavaScript

- Doc: `docs/architecture/cli.md:181` ("Composes a role … and prints it as JavaScript to paste into `authorization`")
- Code: `packages/cli/src/roles.js:143-146`: `` `roles: {\n  ${name.trim()}: ${render(grants, 2)}\n}` ``. The name is interpolated bare. `render` quotes non-identifier keys (`packages/cli/src/declaration.js:38-39`), but the role name does not go through it. The subject of an assignment does go through `JSON.stringify` (`roles.js:172`).
- Observable: a role named `Content editor`, `Copy-writer` or `2nd-line` prints `roles: {\n  Content editor: [...]\n}`, which is a syntax error when pasted.
- Test: `packages/cli/src/declaration.test.js:55-60` builds the snippet itself, with the identifier `Copywriter`, so it never exercises `roles.js`'s assembly. See T3.
- Severity: behavior
- Options: (a) quote the role name as `render` quotes keys, and add a test through `roles()`; (b) validate the role name as an identifier in the prompt; (c) narrow CLI-11 to say role names must be identifiers.

### D7 · CLI-11 · cancelling the field narrowing prints "Nothing composed." and then composes

- Doc: `docs/architecture/cli.md:181` (silent on cancellation)
- Code: `packages/cli/src/roles.js:42-48` (`canceled` prints the outro `Nothing composed.`), `:90` and `:97` (in `chooseFields` a cancel returns `undefined`, which `composeGrant` at `:117-118` reads as "no narrowing"), then `:138-148` continue and print `Composed.`
- Observable: Ctrl-C at "Restrict this grant to particular fields?" or at "Which fields?" prints `Nothing composed.`, then goes on to "Add another grant?" and finally prints the snippet and `Composed.` Every other prompt of `roles` ends the command on cancel.
- Severity: behavior (not covered)
- Options: (a) state that cancelling any prompt ends `roles` with `Nothing composed.` and nothing printed, and fix `chooseFields`; (b) state that cancelling the narrowing only declines it, and print no outro there.

### D8 · CLI-18 · the menu has an `Exit` entry, and leaving it exits 0 silently

- Doc: `docs/architecture/cli.md:240` ("opens the interactive menu of every command")
- Code: `packages/cli/src/index.js:8-16` (an extra `Exit` option), `:35-39` (`Exit` or a cancel returns `undefined`), `:84` (nothing runs, exit 0, no output)
- Test: `packages/cli/src/commands.test.js:30-45` asserts the `Exit` entry and an exit code that is not non-zero, so the test already checks behavior the statement does not state.
- Severity: editorial
- Options: (a) add the `Exit` entry and the silent exit 0 on Exit or cancel to CLI-18; (b) leave CLI-18 as is, and treat the menu's extra entry as unspecified.

### D9 · CLI-5 · Vite killed by a signal fails with `exited with null`

- Doc: `docs/architecture/cli.md:137` ("a non-zero exit fails with `cli/vite-failed: vite <arguments> exited with <code>`")
- Code: `packages/cli/src/vite.js:32-34` (`code` is `null` when the child is killed by a signal; the signal is ignored)
- Observable: when Vite is killed (OOM killer, `kill`, Ctrl-C reaching only the child), the CLI prints `cli/vite-failed: vite build exited with null` and exits 1. A spawn failure (`error` event, for example `EACCES` on the binary) rejects with Node's own error, not `cli/vite-failed`.
- Severity: behavior (edge case, not covered)
- Options: (a) state what a signal termination and a spawn failure print; (b) leave both unspecified.

### D10 · CLI-3 · an unreadable root `package.json` fails with a `SyntaxError`

- Doc: `docs/architecture/cli.md:123` ("When neither holds, the command fails with `cli/core-not-installed: …`")
- Code: `packages/cli/src/project.js:9-12` (`JSON.parse` of the root `package.json` throws for invalid JSON, outside the `try` of `installedCore`)
- Observable: in a directory whose `package.json` is not valid JSON, `genoa build` prints a JSON `SyntaxError` message and exits 1, instead of `cli/core-not-installed`.
- Severity: behavior (edge case, not covered)
- Options: (a) state it as an error of its own; (b) treat an unreadable `package.json` as "not core" and fall through to `cli/core-not-installed`; (c) leave it unspecified.

### D11 · CLI-12 · "unless a line already holds it" is an exact match

- Doc: `docs/architecture/cli.md:188` ("appends `.genoacms/` to `.gitignore` unless a line already holds it")
- Code: `packages/cli/src/init.js:163` (`current.split('\n').includes('.genoacms/')`)
- Observable: a `.gitignore` that already ignores the directory as `.genoacms`, `/.genoacms/` or `.genoacms/ # local`, or a CRLF file whose line is `.genoacms/\r`, gets a second `.genoacms/` line appended.
- Severity: editorial
- Options: (a) say "unless a line is exactly `.genoacms/`"; (b) match the equivalent forms and state which.

### D12 · `docs/README.md` · the CLI rows predate RFC-0028

- Doc: `docs/README.md:29` ("19 statements: 10 current, unverified until RFC-0028 adds their tests; 9 **New** (RFC-0028)"), `:42` ("open findings LF2 to LF8, all but LF7 in RFC-0028")
- Reality: `cli.md` has 19 current statements, 18 naming tests and 1 unverified (CLI-6). Its only open finding is LF7. LF2 to LF6 and LF8 to LF13 are marked fixed, and this audit confirms each of them (below).
- Severity: editorial
- Options: update both rows to the current state of `cli.md`.

### Test gaps: `cli.md`

| # | Statement | Doc | Test | What could break while every test passes |
| :-- | :-- | :-- | :-- | :-- |
| T1 | CLI-8 | `cli.md:160` | `packages/cli/src/deploy.test.js:72-88` | Only the building phase's failure line is asserted. The labels `Resolving deployment options failed` and `Deploying code failed`, every success label, and closing the host after a **successful** procedure are not asserted (the first test fails the procedure). Changing `deployPhase`'s label, or moving `host.close()` into a `catch`, passes. |
| T2 | CLI-10 | `cli.md:174` | `packages/cli/src/database.test.js:13-38` | One path only (continue, delete). `Exit`, `Add a collection` (LF7), closing the host when listing or deleting fails, and the cancel paths of D5 are not exercised. |
| T3 | CLI-11 | `cli.md:181` | `packages/cli/src/roles.test.js`, `packages/cli/src/declaration.test.js` | The collections offered for a `db:collection:*` permission, the field narrowing through the command, and the assembly of the printed `roles:` snippet are not tested through `roles()`. `declaration.test.js` rebuilds the snippet text itself, so D6 passes. |
| T4 | CLI-12 | `cli.md:188` | `packages/cli/src/init.test.js` | Only `initTemplateValues`, `renderTemplate` and `prepareConfig` are tested. `init()` is not: the lock-file detection and its order, `<pm> init -y` only without `package.json`, the list of installed packages, the next-steps text naming `genoa deploy --config genoa.config/production.ts`, and the ordering of D2. Removing `@genoacms/contracts` from `installPackages`, or the `production.ts` line from `printNextSteps`, passes. |
| T5 | CLI-13 | `cli.md:203` | `packages/cli/src/init.test.js` | "A `TODO` specifier is refused by the loader until it is replaced" is not tested anywhere. The loader refuses it today as `config/descriptor-not-found` (`packages/config/src/load/descriptors.ts:86-90`), because `TODO: storage adapter` does not resolve. |
| T6 | CLI-17 | `cli.md:233` | `packages/cli/src/main.test.js:223-226`, `:282-288` | "the empty string included" is not tested (the probe confirms `genoa ''` fails as stated). The terminal cases of CLI-17 and CLI-18 are `test.skipIf(!hasScript)`: on a runner without util-linux `script` they are skipped, and the non-terminal tests still carry both IDs, so the results check passes with the terminal half unverified. |

### Existing findings of `cli.md`

| Finding | Marked | Still accurate? | Evidence |
| :-- | :-- | :-- | :-- |
| LF1 | fixed | yes. `--development` is refused (`parseArgs` strict, `args.js:35`); `configuration.md:344` (P3) says `--mode development`. | |
| LF2 | fixed | yes | `index.js:28-32`; `main.test.js:223` |
| LF3 | fixed | yes | `args.js:26-27`, `help.js` |
| LF4 | fixed | yes | `index.js:46-50`, `hint.js` |
| LF5 | fixed | yes | `init.js:31` |
| LF6 | fixed | yes. Roles are read from `authorization.roles` (`roles.js:33`) | |
| LF7 | open | yes. "Add a collection" calls `console.clear()` and the command then ends (`database.js:60-63`, `:73-75`). | |
| LF8 | fixed | yes. The package's `test` script is `vitest run`; `scripts/test-level.mjs:18`, `:52` run `src/main.test.js` at `integration` and exclude it from `unit`. | |
| LF9 | fixed | yes | `commands.js:59`, `:68` |
| LF10 | fixed | yes | `args.js:17-20` |
| LF11 | fixed | yes for `deploy` (`deploy.js:18-29`; clack 0.7.0 stops a spinner with code 2 as an error, and a stopped spinner ignores the exit hook). The same defect remains in `init`: D3. | |
| LF12 | fixed | yes, for both `spawnVite` and `runCoreScript` (`vite.js:14-22`) | |
| LF13 | fixed | yes. `project.js` and `hint.js` are imported dynamically (`index.js:20`, `:48`); `commands.js` and `help.js` import neither a command nor the loader. | |

`cli.md`'s `verified: 45bc5c1` is older than `022de8b6`, which changed `init`'s collections template (a commented example, `packages/cli/src/templates/collections.ts:14`). No statement depends on it.

---

## Findings: `configuration.md` (not conforming: no statement IDs)

### D13 · Loader rule 7 · a config with no `secrets.providers` loads

- Doc: `docs/architecture/configuration.md:213` ("exactly one key, enforced by the loader"), `:272` (rule 7)
- Code: `packages/config/src/load/rules.ts:153-158` (`secretsProviderCount` returns no issue when `secrets.providers` is absent or not an object); `:23`, `:65-67` (the required-stanza rule checks only that `secrets` is an object)
- Observable (probe): `loadConfig({ mode: 'production' })` over a config with `secrets: {}` resolves to a manifest. The failure surfaces only at runtime, when `host.secrets()` throws `secrets/provider-count: exactly one secrets provider is allowed, found 0` (`packages/config/src/host/index.ts:121-122`), which during the bootstrap is caught and logged (K1). The same probe shows `authentication: {}` (no `providers`, no `cookieName`) and `languages: {}` also load.
- Severity: behavior
- Options: (a) make the loader require `secrets.providers` with exactly one key (and, if wanted, `authentication.providers`, `authentication.cookieName` and `languages.providers`); (b) restate rule 7 as "at most one, and exactly one when the record exists", and say where a missing store is caught.

### D14 · Loader rules · the code enforces a different, longer rule list

- Doc: `docs/architecture/configuration.md:264-276` (rules 1 to 11)
- Code: `packages/config/src/load/rules.ts:219-235` (15 rules), `packages/config/src/load/descriptors.ts:67-76`
- Rules the code has that the document does not state:
  - `config/missing-stanza`: `authentication`, `database`, `storage`, `secrets`, `languages`, `authorization` and `security` must be objects (`rules.ts:23`, `:65-67`);
  - `config/invalid-provider-entry`: every entry must be `{ adapter: non-empty string, options: object }` (`rules.ts:70-72`);
  - `config/descriptor-invalid`: a descriptor's shape (`kind` is a service kind; a deployment descriptor has `svelteKitAdapter` and `procedure`; any other has a non-empty `runtime`) (`descriptors.ts:67-76`);
  - `config/unknown-bucket`: `storage.defaultBucket` must name a bucket (`rules.ts:181-187`);
  - `config/integer-key` also applies to bucket and database names, not only to provider keys (`rules.ts:190-200`; doc rule 9 says provider keys).
- A rule implemented differently: rule 10 says `JSON.parse(JSON.stringify(config))` deep-equals `config`. The code walks the values instead (`rules.ts:75-88`). Observable differences: `-0` is accepted (JSON turns it into `0`); symbol-keyed properties are ignored rather than refused.
- Numbering: `rules.ts`'s `// Rule n` comments do not follow the document's numbers (doc rule 5, the bootstrap rule, is the code's "Rule 7"; `secrets.md:71` cites "loader rule 5").
- Severity: editorial (the added rules), behavior (rule 10's edge cases)
- Options: (a) list every enforced rule, with its issue code, in the document (it becomes the specification when the document is restructured); (b) align the code's rule-10 implementation with the JSON round trip, or restate rule 10 as the value walk; (c) renumber either side.

### D15 · *Types* · the `Manifest`, `LoadOptions` and memoization differ from the document

- Doc: `docs/architecture/configuration.md:236-246`, `:251-256`, `:266`
- Code: `packages/config/src/manifest.ts:7-16` (`AdapterRecord` has `developmentOnly`; `runtime` is absent for deployment descriptors), `packages/config/src/load/index.ts:18-19` (`onWarning`), `:73` (the memo key is file, mode **and** `forbidInline`), `:39` (a rejected load is dropped from the memo)
- Severity: editorial
- Options: update the types and rule 1's memoization sentence to the code, or change the code.

### D16 · Rule 11 · inline warnings are printed twice by `genoa build`

- Doc: `docs/architecture/configuration.md:276`, `docs/architecture/secrets.md:54` ("warns once per field")
- Code: the CLI loads the config (`packages/cli/src/build.js:38`), then spawns Vite, whose plugin loads it again in its own process with the default `onWarning` (`packages/config/src/vite/index.ts:56-57`, `packages/config/src/load/index.ts:24-26`). The plugin never passes `forbidInline`.
- Observable: in production mode each `inline()` field is warned once by the CLI and once more from inside `vite build`. With `--no-inline` the CLI refuses before Vite runs, so the plugin's missing `forbidInline` is not observable through the CLI; it is through a bare `vite build`.
- Severity: behavior (minor)
- Options: (a) state that the warning appears once per process; (b) silence the plugin's warnings, or pass the CLI's decision through the environment (a new `GENOA_*` fact, which `build.md` D7 would have to list).

---

## Findings: `build.md` (not conforming)

### D17 · *Lifecycle* · `rotate-root` is described as a `vite-node` spawn

- Doc: `docs/architecture/build.md:186-188` ("keeps running under `vite-node` … `genoa rotate-root` spawns it with `GENOA_PROJECT` and `GENOA_CONFIG`")
- Code: `packages/cli/src/vite.js:42-57` (runs `scripts/rotate-root.ts` **in the CLI's process** through Vite's `createServer` and `ssrLoadModule`), `packages/cli/src/rotateRoot.js:26` (also passes `GENOA_MODE` and `GENOACMS_CONFIRM_ROOT_ROTATION=1`)
- `cli.md` CLI-9 (`:167`) and CLI-5 already describe the code correctly; `build.md` contradicts them.
- Severity: editorial
- Options: replace the paragraph with a pointer to CLI-9.

### D18 · *Lifecycle* · the facts and the resolution path differ

- Doc: `docs/architecture/build.md:149` (dev passes `GENOA_PROJECT`, `GENOA_CONFIG`), `:168` (`host.resolve(…, `deployment.targets.${target}`)`)
- Code: `packages/cli/src/dev.js:6` (also `GENOA_MODE`), `packages/cli/src/deploy.js:40` (path `deployment.targets.<target>.options`, as `cli.md:160` says)
- Observable: the path appears in resolution errors, for example `secrets/missing: deployment.targets.gcp.options.credentials points at …`.
- Severity: editorial
- Options: align `build.md` with the code and CLI-5 and CLI-8.

### D19 · *The artifact* · which adapter packages the runtime `package.json` lists, and where their versions come from

- Doc: `docs/architecture/build.md:24-25` (D6: "every adapter package the manifest names"), `:108` ("the package of every **runtime specifier** in `manifest.adapters`"), `:109` ("versions … resolved from `coreDir`"), `:106` (signature `createRuntimePackage(manifest, buildDir, coreDir)`), `:100` (`{ type, dependencies, overrides }`)
- Code: `packages/config/src/artifact/index.ts:40-44` (the **descriptor's** package, `record.package`, deployment descriptors excluded), `packages/config/src/load/descriptors.ts:95-96` (that version is read from the package that owns the descriptor, resolved from the **project root**), `artifact/index.ts:46-55` (scanned packages resolved from `coreDir`; `build/version-conflict: <pkg>` when a scanned package and an adapter disagree), `:68`, `:76-82` (object argument with `root`; `name: 'genoacms-runtime'`, `private: true`)
- Observable: an adapter whose descriptor and runtime live in different packages gets its descriptor's package installed, not its runtime's. A deployment adapter is never listed. A build fails with `build/version-conflict`, which the document does not mention.
- Severity: behavior (the edge cases), editorial (signature, shape)
- Options: (a) state "the package that owns each non-deployment descriptor, at the version installed for the project", and the conflict error; (b) change the code to list the runtime specifier's package.

### D20 · D9 · what is vendored

- Doc: `docs/architecture/build.md:72-74` (rule 1: every runtime adapter package; rule 2: "every other package, **transitively from a vendored one**, that is local")
- Code: `packages/config/src/artifact/vendor.ts:94-102` (the seeds also include every **local package the server bundle imports**, whether or not an adapter reaches it), `:74-80` (the transitive walk follows `optionalDependencies` and `peerDependencies` as well as `dependencies`)
- Observable: a local workspace library imported directly by core's bundle, and reached by no adapter, is packed into `vendor/`, which rule 2 does not say. A local peer dependency of an adapter is vendored too.
- Also not in the document: `build/vendor-conflict` (one name at two real paths, `vendor.ts:57-61`), `build/vendor-pack-failed` (`:118-127`), and the deny list's exact names (`serviceAccount.json`, `credentials.json`, `authCredentials.js`, `secrets.env`, `.env*` except `*.example`; `:47`, `:149-152`).
- Severity: behavior (seeding), editorial (errors)
- Options: (a) extend D9's rule 2 to "transitively from a vendored package or from the bundle", and name the dependency kinds and errors; (b) restrict the code to D9 as written.

### D21 · *Targets* · `@genoacms/adapter-node` restricts `outDir`

- Doc: `docs/architecture/build.md:141` ("Copies `buildDir` to `options.outDir` (default `<project>/build`)")
- Code: `packages/adapter-node/src/descriptor.js:8-18` (`outDir` must be relative, inside the project and not the project itself; unknown options refused), `packages/adapter-node/src/procedure.js:12-15` (refused again at deploy with `deploy/out-dir-outside-project`; `path.startsWith('..')` also refuses a directory named like `..cache` inside the project), `:25` (copies without deleting what is already there)
- Severity: editorial (behavior not in the document)
- Options: state the restriction and the "nothing is deleted first" rule in the target's row.

---

## Findings: `host.md` (not conforming)

### D22 · *Types: the host* · members and errors the document does not list

- Doc: `docs/architecture/host.md:29-65`, `:67-82`
- Code: `packages/config/src/host/index.ts`
  - `databases` getter (`:51`, `:165`), not in the interface;
  - `createHost` throws `host/unsupported-manifest` for a manifest whose `version` is not 1 (`:80`);
  - `language(name)` throws `language/not-configured` with the old listing message before constructing anything (`:65-70`, `:128-130`), in addition to the documented `language/mismatch` check;
  - `provider/unknown-adapter` when an entry's adapter is not in the manifest (`:98`);
  - a database provider receives the names of its databases as `resources` (`packages/config/src/host/routing.ts:20-24`); the pseudo-code shows only `bucketsOf(name)`;
  - `close()` also clears the secret cache (`:169-173`);
  - the construction cache is keyed by `<service>:<name>` (`:105`), not by name alone as the pseudo-code says (`host.md:71`, `:84`). Provider names are per service, so this is the same observable behavior.
- `host.md:31`: "In core and the CLI it is `s => import(/* @vite-ignore */ s)`". The CLI passes `importFromProject(s, root)` (`packages/cli/src/deploy.js:55`, `packages/cli/src/database.js:13`); core passes a loader that refuses while `building` (`packages/core/src/lib/script/host.server.ts:14-17`).
- Severity: editorial
- Options: add the members, errors and loaders to the document (it becomes the host's specification when restructured).

---

## Findings: `secrets.md` (not conforming)

### D23 · *Failure and latency* · a missing key is not retried until the process restarts

- Doc: `docs/architecture/secrets.md:84` ("On timeout or a missing key, the construction rejects with `provider/secret-unavailable` or `secrets/missing` … The rejection is **not** cached, so the next call retries.")
- Code: `packages/config/src/host/secretCache.ts:7-25` ("`undefined` is cached too: a key missing now stays missing until the process restarts"), `packages/config/src/host/resolve.ts:25-35`
- Observable (probe): a store that reports a key missing is asked once. The construction is retried on the next call, as the document says, but that retry reads `undefined` from the host's cache and rejects with `secrets/missing` again without asking the store. A key written to the store after the first failure is not seen until the process restarts. A timeout, being a rejection, is retried against the store.
- Severity: behavior
- Options: (a) state that a missing key stays missing for the life of the process, and only timeouts and errors are retried; (b) stop caching `undefined`, so a missing key is retried.

### D24 · *Failure and latency* · the timeout covers the store's construction, and two errors are unlisted

- Doc: `docs/architecture/secrets.md:84` ("Each `getSecret` is bounded by `secretTimeoutMs`")
- Code: `packages/config/src/host/resolve.ts:26-30` (the deadline wraps `deps.secrets().then(store => store.getSecret(key))`: the first read also spends the timeout on constructing the store); `:37-41` (`secrets/env-missing` for an unset `env()` variable); `:44-51` (`secrets/invalid-json` for a JSON-declared field that does not parse, with the parse error dropped); `:57` (`config/bare-secret` at runtime)
- Severity: behavior (timeout scope), editorial (errors)
- Options: (a) state that the bound covers the store's construction and the read; (b) bound only `getSecret`. In either case, list the other error codes.

### D25 · *Development store* · behavior the section does not state

- Doc: `docs/architecture/secrets.md:96-106`
- Code: `packages/adapter-secrets-env/src/descriptor.js:3`, `:14-21` (a `path` option, a non-empty string; unknown options refused), `src/runtime.js:188-189` (`path` is resolved against `projectRoot`, so an absolute path leaves the project), `:76-79` (`mode: 0o600` applies only when the file is created; an existing file keeps its mode), `:93-108` (a lock left by a crashed process is never broken: every claim fails after 5 s with `secrets-env/lock-timeout`), `:28-33` (`secrets-env/no-project-root`)
- Severity: editorial
- Options: state the `path` option, the mode rule and the stale-lock behavior, or change the code.

---

## Findings: `identities.md`

No drift: every statement is **New**, no code implements it, and every statement says `Test: none yet`. The test vectors of PWH-6 reproduce (see *Method*).

### D26 · *Role* · the array adapter and "no self-owned identity store exists"

- Doc: `docs/architecture/identities.md:11`, `:15-21`
- Code: `packages/authentication-adapter-array/src/runtime.js:45-47` keeps its own users (from a JSON secret) and compares the plaintext password with `!==`, which is neither PWH-4's hash check nor constant-time.
- The document's ID4 *Cost* mentions the array adapter only as a migration source. Whether the array adapter is a self-owned store in the sense of IDS, and so whether PWH and IDS will bind it, is not stated.
- Severity: editorial
- Options: (a) state in *Role* that the array adapter is out of scope (a development and seed mechanism); (b) bring it under PWH and IDS through the RFC that implements them.

---

## Summary

| # | Document | Statement or section | Severity |
| :-- | :-- | :-- | :-- |
| D1 | cli.md | CLI-14, CLI-15, CLI-17 | behavior |
| D2 | cli.md | CLI-12 | behavior |
| D3 | cli.md | CLI-12 (LF11 class) | behavior |
| D4 | cli.md | CLI-12 | behavior |
| D5 | cli.md | CLI-10 | behavior, editorial |
| D6 | cli.md | CLI-11 | behavior |
| D7 | cli.md | CLI-11 | behavior |
| D8 | cli.md | CLI-18 | editorial |
| D9 | cli.md | CLI-5 | behavior (edge) |
| D10 | cli.md | CLI-3 | behavior (edge) |
| D11 | cli.md | CLI-12 | editorial |
| D12 | README.md | Documents, Coverage | editorial |
| T1 | cli.md | CLI-8 | test gap |
| T2 | cli.md | CLI-10 | test gap |
| T3 | cli.md | CLI-11 | test gap |
| T4 | cli.md | CLI-12 | test gap |
| T5 | cli.md | CLI-13 | test gap |
| T6 | cli.md | CLI-17, CLI-18 | test gap |
| D13 | configuration.md | loader rule 7 | behavior |
| D14 | configuration.md | loader rules | editorial, behavior (rule 10) |
| D15 | configuration.md | Manifest, LoadOptions | editorial |
| D16 | configuration.md, secrets.md | rule 11, `inline()` | behavior (minor) |
| D17 | build.md | Lifecycle, rotate-root | editorial |
| D18 | build.md | Lifecycle | editorial |
| D19 | build.md | The artifact, D6 | behavior (edge), editorial |
| D20 | build.md | D9 | behavior, editorial |
| D21 | build.md | Targets | editorial |
| D22 | host.md | Types: the host | editorial |
| D23 | secrets.md | Failure and latency | behavior |
| D24 | secrets.md | Failure and latency | behavior, editorial |
| D25 | secrets.md | Development store | editorial |
| D26 | identities.md | Role | editorial |

Counts: 15 with behavior drift (D1 to D7, D9, D10, D13, D16, D19, D20, D23, D24, some only in edge cases), 6 test gaps, the rest editorial. Existing findings: LF7 is still open and accurate; LF1 to LF6 and LF8 to LF13 are fixed as marked, with LF11's defect class recurring in `init` (D3).

## Statements checked with no drift

- `cli.md`: **CLI-1**, **CLI-2**, **CLI-4**, **CLI-6** (code matches; `unverified` as declared), **CLI-7**, **CLI-9**, **CLI-16**, **CLI-19**. For each, the code does what the statement says, the named test files exist, carry the ID in a test title, and assert the statement at the declared level.
- With findings above, but otherwise matching: CLI-3 (D10), CLI-5 (D9), CLI-8 (T1), CLI-10 (D5, T2), CLI-11 (D6, D7, T3), CLI-12 (D2 to D4, D11, T4), CLI-13 (T5), CLI-14 and CLI-15 (D1), CLI-17 (D1, T6), CLI-18 (D8, T6).
- `identities.md`: PWH-1 to PWH-6 and IDS-1 to IDS-6, all **New**, no implementation to compare; the PWH-6 vectors reproduce.
- Non-conforming documents, sections that match the code: `configuration.md` default lookup (`:260-262`, `packages/config/src/load/locate.ts`), rules 2 to 6, 8, 9 and 11 as far as they go; `build.md` D7 (`packages/config/src/environment.ts`, `packages/config/src/vite/index.ts:47-54`) and D8 (`packages/core/src/lib/script/host.server.ts:14-17`, `packages/core/src/hooks.server.ts:13`, `packages/core/src/lib/script/database/database.server.ts:17`); `host.md` D3 (promise caching, rejected promise dropped, `packages/config/src/host/constructions.ts`); `secrets.md` resolution, the bootstrap rule at runtime (`packages/config/src/host/index.ts:113-125`), `inline()` under deployment not warning (`packages/config/src/load/rules.ts:211-217`), and the development store's read order, overlay, no `process.env` writes, lock file and default path (`packages/adapter-secrets-env/src/runtime.js`).
