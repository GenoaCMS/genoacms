---
type: architecture
title: Agent access
prefix: T
codes: [AGT, MCP, TOL]
verified: 7f69446f
---

# Agent access

Implemented by RFC-0039, except MCP-3, which is **New** and follows RFC-0031.

## Design

### Role

An **agent** is a principal that is not a person: an AI client, such as Claude Code, that controls
the CMS through the Model Context Protocol (MCP). It exists so that the clicking work of building
components and pages, registering a component, describing its attributes, writing its code,
composing a page node by node, can be done by an agent.

```
genoa.config authentication.agents ─┐
.genoacms/security/agents.json ─────┴─▶ agent subjects `agent:<name>`, token hashes (AGT)
                                                  │
MCP client ──POST /mcp, Authorization: Bearer <token>──▶ endpoint (MCP) ──AuthContext──▶ tools (TOL)
                                                                                         │
                                       the permission-checked services of components.md ◀┤
                                       the document service (collections.md DOC) ◀───────┤
                                       the storage user layer (storage.md STS) ◀─────────┘
```

An agent has its own account, declared like everything else in Tier 1 or created in Tier 2. It
identifies itself with a token alone, on `/mcp` alone; a person signs in with an email and a password
on the sign-in page alone. Its grants come from roles, as a person's do, under a ceiling no role
lifts. Every tool calls the same services the screens call, so a tool can do nothing the agent's
grants would not let it do on a screen.

Agents also read and change documents of collections and objects in buckets, through the document
service of [`collections.md`](collections.md) and the user layer of [`storage.md`](storage.md) (TU12,
**New**, RFC-0041).

Out of scope: defining collections; uploads larger than 4 MiB (TU14); a server-side record
of who changed what (TF1); the specification of components and pages themselves
([`components.md`](components.md)), which the RFC of this document also changes, to fix NF1, NF2,
NF4 to NF8, NF11 and NF17. Limiting failed tokens (MCP-3) builds on the counters of
[`contracts/authentication.md`](contracts/authentication.md) AUTHN-8 to AUTHN-10, themselves New
(RFC-0031), and is not part of RFC-0039 (TU11).

### Decisions

| # | Decision | Where |
| :-- | :-- | :-- |
| TU1 | 2026-10-27: AI control of the CMS is an MCP server in core, for components and pages first. | TD3; MCP-1 |
| TU2 | 2026-10-27: an agent is an account of its own, typed apart from people. Its type lives in core's own data, never in an identity provider: agents are declared in `authentication.agents` of the Tier-1 config, next to `providers`. | TD1; AGT-1 |
| TU3 | 2026-10-27: an agent identifies itself with a token alone, which is both its password and its identity; identification by a token alone exists for agents only, never for people. | TD2; AGT-1, MCP-2 |
| TU4 | 2026-10-27: agent subjects carry the reserved prefix `agent:`. | AGT-4 |
| TU5 | 2026-10-27: an agent can never hold the configuration permissions; a role exceeding that ceiling is refused, never trimmed. | TD5; AGT-5 |
| TU6 | 2026-10-27: agents can also be created in Tier 2, on a screen, from the start; Tier-1 agents show there and are immutable. Issuing needs the permission that administers users. Tokens are valid until revoked. | AGT-2, AGT-3 |
| TU7 | 2026-10-27: publishing needs no rule of its own for agents; the agent's grants decide. | TOL-17 |
| TU8 | 2026-10-27: tools change a page one node at a time, validated against stored, published component headers. | TD4; TOL-9 to TOL-13 |
| TU9 | 2026-10-27: every save carries the version it was read at, and a stale save is refused, for agents and for the screens. | TD6; TOL-1 |
| TU10 | 2026-10-27: no server-side record of who changed what for now; it stays a finding. | TF1 |
| TF2 | **A move replaces what is at its destination (TOL-27, TOL-28).** `move_object a → b` replaces `b`, under `storage:bucket:write` alone, without `delete`; `move_directory d/ → e/` replaces what `e/` holds; an object can be moved onto the name of a directory, and a directory into itself, which the browser refuses (`storage.md` BRW-9). Uploads refuse to replace unless asked (TOL-26); moves say nothing. Found 2026-10-28 by the falsification audit of RFC-0041, with probes through the tool registry and the memory adapters. | open; RFC-0041 amendment |
| TF3 | **`create_directory` accepts the root (TOL-28).** A `path` of `''` reaches the adapter on any bucket but the default, where STS-5 refuses it. Found 2026-10-28 by the falsification audit of RFC-0041, with probes through the tool registry and the memory adapters. | open; RFC-0041 amendment |
| TF4 | **Content edge cases of `upload_object` (TOL-26).** Wrapped base64 and base64url are refused as `storage/invalid-content`; text with a lone surrogate is stored with U+FFFD in its place. Found 2026-10-28 by the falsification audit of RFC-0041, with probes through the tool registry and the memory adapters. | open; RFC-0041 amendment |
| TU11 | 2026-10-27: `tools/list` lists every tool; the first version includes the deleting tools; stored agents keep their roles in `agents.json`; agent access does not wait for RFC-0031, so failed tokens are limited only once it lands; no CLI command generates tokens for now. | MCP-3, MCP-4, AGT-2, TOL-7, TOL-15 |
| TU12 | 2026-10-28: agents also read and change documents and objects, through MCP tools that call the document service and the storage user layer, under the same permissions as people. `.genoacms/` is for agents as it is for people (`storage.md` BU1, BU7). Defining collections stays out. | TD7; TOL-18 to TOL-29 |
| TU13 | 2026-10-28: a document save is last write wins, for agents as for people on the editor: no database adapter offers a version to write conditionally on. TU9 holds for components and pages only. | TD7; TOL-22 |
| TU14 | 2026-10-28: an agent reads an object through a signed URL, and uploads its contents inline, at most 4 MiB. Larger uploads, through a signed upload URL, are a later RFC. | TD8; TOL-25, TOL-26 |
| TU15 | 2026-10-28: `delete_directory` deletes everything under the directory, as the storage contract does. | TOL-28 |
| TU16 | 2026-10-28: `move_object` and `move_directory` refuse an existing destination with `storage/exists` unless given `overwrite: true`, as `upload_object` does; a directory is never moved into itself (TF2). | pending, RFC-0041 amendment |

