---
title: AI agents
---

An **agent** is an account for something that is not a person: an AI client such as Claude Code that
edits your components and pages through the [Model Context Protocol](https://modelcontextprotocol.io)
(MCP). It does the clicking work of the editor: registering a component, describing its attributes,
writing its code, composing a page node by node.

An agent is an account of its own, with roles like anyone's:

- **Its token is both identity and password.** There is no username and no session. The agent sends
  the token on every request to `/mcp`, and nowhere else.
- **Its subject is `agent:<name>`.** The prefix `agent:` is reserved. An identity provider that
  returns a subject starting with it is refused at sign-in with `invalid-credentials`, so an agent
  can never be confused with a person.
- **It cannot sign in to the CMS.** It has no password, no cookie and no screen. A person's email and
  password work on the sign-in page alone.
- **It does only what its roles let it do.** Every tool calls the same permission-checked services
  as the screens, so an agent can do nothing its grants would not let it do on a screen.

## Declaring agents in `genoa.config`

Agents are declared in `authentication.agents`, next to `providers`, keyed by subject. The token is a
[`secret()`](/guide/config/secrets) reference, never a plain value. Roles come from
`authorization.assignments`, as for people:

```ts
authentication: {
  providers: { /* people */ },
  cookieName: 'genoacms',
  agents: {
    'agent:site-builder': {
      label: 'Site builder',
      token: secret('GENOACMS_AGENT_SITE_BUILDER')
    }
  }
},
authorization: {
  roles: {
    'Page builder': [
      { permission: 'components:read', resource: '*' },
      { permission: 'components:modify', resource: '*' },
      { permission: 'pages:read', resource: '*' },
      { permission: 'pages:structure_edit', resource: '*' },
      { permission: 'pages:content_edit', resource: '*' }
    ]
  },
  assignments: {
    'agent:site-builder': ['Page builder']
  }
}
```

`label` is shown wherever a person's email would be. As everywhere in Tier 1, a declared agent
cannot be changed or revoked from inside the CMS; change the config and deploy.

### The token

A declared token needs **at least 43 characters** and must not be shared with another agent. Generate
one with 32 random bytes, for example `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`. It is
checked for length, not for randomness.

The token is resolved when `/mcp` is first requested. If it is too short, or two agents share one,
every request to `/mcp` answers **503** and the error is logged; the rest of the CMS keeps running:

| Error | Cause |
| :--- | :--- |
| `authentication/agent-token-too-short:` | a token of fewer than 43 characters |
| `authentication/agent-token-shared:` | two agents with the same token |

A key that is not `agent:<name>`, with a name of lowercase letters, digits and hyphens, fails when
the config loads with `authentication/agent-subject-prefix:`.

## What an agent can hold

An agent never holds a configuration permission (`config:users:manage`, `config:roles:manage`,
`config:keys:manage`, `config:security:manage`, `config:adapters:manage`) nor a grant of `*`. An
agent able to administer users or keys could make itself, or anyone, anything. A role exceeding this
ceiling is **refused, never trimmed**:

- In the config, assigning an agent such a role stops the server from starting, with
  `authorization/agent-ceiling: <subject> is assigned <role>, which grants permissions an agent cannot hold.`
- In the CMS, assigning such a role to an agent, or changing a role an agent holds so that it
  exceeds the ceiling, is refused with the same message.
- If an agent's roles exceed it anyway, as when a declared assignment names a stored role that was
  later widened, the agent resolves with no grants: every tool call is denied and the error is
  logged.

An agent with no roles can do nothing. Role changes take effect within `grantCacheSeconds`, as for
people (see [roles and permissions](/guide/authorization)).

**Publishing needs no rule of its own.** An agent publishes a component, or builds a page, exactly
when its grants include `components:code` or `pages:publish`. Give an agent neither and it can only
prepare work for a person to publish. The [tool reference](/reference/mcp) lists the permissions each
tool needs.

## Creating agents in the CMS

**Configuration → Roles and access** has an **Agents** section listing every agent, declared and
stored, by subject, label and roles. Declared agents are marked as declared in `genoa.config`.

With `config:users:manage` you can:

| Action | Effect |
| :--- | :--- |
| Add an agent | a name, a label and roles; the agent is `agent:<name>`, with a name matching `^[a-z0-9][a-z0-9-]{0,62}$` that no agent has taken; it gets a new token |
| Issue a new token | the previous token stops working |
| Change label or roles | as given, within the ceiling above |
| Revoke | the stored agent is removed |

Any action on a declared agent is refused with `agents/declared: <subject> is declared in genoa.config.`

A new token looks like `gat_…` and is **shown once**, with a note that it cannot be shown again.
GenoaCMS stores only its SHA-256, so a lost token is replaced, not recovered. Tokens do not expire:
a token is valid until you issue another or revoke the agent, and either takes effect at the next
request. Stored agents live in `.genoacms/security/agents.json`, a signed document like the users
manifest (see [what GenoaCMS stores](/guide/storage-layout)).

## Connecting a client

The endpoint is `POST <your CMS origin>/mcp`, with `Authorization: Bearer <token>`. It speaks MCP
over Streamable HTTP, protocol revision `2025-06-18`, **statelessly**: each request is one JSON-RPC
message answered with JSON, there is no session, and the server never streams or notifies. That is
what lets it run on Cloud Run, Lambda or Node alike. `GET` and `DELETE` answer 405.

A request without a valid token answers 401. Cookies are ignored on `/mcp`, and the `Authorization`
header is ignored everywhere else.

For Claude Code, as a project's `.mcp.json`:

```json
{
  "mcpServers": {
    "genoacms": {
      "type": "http",
      "url": "https://cms.example.com/mcp",
      "headers": { "Authorization": "Bearer ${GENOACMS_AGENT_TOKEN}" }
    }
  }
}
```

Other clients that support remote HTTP servers with custom headers take the same URL and header.
Keep the token in the client's environment or secret store, not in a committed file.

`tools/list` lists all [18 tools](/reference/mcp) whatever the agent's grants; a call the grants do
not allow answers `permission-denied:`.

### Results and errors

A successful call returns the tool's output as `structuredContent` and as JSON text. A refusal
(permission, validation, conflict) comes back as a result with `isError: true` whose text starts with
the error code, such as `permission-denied:` or `conflict/modified-since:`. Arguments that do not
match a tool's input schema give `tools/invalid-arguments:`.

## Versions and conflicts

Every read tool returns a `version`, and every tool that changes that object takes it back. If a
person, or another agent, saved the object in between, nothing is written and the call fails with

```text
conflict/modified-since: <object> has changed since version <version>; read it again.
```

The agent reads the object again and redoes its change on what it finds. The screens carry a version
too, so a person and an agent editing one page cannot overwrite each other silently.

Each change an agent makes is one step in the object's history, so a person can undo it on the
screens. Changing a page's preview URL is the exception, as it is on screen. GenoaCMS does not yet
record on the server which principal saved a draft; what an agent publishes names it as publisher.
