# GCP secrets: Secret Manager

Part of the [GCP adapter architecture](README.md). Markers and IDs as defined there.

## 1. Role

`@genoacms/adapter-gcp/secrets` is the production secrets store on GCP. The host resolves `secret()`
references through it (`configuration.md` §6), and core reads and writes its own signing material
through it directly: the root seed, the registry sequence and the subordinate seeds
(`configuration.md` §6.3). Only one secrets provider may be configured (`configuration.md` non-goal).

Options: `projectId`, and `credentials?`, a **bootstrap** secret (`env()` or `inline()` only),
because it cannot come from the store it configures. Production omits it (README GU2).

## 2. Behavior

GenoaCMS keys map one to one onto secret IDs in `projects/<projectId>/secrets/<key>`. Keys are
validated by the contract (`assertValidSecretKey`).

| Contract method | Secret Manager calls | Semantics |
| :-- | :-- | :-- |
| `getSecret(key)` | `accessSecretVersion(latest)` | The value, or `undefined` **only** when the secret does not exist. Any other failure propagates, including a disabled or destroyed `latest`. Reading absence into it would make core generate a replacement key. |
| `setSecret(key, value)` | `getSecret`, then `createSecret` if missing (a lost race is fine), then `addSecretVersion`, then best-effort cleanup (§3) | Overwrite: a new version becomes `latest`, and older enabled versions are destroyed. |
| `setSecretIfAbsent(key, value)` | `createSecret`, then `addSecretVersion` | An atomic claim: exactly one concurrent caller creates the name. Others get `false` on `ALREADY_EXISTS`. A crash between the two calls leaves a name with no version, and the caller polls rather than reading that as absence. |
| `deleteSecret(key)` | `deleteSecret` | Removes every version. `false` when already absent. |

Secrets are created with automatic replication and a 7-day `versionDestroyTtl` (§3).

**Who overwrites.** `setSecret` is called by root rotation (`rootRotation.server.ts`: once per
rotation) and by the registry sequence (`registrySequence.server.ts`: on every change to the key
registry). The registry sequence therefore gains a version every time a subordinate key is issued.

| # | Finding | Where |
| :-- | :-- | :-- |
| GF5 | *History, fixed by GD4 (RFC-0022).* **Superseded versions accumulated.** Reads take `latest`, and nothing removes older versions. Every one of them stays readable to anyone with access to the project's secrets, and is billed as an active version. For the registry sequence that is one more version per key issuance, indefinitely. For the root seed, every retired root stays readable. | `src/secrets/runtime.ts`, `setSecret` |

## 3. Destroying superseded versions (RFC-0022)

**GD4. `setSecret` destroys the versions it supersedes, with a recovery window (GF5).**

1. Secrets the adapter creates, in both `setSecret` and `setSecretIfAbsent`, get `versionDestroyTtl` of **7 days**. Secret Manager then keeps a destroyed version **disabled** for that period before destroying it, so a bad overwrite can be undone in the console or with `gcloud`.
2. After `addSecretVersion` succeeds, `setSecret` lists the secret's `ENABLED` versions and destroys every one whose version number is **lower** than the version it just added. Versions added concurrently by another caller are higher, or are the other caller's to clean up, so no caller destroys a newer value.
3. The cleanup is best effort. The new value is already written and is `latest`, so a failure in cleanup does not fail `setSecret`. It is reported as a warning naming the secret, and the next `setSecret` on that secret retries it, because it destroys every lower enabled version, not only the previous one.

`setSecretIfAbsent` never supersedes anything, so it does no cleanup. `getSecret` is unchanged.

*Why:* the contract never consults history (`secrets/runtime.ts` doc comment), so the old versions
serve nobody and only cost money and exposure. The recovery window keeps the one real use of history,
undoing a bad rotation by hand, without GenoaCMS depending on it.
*Cost:* two more permissions for the runtime identity (`secretmanager.versions.list`,
`secretmanager.versions.destroy`; README §4), and one extra list call per overwrite.

**Secrets created before GD4** have no `versionDestroyTtl`, so the versions GD4 destroys there are
destroyed **immediately**, without a window. Operators of an existing instance set it once per secret
before deploying a build that contains RFC-0022. The RFC lists the command. GenoaCMS does not change an existing secret's
configuration itself.

## 4. History

*History.* Secret Manager support was added on 2026-08-16 as a `cloudabstraction` secrets service,
then given atomic claims (`setSecretIfAbsent`) for the root trust anchor. RFC-0007 moved the same
bodies into the runtime unchanged.

## 5. Verification

**GS4, for GD4.**
- Unit tests, with the SDK mocked (RFC-0022, passing): the TTL on both create paths; only lower-numbered enabled versions are destroyed; a cleanup failure does not fail `setSecret`.
- Live, by the author, not run yet: in a scratch project, `setSecret` three times; expect one enabled version, two disabled ones scheduled for destruction, and `getSecret` returning the third value.

## Critique & architectural sanity check: GD4

**Pros**
- Exposure and cost stop growing with use. A retired root seed becomes unreadable after the window, which is what retiring it meant.
- No contract change and no new call path in core. The cleanup lives entirely inside `setSecret`.
- The recovery window turns an irreversible operation into a reversible one for a week.

**Cons & trade-offs**
- Destruction is irreversible after the window. A rotation that went wrong unnoticed for more than 7 days cannot be rolled back from the store.
- The runtime identity gains `versions.destroy`, a destructive permission. A compromised instance could destroy history it could previously only read. It could already overwrite and delete secrets, so the new power is small.
- Best-effort cleanup means a persistent permission gap only shows as warnings, while versions keep accumulating as before.

**Blindspots & missed edge cases**
- **Secrets created outside GenoaCMS** (for example `GENOACMS_CREDENTIALS`, created by an operator) have whatever TTL the operator gave them. GenoaCMS only overwrites its own signing secrets, so that is theirs to manage, but the window is not guaranteed for secrets GenoaCMS did not create.
- **Version numbers are compared as integers** from the version resource name. The name format is Secret Manager's, and a change there would break the comparison. The list filter `state:ENABLED` also depends on Secret Manager's filter syntax.
- **A 7-day window is a guess.** It should be long enough to notice a bad rotation. It is not an option, and making it one is deferred until someone needs a different value.