**TD1. An agent is a principal of its own kind, known by core and not by a provider (AGT-1,
AGT-2, AGT-4).** Its subject and token live in core's configuration or core's signed manifest.
*Why:* an identity provider decides who a person is, and a third-party or faulty provider could then
also decide who is an agent, or answer a token with a person's identity. The type decides what a
principal may hold (AGT-5) and how it may enter (MCP-2), so it has to be as tamper-proof as the
authorization data.
*Cost:* agents need their own administration screen, beside the one for users.

**TD2. The token is the identity, so it has to be unguessable and kept out of the config file
(AGT-1, AGT-3).** A Tier-1 token is a `secret()` reference of at least 43 characters; a Tier-2 token
is 32 random bytes, shown once and stored only as its SHA-256.
*Why:* with no username, guessing a token is guessing an account. A hash of a high-entropy token
needs no slow hash: there is nothing to brute-force from it.
*Cost:* a lost Tier-2 token cannot be shown again, only replaced. A Tier-1 token is checked for
length, not for randomness.

**TD3. The MCP endpoint is one stateless route of core (MCP-1).** `POST /mcp` answers JSON-RPC
with JSON, keeps no MCP session, and resolves the agent's authority on every request.
*Why:* core already runs as stateless functions on several platforms (Cloud Run, Lambda, Node);
server-sent streams and sessions would not survive them. Resolving per request makes a revocation
take effect at the next call.
*Cost:* no notifications from server to client, and no long-running tool reporting progress.

**TD4. Tools are made for an agent, not copied from the forms (TOL-2 to TOL-16).** A component's
attributes are an ordered list from which core derives `attributes` and `attributeOrder`. A page is
changed one node at a time, by a tool per kind of change, each naming the permission of what it
alters.
*Why:* the forms send whole objects the browser assembled (NF5, NF6). An agent assembling a node or
a header map makes the mistakes the forms' validation never had to catch: inconsistent keys and
orders (NF3), orphaned nodes (NF7), structure changed through content. Narrow tools make each
change checkable.
*Cost:* more tools than screens have actions, each specified and tested.

**TD5. The ceiling is refused wherever it can be decided, and fails closed where it cannot
(AGT-5).**
*Why:* trimming would let the configuration say more than the agent can do, and an agent able to
administer users or keys could make itself, or another subject, anything.
*Cost:* a role an agent holds cannot later gain a configuration permission without first being
taken from the agent.

