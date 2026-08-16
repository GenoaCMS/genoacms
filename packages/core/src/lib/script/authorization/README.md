# Authorization

Access control for GenoaCMS. **This is a core module, not a cloud abstraction service**, and that
is a deliberate architectural position rather than an accident of where the files landed.

Authentication asks *"who are you?"* — a standardised question that identity platforms answer
better than an application can, so it remains a `@genoacms/cloudabstraction` service with adapters.
Authorization asks *"what may you do in this application?"*. Cloud IAM can grant "read bucket X";
it cannot express which collections or which fields a principal may reach, it would require a cloud
identity for every copywriter and translator, and a permission such as `pages:publish` has no
meaning outside GenoaCMS. So there are no adapters here, and no `authorization` stanza in
`genoa.config`.

---

## The shape of it

Two questions get asked of this module, and the files divide along them:

| | Question | Answered by |
| :--- | :--- | :--- |
| **Decision** | Does this principal hold this permission? | `permissions` → `grants` → `roles` / `context` → `enforce` |
| **Resolution** | What does this principal hold in the first place? | `manifests*` → `verifier` → `resolution*` |

Decision is pure and synchronous. Resolution reads storage and is where things fail closed.

```
  vocabulary   permissions.ts ─────────────┐  (no imports at all)
                     │                     │
  model        ┌─────▼─────┐               │
               │ grants.ts │               │
               └──┬─────┬──┘               │
                  │     │                  │
          ┌───────▼──┐ ┌▼──────────┐       │
          │ roles.ts │ │ context.ts│       │
          └──┬───────┘ └────┬──────┘       │
             │              │              │
  decision   │         ┌────▼──────────────▼──┐
             │         │     enforce.ts       │  ← the service layer calls this
             │         └──────────────────────┘
             │
  storage    ├──► manifestSchemas.ts ──► manifests.ts ──► manifests.server.ts
             │                                │                    │
  trust      │           verifier.ts          │                    │
             │                │               │                    │
  resolution └──► resolution.ts               │                    │
                        │                     │                    │
                        └──► resolution.server.ts ◄────────────────┘
                                    ▲
                                    │  seedAdmin.server.ts
                                    │
                              auth.server.ts (login)
```

Dependencies point **downward and inward only**. Nothing in the model layer knows that storage
exists; nothing outside `resolution.server.ts` knows that manifests are files in a bucket.

---

## Files

### Decision path — pure, no I/O

| File | Responsibility |
| :--- | :--- |
| **`permissions.ts`** | The permission vocabulary: 21 permissions across four domains, each with a `scope` (`instance` \| `bucket` \| `collection`) and a `domain`. Derives `InstancePermission` and `ResourceScopedPermission` from that table, which is what makes omitting a required resource a *compile* error. Imports nothing. |
| **`grants.ts`** | `Grant` — a permission selector paired with the resource it applies to, each axis independently wildcardable. Owns `grantSatisfies`, the single matcher. |
| **`roles.ts`** | `Role` (a name and a set of grants) and `composeGrants`, the union of several roles with exact duplicates removed. Also the `SuperAdmin` role, which is an ordinary role holding the wildcard grant — not a special case in the matcher. |
| **`context.ts`** | `AuthContext` — the subject, its resolved grants, and whether that authority came from Tier-1 configuration. Threaded explicitly through service functions rather than read from ambient state, so omitting it is a type error. |
| **`enforce.ts`** | `requirePermission` (throws, returns nothing) and `hasPermission` (returns a boolean, **presentation only**), plus `PermissionDeniedError`. The entry point every service function will use. |

### Resolution path — reads storage, fails closed

