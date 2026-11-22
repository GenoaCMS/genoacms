---
type: rfc
number: 47
title: The roles of accounts and agents change only with both configuration permissions
status: implemented
commits: [d38c6d9e, 095cc7e6, 46209b50, 471437ff]
audit: [ZS1]
depends: []
architecture: [architecture/authorization.md, architecture/agent-access.md]
changes: [ENF-3 breaking, AGT-3 breaking, ADM-3 breaking, RES-1 breaking, RES-2 compatible]
commit-subject: "fix(core): require config:roles:manage to give accounts and agents other roles (RFC-0047)"
---

# RFC-0047: The roles of accounts and agents change only with both configuration permissions

## Summary

`authorization.md` ZF5: a holder of `config:users:manage` alone can give any account any role, a
wildcard role and their own account included, so that permission is full authority. Changing an
account's roles through `assignUserAccountRoles` requires both `config:users:manage` and
`config:roles:manage` (ZU10), but `upsertUserAccount`, which creates or replaces an account, writes
the roles it is given and requires only `config:users:manage`.

Agents have the same gap. `agent-access.md` AGT-3 lets `config:users:manage` alone create an agent
with roles, or change an agent's roles, and the token of a new agent goes to whoever created it. The
ceiling (AGT-5) keeps configuration permissions and the `*` permission away from agents, but not
`components:code` or `pages:publish` over every resource.

The author decided on 2026-11-20 (ZU13) that setting the roles of an account or an agent, or issuing
a token to an agent holding roles, needs both permissions on every path. This RFC:

1. Has `upsertUserAccount` also demand `config:roles:manage` when the write changes the account's
   roles: a new account with at least one role, or a stored account whose set of roles differs
   from the one submitted.
2. Has `createAgent` and `updateAgent` demand it the same way: a new agent with at least one role,
   or a stored agent whose set of roles differs.
3. Has `reissueAgentToken` demand it when the agent holds at least one role: a new token is the
   agent's authority, handed to whoever reissued it.
4. Decides each against the stored record the write replaces, read once for both the decision and
   the conditional write, so a concurrent change cannot slip a role change past the check.
5. Leaves to `config:users:manage` alone: an account or agent with no roles, a change of email or
   label that keeps the roles, reissuing the token of an agent with no roles, removing an account and
   revoking an agent.