**TD6. Every save is conditional on the version it was read at (TOL-1).** Read tools return the
storage version of the object; write tools require it back and write with `ifVersion`.
*Why:* an agent and a person editing one page would otherwise overwrite each other silently, and
the later save's undo step would be computed against a state its author never saw (NF11). The
storage contract already offers conditional writes (`contracts/storage.md` STOR-6).
*Cost:* an agent has to read again and retry after a conflict, and the screens have to carry a
version too.

**TD7. A document update sets the fields it is given (TOL-22).** `update_document` takes the
top-level fields to change; the others keep their stored values, and the result is validated
against the schema before it is written (`collections.md` DOC-8). There is no version: the later
save wins (TU13).
*Why:* both database adapters already merge an update (`adapter-gcp/database.md` DB-7,
`adapter-aws/database.md` DDB-7), and an agent changing one field should not have to send, and
risk corrupting, the rest. Validating the merged document is the only way to check a partial
submission.
*Cost:* a field cannot be removed, only set to another value, since the database contract has no
removal. An agent and a person saving one document at once overwrite each other's fields without
either knowing.

**TD8. Object contents go out by URL and come in inline (TOL-25, TOL-26).** `get_object` returns a
signed URL for the agent to fetch; `upload_object` takes the contents in the call, as text or
base64, decoded to at most 4 MiB.
*Why:* the endpoint is stateless (TD3), so a tool call carries its whole body and cannot stream
across calls; AWS Lambda accepts at most 6 MB per request, and 4 MiB is about 5.6 MB in base64.
A signed URL keeps object bytes out of the CMS, as for people (`storage.md` BD4). Splitting an
upload across calls would need the provider to hold an upload session, and S3 parts of at least
5 MiB do not fit in a Lambda request.
*Cost:* an agent has to fetch the URL itself, and cannot upload a file larger than 4 MiB. The
upload carries no content type.

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| TF1 | **An agent's edits are not recorded on the server.** As for people (`components.md` NF13), nothing records which principal saved a header, a body or a page entry. A publication names its publisher (`components.md` PUB-4), so what an agent publishes is attributable; what it only saved, or built, is not. | open |

### History

None.

### Verification

- **`unit`, in Node.** Tools and the protocol are called through `handleMessage` and the real registry over a versioned in-memory storage with real ML-DSA-65 signatures; the endpoint through its `Request` handlers; the services through their public functions.
- **`e2e`** (`packages/core/e2e/mcp.test.ts`): a built core with `genoa.config/e2e.ts`, an agent token in `GENOACMS_E2E_AGENT_TOKEN`, a real browser for TOL-1 and AGT-4. They need Google Cloud credentials and run in CI on pushes to `main` only.

**TS1.** 2026-10-28, falsification audit of the statements RFC-0041 added or changed (TOL-18 to TOL-29,
`collections.md` DOC-3, DOC-5, DOC-8, `storage.md` STS-7), by an agent that wrote none of the code,
with probes through the tool registry, `protocol.ts` and the user layers over the memory adapters.
Permissions (TOL-29), the unreadable-field refusal (TOL-19), key immutability, not-found answers,
names, `.genoacms/`, the upload limit counted in bytes, overwrite and STS-7 held. Counterexamples:
TF2 to TF4, `collections.md` OF30 to OF35, `storage.md` BF13.

Not yet done: the falsification audit of the statements RFC-0039 added, with the tokens of two agents, one under the ceiling and one whose role was made to exceed it in storage. Until it is, no statement here is audited.

## Specification

### Agents

#### AGT-1 · Declaring agents in Tier 1

```ts
interface AuthenticationConfig {
  providers: Providers
  cookieName: string
  agents?: Record<string, {          // keyed by the agent's subject
    label: string                    // shown wherever a person's email would be
    token: Secret<string>            // secret(), env() or inline()
  }>
}
```

```ts
authentication: {
  providers: { /* people */ },
  agents: {
    'agent:site-builder': { label: 'Site builder', token: secret('GENOACMS_AGENT_SITE_BUILDER') }
  }
},
authorization: {
  assignments: { 'agent:site-builder': ['Page builder'] }
}
```

Loading the config fails with an issue whose message starts with
`authentication/agent-subject-prefix:` for a key that does not match `agent:<name>` (AGT-3's
`<name>`). Core resolves the declared tokens when `/mcp` is first requested; a token of fewer than
43 characters fails with an error whose message starts with `authentication/agent-token-too-short:`,
and two agents with the same token with `authentication/agent-token-shared:`. Until the
configuration is corrected, every request to `/mcp` answers 503 and logs that error; the rest of the
CMS runs. A declared agent's roles
are its `authorization.assignments`. A declared agent cannot be changed or revoked at runtime.

