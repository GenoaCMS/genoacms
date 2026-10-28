---
'@genoacms/core': minor
'@genoacms/config': patch
---

AI agents control components and pages through an MCP endpoint, `POST /mcp`, with 18 tools. An agent is declared in `authentication.agents` or created on `/configuration/iam`, identifies itself with a bearer token alone, and never holds a configuration permission. Every save of a component header, a component body or a page carries the version it was read at, on the screens and in the tools, and a stale save is refused. The screens now refuse a header saved for an unknown component, a changed component kind, a page name of more than one level, a replaced page, a node of an unpublished component, and a node edit that rewrites a page's structure with only the content permission; a node removed from a slot leaves the page with every node below it.