**Amended after its falsification audit** (`authorization.md` ZS1; ZU14 to ZU16, `agent-access.md`
TU18):
- an `agent:` subject refused as an account and ignored by resolution, so no account shadows a stored agent (ZF15);
- assigning roles reports the lock before `config:roles:manage` (ZF17);
- ENF-3 narrowed to the permission rule for agents, the lock left open (ZF16);
- a repeated role refused for agents (TF5);
- tests for the conditional write of agents and for the stated orders (TF6, ZF17).

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/core/src/lib/script/authorization/administration.ts` | add and export `sameRoleSet` and `changesRoles`; by the amendment, `upsertUser` and `setUserRoles` refuse an `agent:` subject |
| `packages/core/src/lib/script/authorization/administration.server.ts` | `upsertAccount` takes `authorizeRoleChange` and calls it before the rule |
| `packages/core/src/lib/script/configuration/user.server.ts` | `upsertUserAccount` passes the demand for `config:roles:manage`; its doc comment names ENF-3; by the amendment, `assignUserAccountRoles` consults the lock before `config:roles:manage` |
| `packages/core/src/lib/script/agents/administration.server.ts` | `createAgent` and `updateAgent` demand `config:roles:manage` when the roles change, `reissueAgentToken` when the agent holds roles, in the order below; by the amendment, a repeated role is refused |
| `packages/core/src/lib/script/authorization/administration.test.ts` | the `sameRoleSet` and `changesRoles` tests; by the amendment, the ADM-3 tests, and its AGT-5 assignment test moves out |
| `packages/core/src/lib/script/configuration/accounts.server.test.ts` | new: the account service through the real manifests, on in-memory storage |
| `packages/core/src/lib/script/configuration/user.server.test.ts` | the `upsertAccount` stub takes and calls `authorizeRoleChange` |
| `packages/core/src/lib/script/agents/administration.server.test.ts` | the new agent tests, and by the amendment its storage mock gains the `afterRead` hook of `accounts.server.test.ts`, and it receives the AGT-5 test that moves; two existing tests create, and reissue for, agents with roles as a holder of both permissions |
| `packages/core/src/lib/script/agents/authenticate.server.test.ts`, `packages/core/src/lib/script/agents/manifest.test.ts` | the principal that creates an agent with roles as a fixture holds both permissions; no assertion changes |
| `packages/core/evidence/permissionMatrix.test.ts` | the `upsertAccount` stub takes and calls `authorizeRoleChange` |
| `packages/core/src/lib/script/authorization/resolution.server.ts` | by the amendment: `loadAuthorizationSource` leaves out and reports a stored account with an `agent:` subject |
| `docs/architecture/authorization.md` | after the code: ENF-3 to the text below, ZU13 current, ZF5 fixed, test files named, `verified` |
| `docs/architecture/agent-access.md` | after the code: AGT-3 to the text below, `verified` |
| `docs/architecture/authorization.md`, `agent-access.md`, by the amendment | after its code: ENF-3, ADM-3, RES-1, RES-2 and AGT-3 to §Amended by the audit, ZU14 to ZU16 and TU18 current, ZF15, ZF17, TF5 and TF6 fixed |
| `docs/rfcs/README.md` | the row of this RFC |

## Specification

**ENF-3, changed** (`breaking`: a caller holding only `config:users:manage` that creates or replaces
an account with other roles is now denied). New text:

> #### ENF-3 · Configuration permissions
>
> | Operation | Permission |
> | :-- | :-- |
> | listing roles and accounts, listing the buckets, collections and fields a grant can name | `config:roles:manage` |
> | creating, replacing or deleting a role | `config:roles:manage` |
> | creating an account with no roles, replacing an account with the same set of roles, removing an account | `config:users:manage` |
> | creating an account with roles, replacing an account with another set of roles, changing an account's roles | `config:users:manage` and `config:roles:manage` |
> | reading or changing the security policy | `config:security:manage` |
>
> Whether creating or replacing an account changes its roles is decided against the stored account
> the write replaces, none for a new account, comparing the roles as sets, so order does not count.
> `config:users:manage` is demanded first, then the lock (TIR-4), then `config:roles:manage` when
> the roles change; a denial writes nothing. A write that the decision no longer matches when it
> lands fails with `manifest/conflict` (ADM-1). Agents follow the same rule (`agent-access.md`
> AGT-3).
>
> The catalog of grantable resources gives names only: every configured bucket, and every collection
> with the names of its fields, a collection whose definition cannot be read with none.
>
> - Test: `packages/core/src/lib/script/authorization/administration.test.ts`, `packages/core/src/lib/script/configuration/accounts.server.test.ts`, `packages/core/src/lib/script/configuration/user.server.test.ts`, `packages/core/evidence/permissionMatrix.test.ts`
> - Level: unit

A declared subject is never stored, so for it the decision compares with no roles; the write is then
refused with `user/declared-in-configuration` (ADM-3) by a holder of both, and denied by a holder of
`config:users:manage` alone when the submission names roles.

**AGT-3, changed** (`breaking`: a caller holding only `config:users:manage` that creates an agent
with roles, changes an agent's roles, or reissues the token of an agent holding roles, is now
denied). New text; only the paragraph after the
table is new:

> #### AGT-3 · Administering agents
>
> The Agents section of `/configuration/iam` lists every agent, declared and stored, by subject,
> label and roles, the declared ones marked as declared in `genoa.config`. With
> `config:users:manage` a principal may:
>
> | Action | Effect |
> | :-- | :-- |
> | create, with a name, a label and roles | a stored agent `agent:<name>`, `<name>` matching `^[a-z0-9][a-z0-9-]{0,62}$` and not taken by any agent; a new token |
> | issue a new token | the agent's previous token stops working |
> | change label or roles | as given, subject to AGT-5 |
> | revoke | the stored agent is removed |
>
> Creating an agent with at least one role, changing a stored agent to another set of roles, and
> issuing a new token to a stored agent that holds at least one role also need
> `config:roles:manage` (`authorization.md` ZU13, ENF-3): a token is the agent's authority, given
> to whoever issued it. The roles are compared as sets with the stored agent the write replaces,
> none for a new agent. The checks run in this order, and a failed one changes no stored agent and
> leaves the previous token working. Creating: `config:users:manage`; the name matches;
> `config:roles:manage` when roles are given; the name is not taken; the roles exist and stay within
> the ceiling (AGT-5). Changing and issuing a token: `config:users:manage`; the agent is stored and
> not declared; `config:roles:manage` when it is needed; the roles exist and stay within the
> ceiling, when they are given. The write is conditional on the stored agents that were read.
>
> A new token is `gat_` followed by the base64url, without padding, of 32 random bytes. It is shown
> once, with a note that it cannot be shown again, and only its hash is stored. Any action on a
> declared agent is refused with `agents/declared: <subject> is declared in genoa.config.` Tokens do
> not expire.
>
> - Test: `packages/core/src/lib/script/agents/administration.server.test.ts`, `packages/core/src/lib/script/agents/tokens.test.ts`
> - Level: unit

**Signatures.**

```ts
// administration.ts
/** ENF-3, AGT-3: whether two lists name the same roles, in any order. */
function sameRoleSet (a: string[], b: string[]): boolean
/** ENF-3: whether writing `record` gives its subject another set of roles than the stored one. */
function changesRoles (users: UserRecord[], record: UserRecord): boolean

