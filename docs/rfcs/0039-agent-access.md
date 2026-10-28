---
type: rfc
number: 39
title: Agent access through MCP, with checked and conditional component and page edits
status: implemented
commits: [7f69446f]
depends: [38]
architecture: [architecture/agent-access.md, architecture/components.md, architecture/contracts/authentication.md]
changes: [CMP-8 breaking, SRC-4 breaking, PGE-2 breaking, PGE-4 breaking, PGE-5 breaking, PGE-6 breaking, PGE-7 breaking, AUTHN-5 compatible]
commit-subject: "feat(core): agent access through MCP, with checked and conditional component and page edits (RFC-0039)"
---

# RFC-0039: Agent access through MCP, with checked and conditional component and page edits

## Summary

The author wants AI agents to build components and pages (`agent-access.md` TU1). Agents need an
account of their own, a way in, and tools; and the services those tools call must not accept what
the screens' forms let through today (`components.md` NF1, NF2, NF4 to NF8, NF11). This RFC:

1. Declares agents in `authentication.agents` of the config, and stores runtime agents in a signed
   `agents.json`, administered on `/configuration/iam` (AGT-1 to AGT-3; TU2, TU6).
2. Keeps agents and people apart: the `agent:` prefix, no sign-in for an agent subject, tokens only
   for agents (AGT-4; AUTHN-5).
3. Refuses any role that would give an agent a configuration permission or the wildcard (AGT-5;
   TU5).
4. Serves MCP at `POST /mcp`, stateless, authenticated by a bearer token (MCP-1, MCP-2, MCP-4; TU1,
   TU3).
5. Adds 18 tools over components and pages (TOL-1 to TOL-17; TU8).
6. Saves a header only for an existing component and keeps its kind (CMP-8; NU2; NF1, NF2).
7. Checks page names and never replaces a page on creation (PGE-2, PGE-11; NU3; NF4).
8. Builds nodes only of stored, published components that the slot accepts (PGE-2, PGE-5; NU4; NF5,
   NF8).
9. Takes only values from a node edit, checks them, treats slot changes as structure, and deletes
   removed subtrees (PGE-4; NU5; NF6, NF7).
10. Makes every save conditional on the version it was read at, on the screens and in the tools
    (HIS-2, TOL-1; NU6, TU9; NF11).