- Test: `packages/config/src/load/agents.test.ts`, `packages/core/src/lib/script/agents/declared.server.test.ts`
- Level: unit

#### AGT-2 · Agents stored in Tier 2

Agents created at runtime are kept in `.genoacms/security/agents.json` of the default bucket, a
signed envelope of the type `genoacms.agents.v1`, signed and written as the users manifest is:

```ts
interface AgentsManifest {
  agents: Record<string, {           // keyed by subject
    label: string
    tokenHash: string                // lowercase hex SHA-256 of the token's UTF-8 bytes
    roles: string[]
    createdAt: number                // ms since epoch
    createdBy: string                // the subject that created it
  }>
}
```

A manifest that does not verify is treated as the users manifest is when it does not verify: no
stored agent is known, and Tier-1 agents still are.

- Test: `packages/core/src/lib/script/agents/manifest.test.ts`
- Level: unit

#### AGT-3 · Administering agents

The Agents section of `/configuration/iam` lists every agent, declared and stored, by subject,
label and roles, the declared ones marked as declared in `genoa.config`. With
`config:users:manage` a principal may:

| Action | Effect |
| :-- | :-- |
| create, with a name, a label and roles | a stored agent `agent:<name>`, `<name>` matching `^[a-z0-9][a-z0-9-]{0,62}$` and not taken by any agent; a new token |
| issue a new token | the agent's previous token stops working |
| change label or roles | as given, subject to AGT-5 |
| revoke | the stored agent is removed |

A new token is `gat_` followed by the base64url, without padding, of 32 random bytes. It is shown
once, with a note that it cannot be shown again, and only its hash is stored. Any action on a
declared agent is refused with `agents/declared: <subject> is declared in genoa.config.` Tokens do
not expire.

- Test: `packages/core/src/lib/script/agents/administration.server.test.ts`, `packages/core/src/lib/script/agents/tokens.test.ts`
- Level: unit

#### AGT-4 · Agents and people stay apart

The subject prefix `agent:` is reserved for agents. A sign-in whose provider returns an `Identity`
with a subject starting with `agent:` fails with `invalid-credentials`, and is logged with the
provider's key. An agent has no password, no session and no cookie: it is admitted only by MCP-2.
A token is only ever issued to, and only ever resolves to, an agent.

- Test: `packages/core/e2e/mcp.test.ts`, `packages/core/src/lib/script/auth/providers.server.test.ts`
- Level: unit, e2e

#### AGT-5 · The ceiling

An agent holds no permission of the `configuration` domain (`config:users:manage`,
`config:roles:manage`, `config:keys:manage`, `config:security:manage`, `config:adapters:manage`) and
no grant whose permission is the wildcard `*`. A role exceeds the ceiling when one of its grants
does.

| Where | Refusal |
| :-- | :-- |
| the config, at load: an agent assigned a declared role that exceeds it | the server does not start: `authorization/agent-ceiling: <subject> is assigned <role>, which grants permissions an agent cannot hold.` |
| administration: assigning such a role to an agent, or changing a role an agent holds so it exceeds it | refused with the same message |
| resolution: an agent whose roles exceed it anyway, such as a declared assignment of a stored role | the agent resolves with no grants, every tool call is denied, and the error is logged |

- Test: `packages/config/src/load/agents.test.ts`, `packages/core/src/lib/script/agents/ceiling.test.ts`, `packages/core/src/lib/script/authorization/administration.test.ts`
- Level: unit

#### AGT-6 · An agent's authority

An agent's `AuthContext` has its subject, and the grants of its roles, matched exactly as a
person's are, through the same grant cache: a changed role takes effect within the policy's
`grantCacheSeconds`, as it does for a person. The token is looked up on every request, so a
revoked token or a removed declaration takes effect at the next request.

- Test: `packages/core/src/lib/script/agents/authenticate.server.test.ts`
- Level: unit

### The endpoint

#### MCP-1 · The MCP endpoint

`/mcp` implements the Streamable HTTP transport of the Model Context Protocol, revision
`2025-06-18`, without sessions. `POST /mcp` takes one JSON-RPC 2.0 message and answers with
`Content-Type: application/json`: a request with its response, a notification with 202 and no body.
It never answers with a stream and never sends `Mcp-Session-Id`. `GET` and `DELETE` answer 405.
It handles `initialize` (server name `genoacms`, the capability `tools`), `notifications/initialized`,
`ping`, `tools/list` and `tools/call`; any other method answers the JSON-RPC error `-32601`.