// administration.server.ts
const upsertAccount = async (
  record: UserRecord,
  authorizeRoleChange: (changesRoles: boolean) => void
): Promise<AdministrationResult<void>>
```

`upsertAccount` passes `applyToUsers` a rule that first calls
`authorizeRoleChange(changesRoles(state.users, record))` and then `upsertUser(...)` as today. A
`PermissionDeniedError` thrown by `authorizeRoleChange` propagates out of `applyToUsers` before
`saveUsers` runs. `upsertUserAccount` becomes:

```ts
const upsertUserAccount = async (ctx: AuthContext, record: UserRecord): Promise<AdministrationResult<void>> => {
  requirePermission(ctx, 'config:users:manage')
  if (isAdministrationLocked()) return LOCKED
  return await upsertAccount(record, changes => {
    if (changes) requirePermission(ctx, 'config:roles:manage')
  })
}
```

In `agents/administration.server.ts`, `createAgent` and `updateAgent` follow the order of AGT-3.
`requireAssignableRoles` splits in two: `loadKnownRoles(): Promise<Map<string, Role>>` loads the
authorization source and returns its roles by name, and `requireAssignableRoles(subject, names,
known)` checks against them, with refusals that do not change. `createAgent`:
`requireAdministrator`, `requireValidName`, `requirePermission(ctx, 'config:roles:manage')` when
`input.roles` is not empty, `loadKnownRoles`, `readStoredAgentsForAdministration`,
`requireUnclaimed`, `requireAssignableRoles`, then `writeStoredAgents(..., version)` with the
version of that one read. `updateAgent`: `requireAdministrator`, the read, `requireStored`,
`requirePermission(ctx, 'config:roles:manage')` when `!sameRoleSet(agent.roles, input.roles)`,
`loadKnownRoles` and `requireAssignableRoles`, then the write with the version of that read.

Loading the source creates an absent `agents.json` (AGT-2, as MAN-2 does for the users manifest).
`createAgent` therefore loads before it reads: read first, a first agent's write would be
conditional on an absence the load had already ended, and fail with `conflict/modified-since`. Its
role-permission check depends on the request alone, so it still runs before the load, and a denial
writes nothing; "name taken" moves after it. `updateAgent` reads first: the agent it changes is
stored, so the load cannot create `agents.json`.

`reissueAgentToken` has no roles to check: `requireAdministrator`, the read, `requireStored`, then
`requirePermission(ctx, 'config:roles:manage')` when the stored agent's `roles` is not empty, then
the write with the version of that read.

The denial is the existing one (GRT-5): `permission-denied: '<subject>' lacks config:roles:manage`.
The routes `createAccount`, `createAgent` and `updateAgent` are unchanged; a denial propagates as
today (ZF6).

### Amended by the audit

**ENF-3**, by the amendment. The paragraph after the table becomes:

> Whether creating or replacing an account changes its roles is decided against the stored account
> the write replaces, none for a new account, comparing the roles as sets, so order does not count.
> A subject starting with `agent:` is never an account (ADM-3). Creating, replacing and assigning
> demand `config:users:manage` first, then the lock (TIR-4), then `config:roles:manage` (when the
> roles change for creating and replacing, always for assigning), then the refusals of ADM-3; a
> denial writes nothing. A write that the decision no longer matches when it lands fails with
> `manifest/conflict` (ADM-1). Agents follow the same permission rule (`agent-access.md` AGT-3),
> but not the lock (ZF16).

**AGT-3**, by the amendment. The paragraph after the table becomes:

> Creating an agent with at least one role, changing a stored agent to another set of roles, and
> issuing a new token to a stored agent that holds at least one role also need
> `config:roles:manage` (`authorization.md` ZU13, ENF-3): a token is the agent's authority, given
> to whoever issued it. The roles are compared as sets with the stored agent the write replaces,
> none for a new agent. The checks run in this order. Creating: `config:users:manage`; the name
> matches; `config:roles:manage` when roles are given; the name is not taken; no role repeats
> (`user/duplicate-roles`), and the roles exist and stay within the ceiling (AGT-5). Changing and
> issuing a token: `config:users:manage`; the agent is stored and not declared;
> `config:roles:manage` when it is needed; no role repeats, and the roles exist and stay within the
> ceiling, when they are given. A failed check changes no stored agent and leaves the previous token
> working; creating may still leave the empty manifests that loading the roles creates
> (`authorization.md` MAN-2). The write is conditional on the stored agents that were read: one
> that loses the condition changes nothing and fails with `conflict/modified-since: agents has
> changed since version <version>; read it again.`, `absent` standing for the version when there
> was no `agents.json`.

**ADM-3**, `breaking` (an account with an `agent:` subject is refused). The table becomes:

> | Change | Refused with |
> | :-- | :-- |
> | creating or replacing an account, with its email and roles | `user/subject-empty`; `user/declared-in-configuration` for a declared subject; `user/agent-subject` for a subject starting with `agent:`; `user/duplicate-roles`; `user/unknown-roles: <names>` |
> | changing an account's roles | `user/declared-in-configuration`; `user/agent-subject`; `user/not-found`; `user/duplicate-roles`; `user/unknown-roles: <names>` |
> | removing an account | `user/declared-in-configuration`; `user/not-found` |
>
> Nothing refuses removing the last account that can administer, nor a stored account with an
> `agent:` subject.

The ceiling refusal of `changing an account's roles` goes: an agent's subject is refused before it.

