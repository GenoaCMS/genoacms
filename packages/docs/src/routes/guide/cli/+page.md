---
title: CLI
---

For initializing, running and deploying GenoaCMS projects there is a [CLI tool](https://github.com/GenoaCMS/cli). It is a npm script executable by running `npx @genoacms/cli <command>`.

Run it with no command for an interactive menu.

## Commands

| Command | |
| :--- | :--- |
| `init` | Create a project: install the adapters you choose and write `genoa.config`. |
| `run` | Run the CMS locally. |
| `deploy` | Deploy through the configured deployment adapter. |
| `database` | Configure the database. |
| `roles` | Compose a role or an assignment to paste into `genoa.config`. |
| `rotate-root` | Replace the root trust anchor. **See below before running this.** |

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
npx @genoacms/cli rotate-root
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
