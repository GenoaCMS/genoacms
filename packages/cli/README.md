# `@genoacms/cli`

The `genoa` command: scaffold a GenoaCMS project, run it locally, build and deploy it, and run the operator tasks that must not sit behind a CMS session.

Install it in the project with the package manager you use, alongside `@genoacms/core`:

```sh
npm install -D @genoacms/cli
npx genoa --help
```

Installing the package puts one command of its own on the project's path, `genoa`.

```
genoa <command> [target] [flags]
```

The first positional is the command, the second the target. Further positionals are ignored.

## Configuration

Every command except `init` runs in a project: its root is the working directory, and the config is found there. Without `--config`, the lookup is `genoa.config.ts` (or `.mts`, `.js`, `.mjs`), else `genoa.config/development.ts` (or `.mts`, `.js`, `.mjs`). A production config is never found by default: name it with `--config`. `--config` is resolved against the working directory.

Core is the `@genoacms/core` the project resolves. When it is not installed, the command fails with `cli/core-not-installed: install @genoacms/core in <root>`.

`build` and `deploy` take their target from the config:

```ts
// genoa.config/production.ts
deployment: {
  default: 'gcp',
  targets: {
    gcp: deploymentTarget('@genoacms/adapter-gcp/deployment', { projectId: 'my-project', region: 'europe-west3' }),
    aws: deploymentTarget('@genoacms/adapter-aws/deployment', { region: 'eu-central-1', role: 'arn:aws:iam::123456789012:role/genoacms', artifactBucket: 'my-company-deployments' })
  }
}
```

The target is the positional target, else `deployment.default`, else the first declared target. A config without targets fails with `config/no-deployment-target`. An undeclared target fails with `config/unknown-target`; its issue at `deployment.targets` reads `<target> is not a deployment target; known: <names>`. The config format is described in `@genoacms/config`.

## Flags

| Flag | Meaning | Default |
| :-- | :-- | :-- |
| `-c`, `--config <file>` | The config file, relative to the working directory. | `genoa.config.ts`, else `genoa.config/development.ts`; a production config is always named |
| `-m`, `--mode <mode>` | `development` (`dev`) or `production` (`prod`). | the command's default mode |
| `--no-inline` | Refuse `inline()` values in the build. | off |
| `-h`, `--help` | Show the usage. | |
| `-v`, `--version` | Show the CLI's version. | |

Parsing is strict. An unknown flag, or `--config` or `--mode` without a value, fails with the parser's message. An empty `--config` fails with `cli/invalid-config: --config must name a file`. Any other mode fails with `cli/invalid-mode: --mode must be development (dev) or production (prod), not <mode>`. `dev` and `prod` are replaced by the full name before anything reads the mode, so `GENOA_MODE` and every message carry the full name. Every command accepts every flag; a flag a command does not use is ignored.

## Commands

| Command | Summary | Default mode |
| :-- | :-- | :-- |
| `init` | Scaffold a GenoaCMS project in this directory | none |
| `dev` | Run GenoaCMS locally (alias: `run`) | `development` |
| `build` | Build GenoaCMS for a deployment target | `production` |
| `deploy` | Build, then deploy to a deployment target | `production` |
| `database` | Delete dynamic collections | `development` |
| `roles` | Compose a role or an assignment to paste into the config | `development` |
| `rotate-root` | Rotate the root trust anchor (asks to confirm) | `development` |

`genoa --help` prints the usage of every command, and `genoa <command> --help` prints that command's usage, flags, default mode and examples. `run --help` prints `dev`'s usage. Help and version need no project.

### `genoa init`

```
genoa init
```

Scaffolds a project in the working directory. It runs the package manager's `init -y` when there is no `package.json`, takes the package manager from the lock file or asks, asks for an adapter suite (GCP, AWS or none) and an authentication adapter (array or none), and installs `@genoacms/core`, `config`, `contracts`, `adapter-secrets-env`, `adapter-node`, `language-adapter-ts` and the chosen suite and authentication packages. It writes `genoa.config/` with `development.ts`, `production.ts`, `collections.ts`, `authorization.ts`, `security.ts` and `languages.ts`, appends `.genoacms/` to `.gitignore` unless a line already holds it, and prints the next steps.