**RES-1**, `breaking` (a stored account with an `agent:` subject stops counting). After its first
sentence:

> A stored account whose subject starts with `agent:` is not part of the merged data
> (`agent-access.md` AGT-4).

**RES-2**, `compatible`. The list gains a stored account left out by RES-1:
`account-agent-subject: '<subject>' in users.json is ignored; agents are stored in agents.json.`

The code:

- `administration.ts`: `upsertUser` returns `{ ok: false, reason: 'user/agent-subject' }` after
  `user/declared-in-configuration` when `isAgentSubject(record.subject)`; `setUserRoles` does so
  after `user/declared-in-configuration`, before `user/not-found`. Its ceiling check and
  `ceilingRefusal`, now unreachable, are removed.
- `resolution.server.ts`: `loadAuthorizationSource` merges only the stored accounts for which
  `!isAgentSubject(user.subject)`, and returns RES-2's warning for each of the others. The
  declarations-only path is unchanged.
- `configuration/user.server.ts`: `assignUserAccountRoles` demands `config:users:manage`, returns
  `LOCKED` when locked, then demands `config:roles:manage`.
- `agents/administration.server.ts`: `requireAssignableRoles` throws
  `new Error('user/duplicate-roles')` when `new Set(names).size !== names.length`, before the
  unknown roles.