- Test: `packages/core/e2e/mcp.test.ts`, `packages/core/src/lib/script/mcp/protocol.test.ts`, `packages/core/src/routes/mcp/server.test.ts`
- Level: unit, e2e

#### MCP-2 · Authenticating a request

A request to `/mcp` is admitted only with the header `Authorization: Bearer <token>` whose token's
SHA-256 equals the hash of a declared agent's token or a stored agent's `tokenHash`. Otherwise it
answers 401 with `WWW-Authenticate: Bearer realm="genoacms"` and no JSON-RPC body. Cookies are
ignored on `/mcp`, and the `Authorization` header is ignored everywhere else. No log line contains a
token.

- Test: `packages/core/e2e/mcp.test.ts`, `packages/core/src/lib/script/agents/authenticate.server.test.ts`, `packages/core/src/routes/mcp/server.test.ts`
- Level: unit, e2e

#### MCP-3 · Failed tokens are limited per address

A request refused by MCP-2 for a token that matches no agent records a failure of the client
address, as AUTHN-9 records one. When the address holds `signInFailuresPerAddress` failures within
`signInWindowMinutes` (AUTHN-8), a request to `/mcp` answers 429 before its token is compared. A
request with no `Authorization` header records nothing.

- Test: none yet
- Level: unit
- State: new (no RFC yet)

#### MCP-4 · Tool results

`tools/list` lists every tool of TOL, each with its input schema, whatever the agent's grants. A
`tools/call` answers:

| Case | Answer |
| :-- | :-- |
| an unknown tool | JSON-RPC error `-32602` |
| arguments not matching the input schema | a result with `isError: true` and the text `tools/invalid-arguments: <what does not match>` |
| success | a result whose `structuredContent` is the tool's output, and whose one text content is that output as JSON |
| a refusal: a permission denial, a validation, a conflict | a result with `isError: true` and one text content, the error's message, which starts with its code (`permission-denied:`, `conflict/modified-since:`, …) |
| any other failure | a result with `isError: true` and the text `tools/failed: <message>`, logged |

- Test: `packages/core/src/lib/script/mcp/protocol.test.ts`
- Level: unit

### Tools

#### TOL-1 · Versions

Every read tool returns the `version` of the object it read: a component's header, a component's
source definition or a page entry, the opaque storage version (STOR-6). Every tool that changes one
of them takes `version` and writes conditionally on it. When the object has changed since, the tool
writes nothing and fails with
`conflict/modified-since: <object> has changed since version <version>; read it again.` On success it
returns the new `version`.

- Test: `packages/core/e2e/mcp.test.ts`
- Level: e2e

#### TOL-2 · Reading components

`list_components()` returns `[{ uid, name, type, publication }]` for every component of the catalog
(`components.md` CMP-7), where `publication` is `{ publicationId, publishedAt }` of its pointer, or
`null`. `get_component({ uid })` returns `{ uid, name, type, attributes, publication, version }`,
`attributes` as TOL-4 takes them, in `attributeOrder`; an unknown `uid` fails with
`components/no-such-component: <uid> does not exist.`

- Test: `packages/core/src/lib/script/mcp/tools/components.test.ts`
- Level: unit

#### TOL-3 · Creating a component

`create_component({ name, type })` registers a component as `components.md` CMP-6 does, and returns
`{ uid, version }`.

- Test: `packages/core/e2e/mcp.test.ts`, `packages/core/src/lib/script/mcp/tools/components.test.ts`
- Level: unit, e2e

#### TOL-4 · Describing a component

`update_component({ uid, version, name, attributes })` takes `attributes` as an ordered list:

```ts
type AttributeInput = { uid?: string, type: AttributeType, schema: MetaSchema }  // components.md CMP-3
```

It saves a header whose `attributes` holds each item under its `uid`, a new random UUID for an item
without one, with `name` equal to `schema.title`, and whose `attributeOrder` is the list's order. A
`uid` the component does not have, or one given twice, fails with
`components/unknown-attribute: <uid>`. The component must exist, and its `type` is kept. CMP-4 and
CMP-5 apply. An attribute keeps its values on pages exactly when its `uid` is kept.

- Test: `packages/core/e2e/mcp.test.ts`, `packages/core/src/lib/script/mcp/tools/components.test.ts`
- Level: unit, e2e

