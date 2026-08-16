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
| `rotate-root` | Replace the root trust anchor. **See below before running this.** |

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