## Non-goals

- Revoking an agent stays with `config:users:manage` alone: it removes authority, and gives none.
- ZF6: the denial still reaches the user as 500 outside storage.
- ZF12: listing accounts still needs `config:roles:manage`.
- The lock (TIR-4) does not start applying to agents.
- The roles screen (ROL-1, `CreateAccount.svelte`, `CreateAgent.svelte`): the screen loads only for
  `config:roles:manage`, so nothing it offers changes.
- `permission_matrix.md` in the thesis: the matrix's account record has no roles and it calls no
  agent function, so its table does not change.

## Tests

`authorization/administration.test.ts` (unit):

- `ENF-3, AGT-3: the same roles in another order are the same set`: `sameRoleSet(['Editor',
  'Publisher'], ['Publisher', 'Editor'])` is `true`; `sameRoleSet(['Editor'], ['Editor',
  'Publisher'])` and `sameRoleSet(['Editor'], [])` are `false`.
- `ENF-3: a new account with no roles changes no roles`: given no stored accounts, when the record
  of `s-1` has no roles, then `changesRoles` is `false`.
- `ENF-3: a new account with roles changes roles`: given no stored accounts, when the record of
  `s-1` has `['Editor']`, then `true`.
- `ENF-3: a stored account's roles in another order change no roles`: given `s-1` stored with
  `['Editor', 'Publisher']`, when the record has `['Publisher', 'Editor']`, then `false`.
- `ENF-3: a role added or removed changes roles`: given `s-1` stored with `['Editor']`, when the
  record has `['Editor', 'Publisher']`, then `true`; when it has no roles, then `true`.
- `ENF-3: another subject's roles do not count`: given `s-2` stored with `['Editor']`, when the
  record of `s-1` has `['Editor']`, then `true`.

`configuration/accounts.server.test.ts` (unit), new, on the harness of
`agents/administration.server.test.ts`: in-memory storage, test signing keys, test declarations.
Before each test, `roles.json` holds `Editor` and `Publisher`, and `users.json` holds `s-1` with
`['Editor']`. `accountAdmin` holds `config:users:manage`, `bothAdmin` also `config:roles:manage`.

- `ENF-3, ZF5: an account manager cannot create an account with roles`: when `accountAdmin` upserts
  `s-2` with `['Editor']`, then `PermissionDeniedError` naming `config:roles:manage`, and storage is
  unchanged.
- `ENF-3, ZF5: an account manager cannot change an account's roles by replacing it`: when
  `accountAdmin` upserts `s-1` with `['Editor', 'Publisher']`, then `PermissionDeniedError`, and
  storage is unchanged.
- `ENF-3, ZF5: an account manager cannot clear an account's roles by replacing it`: when
  `accountAdmin` upserts `s-1` with no roles, then `PermissionDeniedError`, and storage is unchanged.
- `ENF-3: an account manager creates an account with no roles`: when `accountAdmin` upserts `s-2`
  with no roles, then `{ ok: true }` and `users.json` holds `s-2` with no roles.
- `ENF-3: an account manager replaces an email when the roles stay`: when `accountAdmin` upserts
  `s-1` with a new email and `['Editor']`, then `{ ok: true }` and `s-1` has the new email and
  `['Editor']`.
- `ENF-3: a holder of both creates an account with roles`: when `bothAdmin` upserts `s-2` with
  `['Publisher']`, then `{ ok: true }` and `s-2` holds `['Publisher']`.
- `ENF-3: the role change is decided against the accounts the write replaces`: given the in-memory
  storage writes `users.json` with `s-1` holding no roles right after `users.json` is next read, when
  `accountAdmin` upserts `s-1` with `['Editor']`, then `{ ok: false, reason: 'manifest/conflict' }`
  and `s-1` holds no roles.
- `ENF-3, TIR-4: the lock is reported before the role check`: given the lock, when `accountAdmin`
  upserts `s-2` with `['Editor']`, then `{ ok: false, reason: 'administration/locked-by-configuration' }`.