#### TOL-5 · A component's source

`get_component_source({ uid })` returns `{ language, body, signature, version }`, where `signature`
is the preview of `components.md` SRC-3 (`{ text, diagnostics }`). `save_component_source({ uid,
version, body })` saves the body as SRC-4 does and returns `{ version, signature }`. Both refuse a
prebuilt component as SRC-2 does.

- Test: `packages/core/e2e/mcp.test.ts`, `packages/core/src/lib/script/mcp/tools/components.test.ts`
- Level: unit, e2e

#### TOL-6 · Publishing a component

`publish_component({ uid, note })` publishes as `components.md` PUB-1 does, with the agent as
publisher, and returns `{ publicationId, publishedAt, warnings }`. A refusal's message is PUB-2's or
PUB-3's, the line and column of a diagnostic included.

- Test: `packages/core/e2e/mcp.test.ts`, `packages/core/src/lib/script/mcp/tools/components.test.ts`
- Level: unit, e2e

#### TOL-7 · Deleting a component

`delete_component({ uid })` deletes as `components.md` CMP-9 does, and is refused as it is while a
published page pins the component.

- Test: `packages/core/src/lib/script/mcp/tools/components.test.ts`
- Level: unit

#### TOL-8 · Reading pages

`list_pages()` returns `[{ name, lastModified, built }]`, `built` saying whether a published tree
exists. `get_page({ name })` returns:

```ts
interface PageView {
  name: string
  previewURL: string
  root: string                                   // the root node's uid
  nodes: Array<{
    uid: string
    component: { uid: string, name: string }
    values: Array<{                              // in the component's attributeOrder
      uid: string, name: string, type: AttributeType,
      value: AttributeValue                      // a slot's value lists child node uids, in order
    }>
  }>
  version: string
}
```

Only nodes reachable from the root are listed. An unknown page fails with
`pages/no-such-page: <name>`.

- Test: `packages/core/src/lib/script/mcp/tools/pages.test.ts`
- Level: unit

#### TOL-9 · Creating a page