| File | Responsibility |
| :--- | :--- |
| **`manifestSchemas.ts`** | JSON Schemas for `roles.json` and `users.json`. The permission enum is *derived from* `permissions.ts`, so schema and vocabulary cannot drift. Every object is closed. |
| **`manifests.ts`** | Parsing and serialization of manifest content, and the `UserRecord` type. Pure — no bucket — so the fail-closed rules are directly testable. |
| **`manifests.server.ts`** | Bucket paths and I/O. Reads **raw bytes, never parsed objects**, because a signature attests to what was written rather than to what a parser made of it. |
| **`verifier.ts`** | The `ManifestVerifier` interface and the `manifestTrust` policy. Keeps `trusted` and `verified` as separate facts. Imports nothing. |
| **`resolution.ts`** | Pure resolution: subject + authorization data → `AuthContext`. Owns the fail-closed rules and the handling of dangling role references. |
| **`resolution.server.ts`** | Orchestration: read → verify → parse → resolve, plus the trust policy read from config and the operational alert. The only file here that knows about `@genoacms/cloudabstraction`. |
| **`seedAdmin.server.ts`** | `isSeedAdmin`, resolved from `genoa.config` alone. Tiny on purpose — it is the root of authority and should be readable at a glance. |

### The `.server.ts` boundary

SvelteKit refuses to bundle a `.server.ts` file into client code. The split here is not cosmetic:
every file *without* the suffix is pure, unit-testable without mocking storage, and safe to import
from a Svelte component when the adaptive UI arrives. Every file *with* it touches configuration or
the bucket.

That is why `resolution.ts` and `resolution.server.ts` are two files rather than one, and why
`isSeedAdmin` is passed into `resolveSubject` as a boolean instead of being called inside it.

---

## Runtime flow

```
login (auth.server.ts)
  └─ authenticate()                    identity provider returns { subject, email }
  └─ resolvePrincipal(subject)         resolution.server.ts
       ├─ isSeedAdmin?  ── yes ──►     wildcard grants, storage never touched
       └─ no
            ├─ readRawManifest()       roles.json, users.json
            ├─ verifier.verify()       → decideTrust(policy)
            ├─ JSON.parse + parse*()   schema validation
            └─ resolveSubject()        user → roles → grants
```

The seed administrator short-circuits **before storage is read at all**: a recovery path that
requires the bucket to be readable is no recovery path for a bucket that is not.

Any failure along that chain — unreadable, untrusted, not JSON, schema-invalid — produces the same
outcome: an unavailable source, which grants nothing. There is no branch on which a manifest that
failed a check confers a permission.

---

## Current seams

**Manifests are not signed yet.** `verifier.ts` ships a placeholder that reports
`no-manifest-verifier-configured` rather than pretending to verify, and `security.manifestTrust`
decides what that means. While it is `'accept-unsigned'` (the current default), an actor able to
write to the bucket out-of-band can edit authorization and the CMS will act on it.

Closing this means: implement `ManifestVerifier`, register it in `resolution.server.ts`, and flip
the default to `'require-signature'`. Nothing above that layer changes.

**Grants are resolved at login only.** There is no request-time `AuthContext` yet — the session
token still carries only `{ sub, email }`. Until the token carries resolved grants, `enforce.ts`
has no context to be called with outside of tests.

---

## Not here yet

| | Lands with |
| :--- | :--- |
| `sessions.json` and refresh-token records | the session model, which defines their shape |
| First-run `SuperAdmin` provisioning | bootstrapping, using `writeRolesManifest` / `writeUsersManifest` |
| `requirePermission` calls in service functions | service-layer enforcement |
| Field-level masking | declared against collection schemas, not as permissions |

---

## Tests

| File | Covers |
| :--- | :--- |
| `permissions.test.ts` | the table is complete, partitioned by domain, and rejects inherited object properties as permissions |
| `enforce.test.ts` | the matcher, both wildcard axes, and the two ways it could silently over-grant |
| `manifests.test.ts` | schema rejection, whole-manifest failure, unsafe keys, round-tripping |
| `resolution.test.ts` | fail-closed behaviour, seed-admin recovery, dangling roles, trust policy |

Security-critical guards in this module are **mutation-tested**: break the guard, confirm the suite
fails, restore. A denial test passes just as happily against code that denies *everything*, so the
allow direction is asserted alongside every deny.