`agents/administration.server.test.ts` (unit). `administrator` stays `config:users:manage` only;
a new `bothAdministrator` also holds `config:roles:manage`. The tests `AGT-3: creating an agent
stores its hash, never its token, and shows the token once` and `AGT-3: a reissued token replaces the
old one, and a revoked agent is gone` create `agent:writer` with `['Builder']`, so they create it as
`bothAdministrator`. The second also reissues as `bothAdministrator`. Their other calls and every
assertion stay. New tests:

- `AGT-3, ZF5: an account manager cannot create an agent with roles`: when `administrator` creates
  `writer` with `['Builder']`, then `PermissionDeniedError` naming `config:roles:manage`, no token is
  returned, and storage is unchanged.
- `AGT-3: an account manager creates an agent with no roles`: when `administrator` creates `writer`
  with no roles, then a token is returned and `agent:writer` is stored with no roles.
- `AGT-3, ZF5: an account manager cannot change an agent's roles`: given `agent:writer` stored with
  no roles by `administrator`, when `administrator` updates it to `['Builder']`, then
  `PermissionDeniedError`, and storage is unchanged; given it stored with `['Builder']` by
  `bothAdministrator`, when `administrator` updates it to no roles, then the same.
- `AGT-3: an account manager changes an agent's label when the roles stay`: given `agent:writer`
  stored with `['Builder']` by `bothAdministrator`, when `administrator` updates it to label `W2`
  and `['Builder']`, then the stored agent has label `W2` and `['Builder']`.
- `AGT-3: the role check comes before the roles are checked`: when `administrator` creates `writer`
  with `['NoSuchRole']`, then `PermissionDeniedError`, not `user/unknown-roles`.
- `AGT-3, ZF5: an account manager cannot reissue the token of an agent with roles`: given
  `agent:writer` stored with `['Builder']` by `bothAdministrator`, when `administrator` reissues
  its token, then `PermissionDeniedError` naming `config:roles:manage`, no token is returned,
  storage is unchanged, and the token from creation still resolves to `agent:writer`.
- `AGT-3: an account manager reissues the token of an agent with no roles`: given `agent:writer`
  stored with no roles, when `administrator` reissues its token, then the new token resolves to
  `agent:writer` and the old one to nothing.
- `AGT-3: an account manager revokes an agent with roles`: given `agent:writer` stored with
  `['Builder']` by `bothAdministrator`, when `administrator` revokes it, then it is no longer
  stored and its token resolves to nothing.
- `AGT-3: a holder of both creates and changes an agent's roles`: when `bothAdministrator` creates
  `writer` with `['Builder']` and then updates it to no roles, then both succeed and `agent:writer`
  holds no roles.

`configuration/user.server.test.ts` (unit): the stub `upsertAccount(record, authorizeRoleChange)`
calls `authorizeRoleChange(changesRoles(stored.users, record))` with the real `changesRoles`, then
records the call. Existing titles and assertions do not change; `account` has no roles, so they
still pass.

`evidence/permissionMatrix.test.ts` (unit): the same stub change over its empty state. No title or
expected cell changes.

### Amendment tests

Written first, marked `it.fails` where they fail today, each title carrying the statement and the
finding. `administrator` and `accountAdmin` hold `config:users:manage`, `bothAdministrator` and
`bothAdmin` both permissions, `nobody` neither.