| Suite | Storage, database, secrets, deployment | Target name |
| :-- | :-- | :-- |
| GCP | `@genoacms/adapter-gcp/storage`, `/database`, `/secrets`, `/deployment` | `gcp` |
| AWS | `@genoacms/adapter-aws/storage`, `/database`, `/secrets`, `/deployment` | `aws` |
| none | `TODO: storage adapter`, `TODO: database adapter`, `TODO: secrets adapter`, `TODO: deployment adapter` | `cloud` |

The authentication adapter is `@genoacms/authentication-adapter-array` for the array adapter, else `TODO: authentication adapter`. The loader refuses a `TODO` specifier until you replace it.

`init` refuses with `cli/config-exists: <path>` before any prompt, install or write when `genoa.config.ts`, or any file it would write, exists.

### `genoa dev`

```
genoa dev [--config <file>] [--mode <mode>]
```

Runs `vite dev --host` in core, with the project's config.

### `genoa build`

```
genoa build [target] [--config <file>] [--mode <mode>] [--no-inline]
genoa build gcp --config genoa.config/production.ts
```

Loads the config in the mode, runs `vite build` in core, and writes the artifact's `package.json` into `<root>/.genoacms/build`. It warns about every import the dependency scan cannot see and lists the packages packed into the artifact. `--no-inline` refuses `inline()` values.

### `genoa deploy`

```
genoa deploy [target] [--config <file>] [--mode <mode>] [--no-inline]
genoa deploy gcp -c genoa.config/production.ts -m prod
```

Runs `build`, then resolves the target's options on your machine, including the target's `credentials`, and runs the target's deploy procedure. The work directory is `<root>/.genoacms/deploy/<target>`, emptied first. Each phase shows a progress line, and a phase that fails ends it as `Building CMS code failed`, `Resolving deployment options failed` or `Deploying code failed`. What the procedure does and the permissions it needs are in the adapter's README.

### `genoa database`

```
genoa database [--config <file>] [--mode <mode>]
```

Opens the default bucket's storage provider and offers a menu: delete a collection, continue (shows the menu again) or exit. Deleting lists the collections stored in `.genoacms/databases/<database>/collections/` of that bucket, for each database of the config, offers each as `<database>/<file name>`, and deletes the one you choose. The menu also offers to add a collection; that does nothing yet.

### `genoa roles`

```
genoa roles [--config <file>] [--mode <mode>]
```

Composes a role or an assignment and prints it as JavaScript to paste into `authorization` in the config. It writes no file. Permissions are offered grouped by domain. A resource-scoped permission offers the buckets or collections the config declares and `*`, or free text when the config cannot be loaded or declares none. A database read or write grant may be narrowed to fields. An assignment lists the roles the config declares. A config that cannot be loaded is reported as a warning, and composing goes on. A role name that is not a JavaScript identifier is printed as a JSON string.

### `genoa rotate-root`

```
genoa rotate-root [--config <file>] [--mode <mode>]
```

Warns what rotating the root trust anchor does and asks for confirmation, `No` by default. Declined or cancelled, it prints `Cancelled. Nothing was changed.` and changes nothing. Confirmed, it runs core's rotation script.

## Environment passed to Vite

`dev` and `build` run Vite from core's installation, with core as the working directory; `rotate-root` loads core's rotation script through Vite inside the CLI's own process. All three pass these variables:

| Variable | Value |
| :-- | :-- |
| `GENOA_PROJECT` | the project root |
| `GENOA_MODE` | `development` or `production` |
| `GENOA_CONFIG` | the resolved `--config`, only when `--config` is given |
| `GENOA_TARGET` | the deployment target, only for `build` |

A `GENOA_*` variable in your own shell does not reach Vite. When `dev` or `build` spawns Vite and it exits non-zero, the command fails with `cli/vite-failed: vite <arguments> exited with <code>`.

## Failure

Any error is printed to standard error as its message alone, and the process exits with 1.

- An unknown command fails with `cli/unknown-command: <command>` followed by the usage, in a terminal or not.
- Without a command, in a terminal (standard input and output), `genoa` opens a menu of every command. Otherwise it prints `cli/no-command` followed by the usage and exits 1, so a script that calls `genoa` without a valid command fails instead of waiting for a prompt.
- When `build` or `deploy` runs in `production` mode without `--config`, and the default config uses a development-only adapter (`config/development-only`), the CLI adds after the error: `The config loaded was <path>, found by default; a production config is named explicitly.` and, when `genoa.config/production.ts` exists, `Run: genoa <command> [target] --config genoa.config/production.ts`.