Limiting failed tokens (MCP-3) is not part of this RFC; it follows RFC-0031 (TU11).

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/config/src/config.ts` | `authentication.agents?: Record<string, { label: string, token: Secret<string> }>` |
| `packages/config/src/load/agents.ts` | new: the config rules of AGT-1 and AGT-5 that load can decide |
| `packages/config/src/load/agents.test.ts` | new: their tests |
| `packages/config/src/load/rules.ts` | calls `agentIssues(ctx)`; `authentication.agents.<subject>.token` is a place a reference may stand |
| `packages/config/src/host/index.ts` | `Host.agents: Readonly<Record<string, { label: string, token: unknown }>>`, read from the manifest on every access |
| `packages/core/src/lib/script/signing/envelope.ts` | `'genoacms.agents.v1'` in `DOCUMENT_TYPES` |
| `packages/core/src/lib/script/agents/tokens.ts` | new, pure: `generateAgentToken()`, `hashAgentToken(token)`, `AGENT_TOKEN_MIN_LENGTH = 43` |
| `packages/core/src/lib/script/agents/ceiling.ts` | new, pure: `isAgentSubject`, `exceedsAgentCeiling(grants)`, `AgentCeilingError` |
| `packages/core/src/lib/script/agents/manifest.ts` | new, pure: `AgentsManifest`, `parseAgentsManifest` |
| `packages/core/src/lib/script/agents/manifest.server.ts` | new: load and save `.genoacms/security/agents.json` as `manifests.server.ts` does the users manifest |
| `packages/core/src/lib/script/agents/declared.server.ts` | new: the declared agents with resolved tokens, checked once per process (AGT-1) |
| `packages/core/src/lib/script/agents/authenticate.server.ts` | new: `agentForToken(token): Promise<string \| undefined>` (MCP-2) |
| `packages/core/src/lib/script/agents/administration.server.ts` | new: `createAgent`, `reissueAgentToken`, `updateAgent`, `revokeAgent`, each requiring `config:users:manage` (AGT-3) |
| `packages/core/src/lib/script/agents/*.test.ts` | new: the unit tests of §Tests |
| `packages/core/src/lib/script/authorization/resolution.server.ts` | stored agents join the users the source knows (roles from `agents.json`, email `''`); AGT-5's refusal at resolution |
| `packages/core/src/lib/script/authorization/resolution.ts` | `resolveSubject`: an `agent:` subject whose roles exceed the ceiling resolves with no grants and the warning `agent-ceiling: <subject> …` |
| `packages/core/src/lib/script/authorization/administration.ts` | `setUserRoles`, `replaceRole`: AGT-5's refusals; `replaceRole` takes the users who hold roles |
| `packages/core/src/lib/script/auth/providers.server.ts` | AGT-4: an `agent:` subject from a provider fails as `invalid-credentials`, logged |
| `packages/core/src/hooks.server.ts` | no cookie principal is attached for `/mcp` |
| `packages/core/src/routes/mcp/+server.ts` | new: `POST` (MCP-1, MCP-2), `GET` and `DELETE` answer 405 |
| `packages/core/src/lib/script/mcp/protocol.ts` | new, pure given a registry: JSON-RPC dispatch, `initialize`, `ping`, `tools/list`, `tools/call` (MCP-1, MCP-4) |
| `packages/core/src/lib/script/mcp/tools/components.server.ts` | new: TOL-2 to TOL-7 |
| `packages/core/src/lib/script/mcp/tools/pages.server.ts` | new: TOL-8 to TOL-15 |
| `packages/core/src/lib/script/mcp/tools/registry.server.ts` | new: name, description, input schema and handler of every tool |
| `packages/core/src/lib/script/mcp/*.test.ts`, `tools/*.test.ts` | new: the unit tests of §Tests |
| `packages/core/src/lib/script/testing/memoryStorage.ts`, `signingKeys.ts`, `components.ts`, `host.ts`, `requests.ts`, `mcp.ts` | new, test support: a versioned in-memory storage, real signing keys, component fixtures, a host stub, form requests, and the one place the tests name `handleMessage` and `toolRegistry` |
| `packages/core/src/lib/script/storage/storage.server.ts` | `getInternalObjectFlattedVersioned(path)`; `uploadInternalObjectFlatted(path, data, options?)` |
| `packages/core/src/lib/script/components/conflict.ts` | new: `ConflictError`, `UnversionedError`, `isConflict(error)`, `writeConditionally(write, object, version)` (HIS-2) |
| `packages/core/src/lib/script/components/componentHeader/io.server.ts`, `editing.server.ts`, `user.server.ts` | versioned reads; conditional saves, undo, redo; CMP-8's existence and kind |
| `packages/core/src/lib/script/components/editor/io.ts`, `editing.server.ts`, `user.server.ts` | versioned reads; conditional saves, undo, redo |
| `packages/core/src/lib/script/components/page/names.ts` | new, pure: `isPageName(name)` (PGE-11) |
| `packages/core/src/lib/script/components/page/edits.ts` | new, pure: `addNode`, `moveNode`, `removeNode`, `setValues`, `applyNodeEdit`, `checkValue`; each returns the new contents or a refusal |
| `packages/core/src/lib/script/components/page/edits.test.ts` | new: their tests |
| `packages/core/src/lib/script/components/page/page.server.ts` | page paths appended as given (PGE-11); versioned read; `createPageEntry` with `ifAbsent`; conditional upload |
| `packages/core/src/lib/script/components/page/entry/index.ts` | `createPageEntry` from a stored, published header; node operations through `edits.ts` |
| `packages/core/src/lib/script/components/page/user.server.ts` | versions through every save; `saveUserNodeEdit` deciding content or structure (PGE-4) |
| `packages/core/src/routes/(admin)/components/pages/+page.server.ts` | `createPage`: PGE-2, PGE-11 |
| `packages/core/src/routes/(admin)/components/pages/[pageName]/[nodeUid]/+page.server.ts` | every action reads `version`; `update` and `updateAndGenerateTree` as PGE-4; `addChildNode` takes `componentUID`; conflicts as HIS-2 |
| `.../pages/[pageName]/[nodeUid]/NodeEditor.svelte`, `.../Editor/types/Components.svelte`, `.../pages/[pageName]/UpdatePreviewURL.svelte`, `.../pages/[pageName]/Undo.svelte`, `Redo.svelte` | send `version`; `addChildNode` sends `componentUID`; the conflict message |
| `packages/core/src/routes/(admin)/components/registrar/[componentId]/update.remote.ts`, `+page.server.ts`, `ComponentHeaderEditor.svelte` | `version` in and out; conflict message |
| `packages/core/src/routes/(admin)/components/editor/[componentId]/save.remote.ts`, `+page.server.ts`, `SaveComponent.svelte`, `Undo.svelte`, `Redo.svelte` | `version` in and out; conflict message |
| `packages/core/src/routes/(admin)/configuration/iam/+page.server.ts` | load the agents; actions `createAgent`, `reissueAgentToken`, `updateAgent`, `revokeAgent` |
| `packages/core/src/routes/(admin)/configuration/iam/AgentCard.svelte`, `CreateAgent.svelte`, `IssuedToken.svelte`, `+page.svelte` | new: the Agents section |
| `packages/core/genoa.config/e2e.ts` | an agent `agent:e2e-builder`, token `env('GENOACMS_E2E_AGENT_TOKEN')`, assigned a declared role `Builder` holding every `components:*` and `pages:*` permission |
| `packages/core/e2e/mcp.test.ts` | new: the e2e tests of §Tests |
| `packages/core/e2e/server.ts` | passes `GENOACMS_E2E_AGENT_TOKEN` through when it is set; otherwise sets it to 43 random base64url characters per run |
| `packages/core/evidence/permissionMatrix.ts`, `permissionMatrix.test.ts` | the new and versioned user-layer operations: each role's allowed set written from CMP-11, PGE-10 and TOL-17; `version` at the call sites of the changed services |
| `packages/core/src/lib/script/components/{componentHeader,editor,page}/*.test.ts` (existing) | `version` at the call sites of the changed services, and the mocks of `io` extended for versioned reads; no assertion changes |
| `packages/core/src/lib/script/mcp/tools/*.test.ts`, `testing/components.ts`, `testing/memoryStorage.ts` | fixture publication ids are UUIDs (`publicationIdOf`), as PUB-5 validates; a missing object throws `ObjectNotFoundError` |
| `.changeset/agent-access.md` | new: `minor` for `@genoacms/core`, `patch` for `@genoacms/config` |
| `docs/architecture/agent-access.md`, `docs/architecture/components.md`, `docs/architecture/contracts/authentication.md`, `docs/README.md` | to current, step 8 |

## Specification

### Added

AGT-1, AGT-2, AGT-3, AGT-4, AGT-5, AGT-6, MCP-1, MCP-2, MCP-4, TOL-1 to TOL-17 as
`agent-access.md` states them; HIS-2 and PGE-11 as `components.md` states them.

### Changed

**CMP-8 · Saving a header** (breaking): the component must exist, its kind is kept, and the save
carries a version.

> The remote command `updateComponent({ header, version })` validates the header against CMP-4 and
> applies CMP-5. A header whose `uid` names no stored component is refused with
> `components/no-such-component: <uid> does not exist.` The header is stored with the stored `type`,
> whatever `type` it carries, conditionally on `version` (HIS-2), and the step is recorded (HIS-1).
> It answers `{ status: 'success', text: 'Component updated', historyLength, futureLength, version }`;
> `{ status: 'fail', text: 'Invalid data' }` for an invalid argument; `{ status: 'fail', text }` with
> the error's message for a CMP-5 refusal, an unknown component or a conflict; and throws any other
> failure. The form actions `undo` and `redo` of `/components/registrar/<uid>` take the form field
> `version` and step its history (HIS-1, HIS-2).

**SRC-4 · Saving a body** (breaking): adds `version` to the argument and the answer, and conflicts.

> The remote form `saveComponentRemote({ uid, body, version })` validates `uid` as a UUID, `body` and
> `version` as strings, writes the body into the definition conditionally on `version` (HIS-2) and
> records the step (HIS-1). It answers `{ status: 'success', text: 'Code saved', historyLength,
> futureLength, version }`, or `{ status: 'fail', text }` with `Invalid data` or any error's message.
> Saving does not touch `publishedBody` or `publishedSignature`. The form actions `undo` and `redo` of
> `/components/editor/<uid>` take the form field `version` and step its history.

**PGE-2 · Creating a page** (breaking): a checked name, no replacement, a published component.

> The form action `createPage` of `/components/pages` reads `name` and `componentUID`; when either is
> missing it fails with 400 `{ reason: 'no-page-name' }`. A name PGE-11 refuses fails with 400
> `{ reason: 'pages/invalid-name' }`; a name taken, with 409 `{ reason: 'pages/exists' }`; a
> component with no valid header or no publication, with 400
> `{ reason: 'pages/unpublished-component' }`. Otherwise it creates an entry named `name`, with an
> empty preview URL and one root node of the component, written only if no entry of that name exists,
> and answers 307 to `pages/<name>`. A new node has a value for every attribute of the component's
> stored header: the schema's `default` when it is truthy, otherwise `false`, `0`, `''`, or `[]` for
> `link`, `storageResource` and `components`.

**PGE-4 · Editing a node** (breaking): values only, checked; slots as structure; removed subtrees go.

> The form actions `update` and `updateAndGenerateTree` of `/components/pages/<name>/<nodeUid>` read
> `componentNode`, a JSON node, and `version`; without them they fail with 400
> `{ reason: 'no-diff' }`. Of the node sent, only `data[<attribute uid>].value` is read, for the
> attributes of the stored node; any other field is ignored. Each value of a non-slot attribute is
> checked as TOL-11 checks it; one that fails fails the action with 400
> `{ reason: 'pages/invalid-value: <attribute uid>: <what does not match>' }`. A slot's value may
> only be a reordering of the stored slot's node uids with some removed; another fails with 400
> `{ reason: 'pages/invalid-slot: <attribute uid>' }`. A change to a value of a non-slot attribute
> requires `pages:content_edit`, a change to a slot `pages:structure_edit`. A node removed from a
> slot is removed from the page with every node below it. The action records one step (HIS-1), writes
> the entry conditionally on `version` (HIS-2), and `updateAndGenerateTree` then builds the page
> (TRE-1). A node uid the page lacks fails with 404 `{ reason: 'pages/no-such-node' }`.

**PGE-5 · Adding a child node** (breaking): the component by uid, from storage, checked.

> The form action `addChildNode` of `/components/pages/<name>/<nodeUid>` reads `componentUID`,
> `attributeUID` and `version`; without them it fails with 400 `{ reason: 'no-component' }`,
> `{ reason: 'no-target-attribute' }` or `{ reason: 'no-version' }`. It adds a node of the component
> as TOL-10 adds one at the end of the slot, with TOL-10's refusals as 400 `{ reason }` (404 for
> `pages/no-such-node`), records the step and writes the entry conditionally on `version`.

**PGE-6 · The preview URL and files** (breaking): adds `version`; `setStorageResourceValue` is removed,
because no screen calls it and it stores a value of the wrong shape (NF17).

> The form action `changePreviewURL` reads `value` and `version` and writes `value` as the entry's
> `previewURL` conditionally on `version`, without recording a step; without them, it fails with 400
> `{ reason: 'no-diff' }`.

**PGE-7 · Undoing and redoing a page** (breaking): adds `version`.

> The form actions `undo` and `redo` of `/components/pages/<name>/<nodeUid>` read `version`, step the
> entry's history (HIS-1) over `contents`, and write the entry conditionally on `version` (HIS-2),
> also when there was nothing to step.

**AUTHN-5 · Sign-in** (compatible): adds, after "An `Identity` is admitted only if the authorization
data knows its subject.": "An `Identity` whose subject starts with `agent:` is never admitted
(`agent-access.md` AGT-4), and fails as an unknown one does."

### Core

```ts
// agents/tokens.ts
const AGENT_TOKEN_MIN_LENGTH = 43
function generateAgentToken (): string            // 'gat_' + base64url(32 random bytes), no padding
function hashAgentToken (token: string): string   // lowercase hex SHA-256 of the UTF-8 bytes

// agents/ceiling.ts
const AGENT_SUBJECT = /^agent:[a-z0-9][a-z0-9-]{0,62}$/
function isAgentSubject (subject: string): boolean            // starts with 'agent:'
function exceedsAgentCeiling (grants: Grant[]): boolean       // a '*' or a configuration-domain permission
class AgentCeilingError extends Error                         // message as AGT-5

// agents/authenticate.server.ts
function agentForToken (token: string): Promise<string | undefined>  // the subject, declared first

// agents/administration.server.ts: each requires config:users:manage; a refusal rejects
function createAgent (ctx: AuthContext, input: { name: string, label: string, roles: string[] }): Promise<{ subject: string, token: string }>
function reissueAgentToken (ctx: AuthContext, subject: string): Promise<{ token: string }>
function updateAgent (ctx: AuthContext, subject: string, input: { label: string, roles: string[] }): Promise<void>
function revokeAgent (ctx: AuthContext, subject: string): Promise<void>

// authorization/administration.ts, pure
function setUserRoles (users: UserRecord[], roles: Role[], subject: string, names: string[], declared: Set<string>): AdministrationResult<UserRecord[]>
  // an agent: subject given a role exceeding the ceiling: { ok: false, reason: <AGT-5's message> }
function replaceRole (roles: Role[], role: Role, declared: Set<string>, users: UserRecord[]): AdministrationResult<Role[]>
  // users: everyone holding roles, stored agents included as { subject, email: '', roles };
  // a role an agent: subject holds that would exceed the ceiling: { ok: false, reason: <AGT-5's message> }
```

The Tier-1 agents are resolved once per process, on the first request to `/mcp`, through
`host.resolve({ token }, { token: 'string' }, 'authentication.agents.<subject>')`; AGT-1's token
refusals are thrown there and answered as 503, and `@genoacms/config`'s load already refuses a key without the prefix
(`authentication/agent-subject-prefix:`) and an agent assigned a declared role exceeding the ceiling.
The stored agents are read from `agents.json` on each request; a manifest that fails verification is
quarantined and replaced as `resolution.server.ts` does the users manifest.

```ts
// components/conflict.ts
class ConflictError extends Error        // 'conflict/modified-since: <object> has changed since version <version>; read it again.'
class UnversionedError extends Error     // 'storage/unversioned: <object> was read without a version and cannot be saved.'
function writeConditionally (write: (options: UploadOptions) => Promise<void>,
  object: string, version: string | undefined): Promise<void>  // ifVersion; PreconditionFailed → ConflictError
```

Every `*User*` service that saves takes `version: string` after its existing arguments and returns
the new version. Reads that feed a save return `{ value, version }`.

`page/edits.ts` operates on `PageContents` and the stored headers, and is pure:

```ts
type EditResult = { ok: true, contents: PageContents } | { ok: false, code: string, message: string }
function addNode (contents, parent: string, slot: string, header: ComponentHeader, published: boolean, headers: Map<string, ComponentHeader>, position?: number): EditResult & { node?: string }
function moveNode (contents, node: string, parent: string, slot: string, headers: Map<string, ComponentHeader>, position?: number): EditResult
function removeNode (contents, node: string): EditResult
function setValues (contents, node: string, values: Record<string, unknown>, headers: Map<string, ComponentHeader>): EditResult
function applyNodeEdit (contents, sent: unknown, headers): EditResult & { content: boolean, structure: boolean }  // PGE-4
```

The refusal codes are those of TOL-9 to TOL-13 and PGE-4. `headers` maps a component uid to its
stored header; the slot's `items.enum` and `maxItems` are read from the header of the parent node's component
in it. `moveNode` takes no `published` flag: the moved node is already on the page, so its component was
published when it was added, and the function stays pure. TOL-12's `pages/not-accepted` and
`pages/slot-full` apply to it through `headers`.

### MCP

```ts
// mcp/protocol.ts: one parsed message; undefined for a notification
function handleMessage (message: unknown, context: AuthContext, registry: readonly Tool[]): Promise<JsonRpcResponse | undefined>

// mcp/tools/registry.server.ts
interface Tool {
  name: string
  description: string
  inputSchema: JsonSchema                     // an object schema, additionalProperties: false
  handler: (context: AuthContext, args: Record<string, unknown>) => Promise<unknown>  // the output; a refusal throws
}
const toolRegistry: Tool[]                    // the 18 tools of TOL-2 to TOL-15, in that order
```

`protocol.ts` never reads the request. `+server.ts` reads the bearer token, answers 401 as MCP-2 says, parses the body
(a body that is not JSON answers the JSON-RPC error `-32700`, a batch `-32600`), and answers with
`protocol.ts`'s result. `initialize` answers `{ protocolVersion: '2025-06-18', capabilities: {
tools: { listChanged: false } }, serverInfo: { name: 'genoacms', version: <core's version> } }`
whatever version the client asks for. Input schemas are JSON Schema objects with
`additionalProperties: false`, validated with `@exodus/schemasafe`.

## Non-goals

- MCP-3, the limit on failed tokens; it follows RFC-0031.
- Tools for collections, storage, users, roles, keys or the security policy.
- An MCP SDK dependency: the five methods are implemented in `protocol.ts`.
- Streams, sessions, resources, prompts, sampling, or notifications from the server.
- A server-side record of edits (TF1, `components.md` NF13).
- A CLI command generating tokens.
- `components.md` NF3, NF9, NF10, NF12 to NF16, NF18: unchanged, except NF17 as PGE-6 says.
- The screens' look, beyond the Agents section, the version fields and the conflict message.

## Tests

Unit tests run in Node with storage stubbed unless named otherwise; signatures are real ML-DSA-65.

- `packages/config/src/load/agents.test.ts` (unit):
  - › `AGT-1: a key without the agent prefix is refused at load`: given `agents: { 'builder': … }`,
    when the config is checked, then an issue starting `authentication/agent-subject-prefix:` at
    `authentication.agents.builder`.
  - › `AGT-1: a token may be a secret, env or inline reference`: no issue for each of the three.
  - › `AGT-5: an agent assigned a declared role holding a configuration permission or * is refused`:
    for `config:users:manage`, `config:keys:manage` and `*`, an issue starting
    `authorization/agent-ceiling:`; none for `pages:read`.
- `packages/core/src/lib/script/agents/declared.server.test.ts` (unit):
  - › `AGT-1: a declared token shorter than 43 characters closes the agent endpoint`: given a
    42-character token, when `/mcp` is first requested, then it answers 503, the log holds an error
    starting `authentication/agent-token-too-short:`, and the sign-in page still answers.
  - › `AGT-1: two agents sharing a token are refused`: an error starting
    `authentication/agent-token-shared:`.
- `packages/core/src/lib/script/agents/tokens.test.ts` (unit): › `AGT-3: a new token is gat_ and 43
  base64url characters, and its hash is SHA-256 hex`: 1000 tokens are distinct, match
  `^gat_[A-Za-z0-9_-]{43}$`, and `hashAgentToken('abc')` is
  `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`.
- `packages/core/src/lib/script/agents/manifest.test.ts` (unit):
  - › `AGT-2: the agents manifest round-trips, signed, and a tampered one is not trusted`: a saved
    manifest loads; one with a changed `tokenHash` is quarantined, no stored agent is known, a
    declared one still is.
- `packages/core/src/lib/script/agents/administration.server.test.ts` (unit):
  - › `AGT-3: creating an agent stores its hash, never its token, and shows the token once`: given
    `config:users:manage`, when `createAgent({ name: 'writer', label: 'W', roles: ['Builder'] })`, then
    the result has a token, `agents.json` holds `agent:writer` with its hash and `createdBy`, and no
    stored byte contains the token.
  - › `AGT-3: names are checked and unique across declared and stored agents`: `Writer`, `-a`, a 64
    character name, and a declared agent's name are refused.
  - › `AGT-3: a reissued token replaces the old one, and a revoked agent is gone`: the old token
    resolves to no agent; after revoking, the new one neither.
  - › `AGT-3: a declared agent cannot be changed`: each action on it rejects with
    `agents/declared: agent:e2e-builder is declared in genoa.config.`
  - › `AGT-3: administering agents needs config:users:manage`: without it, `PermissionDeniedError`.
- `packages/core/src/lib/script/agents/ceiling.test.ts` (unit), and
  `packages/core/src/lib/script/authorization/administration.test.ts` (unit):
  - › `AGT-5: assigning an agent a role beyond the ceiling is refused`: with the AGT-5 message.
  - › `AGT-5: a role an agent holds cannot gain a configuration permission`: refused; the same role
    without agents may.
  - › `AGT-5: an agent whose roles exceed the ceiling anyway resolves with no grants`: given a
    declared assignment of a stored role holding `config:keys:manage`, when resolved, then no grants
    and a warning starting `agent-ceiling:`.
- `packages/core/src/lib/script/auth/providers.server.test.ts` (unit): › `AGT-4, AUTHN-5: an
  identity with an agent: subject is not admitted`: a provider returning `{ subject: 'agent:x' }`,
  assigned a role, then `invalid-credentials`, and a log line with the provider's key.
- `packages/core/src/lib/script/agents/authenticate.server.test.ts` (unit):
  - › `MCP-2: a token resolves to its agent, declared or stored, and nothing else does`.
  - › `AGT-6: a revoked token stops at the next request`.
- `packages/core/src/lib/script/mcp/protocol.test.ts` (unit), a stub registry:
  - › `MCP-1: initialize names genoacms and the tools capability, at 2025-06-18`.
  - › `MCP-1: ping answers {}, a notification has no response, an unknown method -32601`.
  - › `MCP-4: tools/list lists every tool with its input schema, whatever the grants`: a principal
    with no grants sees all 18.
  - › `MCP-4: arguments not matching the schema are a tool error, an unknown tool -32602`.
  - › `MCP-4: a refusal is a tool error carrying its code, any other failure tools/failed`.
- `packages/core/src/routes/mcp/server.test.ts` (unit), the handler called with `Request`s:
  - › `MCP-2: no header, a wrong token and a cookie alone each answer 401 with WWW-Authenticate`.
  - › `MCP-1: GET and DELETE answer 405; a notification 202; never Mcp-Session-Id`.
  - › `MCP-2: no log line holds the token`: the console captured over a refused and an admitted call.
- `packages/core/src/lib/script/components/page/edits.test.ts` (unit):
  - › `TOL-10: a node is added at the position, of a published component the slot accepts`: and each
    refusal of TOL-10: no parent, not a slot, unpublished, not accepted, full.
  - › `TOL-12: a node moves between slots; the root, itself or a descendant is refused`.
  - › `TOL-13, PGE-4: removing a node removes every node below it, and the root cannot be removed`.
  - › `TOL-11: each value is checked against its attribute; a slot is not a value`: one valid and one
    invalid value per attribute type of CMP-3; `minLength`, `maximum`, `maxItems` honored.
  - › `PGE-4: a node edit takes only values, and tells content from structure`: a sent `name`,
    `schema` and `entryReference` are ignored; a changed string is content; a reordered slot is
    structure; a slot naming a node not its child is refused.
  - › `PGE-11: names of one level are accepted, others refused`: accepted `home`, `a b`, `ü`,
    `..a`; refused `''`, `.`, `..`, `a/b`, `a\b`, `a\u0001`, 201 characters.
- `packages/core/src/lib/script/components/conflict.test.ts` (unit), driven through `updateComponent`,
  `saveComponentRemote` and the page, registrar and editor form actions over a versioned in-memory
  storage; the existing service tests mock storage without versions and cannot host these:
  - › `HIS-2: a save from the stored version writes and returns a new version`.
  - › `HIS-2: a save from an older version writes nothing, records no step, and fails modified-since`:
    for a header, a body and a page.
  - › `HIS-2: undo and redo are conditional too`.
  - › `HIS-2: an object read without a version cannot be saved`.
- `packages/core/src/lib/script/components/componentHeader/user.server.test.ts` (unit):
  - › `CMP-8: saving a header for an unknown uid is refused`: nothing written, with
    `components/no-such-component`.
  - › `CMP-8: saving a header keeps the stored kind`: a prebuilt header sent as `dynamic` is stored
    `prebuilt`.
- `packages/core/src/routes/(admin)/components/pages/actions.test.ts` (unit), the services real:
  - › `PGE-2, PGE-11: a page is created only under a valid, free name, of a published component`.
  - › `PGE-5: a child is of the component named, from storage, never the client's header`.
  - › `PGE-4: a content editor cannot reorder or remove children`: with `pages:content_edit` only, a
    reordered slot fails with `PermissionDeniedError`.
- `packages/core/src/lib/script/mcp/tools/components.test.ts` (unit):
  - › `TOL-2: components are listed with their publication, and one is read with its version`.
  - › `TOL-3, TOL-17: creating needs components:register`.
  - › `TOL-4: attributes are a list; uids are kept, new ones generated, unknown ones refused`: and
    `attributeOrder` follows the list; the stored kind is kept.
  - › `TOL-5: the source is read and saved with its signature, prebuilt refused`.
  - › `TOL-6: publishing names the agent as publisher and returns warnings`.
  - › `TOL-7: a component a published page pins is not deleted`.
  - › `TOL-16: each changing call records exactly one step`: for every tool that changes a header, a
    body or a page's contents; `set_preview_url` records none.
  - › `TOL-17: every tool demands its permissions`: for each tool, a principal lacking one of its
    permissions gets a tool error starting `permission-denied:`.
- `packages/core/src/lib/script/mcp/tools/pages.test.ts` (unit):
  - › `TOL-8: a page is read with its reachable nodes, values in attribute order, and its version`.
  - › `TOL-9: create_page refuses a bad name, a taken name and an unpublished component`.
  - › `TOL-14, TOL-15: the preview URL is set; a page is built and deleted`.
- `packages/core/e2e/mcp.test.ts` (e2e), core built with `genoa.config/e2e.ts`:
  - › `MCP-1, MCP-2: an agent initializes and lists the tools with its token; without it, 401`.
  - › `TOL-3, TOL-4, TOL-5, TOL-6: an agent registers, describes, codes and publishes a component`.
  - › `TOL-9, TOL-10, TOL-11, TOL-15: an agent composes a page and builds it, and the tree verifies`.
  - › `TOL-1: a save from a version a person has since changed in the browser is refused`.
  - › `AGT-4: the agent's subject cannot sign in on the sign-in page`.

## Steps

1. Baseline: `pnpm --filter @genoacms/core exec vitest run`, `pnpm --filter @genoacms/config exec
   vitest run`, the core e2e suite and `node docs/tools/check-docs.mjs docs`; record the counts.
2. Tests: written from `agent-access.md`, `components.md` and this RFC by a session that has not
   seen the code, each failing one marked `it.fails`. Commit.
3. `@genoacms/config`: the type, the load rules, `Host.agents`.
4. Versions: `storage.server.ts`, `conflict.ts`, and the header, body and page services and screens
   (HIS-2, CMP-8, SRC-4, PGE-6, PGE-7).
5. Pages: `names.ts`, `edits.ts`, the services and the actions (PGE-2, PGE-4, PGE-5, PGE-11).
6. Agents: tokens, ceiling, manifest, declared agents, authentication, resolution, sign-in refusal,
   administration and the Agents section (AGT-1 to AGT-6, AUTHN-5).
7. MCP: the protocol, the tools, the route, the hook; the e2e config and harness. Remove every
   `it.fails`, change no assertion, add the changeset. Commit. Run §Verification.
8. Documents to current: `agent-access.md` loses its New markers but MCP-3's, names its tests and
   `verified`; `components.md` takes §Specification's text for the changed statements, HIS-2 and
   PGE-11 lose their `State:` lines, NF1, NF2, NF4 to NF8, NF11 and NF17 are fixed; AUTHN-5 takes its
   sentence; `docs/README.md` counts. Commit separately.

## Verification

```bash
pnpm --filter @genoacms/config exec vitest run
# all pass
pnpm --filter @genoacms/core exec vitest run
# all pass
GENOACMS_TEST_GCP=1 pnpm --filter @genoacms/core exec vitest run --mode e2e e2e
# all pass, mcp.test.ts among them
pnpm --filter @genoacms/core run check
# 0 errors
node docs/tools/check-docs.mjs docs
# 0 error(s)
```

A falsification audit of each statement this RFC adds or changes (WORKFLOW §6.3), by an agent that
did not write the code, recorded as a Verification entry in `agent-access.md` and `components.md`.
It SHOULD include an agent driving the running endpoint with the tokens of two agents, one under
the ceiling and one whose role was made to exceed it in storage.

## Critique

**Pros**
- An agent can do on components and pages what a person does on the screens, and nothing its
  grants would not allow a person: every tool goes through the same permission-checked services.
- Agents and people cannot become each other: separate prefixes, separate entry points, tokens only
  for agents, and no configuration permission for an agent at any tier.
- The fixes protect the screens too: page names, published components, values-only node edits and
  conditional saves close NF1, NF2, NF4 to NF8 and NF11 for everyone, not only for agents.
- An agent's edit is one undoable step, so a person can take it back.

**Cons & trade-offs**
- One large RFC: config, authorization, auth, the component and page services, every component and
  page screen, and a new endpoint. A defect in one part holds the rest back.
- Every save now carries a version; a person who saves after an agent did sees a conflict and has to
  reload, losing unsaved input.
- Hand-written MCP: less code than an SDK integration, but protocol changes are ours to follow, and
  `initialize` answers `2025-06-18` to every client.
- Without MCP-3, a token is protected by its length alone until RFC-0031 lands; 32 random bytes make
  guessing infeasible, but a weak declared token (43 characters chosen by hand) is not detected.
- Reading `agents.json` on every request adds a storage read and a signature verification per call.

**Blindspots & missed edge cases**
- Two agents, or an agent and a person, racing on one page will see conflicts often; there is no
  merge, only refusal.
- An agent can publish a component's code if its role holds `components:code`; nothing limits how
  often (TU7), and every publication is permanent.
- A Tier-1 assignment naming a stored role is checked against the ceiling only at resolution; the
  config cannot know stored roles at load.
- The tools see `.genoacms` content only through the services, but an agent holding
  `storage:bucket:*` elsewhere is outside this RFC's view.
- `tools/list` exposes the names of tools an agent cannot use, which tells it what the instance can
  do.
- Prebuilt components are compared by `name` against a slot's `items.enum`, as today; renaming a
  component silently changes which slots accept it.