`create_page({ name, component })` creates a page whose root is a new node of the component, as
`components.md` PGE-2 does, and returns `{ version }`. The name has 1 to 200 characters, none of
them `/`, `\` or a control character, and is not `.` or `..`; another fails with
`pages/invalid-name: <name>`. A name already taken fails with `pages/exists: <name>`. A component
without a publication fails with `pages/unpublished-component: <uid>`.

- Test: `packages/core/e2e/mcp.test.ts`, `packages/core/src/lib/script/mcp/tools/pages.test.ts`
- Level: unit, e2e

#### TOL-10 · Adding a node

`add_node({ page, version, parent, slot, component, position? })` creates a node of the component
(PGE-2) and inserts its uid into the value of the attribute `slot` of the node `parent`, at
`position` (0-based), or at the end. It returns `{ node, version }`. It fails with
`pages/no-such-node: <uid>` for a parent the page lacks, `pages/not-a-slot: <uid>` for an attribute
that is not of type `components`, `pages/unpublished-component: <uid>` for a component without a
publication, `pages/not-accepted: <name>` for a component whose name the slot's non-empty
`items.enum` lacks, and `pages/slot-full: <uid>` when the slot holds `maxItems` nodes.

- Test: `packages/core/e2e/mcp.test.ts`, `packages/core/src/lib/script/components/page/edits.test.ts`
- Level: unit, e2e

#### TOL-11 · Setting values

`set_values({ page, version, node, values })`, `values` mapping attribute uids to values, replaces
those values of the node and returns `{ version }`. Each value must match its attribute's type
(`components.md` CMP-3) and meta-schema; one that does not fails with
`pages/invalid-value: <attribute uid>: <what does not match>`, and nothing is written. An attribute
of type `components` fails with `pages/slot-not-a-value: <uid>`: slots change through TOL-10,
TOL-12 and TOL-13.

- Test: `packages/core/e2e/mcp.test.ts`, `packages/core/src/lib/script/components/page/edits.test.ts`
- Level: unit, e2e

#### TOL-12 · Moving a node

`move_node({ page, version, node, parent, slot, position? })` removes the node's uid from the slot
holding it and inserts it into `slot` of `parent`, at `position`, or at the end, and returns
`{ version }`. Moving the root, or a node into itself or one of its descendants, fails with
`pages/invalid-move: <uid>`; TOL-10's refusals for the parent, the slot and the component apply.

- Test: `packages/core/src/lib/script/components/page/edits.test.ts`
- Level: unit

#### TOL-13 · Removing a node

`remove_node({ page, version, node })` removes the node's uid from the slot holding it, and removes
the node and every node below it from the page. Removing the root fails with
`pages/invalid-move: <uid>`.

- Test: `packages/core/src/lib/script/components/page/edits.test.ts`
- Level: unit

#### TOL-14 · The preview URL

`set_preview_url({ page, version, url })` sets the page's `previewURL` and returns `{ version }`.

- Test: `packages/core/src/lib/script/mcp/tools/pages.test.ts`
- Level: unit

#### TOL-15 · Building and deleting a page

`build_page({ page })` builds the stored page as `components.md` TRE-1 does. `delete_page({ page })`
deletes it as PGE-8 does.

- Test: `packages/core/e2e/mcp.test.ts`, `packages/core/src/lib/script/mcp/tools/pages.test.ts`
- Level: unit, e2e

#### TOL-16 · Edits are undoable

Each tool call that changes a header, a body or a page's contents records exactly one step in its
history (`components.md` HIS-1), so a person can undo it on the screens. `set_preview_url` records
none, as the screen's action does not (`components.md` PGE-6): a page's history covers its contents
only.

- Test: `packages/core/src/lib/script/mcp/tools/components.test.ts`
- Level: unit

#### TOL-17 · Tool permissions

Each tool requires the permissions of the operation it performs, checked by the same services:

| Tool | Permissions |
| :-- | :-- |
| `list_components`, `get_component` | `components:read` |
| `create_component`, `delete_component` | `components:register` |
| `update_component` | `components:modify` |
| `get_component_source`, `save_component_source` | `components:code` |
| `publish_component` | as `components.md` CMP-11 |
| `list_pages`, `get_page` | `pages:read` |
| `create_page`, `add_node`, `move_node`, `remove_node` | `pages:read`, `pages:structure_edit` |
| `set_values`, `set_preview_url` | `pages:read`, `pages:content_edit` |
| `build_page` | `pages:read`, `pages:content_edit`, `pages:publish` |
| `delete_page` | `pages:delete` |

- Test: `packages/core/src/lib/script/mcp/tools/components.test.ts`
- Level: unit

### Collection tools

#### TOL-18 · Reading collections

`list_collections()` returns `[{ name }]`, the collections of the agent's catalog (`collections.md`
COL-3), in its order. `get_collection({ collection })` returns `{ name, primaryKey: { key, schema },
schema }` of the collection's definition (COL-2, COL-4). A collection that does not exist fails with
`collection/not-found: <collection>`; one whose definition does not verify fails as COL-7 says.

- Test: none yet
- Level: unit
- State: new (RFC-0041)

#### TOL-19 · Listing documents

`list_documents({ collection, where, limit, pageToken })` returns one page of the collection's
documents as the database contract queries it (`contracts/database.md` DATA-8 to DATA-10), each with
only its readable fields (`collections.md` DOC-2): `{ documents: Array<{ id, data }>, next }`, `next`
absent on the last page. `limit` is 1 to 200, 50 by default. A condition on a field the agent may
not read fails with `documents/unreadable-field: <field>` before the database is queried. Malformed
parameters fail with the contract's `database/invalid-query: <reason>`, and a query the store cannot
serve with `database/unsupported-query: <reason>` (DATA-11).

- Test: none yet
- Level: unit
- State: new (RFC-0041)

#### TOL-20 · Reading a document

`get_document({ collection, id })` returns `{ id, data }`, with only the readable fields (DOC-2). A
document that does not exist fails with `documents/not-found: <collection>/<id>`.

- Test: none yet
- Level: unit
- State: new (RFC-0041)

#### TOL-21 · Creating a document

`create_document({ collection, data })` validates `data` (`collections.md` DOC-8), creates the
document as DOC-4 does, and returns `{ id }`, the new document's id.

- Test: none yet
- Level: unit
- State: new (RFC-0041)

#### TOL-22 · Updating a document

`update_document({ collection, id, data })` sets each top-level field of `data` on the stored
document and keeps every other field (TD7), as DOC-3 and DOC-8 do, and returns `{ id }`. A document
that does not exist fails with `documents/not-found: <collection>/<id>`, and nothing is written. The
update is not conditional: a later save wins (TU13).

- Test: none yet
- Level: unit
- State: new (RFC-0041)

#### TOL-23 · Deleting a document

`delete_document({ collection, id })` deletes the document as `collections.md` DOC-6 does, and
returns `{}`. Deleting a document that does not exist is not an error.

- Test: none yet
- Level: unit
- State: new (RFC-0041)

### Storage tools

Every storage tool acts on one bucket, through the user layer (`storage.md` STS-2), so a change under
`.genoacms/` of the default bucket fails as STS-5 says. An object name is levels separated by `/`;
a name that is empty, ends with `/`, or has a level that is empty, `.` or `..`, fails with
`storage/invalid-name: <name>`. A directory path is `` for the root, or such a name followed by `/`;
another fails the same way.

#### TOL-24 · Reading buckets and directories

`list_buckets()` returns `[{ name }]`, the agent's buckets (`storage.md` STS-1), in their order.
`list_directory({ bucket, path, pageToken, limit })` returns one page of the directory, as the
storage contract lists it (`contracts/storage.md` STOR-11): `{ files: Array<{ name, size,
lastModified }>, directories: string[], next }`, `lastModified` an ISO 8601 string, `directories`
their paths, and `next` the token of the next page, absent on the last. `path` is the root by
default; `limit` is passed to the adapter when given. It signs no URLs.

- Test: none yet
- Level: unit
- State: new (RFC-0041)

#### TOL-25 · Reading an object

`get_object({ bucket, name })` returns `{ url, expiresAt }`: a URL signed for the object (`storage.md`
STS-7), and when it expires, as an ISO 8601 string. The agent fetches the contents from the URL.

- Test: none yet
- Level: unit
- State: new (RFC-0041)

#### TOL-26 · Uploading an object

`upload_object({ bucket, name, content, encoding, overwrite })` stores `content` as the object.
`encoding` is `utf8`, the default, for text stored as its UTF-8 bytes, or `base64`. Content that is
not base64 when it should be fails with `storage/invalid-content: <name> is not base64`. Decoded
content longer than 4,194,304 bytes fails with `storage/too-large: <bytes> bytes exceed 4194304`.
Without `overwrite: true`, the object is written only if absent (`contracts/storage.md` STOR-6), and
an existing one fails with `storage/exists: <bucket>/<name>`; with it, an existing object is replaced.
It returns `{ name }`. Nothing is written when it fails. `base64` is the standard alphabet with padding, unwrapped: a
string with whitespace, or in the URL-safe alphabet, is not base64.

- Test: none yet
- Level: unit
- State: new (RFC-0041)

#### TOL-27 · Moving and deleting an object

`move_object({ bucket, name, destination, overwrite })` moves the object to the name `destination`
in the same bucket, and `delete_object({ bucket, name })` deletes it; each returns `{}`. An existing
`destination` fails with `storage/exists: <bucket>/<destination>`, and nothing moves, unless
`overwrite: true` (TU16). An object that does not exist fails with the storage contract's
`storage/not-found: <bucket>/<name>`.

- Test: none yet
- Level: unit
- State: new (RFC-0041)

#### TOL-28 · Directories

`create_directory({ bucket, path })` creates a directory, `move_directory({ bucket, path,
destination, overwrite })` moves everything under `path` to `destination`, and `delete_directory({
bucket, path })` deletes everything under `path`, the directories within it included (TU15); each
returns `{}`. A `destination` that holds anything fails with `storage/exists: <bucket>/<destination>`
unless `overwrite: true`, and one under `path` fails with `storage/invalid-name: <destination>`
(TU16). The root cannot be created, moved or deleted: a `path` of `` fails with
`storage/invalid-name: `.

- Test: none yet
- Level: unit
- State: new (RFC-0041)

#### TOL-29 · Collection and storage tool permissions

Each collection and storage tool requires the permissions of the operation it performs, checked by
the same services:

| Tool | Permissions |
| :-- | :-- |
| `list_collections`, `list_buckets` | none: they list what the agent holds any grant on |
| `get_collection`, `list_documents`, `get_document` | `db:collection:read` |
| `create_document`, `update_document` | `db:collection:read`, to resolve the definition (`collections.md` DOC-1), and `db:collection:write` |
| `delete_document` | `db:collection:read`, `db:collection:delete` |
| `list_directory`, `get_object` | `storage:bucket:read` |
| `upload_object`, `move_object`, `create_directory`, `move_directory` | `storage:bucket:write` |
| `delete_object`, `delete_directory` | `storage:bucket:delete` |

- Test: none yet
- Level: unit
- State: new (RFC-0041)