| File | Title | Asserts |
| :-- | :-- | :-- |
| `core/src/lib/script/authorization/administration.test.ts` | `ADM-3, ZF15: an account is never created or given roles with an agent subject` | `upsertUser` of `agent:writer` with no roles, and `setUserRoles` of a stored `agent:writer` to no roles, return `{ ok: false, reason: 'user/agent-subject' }` |
| same | `ADM-3: a stored account with an agent subject can be removed` | `removeUser` of a stored `agent:writer` returns the accounts without it. Passes today |
| `core/src/lib/script/configuration/accounts.server.test.ts` | `ENF-3, ZF15: an account manager cannot strip a stored agent's roles through an account` | given `agent:writer` created with `['Editor']` by `bothAdmin`, when `accountAdmin` upserts the account `agent:writer` with no roles, then `user/agent-subject`, `users.json` unchanged, and `resolvePrincipal('agent:writer')` holds `pages:content_edit` |
| same | `ENF-3, ZF15: a holder of both cannot give an agent roles through an account` | `bothAdmin` upserting `agent:writer` with `['Editor']` gets `user/agent-subject`, and `users.json` holds no `agent:` subject |
| same | `RES-1, RES-2, ZF15: a stored account with an agent subject is ignored and reported` | given `users.json` written with `agent:writer` holding `['Editor']` and the agent stored with no roles, `resolvePrincipal('agent:writer')` holds no grant and its warnings hold RES-2's line |
| same | `ENF-3, TIR-4, ZF17: assigning roles reports the lock before config:roles:manage` | locked, `accountAdmin` assigning `s-1` `['Editor']` gets `administration/locked-by-configuration` |
| same | `ENF-3, TIR-4, ZF17: on a locked instance a principal without config:users:manage is denied` | locked, `nobody` upserting and assigning gets `PermissionDeniedError` naming `config:users:manage`. Passes today |
| same | `ENF-3, ZF17: the role check comes before the refusals of ADM-3` | `accountAdmin` upserting `s-2` with `['NoSuchRole']` gets `PermissionDeniedError` naming `config:roles:manage`, not `user/unknown-roles`. Passes today |
| `core/src/lib/script/agents/administration.server.test.ts` | `AGT-3, TF5: a repeated role is refused` | `bothAdministrator` creating `writer` with `['Builder', 'Builder']` fails with `user/duplicate-roles` and storage is unchanged; updating a stored `writer` with `['Builder']` to `['Builder', 'Builder']` fails the same, and it keeps `['Builder']` |
| same | `AGT-3, TF6: a change that loses a race writes nothing` | with `agents.json` changed right after the read the decision rests on (the `afterRead` hook, run once after the first read of `agents.json` when updating and reissuing, and after the second when creating, which loads the roles first: `writer`, holding no roles, given `['Builder']` by `bothAdministrator`, or another agent created), `administrator`'s label update and token reissue of `writer` and creation of `other` fail with `conflict/modified-since`; `writer` then holds `['Builder']` and its first token still resolves. Passes today |
| same | `AGT-3, TF6: the checks run in the stated order` | `nobody` creating `Bad!` with roles, and updating or reissuing `agent:nobody`, gets `PermissionDeniedError` naming `config:users:manage`; `administrator` creating `Bad!` with `['Builder']` gets `agents/invalid-name`; creating `e2e-builder` with `['Builder']` gets `PermissionDeniedError` naming `config:roles:manage`; updating the declared `agent:e2e-builder` to other roles gets `agents/declared`; updating a stored `writer` with no roles to `['NoSuchRole']` gets `PermissionDeniedError` naming `config:roles:manage`. Passes today |

**An existing test that moves.** `authorization/administration.test.ts` `AGT-5: assigning an agent a
role beyond the ceiling is refused` calls `setUserRoles` for `agent:writer`, which the amendment
refuses with `user/agent-subject` before the ceiling (ADM-3). It moves, with its title, to
`agents/administration.server.test.ts`, where agents are assigned roles: given the declared role
`Keys` granting `config:keys:manage`, `bothAdministrator` creating `writer` with `['Keys']`, and
updating a stored `writer` holding `['Builder']` to `['Builder', 'Keys']`, fail with
`authorization/agent-ceiling: agent:writer is assigned Keys, which grants permissions an agent
cannot hold.` and storage is unchanged. Passes today.

## Steps

1. Baseline: `pnpm --filter @genoacms/core test` and `node docs/tools/check-docs.mjs docs`; record
   the counts.
2. Tests: write the tests above from this RFC, those that fail today marked `it.fails`, in a session
   that has not seen the implementation; change the principal of the two existing agent tests as listed.
   Commit them: `test(core): roles of accounts and agents need both permissions (RFC-0047)`.
3. Code: `sameRoleSet`, `changesRoles`, `upsertAccount`, `upsertUserAccount`, `createAgent`,
   `updateAgent`, `reissueAgentToken`, the two stubs. Remove the `it.fails` markers and change no assertion. Commit with
   `commit-subject`.
