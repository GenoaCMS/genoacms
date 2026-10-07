---
title: CLI
---

`genoa`, the [`@genoacms/cli`](https://github.com/GenoaCMS/genoacms/tree/main/packages/cli) package,
sets a project up, runs it, builds it and deploys it. Add it to a project with
`npm install -D @genoacms/cli` (or `pnpm add -D @genoacms/cli`), or run it without installing as
`npx @genoacms/cli <command>` (or `pnpm dlx @genoacms/cli <command>`).

```text
genoa <command> [target] [flags]
```

Run in a terminal with no command, it opens a menu. `genoa --help` lists the commands,
`genoa <command> --help` shows one command's usage, and `genoa --version` prints the version.

## Commands

| Command | Does | Default mode |
| :--- | :--- | :--- |
| `init` | Scaffolds a project in this directory: asks for an adapter suite and an authentication adapter, installs the packages, writes `genoa.config/` | — |
| `dev` | Runs GenoaCMS locally, reloading when the config or anything it imports changes. `run` is an alias | development |
| `build [target]` | Builds GenoaCMS for a deployment target | production |
| `deploy [target]` | Builds, then deploys to a deployment target | production |
| `database` | Deletes dynamic collections from the default bucket | development |
| `roles` | Composes a role or an assignment to paste into the config | development |
| `rotate-root` | Rotates the root trust anchor, after asking to confirm. **See below before running it** | development |

An unknown command is an error that prints the usage; it never opens the menu.

## Flags

| Flag | |
| :--- | :--- |
| `-c`, `--config <file>` | The config file, relative to the current directory. Default: `genoa.config.ts`, else `genoa.config/development.ts`. A production config is always named |
| `-m`, `--mode <mode>` | `development` (`dev`) or `production` (`prod`). Default: the command's, in the table above |
| `--no-inline` | `build` and `deploy`: refuse `inline()` values in the build instead of warning |
| `-h`, `--help` | Show the usage |
| `-v`, `--version` | Show the CLI's version |

The mode decides which adapters are allowed: a production run refuses development-only adapters, such
as the `.genoacms/secrets.env` store. When a production `build` or `deploy` without `--config` is
refused for that reason, the CLI names the file it loaded and how to name the production config.

## Building

```bash
genoa build gcp --config genoa.config/production.ts
```

`build` loads the config and refuses on any error, then builds for the target: the one named, else
`deployment.default`, else the first key of `deployment.targets`. It writes the artifact to
`.genoacms/build/`: the target's SvelteKit build with the config embedded — without any target
option — and a generated `package.json` listing exactly the packages the server imports, pinned to
the installed versions. No project source and no config file are part of it.

## Deploying

```bash
genoa deploy gcp --config genoa.config/production.ts
```

`deploy` runs `build`, then hands the artifact to the target's adapter, which publishes it: a Cloud
Run function, a Lambda function, a directory for a Node server. The target's options are resolved
**on your machine**, through the config's secrets store: its credentials are used to deploy and never
enter the build. A failed step says which one failed.

## Composing roles

`roles` walks you through a declaration and prints it. It does not edit `genoa.config` — that file
holds your adapters and credentials, and a tool that rewrites it can break them; printing gives you
the part that is actually hard to get right.

What is hard to get right is that **a mistyped permission is not an error anywhere**. The grant
stores, the role looks correct in the interface, and the check it was meant to satisfy simply never
matches. The same goes for a bucket name that does not exist. So neither is typed here:

- permissions are chosen from the vocabulary, grouped by domain;
- buckets and collections are chosen from the ones your `genoa.config` declares;
- `db:collection:read` and `db:collection:write` can be narrowed to named fields.

Paste the result into the `authorization` stanza — see [configuration](/guide/config/structure) for what
declaring a role means, and [roles and permissions](/guide/authorization) for what the permissions
do.

:::note[It runs offline]
Nothing is read from your bucket, so this works before an instance has ever started. If the config
cannot be loaded at all, the command still runs and asks you to type resource names instead of
offering them.
:::

## Key rotation

### Subordinate keys — automatic

The keys that sign your authorization data rotate on their own, on the interval in
`security.subordinateKeyRotationDays` (default 90 days). Rotation happens the next time something
is signed after the interval elapses, so there is nothing to schedule and nothing to run.

Rotation is additive: the previous key stays in the registry, so everything it signed keeps
verifying. You will see the number of keys in `.genoacms/keys/public.json` grow over time, and one
`GENOACMS_SUBORDINATE_KEY_SEED_…` secret per key.

Nothing needs redeploying. Consumers verify new keys against the root they already hold, which is
the entire reason the hierarchy has two levels.

### The root — manual, and disruptive

```bash
genoa rotate-root --config genoa.config/production.ts
```

This is the **root** only. Rotating and revoking the subordinate keys that sign your content is
done in the CMS, under Configuration → [Signing keys](/guide/signing-keys), and costs no consumer
any redeployment.

**Rotating the root strands every deployed consumer until it is rebuilt.** The root public key is
embedded in consumer applications; replacing it means everything this instance signs is rejected
until those applications ship with the new key.

Rotating also:

- **overwrites the current root seed irrecoverably** — there is no undo, and no archived copy;
- **discards the existing subordinate keys**, because a compromised root could have signed a
  registry naming keys an attacker controls, and nothing distinguishes those from the legitimate
  ones once the anchor that vouched for them is untrusted;
- consequently **invalidates `roles.json` and `users.json`**, which are quarantined and replaced
  empty — the instance returns to seed-administrator-only until roles are rebuilt.

The command prints the new public key. That output is the only record of it, so capture it before
closing the terminal.

:::caution[It asks first, and refuses if not answered]
The command requires an explicit confirmation and aborts without one, so an unattended or
accidental invocation changes nothing. This is the only command in GenoaCMS that cannot safely be
run just to see what it does.
:::

:::note[When to rotate the root]
Only when the root private key may have been exposed, or as part of a planned migration where you
control the consumer release schedule. It is not routine maintenance — subordinate rotation is what
limits day-to-day key exposure, and it costs nothing.
:::
