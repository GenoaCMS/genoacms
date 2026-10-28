---
title: MCP tools
---

The tools of the agent endpoint `POST /mcp`. How to declare an agent and connect a client is under
[AI agents](/guide/agents); this page lists what a connected agent can call.

Arguments marked *optional* may be left out; every other argument is required, and no tool accepts
an argument not listed. `version` is the value a read tool returned for the object being changed
(see [versions and conflicts](/guide/agents#versions-and-conflicts)). Each tool needs the permissions
of the operation it performs, checked by the same services as the screens.

## Components

| Tool | Purpose | Arguments | Returns | Permissions |
| :--- | :--- | :--- | :--- | :--- |
| `list_components` | Lists the catalog with each component's publication | none | `[{ uid, name, type, publication }]` | `components:read` |
| `get_component` | Reads a component's attributes in order, its publication and its version | `uid` | `{ uid, name, type, attributes, publication, version }` | `components:read` |
| `create_component` | Registers a component | `name`, `type` (`prebuilt` or `dynamic`) | `{ uid, version }` | `components:register` |
| `update_component` | Saves a component's name and attributes | `uid`, `version`, `name`, `attributes` | `{ version }` | `components:modify` |
| `get_component_source` | Reads the source of a dynamic component with its signature | `uid` | `{ language, body, signature, version }` | `components:code` |
| `save_component_source` | Saves the body of a dynamic component | `uid`, `version`, `body` | `{ version, signature }` | `components:code` |
| `publish_component` | Publishes a component, with the agent as publisher | `uid`, `note` | `{ publicationId, publishedAt, warnings }` | `components:code` |
| `delete_component` | Deletes a component no published page pins | `uid` | `{ deleted }` | `components:register` |

`publication` is `{ publicationId, publishedAt }`, or `null` for a component never published.

### `attributes`

`update_component` takes the component's attributes as an **ordered list**; the list's order is the
attributes' order. Each item is:

| Field | |
| :--- | :--- |
| `uid` | *optional*. Keeps the attribute, and its values on pages; omit it for a new attribute. A `uid` the component does not have, or one given twice, fails with `components/unknown-attribute:` |
| `type` | one of `boolean`, `number`, `string`, `text`, `markdown`, `richText`, `link`, `storageResource`, `components` |
| `schema` | the attribute's meta-schema, an object with `title`, `description` and `required`; the attribute is named after its `title` |

`get_component` returns the attributes in this same shape, so a read can be edited and saved back.
The component's `type` cannot change.

## Pages

| Tool | Purpose | Arguments | Returns | Permissions |
| :--- | :--- | :--- | :--- | :--- |
| `list_pages` | Lists the pages | none | `[{ name, lastModified, built }]` | `pages:read` |
| `get_page` | Reads a page's nodes, their values and its version | `name` | `{ name, previewURL, root, nodes, version }` | `pages:read` |
| `create_page` | Creates a page whose root is a new node of a published component | `name`, `component` | `{ version }` | `pages:read`, `pages:structure_edit` |
| `add_node` | Adds a node of a published component to a slot of a node | `page`, `version`, `parent`, `slot`, `component`, `position` (*optional*) | `{ node, version }` | `pages:read`, `pages:structure_edit` |
| `set_values` | Sets values of a node by attribute uid | `page`, `version`, `node`, `values` | `{ version }` | `pages:read`, `pages:content_edit` |
| `move_node` | Moves a node into a slot of a node | `page`, `version`, `node`, `parent`, `slot`, `position` (*optional*) | `{ version }` | `pages:read`, `pages:structure_edit` |
| `remove_node` | Removes a node and every node below it | `page`, `version`, `node` | `{ version }` | `pages:read`, `pages:structure_edit` |
| `set_preview_url` | Sets the page's preview URL | `page`, `version`, `url` | `{ version }` | `pages:read`, `pages:content_edit` |
| `build_page` | Builds the stored page into its signed tree | `page` | `{ built }` | `pages:read`, `pages:content_edit`, `pages:publish` |
| `delete_page` | Deletes a page and its built tree | `page` | `{ deleted }` | `pages:delete` |

- `component` is a component `uid`. A component without a publication cannot be used:
  `pages/unpublished-component:`.
- `parent`, `node` and `slot` are a node's `uid` and the `uid` of one of its attributes of type
  `components`. `position` is 0-based; without it the node goes at the end.
- `values` maps attribute `uid`s to values. Each must match its attribute's type and meta-schema, or
  the call fails with `pages/invalid-value:` and writes nothing. Attributes of type `components`
  change through `add_node`, `move_node` and `remove_node`, not `set_values`
  (`pages/slot-not-a-value:`).
- A page name has 1 to 200 characters, none of them `/`, `\` or a control character, and is not `.`
  or `..` (`pages/invalid-name:`). A name already taken fails with `pages/exists:`.

### What `get_page` returns

```ts
{
  name: string
  previewURL: string
  root: string                       // the root node's uid
  nodes: Array<{                     // only nodes reachable from the root
    uid: string
    component: { uid: string, name: string }
    values: Array<{                  // in the component's attribute order
      uid: string, name: string, type: string,
      value: unknown                 // for a slot: the child node uids, in order
    }>
  }>
  version: string
}
```

## Page edit errors

| Error | When |
| :--- | :--- |
| `pages/no-such-page:` | the page does not exist |
| `pages/no-such-node:` | the parent is not a node of the page |
| `pages/not-a-slot:` | the attribute is not of type `components` |
| `pages/not-accepted:` | the slot lists accepted components and this one is not among them |
| `pages/slot-full:` | the slot already holds its `maxItems` nodes |
| `pages/invalid-move:` | moving or removing the root, or moving a node into itself or below itself |
| `conflict/modified-since:` | the object changed since `version`; read it again |