4. Run §Verification. Update `authorization.md` (ENF-3 with its `Test:` line, ZU13 without
   **New**, ZF5 *History.* and `fixed, RFC-0047`, `verified`) and `agent-access.md` (AGT-3,
   `verified`). Set this RFC to `auditing` with `commits`. Commit: `docs: RFC-0047's statements to
   current`.
5. Audit ENF-3 and AGT-3 (WORKFLOW §6.3). Findings amend this RFC through steps 2 to 4; then
   `implemented` with `audit` (done: `authorization.md` ZS1).
6. The amendment: commit the architecture changes (ZU14 to ZU16, ZF15 to ZF17, TU18, TF5, TF6, ZS1,
   TS2), then this RFC, separately. Then its tests, written first (`test(core): RFC-0047's audit
   findings`), then its code, the markers removed and no assertion changed (`fix(core): RFC-0047's
   audit findings`).
7. Step 4 for the amendment: ENF-3, ADM-3, RES-1, RES-2 and AGT-3 current with their `Test:` lines,
   ZU14 to ZU16 and TU18 without **New**, ZF15, ZF17, TF5 and TF6 fixed, `verified`; this RFC
   `implemented` with the commits of steps 3 and 6 and `audit: [ZS1]`. ZF16 stays open.

## Verification

```bash
pnpm --filter @genoacms/core exec vitest run src/lib/script/authorization/administration.test.ts src/lib/script/configuration src/lib/script/agents evidence/permissionMatrix.test.ts
# all pass, none marked it.fails
pnpm --filter @genoacms/core test
# all pass; the count is the baseline plus the new tests
node docs/tools/check-docs.mjs docs
# 0 error(s)
```

A falsification audit of ENF-3 and AGT-3, by an agent that did not write the code, recorded as a
Verification entry of `authorization.md` and named in `audit`.

## Critique

**Pros**
- Closes the gap ZU10 was written to close, on both paths that bypassed it, and keeps the lifecycle
  of accounts and agents with `config:users:manage` alone, as GCP separates user administration
  from granting roles.
- The decision and the write share one read and one conditional write, so no interleaving changes
  roles past the check.
- The new tests run the real manifests, so a check moved after the write fails them.

**Cons & trade-offs**
- The demand depends on stored data, so whether a write is denied cannot be known from the request
  alone; the interface cannot gate the role selection on it beyond `config:roles:manage`.
- A holder of `config:users:manage` alone cannot change an email or label and the roles in one
  write; it takes two people or both permissions.
- Comparing as sets means a reordering is not a change; a rule that gave order a meaning would have
  to revisit it.
- Agent checks move before `requireAssignableRoles`, so an account manager submitting an unknown
  role is now denied instead of told the role is unknown; creating with roles under a taken name,
  they are denied instead of told the name is taken.
- An account manager can no longer replace a leaked token of an agent that holds roles; they can
  revoke the agent, and a holder of both recreates it with a new subject or reissues the token.

- By the amendment: an instance whose `users.json` holds an account with an `agent:` subject loses
  that account's roles at the next resolution, with a warning, and an account manager can remove it.
  A deployment that relied on such an account to give an agent roles must recreate the roles on the
  agent, which needs both permissions.

**Blindspots & missed edge cases**
- An agent created with no roles by an account manager and given roles later by a holder of both
  keeps the token the account manager saw at creation. The check covers giving roles, not who
  already holds the token; a holder of both who gives an agent roles should reissue its token.
- The permission matrix still calls `upsertUserAccount` with no roles only and no agent function; a
  regression of ZF5 shows only in `accounts.server.test.ts` and the agent tests.
- Agent administration still ignores `authorization.lockRoles`; on a locked instance an account
  manager holding both permissions can still change agents' roles (ZF16, left open by ZU16).
- Creating an agent loads the authorization source before the name and the roles are checked, so on
  an instance whose manifests are absent, a creation refused as a taken name or an unknown role
  still leaves the empty manifests MAN-2 creates. A denial of `config:roles:manage` comes before the
  load and leaves storage as it was.
